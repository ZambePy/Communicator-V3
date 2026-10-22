import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  abrirCameraDoRastreador,
  deviceIdDaChave,
  tentativasDeAbertura,
  type PreferenciaDeCamera,
} from './abertura';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 3): a câmera
// escolhida no Preparo nunca chegava ao rastreador, que pedia
// `facingMode: 'user'` — no Chromium isso favorece a câmera integrada do
// notebook, e a webcam USB de frente para o paciente ficava de fora.
// -----------------------------------------------------------------------------

const SEM_ESCOLHA: PreferenciaDeCamera = { escolhida: null, ultima: null };

/** Stream falsa que diz qual câmera abriu. */
const streamDa = (deviceId: string | undefined) =>
  ({ getVideoTracks: () => [{ getSettings: () => ({ deviceId, width: 1280, height: 720, frameRate: 30 }) }] }) as unknown as MediaStream;

const erro = (name: string) => Object.assign(new Error(name), { name });

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('o que é pedido', () => {
  it('nenhum pedido usa `facingMode`', () => {
    for (const p of [SEM_ESCOLHA, { escolhida: 'usb', ultima: null }, { escolhida: null, ultima: 'int' }]) {
      for (const t of tentativasDeAbertura(p)) expect(JSON.stringify(t.constraints)).not.toMatch(/facingMode/);
    }
  });

  it('sem escolha e sem histórico: a mesma escada de antes (1080p, 720p, padrão), sem câmera nomeada', () => {
    const t = tentativasDeAbertura(SEM_ESCOLHA);
    expect(t.map((x) => x.constraints)).toEqual([
      { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } },
      { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } },
      { video: true },
    ]);
  });

  it('com câmera escolhida: exact → ideal → padrão, cada uma com a escada de resoluções', () => {
    const t = tentativasDeAbertura({ escolhida: 'usb-1', ultima: 'int-1' });
    expect(t.map((x) => x.passo)).toEqual([
      'escolhida', 'escolhida', 'escolhida',
      'preferida', 'preferida', 'preferida',
      'padrao', 'padrao', 'padrao',
    ]);
    expect((t[0].constraints.video as MediaTrackConstraints).deviceId).toEqual({ exact: 'usb-1' });
    expect((t[3].constraints.video as MediaTrackConstraints).deviceId).toEqual({ ideal: 'usb-1' });
    expect(t[8].constraints).toEqual({ video: true });
  });

  it('sem escolha, a última câmera aberta é a preferida (continuidade com a calibração em uso)', () => {
    const t = tentativasDeAbertura({ escolhida: null, ultima: 'int-1' });
    expect(t).toHaveLength(3);
    for (const x of t) expect((x.constraints.video as MediaTrackConstraints).deviceId).toEqual({ ideal: 'int-1' });
  });

  it('a chave da câmera guarda o deviceId', () => {
    expect(deviceIdDaChave('id:abc')).toBe('abc');
    expect(deviceIdDaChave('rotulo:Webcam')).toBeNull();
    expect(deviceIdDaChave(null)).toBeNull();
    expect(deviceIdDaChave('id:  ')).toBeNull();
  });
});

describe('abrirCameraDoRastreador', () => {
  it('a escolhida abre: é ela, e não "caiu para outra"', async () => {
    const pedir = vi.fn(async () => streamDa('usb-1'));
    const r = await abrirCameraDoRastreador({ escolhida: 'usb-1', ultima: null }, pedir);
    expect(r).toMatchObject({ passo: 'escolhida', deviceIdAberto: 'usb-1', caiuParaOutra: false });
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('a escolhida não está ligada: pula as outras resoluções dela, abre outra e AVISA', async () => {
    const pedir = vi.fn(async (c: MediaStreamConstraints) => {
      const id = (c.video as MediaTrackConstraints).deviceId as { exact?: string } | undefined;
      if (id?.exact) throw erro('OverconstrainedError');
      return streamDa('integrada');
    });
    const r = await abrirCameraDoRastreador({ escolhida: 'usb-1', ultima: null }, pedir);
    expect(r).toMatchObject({ passo: 'preferida', deviceIdAberto: 'integrada', caiuParaOutra: true });
    // Um pedido "exact" só: as resoluções menores da câmera ausente não são tentadas.
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it('a escolhida está ocupada (NotReadable em todas as resoluções): tenta ideal e depois a padrão', async () => {
    const pedir = vi.fn(async (c: MediaStreamConstraints) => {
      if (c.video !== true && (c.video as MediaTrackConstraints).deviceId) throw erro('NotReadableError');
      return streamDa('integrada');
    });
    const r = await abrirCameraDoRastreador({ escolhida: 'usb-1', ultima: null }, pedir);
    expect(r).toMatchObject({ passo: 'padrao', caiuParaOutra: true });
    expect(pedir).toHaveBeenCalledTimes(7);
  });

  it('permissão negada: para na hora (sem diálogos em série) e explica', async () => {
    const pedir = vi.fn(async () => { throw erro('NotAllowedError'); });
    await expect(abrirCameraDoRastreador({ escolhida: 'usb-1', ultima: null }, pedir)).rejects.toThrow(/não tem permissão para usar a câmera/);
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it('nenhuma câmera: a mensagem de sempre, sem "recarregue"', async () => {
    const pedir = vi.fn(async () => { throw erro('NotFoundError'); });
    const p = abrirCameraDoRastreador(SEM_ESCOLHA, pedir);
    await expect(p).rejects.toThrow(/Não encontrei nenhuma câmera/);
    await expect(p).rejects.not.toThrow(/recarregue/i);
    expect(pedir).toHaveBeenCalledTimes(3);
  });

  it('sem escolha nunca diz "caiu para outra"', async () => {
    const r = await abrirCameraDoRastreador({ escolhida: null, ultima: 'int-1' }, async () => streamDa('usb-2'));
    expect(r.caiuParaOutra).toBe(false);
  });
});

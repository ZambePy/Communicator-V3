import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EstadoDoMotorDeVoz } from '@tracker/voz/protocolo';

const local = vi.hoisted(() => ({
  tocarWav: vi.fn(async (_wav: ArrayBuffer, _aoComecar?: () => void) => true),
  pararVozClonada: vi.fn(),
  ponteDaVoz: vi.fn(),
}));
const sistema = vi.hoisted(() => ({
  falarComVozDoSistemaComDesfecho: vi.fn(
    async (_t: string, _o?: unknown): Promise<{ falou: true } | { falou: false; motivo: string }> => ({ falou: true }),
  ),
  pararVozDoSistema: vi.fn(),
}));
vi.mock('./local', () => local);
vi.mock('./sistema', () => sistema);

import {
  falar,
  falaFalhou,
  falaSaiu,
  vozClonadaLiberadaPelaLicenca,
  vozClonadaPronta,
  aquecerCache,
  acompanharEstadoDaVoz,
  _redefinirVoz,
  ORCAMENTO_DA_VOZ_CLONADA_MS,
} from './index';
import { LICENSE_KEY } from '../../context/LicenseContext';
import { pacienteFalando, _reiniciarFalaEmCurso } from './falaEmCurso';

const pronta = (): EstadoDoMotorDeVoz => ({
  disponivel: true,
  motor: 'pronto',
  modelo: { baixado: true, baixando: false, progresso: null },
  dispositivo: 'cpu',
  voz: { importada: true, duracaoS: 20, qualidade: 'boa' },
  ativa: true,
  cache: { itens: 0, mb: 0 },
  sintetizando: false,
});

const WAV = () => new ArrayBuffer(8);

type Comportamento = {
  emCache?: boolean;
  gerarMs?: number;
  gerarFalha?: 'motor' | 'sem_modelo';
  /** O IPC do `soCache` rejeita (relato de 18/10/2026, item 5). */
  cacheRejeita?: boolean;
  /** O IPC da geração rejeita. */
  geracaoRejeita?: boolean;
};

/** Ponte falsa: `emCache` responde ao `{soCache:true}`; `gerar` à geração completa. */
function ponteCom(estado: EstadoDoMotorDeVoz, comportamento: Comportamento = {}) {
  const sintetizar = vi.fn(async (_t: string, o?: { soCache?: boolean }) => {
    if (o?.soCache) {
      if (comportamento.cacheRejeita) throw new Error('EBUSY: arquivo do cache preso');
      return comportamento.emCache
        ? { ok: true as const, wav: WAV(), deCache: true, ms: 0 }
        : { ok: false as const, motivo: 'nao_em_cache' as const };
    }
    if (comportamento.gerarMs) await new Promise((r) => setTimeout(r, comportamento.gerarMs));
    if (comportamento.geracaoRejeita) throw new Error('o IPC caiu');
    if (comportamento.gerarFalha) return { ok: false as const, motivo: comportamento.gerarFalha };
    return { ok: true as const, wav: WAV(), deCache: false, ms: comportamento.gerarMs ?? 1 };
  });
  const ponte = {
    estado: vi.fn(async () => estado),
    onEstado: vi.fn(() => () => {}),
    importar: vi.fn(),
    remover: vi.fn(),
    baixarModelo: vi.fn(),
    sintetizar,
    sondar: vi.fn(async () => estado),
    ativar: vi.fn(),
  };
  local.ponteDaVoz.mockReturnValue(ponte);
  return ponte;
}

describe('services/voz', () => {
  beforeEach(() => {
    _redefinirVoz();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    local.tocarWav.mockResolvedValue(true);
    sistema.falarComVozDoSistemaComDesfecho.mockResolvedValue({ falou: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('frase em cache: toca a clonada na hora, sem acordar a geração', async () => {
    const ponte = ponteCom(pronta(), { emCache: true });
    const r = await falar('  Estou com sede  ');
    expect(r).toEqual({ origem: 'clonada' });
    expect(ponte.sintetizar).toHaveBeenCalledTimes(1);
    expect(ponte.sintetizar).toHaveBeenCalledWith('Estou com sede', { soCache: true });
    expect(local.tocarWav).toHaveBeenCalled();
    expect(sistema.falarComVozDoSistemaComDesfecho).not.toHaveBeenCalled();
  });

  it('frase nova gerada dentro do prazo sai clonada', async () => {
    const ponte = ponteCom(pronta(), { gerarMs: 20 });
    const r = await falar('Oi');
    expect(r).toEqual({ origem: 'clonada' });
    expect(ponte.sintetizar).toHaveBeenCalledTimes(2);
    expect(ponte.sintetizar).toHaveBeenLastCalledWith('Oi');
  });

  it('geração lenta: fala com o sistema agora e deixa a geração terminar para o cache', async () => {
    vi.useFakeTimers();
    const ponte = ponteCom(pronta(), { gerarMs: ORCAMENTO_DA_VOZ_CLONADA_MS * 4 });
    const p = falar('Frase longa e nova');
    await vi.advanceTimersByTimeAsync(ORCAMENTO_DA_VOZ_CLONADA_MS + 50);
    const r = await p;
    expect(r).toEqual({ origem: 'sistema', motivo: 'demorou' });
    expect(sistema.falarComVozDoSistemaComDesfecho).toHaveBeenCalledWith('Frase longa e nova', {});
    expect(local.tocarWav).not.toHaveBeenCalled();
    // A geração não foi cancelada: continua para aquecer o cache.
    expect(ponte.sintetizar).toHaveBeenCalledTimes(2);
  });

  it('se a geração falhar, cai para a voz do sistema e diz por quê', async () => {
    ponteCom(pronta(), { gerarFalha: 'sem_modelo' });
    const r = await falar('Oi');
    expect(r).toEqual({ origem: 'sistema', motivo: 'sem_modelo' });
    expect(sistema.falarComVozDoSistemaComDesfecho).toHaveBeenCalledWith('Oi', {});
  });

  it('uma fala nova durante a espera substitui a anterior (a última vence)', async () => {
    vi.useFakeTimers();
    ponteCom(pronta(), { gerarMs: 500 });
    const primeira = falar('Primeira');
    await vi.advanceTimersByTimeAsync(100);
    const segunda = falar('Segunda');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await primeira).toEqual({ origem: 'nenhuma', motivo: 'substituida' });
    expect(await segunda).toEqual({ origem: 'clonada' });
    expect(local.tocarWav).toHaveBeenCalledTimes(1);
  });

  it('voz importada mas desligada → sistema; `sistema: true` força o sistema', async () => {
    ponteCom({ ...pronta(), ativa: false });
    expect(await falar('a')).toEqual({ origem: 'sistema' });
    _redefinirVoz();
    const ponte = ponteCom(pronta());
    expect(await falar('b', { sistema: true, rate: 1.2 })).toEqual({ origem: 'sistema' });
    expect(ponte.sintetizar).not.toHaveBeenCalled();
    expect(sistema.falarComVozDoSistemaComDesfecho).toHaveBeenLastCalledWith('b', { sistema: true, rate: 1.2 });
  });

  it('fora do Electron (sem ponte) fala com o sistema sem reclamar', async () => {
    local.ponteDaVoz.mockReturnValue(null);
    expect(await falar('x')).toEqual({ origem: 'sistema' });
  });

  it('texto vazio não fala nada', async () => {
    expect(await falar('   ')).toEqual({ origem: 'nenhuma', motivo: 'texto vazio' });
  });

  it('a licença decide: sem features libera; features.voz=false bloqueia', async () => {
    expect(vozClonadaLiberadaPelaLicenca()).toBe(true);
    localStorage.setItem(LICENSE_KEY, JSON.stringify({ plan: { id: 'essencial', features: { voz: false } } }));
    expect(vozClonadaLiberadaPelaLicenca()).toBe(false);
    ponteCom(pronta());
    await acompanharEstadoDaVoz();
    expect(vozClonadaPronta()).toBe(false);
    expect(await falar('y')).toEqual({ origem: 'sistema' });
    localStorage.setItem(LICENSE_KEY, JSON.stringify({ plan: { id: 'voz', features: { voz: true } } }));
    expect(vozClonadaPronta()).toBe(true);
  });

  it('aquecerCache sintetiza cada frase e para no primeiro erro do motor', async () => {
    const ponte = ponteCom(pronta());
    await acompanharEstadoDaVoz();
    ponte.sintetizar
      .mockResolvedValueOnce({ ok: true, wav: WAV(), deCache: false, ms: 1 })
      .mockResolvedValueOnce({ ok: false, motivo: 'texto' })
      .mockResolvedValueOnce({ ok: true, wav: WAV(), deCache: true, ms: 0 })
      .mockResolvedValueOnce({ ok: false, motivo: 'motor', erro: 'caiu' });
    const n = await aquecerCache(['a', '', 'b', 'c', 'd', 'e'], ponte);
    expect(n).toBe(2);
    expect(ponte.sintetizar).toHaveBeenCalledTimes(4);
  });
});

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 5): `falar()`
// podia REJEITAR sem falar nada (IPC rejeitado fora de qualquer `try`), e o
// desfecho da voz do sistema era descartado — as telas diziam "falou" para
// uma frase que não saiu.
// -----------------------------------------------------------------------------

describe('falar() nunca lança, e diz quando nada saiu', () => {
  beforeEach(() => {
    _redefinirVoz();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    local.tocarWav.mockResolvedValue(true);
    sistema.falarComVozDoSistemaComDesfecho.mockResolvedValue({ falou: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('o IPC do cache rejeita: cai para a voz do sistema em vez de rejeitar', async () => {
    ponteCom(pronta(), { cacheRejeita: true });
    await expect(falar('Quero água')).resolves.toEqual({ origem: 'sistema', motivo: 'erro' });
    expect(sistema.falarComVozDoSistemaComDesfecho).toHaveBeenCalledWith('Quero água', {});
  });

  it('a geração rejeita dentro do prazo: cai para a voz do sistema', async () => {
    ponteCom(pronta(), { gerarMs: 10, geracaoRejeita: true });
    await expect(falar('Quero água')).resolves.toEqual({ origem: 'sistema', motivo: 'erro' });
  });

  it('tocar o WAV falha: cai para a voz do sistema', async () => {
    ponteCom(pronta(), { emCache: true });
    local.tocarWav.mockRejectedValueOnce(new Error('decode falhou'));
    await expect(falar('Quero água')).resolves.toEqual({ origem: 'sistema', motivo: 'erro' });
  });

  it('a voz do sistema também não sai: { origem: "nenhuma", motivo }', async () => {
    local.ponteDaVoz.mockReturnValue(null);
    sistema.falarComVozDoSistemaComDesfecho.mockResolvedValue({ falou: false, motivo: 'sem_voz' });
    const r = await falar('Preciso de ajuda');
    expect(r).toEqual({ origem: 'nenhuma', motivo: 'sem_voz' });
    expect(falaFalhou(r)).toBe(true);
    expect(falaSaiu(r)).toBe(false);
  });

  it('a clonada falhou e a do sistema não começou: nada saiu, e diz isso', async () => {
    ponteCom(pronta(), { cacheRejeita: true });
    sistema.falarComVozDoSistemaComDesfecho.mockResolvedValue({ falou: false, motivo: 'nao_comecou' });
    const r = await falar('Preciso de ajuda');
    expect(r).toEqual({ origem: 'nenhuma', motivo: 'nao_comecou' });
    expect(falaFalhou(r)).toBe(true);
  });

  it('interrompida por outra fala (o alarme, a mensagem do cuidador): não é falha', async () => {
    local.ponteDaVoz.mockReturnValue(null);
    sistema.falarComVozDoSistemaComDesfecho.mockResolvedValue({ falou: false, motivo: 'interrompida' });
    const r = await falar('Oi');
    expect(r).toEqual({ origem: 'nenhuma', motivo: 'interrompida' });
    expect(falaFalhou(r)).toBe(false);
    expect(falaSaiu(r)).toBe(false);
  });

  it('a clonada foi parada antes de o som sair: interrompida, sem cair para o sistema', async () => {
    ponteCom(pronta(), { emCache: true });
    local.tocarWav.mockResolvedValueOnce(false);
    const r = await falar('Oi');
    expect(r).toEqual({ origem: 'nenhuma', motivo: 'interrompida' });
    expect(sistema.falarComVozDoSistemaComDesfecho).not.toHaveBeenCalled();
  });

  it('aoComecar chega à voz que falar (clonada ou do sistema)', async () => {
    const aoComecar = vi.fn();
    ponteCom(pronta(), { emCache: true });
    await falar('Oi', { aoComecar });
    expect(local.tocarWav).toHaveBeenCalledWith(expect.any(ArrayBuffer), aoComecar);

    _redefinirVoz();
    local.ponteDaVoz.mockReturnValue(null);
    await falar('Oi', { aoComecar });
    expect(sistema.falarComVozDoSistemaComDesfecho).toHaveBeenLastCalledWith('Oi', { aoComecar });
  });

  it('falaSaiu/falaFalhou: só "clonada" e "sistema" saíram; substituída e texto vazio não são falha', () => {
    expect(falaSaiu({ origem: 'clonada' })).toBe(true);
    expect(falaSaiu({ origem: 'sistema', motivo: 'demorou' })).toBe(true);
    expect(falaSaiu(undefined)).toBe(false);
    expect(falaFalhou({ origem: 'nenhuma', motivo: 'substituida' })).toBe(false);
    expect(falaFalhou({ origem: 'nenhuma', motivo: 'texto vazio' })).toBe(false);
    expect(falaFalhou({ origem: 'nenhuma', motivo: 'erro' })).toBe(true);
    expect(falaFalhou(null)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// A marca "o paciente está falando" (rodada 3, 21/10/2026). A varredura falada
// do Plano B anuncia os botões com a voz do computador, que começa sempre com
// `speechSynthesis.cancel()`: sem a marca, o anúncio do botão seguinte cortaria
// a frase do paciente no meio — ou entraria por baixo dela, na espera da voz
// clonada, e as duas vozes sairiam juntas.
// -----------------------------------------------------------------------------

describe('falar() marca a fala do paciente', () => {
  beforeEach(() => {
    _redefinirVoz();
    _reiniciarFalaEmCurso();
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    local.tocarWav.mockResolvedValue(true);
    sistema.falarComVozDoSistemaComDesfecho.mockResolvedValue({ falou: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    _reiniciarFalaEmCurso();
  });

  it('vale desde a chamada, durante a voz do sistema, e cai quando ela termina', async () => {
    local.ponteDaVoz.mockReturnValue(null);
    let terminar!: () => void;
    sistema.falarComVozDoSistemaComDesfecho.mockImplementationOnce(
      () => new Promise((r) => { terminar = () => r({ falou: true }); }),
    );
    expect(pacienteFalando()).toBe(false);
    const fala = falar('Quero água');
    expect(pacienteFalando()).toBe(true);
    await vi.waitFor(() => expect(sistema.falarComVozDoSistemaComDesfecho).toHaveBeenCalled());
    expect(pacienteFalando()).toBe(true);
    terminar();
    await fala;
    expect(pacienteFalando()).toBe(false);
  });

  it('vale também na espera da voz clonada — o silêncio em que um anúncio entraria por baixo', async () => {
    ponteCom(pronta(), { gerarMs: 40 });
    const fala = falar('Oi');
    await new Promise((r) => setTimeout(r, 10));
    expect(local.tocarWav).not.toHaveBeenCalled();
    expect(pacienteFalando()).toBe(true);
    await fala;
    expect(local.tocarWav).toHaveBeenCalled();
    expect(pacienteFalando()).toBe(false);
  });

  it('vale enquanto o WAV da voz clonada toca', async () => {
    ponteCom(pronta(), { emCache: true });
    let terminar!: () => void;
    local.tocarWav.mockImplementationOnce(() => new Promise<boolean>((r) => { terminar = () => r(true); }));
    const fala = falar('Oi');
    await vi.waitFor(() => expect(local.tocarWav).toHaveBeenCalled());
    expect(pacienteFalando()).toBe(true);
    terminar();
    await fala;
    expect(pacienteFalando()).toBe(false);
  });

  it('cai mesmo se a voz do sistema lançar: a marca não pode ficar presa e calar a varredura', async () => {
    local.ponteDaVoz.mockReturnValue(null);
    sistema.falarComVozDoSistemaComDesfecho.mockRejectedValueOnce(new Error('o sintetizador caiu'));
    await expect(falar('Oi')).rejects.toThrow('o sintetizador caiu');
    expect(pacienteFalando()).toBe(false);
  });

  it('texto vazio e fala substituída não deixam marca', async () => {
    await falar('   ');
    expect(pacienteFalando()).toBe(false);

    ponteCom(pronta(), { gerarMs: 30 });
    const primeira = falar('Primeira');
    const segunda = falar('Segunda');
    await Promise.all([primeira, segunda]);
    expect(pacienteFalando()).toBe(false);
  });
});

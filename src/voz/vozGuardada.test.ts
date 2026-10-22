// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -----------------------------------------------------------------------------
// Voz guardada (voice banking, pedido de 19/10/2026): o arquivo das gravações
// (`electron/voz/gravacoes.ts`), os canais (`electron/voz/guardadas.ts`) e o
// caminho que leva uma gravação a virar a base da voz clonada pela importação
// de sempre (`registrarVoz().importarDeArquivo`, com o motor falso).
// -----------------------------------------------------------------------------

const MOTOR = path.resolve(__dirname, '..', '..', 'fixtures', 'motor-de-voz-falso.cjs');
let userData = '';
const handlers = new Map<string, (...a: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { getPath: () => userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  ipcMain: { handle: (canal: string, fn: (...a: unknown[]) => unknown) => handlers.set(canal, fn) },
}));
vi.mock('../../electron/voz/sidecar', async (original) => ({
  ...(await original<typeof import('../../electron/voz/sidecar')>()),
  localizarMotor: () => ({ comando: process.execPath, args: [MOTOR], origem: 'python' as const }),
}));

import { criarArmazemDeGravacoes } from '../../electron/voz/gravacoes';
import { registrarVozGuardada } from '../../electron/voz/guardadas';
import { registrarVoz, type ControleDaVoz } from '../../electron/voz/index';
import { CANAIS_VOZ } from './protocolo';
import { CANAIS_VOZ_GUARDADA, consentimentoDoPerfil, ehIdDeGravacao, ehWav, type GravacaoGuardada } from './vozGuardada';

/** WAV PCM 16 bits mono com `n` amostras de um tom (o conteúdo não importa ao arquivo). */
function wav(n = 4800, taxa = 48000): ArrayBuffer {
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const txt = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); txt(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(i / 10) * 8000), true);
  return buf;
}

const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const TERMO = 'Concordo em gravar a minha própria voz nesta tela, guardada só neste computador.';
const consentimento = { texto: TERMO, aceitoEm: '2026-10-19T09:00:00Z', perfilId: 'p1' };
const pedido = (o: Partial<{ id: string; texto: string; wav: unknown; substitui: string }> = {}) => ({
  id: ID1, texto: 'Estou com dor.', wav: wav(), duracaoS: 1.2, qualidade: 'boa', perfilId: 'p1', ...o,
});

let pasta = '';
beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'irisflow-vozg-'));
  pasta = path.join(userData, 'voz', 'guardadas');
  handlers.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());


/** No Windows abrir e fechar o motor falso leva segundos (ver sidecar.test.ts): prazo folgado lá. */
const PRAZO_DO_TESTE = process.platform === 'win32' ? 90_000 : 20_000;

describe('contrato', () => {
  it('id é um UUID — nada de caminho, ponto-ponto nem barra', () => {
    expect(ehIdDeGravacao(ID1)).toBe(true);
    for (const ruim of ['../indice', '..\\x', 'a/b', '', ID1 + '.wav', ID1.toUpperCase().replace(/-/g, '')]) expect(ehIdDeGravacao(ruim)).toBe(false);
    expect(ehIdDeGravacao(42)).toBe(false);
  });

  it('reconhece o cabeçalho RIFF/WAVE', () => {
    expect(ehWav(new Uint8Array(wav()))).toBe(true);
    expect(ehWav(new TextEncoder().encode('RIFF-falso-wav-mas-curto'))).toBe(false);
    const webm = new Uint8Array(wav());
    webm.set([0x1a, 0x45, 0xdf, 0xa3], 0);
    expect(ehWav(webm)).toBe(false);
  });
});

describe('arquivo das gravações', () => {
  it('sem o termo aceito, não grava nada', () => {
    const a = criarArmazemDeGravacoes(pasta);
    expect(a.salvar(pedido()).ok).toBe(false);
    expect(fs.existsSync(path.join(pasta, `${ID1}.wav`))).toBe(false);
    // Um "ok" não é o termo.
    expect(a.consentir({ texto: 'ok', aceitoEm: 'agora', perfilId: null }).ok).toBe(false);
  });

  it('o termo fica gravado como o da voz clonada: texto, hash, quando e perfil', () => {
    const a = criarArmazemDeGravacoes(pasta);
    expect(a.consentir(consentimento).ok).toBe(true);
    const arquivo = JSON.parse(fs.readFileSync(path.join(pasta, 'consentimento.json'), 'utf8'));
    expect(arquivo.versao).toBe(2);
    expect(arquivo.consentimentos).toHaveLength(1);
    const c = arquivo.consentimentos[0];
    expect(c).toMatchObject({ texto: TERMO, aceitoEm: consentimento.aceitoEm, perfilId: 'p1' });
    expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
    const l = a.listar();
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'p1')?.aceitoEm).toBe(consentimento.aceitoEm);
  });

  it('grava, lista, toca o mesmo áudio de volta e apaga', () => {
    const a = criarArmazemDeGravacoes(pasta);
    a.consentir(consentimento);
    const r = a.salvar(pedido());
    expect(r.ok).toBe(true);
    const l = a.listar();
    expect(l.ok && l.gravacoes.map((g: GravacaoGuardada) => [g.id, g.texto, g.qualidade, g.perfilId])).toEqual([[ID1, 'Estou com dor.', 'boa', 'p1']]);
    const lido = a.ler(ID1);
    expect(lido.ok && Buffer.from(lido.wav).equals(Buffer.from(wav()))).toBe(true);
    expect(a.apagar(ID1).ok).toBe(true);
    expect(fs.existsSync(path.join(pasta, `${ID1}.wav`))).toBe(false);
    const depois = a.listar();
    expect(depois.ok && depois.gravacoes).toEqual([]);
  });

  it('gravar de novo a mesma frase troca a anterior só depois de a nova estar inteira', () => {
    const a = criarArmazemDeGravacoes(pasta);
    a.consentir(consentimento);
    a.salvar(pedido());
    expect(a.salvar(pedido({ id: ID2, substitui: ID1 })).ok).toBe(true);
    const l = a.listar();
    expect(l.ok && l.gravacoes.map((g: GravacaoGuardada) => g.id)).toEqual([ID2]);
    expect(fs.existsSync(path.join(pasta, `${ID1}.wav`))).toBe(false);
  });

  it('recusa áudio que não é WAV, texto vazio e id com caminho', () => {
    const a = criarArmazemDeGravacoes(pasta);
    a.consentir(consentimento);
    expect(a.salvar(pedido({ wav: new TextEncoder().encode('não sou áudio').buffer })).ok).toBe(false);
    expect(a.salvar(pedido({ texto: '   ' })).ok).toBe(false);
    expect(a.salvar(pedido({ id: '../../referencia' })).ok).toBe(false);
    expect(a.ler('../consentimento').ok).toBe(false);
    expect(a.apagar('../indice').ok).toBe(false);
    expect(fs.existsSync(path.join(pasta, 'consentimento.json'))).toBe(true);
  });

  it('aceita o áudio como Uint8Array (o IPC pode entregar assim)', () => {
    const a = criarArmazemDeGravacoes(pasta);
    a.consentir(consentimento);
    expect(a.salvar(pedido({ wav: new Uint8Array(wav()) })).ok).toBe(true);
  });

  it('gravação cujo arquivo sumiu não aparece como mensagem que toca', () => {
    const a = criarArmazemDeGravacoes(pasta);
    a.consentir(consentimento);
    a.salvar(pedido());
    fs.rmSync(path.join(pasta, `${ID1}.wav`));
    const l = a.listar();
    expect(l.ok && l.gravacoes).toEqual([]);
    const lido = a.ler(ID1);
    expect(lido.ok).toBe(false);
    expect(!lido.ok && lido.erro).toMatch(/não está mais neste computador/);
  });
});

// Revisão de segurança de 20/10/2026: o termo valia para o computador inteiro.
// Um arquivo só, sobrescrito a cada aceite, e o `salvar` só conferia se ele
// existia — o "Concordo" de um paciente deixava gravar a voz de OUTRO paciente
// do mesmo computador, que nunca viu o termo, e o aceite do segundo apagava o
// registro do primeiro. Voz é dado biométrico (LGPD, art. 11): o termo é de
// cada titular.
describe('o termo é de cada paciente', () => {
  const ID3 = '33333333-3333-4333-8333-333333333333';
  const termoDe = (perfilId: string | null, aceitoEm: string) => ({ texto: TERMO, aceitoEm, perfilId });

  it('o termo de um paciente não deixa gravar a voz de outro do mesmo computador (o caso do revisor)', () => {
    const a = criarArmazemDeGravacoes(pasta);
    expect(a.consentir(termoDe('perfil-A', '2026-10-20T09:00:00Z')).ok).toBe(true);
    const doB = a.salvar({ ...pedido({ id: ID2, texto: 'sou o paciente B' }), perfilId: 'perfil-B' });
    expect(doB.ok).toBe(false);
    expect(!doB.ok && doB.erro).toMatch(/termo de consentimento/);
    expect(fs.existsSync(path.join(pasta, `${ID2}.wav`))).toBe(false);
    // A tela do paciente B não encontra termo dele.
    const l = a.listar();
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'perfil-B')).toBeNull();
    expect(l.ok && consentimentoDoPerfil(l.consentimentos, 'perfil-A')?.aceitoEm).toBe('2026-10-20T09:00:00Z');
    // O paciente A continua gravando a dele.
    expect(a.salvar({ ...pedido(), perfilId: 'perfil-A' }).ok).toBe(true);
  });

  it('o aceite de um paciente não apaga o registro do outro', () => {
    const a = criarArmazemDeGravacoes(pasta);
    a.consentir(termoDe('perfil-A', '2026-10-20T09:00:00Z'));
    const registroDeA = JSON.parse(fs.readFileSync(path.join(pasta, 'consentimento.json'), 'utf8')).consentimentos[0];
    expect(a.consentir(termoDe('perfil-B', '2026-10-20T10:00:00Z')).ok).toBe(true);
    const arquivo = JSON.parse(fs.readFileSync(path.join(pasta, 'consentimento.json'), 'utf8'));
    expect(arquivo.consentimentos).toHaveLength(2);
    expect(arquivo.consentimentos.find((c: { perfilId: string }) => c.perfilId === 'perfil-A')).toEqual(registroDeA);
    expect(arquivo.consentimentos.find((c: { perfilId: string }) => c.perfilId === 'perfil-B')).toMatchObject({ aceitoEm: '2026-10-20T10:00:00Z' });
    expect(a.salvar({ ...pedido(), perfilId: 'perfil-A' }).ok).toBe(true);
    expect(a.salvar({ ...pedido({ id: ID2 }), perfilId: 'perfil-B' }).ok).toBe(true);
    // Sem perfil (modo de desenvolvimento) é outro titular: precisa do próprio termo.
    expect(a.salvar({ ...pedido({ id: ID3 }), perfilId: null }).ok).toBe(false);
  });

  it('o consentimento.json antigo (um registro, de um perfil só) continua valendo para aquele perfil — e só para ele', () => {
    fs.mkdirSync(pasta, { recursive: true });
    const antigo = { texto: TERMO, hash: 'a'.repeat(64), aceitoEm: '2026-10-19T09:00:00Z', perfilId: 'perfil-A' };
    fs.writeFileSync(path.join(pasta, 'consentimento.json'), JSON.stringify(antigo, null, 2));
    const a = criarArmazemDeGravacoes(pasta);
    const l = a.listar();
    expect(l.ok && l.consentimentos).toEqual([antigo]);
    expect(a.salvar({ ...pedido(), perfilId: 'perfil-A' }).ok).toBe(true);
    expect(a.salvar({ ...pedido({ id: ID2 }), perfilId: 'perfil-B' }).ok).toBe(false);
    // O aceite do B passa o arquivo para o formato novo, com o registro do A como estava.
    expect(a.consentir(termoDe('perfil-B', '2026-10-20T10:00:00Z')).ok).toBe(true);
    const arquivo = JSON.parse(fs.readFileSync(path.join(pasta, 'consentimento.json'), 'utf8'));
    expect(arquivo.versao).toBe(2);
    expect(arquivo.consentimentos.find((c: { perfilId: string }) => c.perfilId === 'perfil-A')).toEqual(antigo);
    expect(a.salvar({ ...pedido({ id: ID2 }), perfilId: 'perfil-B' }).ok).toBe(true);
  });

  it('o antigo sem perfil (modo de desenvolvimento) vale só para quem também não tem perfil', () => {
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'consentimento.json'), JSON.stringify({ texto: TERMO, hash: 'b'.repeat(64), aceitoEm: '2026-10-19T09:00:00Z', perfilId: null }));
    const a = criarArmazemDeGravacoes(pasta);
    expect(a.salvar({ ...pedido(), perfilId: 'perfil-A' }).ok).toBe(false);
    expect(a.salvar({ ...pedido({ id: ID2 }), perfilId: null }).ok).toBe(true);
  });

  it('arquivo dos termos preso agora (antivírus): o aceite não grava por cima dos termos dos outros, e nada é gravado', () => {
    const a = criarArmazemDeGravacoes(pasta);
    a.consentir(termoDe('perfil-A', '2026-10-20T09:00:00Z'));
    const lerDeVerdade = fs.readFileSync;
    const preso = vi.spyOn(fs, 'readFileSync').mockImplementation(((arquivo: fs.PathOrFileDescriptor, ...resto: unknown[]) => {
      if (String(arquivo).endsWith('consentimento.json')) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return (lerDeVerdade as (...x: unknown[]) => unknown)(arquivo, ...resto);
    }) as typeof fs.readFileSync);
    const r = a.consentir(termoDe('perfil-B', '2026-10-20T10:00:00Z'));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/Tente de novo/);
    const s = a.salvar({ ...pedido(), perfilId: 'perfil-A' });
    expect(s.ok).toBe(false);
    expect(fs.existsSync(path.join(pasta, `${ID1}.wav`))).toBe(false);
    preso.mockRestore();
    const arquivo = JSON.parse(fs.readFileSync(path.join(pasta, 'consentimento.json'), 'utf8'));
    expect(arquivo.consentimentos.map((c: { perfilId: string }) => c.perfilId)).toEqual(['perfil-A']);
  });
});

/** Abre o motor de voz falso de verdade: no Windows só no GitHub Actions (ver sidecar.test.ts). */
const SO_NO_CI = process.platform === 'win32' && !process.env.GITHUB_ACTIONS;

describe.skipIf(SO_NO_CI)('canais e a voz clonada', () => {
  const SENDER = { id: 1 };
  const chamar = <T,>(canal: string, ...args: unknown[]) => handlers.get(canal)!({ sender: SENDER }, ...args) as Promise<T>;
  let voz: ControleDaVoz | null = null;
  afterEach(() => { voz?.matarAgora(); voz = null; });

  function montar() {
    const janela = () => ({ isDestroyed: () => false, webContents: SENDER }) as never;
    voz = registrarVoz({ raizDoProjeto: userData, janelaPrincipal: janela });
    registrarVozGuardada({ janelaPrincipal: janela, importarDeArquivo: voz.importarDeArquivo });
  }

  it('só a janela do app fala com os canais', async () => {
    montar();
    const r = (await handlers.get(CANAIS_VOZ_GUARDADA.listar)!({ sender: { id: 99 } })) as { ok: boolean };
    expect(r.ok).toBe(false);
    const s = (await handlers.get(CANAIS_VOZ_GUARDADA.consentir)!({ sender: { id: 99 } }, consentimento)) as { ok: boolean };
    expect(s.ok).toBe(false);
    expect(fs.existsSync(path.join(pasta, 'consentimento.json'))).toBe(false);
  });

  it('uma gravação vira a base da voz clonada pela importação de sempre — com o termo da voz clonada', async () => {
    montar();
    await chamar(CANAIS_VOZ_GUARDADA.consentir, consentimento);
    await chamar(CANAIS_VOZ_GUARDADA.salvar, pedido({ texto: 'Hoje eu quero contar uma coisa.' }));

    // Sem o termo da voz clonada, recusa (o mesmo que a importação exige).
    const sem = await chamar<{ ok: boolean; erro?: string }>(CANAIS_VOZ_GUARDADA.usarComoReferencia, ID1, { texto: 'curto', aceitoEm: 'x' });
    expect(sem.ok).toBe(false);

    const termoDaClonada = { texto: 'Declaro que o áudio contém a voz do próprio paciente que usa este computador.', aceitoEm: '2026-10-19T10:00:00Z', perfilId: 'p1' };
    const r = await chamar<{ ok: boolean }>(CANAIS_VOZ_GUARDADA.usarComoReferencia, ID1, termoDaClonada);
    expect(r.ok).toBe(true);
    const meta = JSON.parse(fs.readFileSync(path.join(userData, 'voz', 'referencia.json'), 'utf8'));
    expect(meta.consentimento).toMatchObject({ texto: termoDaClonada.texto, aceitoEm: termoDaClonada.aceitoEm, perfilId: 'p1' });
    expect(meta.nomeDoArquivo).toBe('Gravação guardada: "Hoje eu quero contar uma coisa."');
    const estado = await chamar<{ voz: { importada: boolean } }>(CANAIS_VOZ.estado);
    expect(estado.voz.importada).toBe(true);
    // A gravação continua guardada: virar base não a consome.
    expect(fs.existsSync(path.join(pasta, `${ID1}.wav`))).toBe(true);
  }, PRAZO_DO_TESTE);

  it('id inexistente (ou um caminho) não chega ao motor', async () => {
    montar();
    await chamar(CANAIS_VOZ_GUARDADA.consentir, consentimento);
    const termo = { texto: 'Declaro que o áudio contém a voz do próprio paciente que usa este computador.', aceitoEm: 'agora' };
    for (const id of [ID2, '/etc/passwd', '../referencia']) {
      const r = await chamar<{ ok: boolean }>(CANAIS_VOZ_GUARDADA.usarComoReferencia, id, termo);
      expect(r.ok).toBe(false);
    }
    expect(fs.existsSync(path.join(userData, 'voz', 'referencia.json'))).toBe(false);
  }, PRAZO_DO_TESTE);

  it('remover a voz clonada NÃO apaga as gravações guardadas', async () => {
    montar();
    await chamar(CANAIS_VOZ_GUARDADA.consentir, consentimento);
    await chamar(CANAIS_VOZ_GUARDADA.salvar, pedido());
    await chamar(CANAIS_VOZ.remover);
    const l = await chamar<{ ok: boolean; gravacoes: unknown[] }>(CANAIS_VOZ_GUARDADA.listar);
    expect(l.ok && l.gravacoes).toHaveLength(1);
  }, PRAZO_DO_TESTE);
});

// -----------------------------------------------------------------------------
// Revisão final, rodada 1 (M4, 21/10/2026): remover o paciente apaga a voz dele.
// A gravação é dado biométrico: antes, remover o perfil deixava as gravações e o
// termo no computador — e o backup "Tudo" os levava, sem dono. `apagarDoPerfil`
// tira tudo do perfil e não toca no de mais ninguém.
// -----------------------------------------------------------------------------
describe('apagarDoPerfil: remover o paciente apaga a voz dele', () => {
  const ID3 = '33333333-3333-4333-8333-333333333333';
  const termoDe = (perfilId: string | null) => ({ texto: TERMO, aceitoEm: '2026-10-20T09:00:00Z', perfilId });
  const comDoisPerfis = () => {
    const a = criarArmazemDeGravacoes(pasta);
    a.consentir(termoDe('perfil-A'));
    a.consentir(termoDe('perfil-B'));
    a.salvar({ ...pedido({ id: ID1 }), perfilId: 'perfil-A' });
    a.salvar({ ...pedido({ id: ID2, texto: 'Quero água.' }), perfilId: 'perfil-A' });
    a.salvar({ ...pedido({ id: ID3, texto: 'Boa noite.' }), perfilId: 'perfil-B' });
    return a;
  };

  it('tira do disco os áudios e o termo do perfil — e deixa os do outro', () => {
    const a = comDoisPerfis();
    expect(a.apagarDoPerfil('perfil-A')).toEqual({ ok: true });
    expect(fs.existsSync(path.join(pasta, `${ID1}.wav`))).toBe(false);
    expect(fs.existsSync(path.join(pasta, `${ID2}.wav`))).toBe(false);
    expect(fs.existsSync(path.join(pasta, `${ID3}.wav`))).toBe(true);
    const l = a.listar();
    expect(l.ok && l.gravacoes.map((g) => g.id)).toEqual([ID3]);
    expect(l.ok && l.consentimentos.map((c) => c.perfilId)).toEqual(['perfil-B']);
  });

  it('o backup completo não leva mais nada do perfil removido', () => {
    const a = comDoisPerfis();
    a.apagarDoPerfil('perfil-A');
    const b = a.arquivosParaBackup();
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const conteudo = JSON.stringify(b);
    expect(conteudo).not.toContain(ID1);
    expect(conteudo).not.toContain(ID2);
    expect(conteudo).not.toContain('perfil-A');
    expect(conteudo).toContain(ID3);
  });

  it('o arquivo do perfil sem nenhum dado é um sucesso (remover duas vezes não falha)', () => {
    const a = criarArmazemDeGravacoes(pasta);
    expect(a.apagarDoPerfil('nunca-gravou')).toEqual({ ok: true });
    const b = comDoisPerfis();
    expect(b.apagarDoPerfil('perfil-A').ok).toBe(true);
    expect(b.apagarDoPerfil('perfil-A').ok).toBe(true);
  });

  it('o perfil que não existe não leva nada junto (sem perfil é outro titular)', () => {
    const a = comDoisPerfis();
    a.consentir(termoDe(null));
    a.salvar({ ...pedido({ id: '44444444-4444-4444-8444-444444444444' }), perfilId: null });
    expect(a.apagarDoPerfil('perfil-A').ok).toBe(true);
    const l = a.listar();
    expect(l.ok && l.gravacoes).toHaveLength(2);
    expect(l.ok && l.consentimentos.map((c) => c.perfilId).sort()).toEqual(['perfil-B', null].sort());
  });

  it('id de perfil que não é texto é recusado sem apagar nada', () => {
    const a = comDoisPerfis();
    for (const ruim of [undefined, null, 42, '', {}]) {
      const r = a.apagarDoPerfil(ruim as never);
      expect(r.ok).toBe(false);
    }
    const l = a.listar();
    expect(l.ok && l.gravacoes).toHaveLength(3);
  });

  it('índice preso agora (antivírus): recusa e diz, sem apagar parte — o app avisa e a pessoa tenta de novo', () => {
    const a = comDoisPerfis();
    const lerDeVerdade = fs.readFileSync;
    const preso = vi.spyOn(fs, 'readFileSync').mockImplementation(((arquivo: fs.PathOrFileDescriptor, ...resto: unknown[]) => {
      if (String(arquivo).endsWith('indice.json')) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return (lerDeVerdade as (...x: unknown[]) => unknown)(arquivo, ...resto);
    }) as typeof fs.readFileSync);
    const r = a.apagarDoPerfil('perfil-A');
    preso.mockRestore();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toMatch(/Tente de novo/);
    expect(fs.existsSync(path.join(pasta, `${ID1}.wav`))).toBe(true);
    const l = a.listar();
    expect(l.ok && l.consentimentos.map((c) => c.perfilId).sort()).toEqual(['perfil-A', 'perfil-B']);
  });

  it('áudio órfão do perfil (no índice, sem arquivo) também sai do índice', () => {
    const a = comDoisPerfis();
    fs.rmSync(path.join(pasta, `${ID1}.wav`));
    expect(a.apagarDoPerfil('perfil-A').ok).toBe(true);
    const indice = JSON.parse(fs.readFileSync(path.join(pasta, 'indice.json'), 'utf8'));
    expect(indice.gravacoes.map((g: { id: string }) => g.id)).toEqual([ID3]);
  });
});

describe('apagarDoPerfil pelo canal IPC', () => {
  const SENDER = { id: 1 };
  const janela = () => ({ isDestroyed: () => false, webContents: SENDER }) as never;

  it('só a janela do app apaga a voz de um perfil', async () => {
    const armazem = registrarVozGuardada({ janelaPrincipal: janela, importarDeArquivo: async () => ({ ok: false, erro: 'x' }) });
    armazem.consentir({ texto: TERMO, aceitoEm: '2026-10-20T09:00:00Z', perfilId: 'perfil-A' });
    armazem.salvar({ ...pedido(), perfilId: 'perfil-A' });
    const canal = handlers.get(CANAIS_VOZ_GUARDADA.apagarDoPerfil)!;
    expect(canal).toBeTypeOf('function');
    const de_fora = (await canal({ sender: { id: 99 } }, 'perfil-A')) as { ok: boolean };
    expect(de_fora.ok).toBe(false);
    expect(fs.existsSync(path.join(pasta, `${ID1}.wav`))).toBe(true);
    const da_janela = (await canal({ sender: SENDER }, 'perfil-A')) as { ok: boolean };
    expect(da_janela.ok).toBe(true);
    expect(fs.existsSync(path.join(pasta, `${ID1}.wav`))).toBe(false);
  });
});

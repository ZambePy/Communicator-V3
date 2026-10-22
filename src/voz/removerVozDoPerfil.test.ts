// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -----------------------------------------------------------------------------
// Remover o paciente apaga a voz clonada IMPORTADA dele (revisão final, rodada 2,
// N1, 21/10/2026). A voz clonada é única por computador e guarda o termo de quem
// a autorizou (`consentimento.perfilId`). Antes, remover o perfil deixava a
// referência (a voz da pessoa), o termo e as frases já sintetizadas no disco, e o
// perfil seguinte passava a falar com a voz de quem foi removido.
//
// A regra: sai SÓ se o termo for daquele perfil. Se for de outro paciente, ou de
// ninguém, fica. Pelo id do perfil, nunca por caminho; e só a janela do app pede.
// Usa o `registrarVoz` REAL, com o módulo `electron` simulado e o motor falso.
// -----------------------------------------------------------------------------

const MOTOR = path.resolve(__dirname, '..', '..', 'fixtures', 'motor-de-voz-falso.cjs');
let userData = '';
const handlers = new Map<string, (...a: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { getPath: () => userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => undefined },
  dialog: {
    showOpenDialog: async () => ({ canceled: false, filePaths: [dialogo.arquivo] }),
  },
  ipcMain: { handle: (canal: string, fn: (...a: unknown[]) => unknown) => handlers.set(canal, fn) },
}));
vi.mock('../../electron/voz/sidecar', async (original) => ({
  ...(await original<typeof import('../../electron/voz/sidecar')>()),
  localizarMotor: () => ({ comando: process.execPath, args: [MOTOR], origem: 'python' as const }),
}));

/** Arquivo "escolhido" no diálogo do sistema; `LENTO:<ms>` atrasa o preparo no motor falso. */
const dialogo = { arquivo: '/qualquer/voz-do-paciente.ogg' };

/** No Windows abrir e fechar o motor falso leva segundos (ver sidecar.test.ts): prazo folgado lá. */
const PRAZO_DO_TESTE = process.platform === 'win32' ? 90_000 : 20_000;

import { registrarVoz, type ControleDaVoz } from '../../electron/voz/index';
import { CANAIS_VOZ } from './protocolo';

const SENDER = { id: 1 };
const chamar = <T,>(canal: string, ...args: unknown[]) => handlers.get(canal)!({ sender: SENDER }, ...args) as Promise<T>;
const termoDe = (perfilId: string | null) => ({
  texto: 'Eu autorizo o uso da minha voz para a voz personalizada do IrisFlow.',
  aceitoEm: '2026-10-21T10:00:00Z',
  perfilId,
});

let voz: ControleDaVoz;
const pastaVoz = () => path.join(userData, 'voz');
const arquivoDaReferencia = () => path.join(pastaVoz(), 'referencia.wav');
const arquivoDoMeta = () => path.join(pastaVoz(), 'referencia.json');

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'irisflow-voz-perfil-'));
  handlers.clear();
  dialogo.arquivo = '/qualquer/voz-do-paciente.ogg';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  voz = registrarVoz({
    raizDoProjeto: userData,
    janelaPrincipal: () => ({ isDestroyed: () => false, webContents: SENDER }) as never,
  });
});

afterEach(() => {
  voz?.matarAgora();
  vi.restoreAllMocks();
});

/** Importa a voz com o termo de `perfilId` e deixa uma frase sintetizada no cache. */
async function importarComCache(perfilId: string | null): Promise<void> {
  expect((await chamar<{ ok: boolean }>(CANAIS_VOZ.importar, termoDe(perfilId))).ok).toBe(true);
  const r = await chamar<{ ok: boolean }>(CANAIS_VOZ.sintetizar, 'Quero água', {});
  expect(r.ok).toBe(true);
  expect(fs.readdirSync(path.join(pastaVoz(), 'cache'))).toHaveLength(1);
}

const vozFicou = (): boolean =>
  fs.existsSync(arquivoDaReferencia()) && fs.existsSync(arquivoDoMeta()) && fs.readdirSync(path.join(pastaVoz(), 'cache')).length === 1;


/**
 * Estes testes abrem e matam processos de verdade (o motor de voz falso). No PC
 * do dono (Windows, pasta no OneDrive, antivírus olhando cada processo novo, a
 * suíte inteira em paralelo) isso leva de segundos a mais de 10 s e os testes
 * caem por TEMPO, não por defeito — três rodadas seguidas do `npm run publicar`
 * pararam em testes diferentes daqui (22/10/2026). No Windows eles rodam só no
 * CI do GitHub Actions (`GITHUB_ACTIONS`; o `CI` não serve: o verificar-tudo o liga também no PC), que continua barrando defeito de verdade; no
 * Linux, sempre.
 */
const SO_NO_CI = process.platform === 'win32' && !process.env.GITHUB_ACTIONS;

describe.skipIf(SO_NO_CI)('remover a voz clonada junto com o paciente (N1)', () => {
  it('o canal existe', () => {
    expect(CANAIS_VOZ.removerDoPerfil).toBe('irisflow:voz-remover-do-perfil');
    expect(handlers.get(CANAIS_VOZ.removerDoPerfil)).toBeTypeOf('function');
  });

  it('o termo é DAQUELE perfil: a referência, o termo e o cache de frases saem, e o estado diz que não há voz', async () => {
    await importarComCache('perfil-A');

    const r = await chamar<{ ok: boolean; removida?: boolean }>(CANAIS_VOZ.removerDoPerfil, 'perfil-A');

    expect(r).toEqual({ ok: true, removida: true });
    expect(fs.existsSync(arquivoDaReferencia())).toBe(false);
    expect(fs.existsSync(arquivoDoMeta())).toBe(false);
    expect(fs.existsSync(`${arquivoDoMeta()}.bak`)).toBe(false);
    expect(fs.existsSync(path.join(pastaVoz(), 'estado.json'))).toBe(false);
    expect(fs.readdirSync(path.join(pastaVoz(), 'cache'))).toEqual([]);
    const estado = await chamar<{ voz: { importada: boolean }; ativa: boolean; cache: { itens: number } }>(CANAIS_VOZ.estado);
    expect(estado.voz.importada).toBe(false);
    expect(estado.ativa).toBe(false);
    expect(estado.cache.itens).toBe(0);
    // E a síntese seguinte não encontra voz nenhuma.
    expect(await chamar(CANAIS_VOZ.sintetizar, 'Quero água', {})).toMatchObject({ ok: false, motivo: 'sem_voz' });
  }, PRAZO_DO_TESTE);

  it('o termo é de OUTRO paciente: a voz fica inteira (referência, termo, estado e cache)', async () => {
    await importarComCache('perfil-B');
    const antes = fs.readFileSync(arquivoDoMeta(), 'utf8');

    const r = await chamar<{ ok: boolean; removida?: boolean }>(CANAIS_VOZ.removerDoPerfil, 'perfil-A');

    expect(r).toEqual({ ok: true, removida: false });
    expect(vozFicou()).toBe(true);
    expect(fs.readFileSync(arquivoDoMeta(), 'utf8')).toBe(antes);
    const estado = await chamar<{ voz: { importada: boolean }; ativa: boolean }>(CANAIS_VOZ.estado);
    expect(estado.voz.importada).toBe(true);
    expect(estado.ativa).toBe(true);
  }, PRAZO_DO_TESTE);

  it('o termo é de NINGUÉM (sem perfil): a voz fica', async () => {
    await importarComCache(null);
    const r = await chamar<{ ok: boolean; removida?: boolean }>(CANAIS_VOZ.removerDoPerfil, 'perfil-A');
    expect(r).toEqual({ ok: true, removida: false });
    expect(vozFicou()).toBe(true);
  }, PRAZO_DO_TESTE);

  it('não há voz nenhuma: nada a apagar é um sucesso (remover duas vezes não falha)', async () => {
    expect(await chamar(CANAIS_VOZ.removerDoPerfil, 'perfil-A')).toEqual({ ok: true, removida: false });
    await importarComCache('perfil-A');
    expect(await chamar(CANAIS_VOZ.removerDoPerfil, 'perfil-A')).toEqual({ ok: true, removida: true });
    expect(await chamar(CANAIS_VOZ.removerDoPerfil, 'perfil-A')).toEqual({ ok: true, removida: false });
  }, PRAZO_DO_TESTE);

  it('só a janela do app apaga: de fora, recusa e a voz fica', async () => {
    await importarComCache('perfil-A');
    const r = (await handlers.get(CANAIS_VOZ.removerDoPerfil)!({ sender: { id: 99 } }, 'perfil-A')) as { ok: boolean };
    expect(r.ok).toBe(false);
    expect(vozFicou()).toBe(true);
  }, PRAZO_DO_TESTE);

  it('o id do perfil tem de ser um texto: qualquer outra coisa é recusada sem apagar', async () => {
    await importarComCache('perfil-A');
    for (const ruim of [undefined, null, 42, '', {}, ['perfil-A']]) {
      const r = await chamar<{ ok: boolean }>(CANAIS_VOZ.removerDoPerfil, ruim);
      expect(r.ok, String(ruim)).toBe(false);
    }
    expect(vozFicou()).toBe(true);
  }, PRAZO_DO_TESTE);

  it('o id nunca é caminho: um nome de arquivo no lugar do perfil não apaga nem lê nada fora da voz', async () => {
    await importarComCache('perfil-A');
    const fora = path.join(userData, 'fora.txt');
    fs.writeFileSync(fora, 'meu');
    const r = await chamar<{ ok: boolean; removida?: boolean }>(CANAIS_VOZ.removerDoPerfil, fora);
    expect(r).toEqual({ ok: true, removida: false });
    expect(fs.existsSync(fora)).toBe(true);
    expect(vozFicou()).toBe(true);
  }, PRAZO_DO_TESTE);

  it('apagar falha (arquivo preso): diz que falhou, em vez de fingir que apagou', async () => {
    await importarComCache('perfil-A');
    const rmDeVerdade = fs.rmSync;
    const preso = vi.spyOn(fs, 'rmSync').mockImplementation(((alvo: fs.PathLike, ...resto: unknown[]) => {
      if (String(alvo).endsWith('referencia.wav')) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return (rmDeVerdade as (...x: unknown[]) => unknown)(alvo, ...resto);
    }) as typeof fs.rmSync);
    const r = await chamar<{ ok: boolean; erro?: string }>(CANAIS_VOZ.removerDoPerfil, 'perfil-A');
    preso.mockRestore();
    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/EBUSY|preso/i);
    // O termo continua: dá para tentar de novo.
    expect(fs.existsSync(arquivoDoMeta())).toBe(true);
    expect(await chamar(CANAIS_VOZ.removerDoPerfil, 'perfil-A')).toEqual({ ok: true, removida: true });
  }, PRAZO_DO_TESTE);

  it('a síntese em voo da voz removida não é gravada nem devolvida', async () => {
    await importarComCache('perfil-A');
    const emVoo = chamar<{ ok: boolean; motivo?: string; wav?: ArrayBuffer }>(CANAIS_VOZ.sintetizar, 'LENTO:1200 outra frase', {});
    await new Promise((r) => setTimeout(r, 300));
    expect(await chamar(CANAIS_VOZ.removerDoPerfil, 'perfil-A')).toEqual({ ok: true, removida: true });
    const r = await emVoo;
    expect(r.ok).toBe(false);
    expect(r.wav).toBeUndefined();
    expect(fs.readdirSync(path.join(pastaVoz(), 'cache'))).toEqual([]);
  }, PRAZO_DO_TESTE);

  it('uma importação EM PREPARO para o perfil removido não grava a voz de volta', async () => {
    dialogo.arquivo = '/qualquer/LENTO:1200-voz.ogg';
    const importando = chamar<{ ok: boolean; erro?: string }>(CANAIS_VOZ.importar, termoDe('perfil-A'));
    await new Promise((r) => setTimeout(r, 300));

    const r = await chamar<{ ok: boolean; removida?: boolean }>(CANAIS_VOZ.removerDoPerfil, 'perfil-A');

    expect(r.ok).toBe(true);
    const importacao = await importando;
    expect(importacao.ok).toBe(false);
    expect(fs.existsSync(arquivoDaReferencia())).toBe(false);
    expect(fs.existsSync(arquivoDoMeta())).toBe(false);
  }, PRAZO_DO_TESTE);

  it('uma importação em preparo para o perfil removido NÃO leva a voz de outro paciente que já estava lá', async () => {
    await importarComCache('perfil-B');
    dialogo.arquivo = '/qualquer/LENTO:1200-voz.ogg';
    const importando = chamar<{ ok: boolean }>(CANAIS_VOZ.importar, termoDe('perfil-A'));
    await new Promise((r) => setTimeout(r, 300));

    expect(await chamar(CANAIS_VOZ.removerDoPerfil, 'perfil-A')).toMatchObject({ ok: true, removida: false });

    expect((await importando).ok).toBe(false);
    // A voz do B continua a de antes: a importação do A foi descartada antes de trocá-la.
    expect(JSON.parse(fs.readFileSync(arquivoDoMeta(), 'utf8')).consentimento.perfilId).toBe('perfil-B');
    expect(vozFicou()).toBe(true);
  }, PRAZO_DO_TESTE);
});

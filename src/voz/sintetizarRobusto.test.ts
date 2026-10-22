// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 5), lado do
// processo principal: o `sintetizar` podia REJEITAR o `invoke` — um
// `readFileSync` do cache fora do `try` (EBUSY com o antivírus, ENOENT quando
// `podarCache` apagava o arquivo entre o `existsSync` e a leitura) e o `rmSync`
// do `finally` (EPERM/EBUSY no Windows, que substitui o retorno). No renderer a
// frase do paciente sumia. Aqui, o `registrarVoz` REAL com o motor falso.
// -----------------------------------------------------------------------------

const MOTOR = path.resolve(__dirname, '..', '..', 'fixtures', 'motor-de-voz-falso.cjs');
let userData = '';
const handlers = new Map<string, (...a: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { getPath: () => userData, isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/qualquer/voz-do-paciente.ogg'] }) },
  ipcMain: { handle: (canal: string, fn: (...a: unknown[]) => unknown) => handlers.set(canal, fn) },
}));
vi.mock('../../electron/voz/sidecar', async (original) => ({
  ...(await original<typeof import('../../electron/voz/sidecar')>()),
  localizarMotor: () => ({ comando: process.execPath, args: [MOTOR], origem: 'python' as const }),
}));

import { registrarVoz, type ControleDaVoz } from '../../electron/voz/index';
import { CANAIS_VOZ, normalizarTextoParaFala, type ResultadoDaSintese } from './protocolo';

const SENDER = { id: 1 };
const chamar = <T,>(canal: string, ...args: unknown[]) => handlers.get(canal)!({ sender: SENDER }, ...args) as Promise<T>;
const CONSENTIMENTO = {
  texto: 'Eu autorizo o uso da minha voz para a voz personalizada do IrisFlow.',
  aceitoEm: '2026-09-27T10:00:00Z',
  perfilId: null,
};

let voz: ControleDaVoz;
const pastaVoz = () => path.join(userData, 'voz');

/** Onde a frase fica no cache (a mesma conta do main). */
function arquivoDoCache(texto: string): string {
  const meta = JSON.parse(fs.readFileSync(path.join(pastaVoz(), 'referencia.json'), 'utf8')) as { vozId: string };
  const chave = createHash('sha256').update(`${meta.vozId}|${normalizarTextoParaFala(texto)}`, 'utf-8').digest('hex');
  return path.join(pastaVoz(), 'cache', `${chave}.wav`);
}

beforeEach(async () => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'irisflow-voz-robusta-'));
  handlers.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  voz = registrarVoz({
    raizDoProjeto: userData,
    janelaPrincipal: () => ({ isDestroyed: () => false, webContents: SENDER }) as never,
  });
  expect((await chamar<{ ok: boolean }>(CANAIS_VOZ.importar, CONSENTIMENTO)).ok).toBe(true);
});

afterEach(() => {
  voz?.matarAgora();
  vi.restoreAllMocks();
});


/** No Windows abrir e fechar o motor falso leva segundos (ver sidecar.test.ts): prazo folgado lá. */
const PRAZO_DO_TESTE = process.platform === 'win32' ? 90_000 : 20_000;


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

describe.skipIf(SO_NO_CI)('sintetizar nunca rejeita o IPC', () => {
  it('a frase do cache não pode ser lida: vale como "fora do cache", sem rejeitar', async () => {
    // Um diretório no lugar do WAV: `existsSync` diz que existe e a leitura
    // falha (EISDIR) — o mesmo caminho do arquivo preso pelo antivírus.
    fs.mkdirSync(arquivoDoCache('Quero água'), { recursive: true });
    const r = await chamar<ResultadoDaSintese>(CANAIS_VOZ.sintetizar, 'Quero água', { soCache: true });
    expect(r).toEqual({ ok: false, motivo: 'nao_em_cache' });
  }, PRAZO_DO_TESTE);

  it('o cache recusa guardar a frase nova: ela toca do temporário mesmo assim', async () => {
    fs.mkdirSync(arquivoDoCache('Quero água'), { recursive: true });
    const r = await chamar<ResultadoDaSintese>(CANAIS_VOZ.sintetizar, 'Quero água', {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(Buffer.from(r.wav).toString()).toBe('RIFF-falso-wav');
    // Nada sobrou em tmp/.
    expect(fs.readdirSync(path.join(pastaVoz(), 'tmp'))).toEqual([]);
  }, PRAZO_DO_TESTE);

  it('o `rmSync` do `finally` lança (EPERM no Windows): a frase pronta continua sendo devolvida', async () => {
    const rmSync = fs.rmSync;
    vi.spyOn(fs, 'rmSync').mockImplementation(((alvo: fs.PathLike, opcoes?: fs.RmOptions) => {
      if (String(alvo).endsWith('.part.wav')) throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
      return rmSync(alvo, opcoes);
    }) as typeof fs.rmSync);
    const r = await chamar<ResultadoDaSintese>(CANAIS_VOZ.sintetizar, 'Estou com sede', {});
    expect(r.ok).toBe(true);
  }, PRAZO_DO_TESTE);

  it('qualquer outra exceção vira `{ ok: false, motivo: "motor" }`, e não rejeição', async () => {
    vi.spyOn(fs, 'existsSync').mockImplementation(() => { throw new Error('disco sumiu'); });
    await expect(chamar<ResultadoDaSintese>(CANAIS_VOZ.sintetizar, 'Oi', {})).resolves.toMatchObject({
      ok: false,
      motivo: 'motor',
      erro: 'disco sumiu',
    });
  }, PRAZO_DO_TESTE);
});

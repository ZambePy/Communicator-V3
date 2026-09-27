// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// -----------------------------------------------------------------------------
// "Remover voz" apaga tudo menos os pesos do modelo (voz é dado biométrico; a
// remoção é a revogação do consentimento). Estes testes usam o
// `registrarVoz` REAL, com o módulo `electron` simulado e o motor falso de
// mesmo contrato do Python no lugar do processo real.
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
// Motor falso em qualquer sistema (o executável empacotado só existe no Windows).
vi.mock('../../electron/voz/sidecar', async (original) => ({
  ...(await original<typeof import('../../electron/voz/sidecar')>()),
  localizarMotor: () => ({ comando: process.execPath, args: [MOTOR], origem: 'python' as const }),
}));

/** Arquivo "escolhido" no diálogo do sistema; `LENTO:<ms>` atrasa o preparo no motor falso. */
const dialogo = { arquivo: '/qualquer/voz-do-paciente.ogg' };

import { registrarVoz, type ControleDaVoz } from '../../electron/voz/index';
import { CANAIS_VOZ } from './protocolo';

const SENDER = { id: 1 };
const chamar = <T,>(canal: string, ...args: unknown[]) => handlers.get(canal)!({ sender: SENDER }, ...args) as Promise<T>;
const CONSENTIMENTO = {
  texto: 'Eu autorizo o uso da minha voz para a voz personalizada do IrisFlow.',
  aceitoEm: '2026-09-27T10:00:00Z',
  perfilId: null,
};

let voz: ControleDaVoz;
const pastaVoz = () => path.join(userData, 'voz');

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'irisflow-voz-'));
  handlers.clear();
  dialogo.arquivo = '/qualquer/voz-do-paciente.ogg';
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  voz?.matarAgora();
  vi.restoreAllMocks();
});

function montar(): void {
  voz = registrarVoz({
    raizDoProjeto: userData,
    janelaPrincipal: () => ({ isDestroyed: () => false, webContents: SENDER }) as never,
  });
}

describe('Remover voz (CORE-5)', () => {
  it('uma síntese em voo na hora da remoção não é gravada nem devolvida para tocar; tmp/ fica vazia', async () => {
    montar();
    expect((await chamar<{ ok: boolean }>(CANAIS_VOZ.importar, CONSENTIMENTO)).ok).toBe(true);
    // Resto de uma importação interrompida.
    fs.writeFileSync(path.join(pastaVoz(), 'tmp', 'referencia.part.wav'), 'RIFF-resto');

    const emVoo = chamar<{ ok: boolean; motivo?: string; wav?: ArrayBuffer }>(CANAIS_VOZ.sintetizar, 'LENTO:1200 quero água', {});
    await new Promise((r) => setTimeout(r, 300));
    await chamar(CANAIS_VOZ.remover);
    const r = await emVoo;

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('sem_voz');
    expect(r.wav).toBeUndefined();
    expect(fs.readdirSync(path.join(pastaVoz(), 'cache'))).toEqual([]);
    expect(fs.readdirSync(path.join(pastaVoz(), 'tmp'))).toEqual([]);
    // Nem a referência, nem os metadados (com as cópias .bak do consentimento).
    const restos = fs.readdirSync(pastaVoz()).filter((n) => !['cache', 'tmp', 'modelos'].includes(n));
    expect(restos).toEqual([]);
  }, 20_000);

  it('uma importação em preparo na hora da remoção não grava a voz de volta', async () => {
    montar();
    dialogo.arquivo = '/qualquer/LENTO:1200-voz.ogg';
    const importando = chamar<{ ok: boolean; erro?: string }>(CANAIS_VOZ.importar, CONSENTIMENTO);
    await new Promise((r) => setTimeout(r, 300));
    await chamar(CANAIS_VOZ.remover);
    const r = await importando;
    expect(r.ok).toBe(false);
    expect(fs.existsSync(path.join(pastaVoz(), 'referencia.wav'))).toBe(false);
    expect(fs.existsSync(path.join(pastaVoz(), 'referencia.json'))).toBe(false);
    const estado = await chamar<{ voz: { importada: boolean } }>(CANAIS_VOZ.estado);
    expect(estado.voz.importada).toBe(false);
  }, 20_000);

  it('remover encerra o motor (o condicionamento da voz fica na memória do processo)', async () => {
    montar();
    expect((await chamar<{ ok: boolean }>(CANAIS_VOZ.importar, CONSENTIMENTO)).ok).toBe(true);
    let estado = await chamar<{ motor: string }>(CANAIS_VOZ.sondar);
    expect(estado.motor).toBe('pronto');
    await chamar(CANAIS_VOZ.remover);
    await voz.encerrarEAguardar();
    estado = await chamar<{ motor: string }>(CANAIS_VOZ.estado);
    expect(estado.motor).toBe('parado');
  }, 20_000);

  it('restos de uma sessão anterior em tmp/ são apagados ao abrir', () => {
    fs.mkdirSync(path.join(userData, 'voz', 'tmp'), { recursive: true });
    fs.writeFileSync(path.join(userData, 'voz', 'tmp', 'abc.part.wav'), 'RIFF-resto');
    montar();
    expect(fs.readdirSync(path.join(pastaVoz(), 'tmp'))).toEqual([]);
  });

  it('um referencia.json truncado não faz a voz sumir: a cópia .bak responde', async () => {
    montar();
    expect((await chamar<{ ok: boolean }>(CANAIS_VOZ.importar, CONSENTIMENTO)).ok).toBe(true);
    // Uma segunda gravação produz a cópia; depois o principal é truncado (queda de energia).
    await chamar(CANAIS_VOZ.ativar, true);
    const meta = path.join(pastaVoz(), 'referencia.json');
    fs.copyFileSync(meta, `${meta}.bak`);
    const cheio = fs.readFileSync(meta, 'utf8');
    fs.writeFileSync(meta, cheio.slice(0, Math.floor(cheio.length / 2)));
    voz.matarAgora();
    handlers.clear();
    montar(); // app reaberto
    const estado = await chamar<{ voz: { importada: boolean; consentimentoEm?: string } }>(CANAIS_VOZ.estado);
    expect(estado.voz.importada).toBe(true);
    expect(estado.voz.consentimentoEm).toBe(CONSENTIMENTO.aceitoEm);
  }, 20_000);
});

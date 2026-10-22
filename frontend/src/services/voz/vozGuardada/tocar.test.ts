import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ArmazemDaVozGuardada } from './armazem';

// A mensagem guardada é a voz da própria pessoa, tocada por outro caminho que
// `falar()`. Ela também é fala do paciente: a varredura falada (rodada 3,
// 21/10/2026) não pode anunciar um botão por cima dela, nem na leitura da
// gravação do disco, nem na volta para a voz do computador.

const voz = vi.hoisted(() => ({ falar: vi.fn(), pararFala: vi.fn() }));
const local = vi.hoisted(() => ({ tocarWav: vi.fn() }));
vi.mock('../index', () => voz);
vi.mock('../local', () => local);
vi.mock('./armazem', () => ({ armazemDaVozGuardada: () => ({ ler: vi.fn() }) }));

import { tocarMensagemGuardada } from './tocar';
import { pacienteFalando, _reiniciarFalaEmCurso } from '../falaEmCurso';

const GRAVACAO = { id: 'g1', texto: 'Estou com dor' };
const armazemCom = (ler: () => Promise<unknown>) => ({ ler: vi.fn(ler) }) as unknown as ArmazemDaVozGuardada;

describe('tocarMensagemGuardada marca a fala do paciente', () => {
  beforeEach(() => {
    _reiniciarFalaEmCurso();
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    _reiniciarFalaEmCurso();
    vi.restoreAllMocks();
  });

  it('vale desde a chamada, na leitura do disco e enquanto a gravação toca, e cai no fim', async () => {
    let lerTerminou!: () => void;
    let tocarTerminou!: () => void;
    const armazem = armazemCom(() => new Promise((r) => { lerTerminou = () => r({ ok: true, wav: new ArrayBuffer(8) }); }));
    local.tocarWav.mockImplementationOnce(() => new Promise<boolean>((r) => { tocarTerminou = () => r(true); }));

    const toque = tocarMensagemGuardada(GRAVACAO, armazem);
    expect(pacienteFalando()).toBe(true);
    lerTerminou();
    await vi.waitFor(() => expect(local.tocarWav).toHaveBeenCalled());
    expect(pacienteFalando()).toBe(true);
    tocarTerminou();
    await expect(toque).resolves.toEqual({ como: 'gravacao' });
    expect(pacienteFalando()).toBe(false);
  });

  it('gravação que não abre: continua marcada na volta para a voz do computador', async () => {
    let terminarFala!: () => void;
    voz.falar.mockImplementationOnce(() => new Promise((r) => { terminarFala = () => r({ origem: 'sistema' }); }));
    const toque = tocarMensagemGuardada(GRAVACAO, armazemCom(async () => ({ ok: false, erro: 'arquivo apagado' })));
    await vi.waitFor(() => expect(voz.falar).toHaveBeenCalledWith('Estou com dor', { rate: 0.9 }));
    expect(pacienteFalando()).toBe(true);
    terminarFala();
    await expect(toque).resolves.toMatchObject({ como: 'voz_do_computador' });
    expect(pacienteFalando()).toBe(false);
  });

  it('cai também quando a leitura do disco rejeita: a marca não pode ficar presa', async () => {
    const armazem = armazemCom(async () => { throw new Error('disco ocupado'); });
    await expect(tocarMensagemGuardada(GRAVACAO, armazem)).rejects.toThrow('disco ocupado');
    expect(pacienteFalando()).toBe(false);
  });
});

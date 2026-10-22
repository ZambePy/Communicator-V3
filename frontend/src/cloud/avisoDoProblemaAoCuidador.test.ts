import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  avisoParaOCuidador,
  ligarAvisoDoProblemaAoCuidador,
  ESPERA_ENTRE_AVISOS_MS,
  USO_RECENTE_MS,
  CONFERIR_A_VOLTA_MS,
  TEXTO_DE_VOLTA,
} from './avisoDoProblemaAoCuidador';
import type { ProblemaPersistente } from '../services/problemaDoRastreamento';

// Pedido de 18/10/2026: problema que dura vira aviso no celular do cuidador.

const T0 = 1_000_000_000;
const problema = (tipo: ProblemaPersistente['tipo'], desdeMs = T0): ProblemaPersistente => ({ tipo, desdeMs, mensagem: 'texto da tela' });

describe('aviso do problema persistente ao cuidador', () => {
  it('câmera parada vira aviso; olhos fechados nunca (é descanso ou sono)', () => {
    const estado = { ultimoAvisoPorTipo: {} };
    expect(avisoParaOCuidador(problema('camera'), { agoraMs: T0 + 45_000, ultimoRastreamentoOkMs: null, estado })).toMatch(/câmera do computador parou/);
    expect(avisoParaOCuidador(problema('olhos_fechados'), { agoraMs: T0 + 45_000, ultimoRastreamentoOkMs: T0 - 1000, estado })).toBeNull();
  });

  it('rosto fora da câmera só avisa se o olhar funcionava pouco antes (não acorda a casa com o computador ligado sem ninguém)', () => {
    const estado = { ultimoAvisoPorTipo: {} };
    const ctx = (ok: number | null) => ({ agoraMs: T0 + 45_000, ultimoRastreamentoOkMs: ok, estado });
    expect(avisoParaOCuidador(problema('rosto_perdido'), ctx(T0 - 2000))).toMatch(/não está vendo o rosto/);
    expect(avisoParaOCuidador(problema('rosto_perdido'), ctx(null))).toBeNull();
    expect(avisoParaOCuidador(problema('rosto_perdido'), ctx(T0 - USO_RECENTE_MS - 1))).toBeNull();
  });

  it('o mesmo tipo não se repete em menos de 15 min; outro tipo pode', () => {
    const estado = { ultimoAvisoPorTipo: { camera: T0 } };
    expect(avisoParaOCuidador(problema('camera'), { agoraMs: T0 + ESPERA_ENTRE_AVISOS_MS - 1, ultimoRastreamentoOkMs: null, estado })).toBeNull();
    expect(avisoParaOCuidador(problema('camera'), { agoraMs: T0 + ESPERA_ENTRE_AVISOS_MS, ultimoRastreamentoOkMs: null, estado })).not.toBeNull();
    expect(avisoParaOCuidador(problema('contraluz'), { agoraMs: T0 + 1, ultimoRastreamentoOkMs: null, estado })).toMatch(/luz forte atrás/);
  });

  it('liga: manda um pedido do tipo dispositivo, e uma nota na conversa quando o problema avisado resolve', () => {
    let ouvinte: ((p: ProblemaPersistente | null) => void) | null = null;
    const pedir = vi.fn();
    const nota = vi.fn();
    let agora = T0 + 45_000;
    let ok = T0 - 1000;
    const desligar = ligarAvisoDoProblemaAoCuidador({
      ouvir: (cb) => { ouvinte = cb; return () => { ouvinte = null; }; },
      ultimoOk: () => ok,
      pedir,
      nota,
      agora: () => agora,
      novoId: () => 'id-1',
    });
    ouvinte!(problema('modelo_do_olhar'));
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir).toHaveBeenCalledWith(expect.stringMatching(/modelo do olhar parou/), 'id-1');
    // O olhar voltou de verdade (rastreamento bom depois do aviso).
    ok = agora + 5_000;
    ouvinte!(null);
    expect(nota).toHaveBeenCalledWith(TEXTO_DE_VOLTA);
    // Volta logo: dentro da espera, não avisa de novo, e a resolução não gera outra nota.
    agora += 60_000;
    ouvinte!(problema('modelo_do_olhar', agora - 45_000));
    ouvinte!(null);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(nota).toHaveBeenCalledTimes(1);
    desligar();
    expect(ouvinte).toBeNull();
  });

  it('problema que não vira aviso também não gera a nota de volta', () => {
    let ouvinte: ((p: ProblemaPersistente | null) => void) | null = null;
    const pedir = vi.fn();
    const nota = vi.fn();
    ligarAvisoDoProblemaAoCuidador({ ouvir: (cb) => { ouvinte = cb; return () => {}; }, ultimoOk: () => null, pedir, nota, agora: () => T0, novoId: () => 'x' });
    ouvinte!(problema('olhos_fechados'));
    ouvinte!(null);
    expect(pedir).not.toHaveBeenCalled();
    expect(nota).not.toHaveBeenCalled();
  });

  it('calibração perdida avisa mesmo sem uso recente (ela só conta com o rosto na câmera e de olhos abertos)', () => {
    const estado = { ultimoAvisoPorTipo: {} };
    expect(avisoParaOCuidador(problema('calibracao_perdida'), { agoraMs: T0 + 45_000, ultimoRastreamentoOkMs: null, estado }))
      .toMatch(/calibração do olhar deixou de valer/);
  });

  it('olhar em modo reduzido (calibração suspensa pelo modelo) avisa, dizendo que o socorro funciona', () => {
    const estado = { ultimoAvisoPorTipo: {} };
    expect(avisoParaOCuidador(problema('olhar_reduzido'), { agoraMs: T0 + 45_000, ultimoRastreamentoOkMs: null, estado }))
      .toMatch(/só aciona o socorro/);
  });

  it('quarto escuro: avisa só se o olhar funcionava pouco antes (apagar a luz para dormir não acorda ninguém)', () => {
    const estado = { ultimoAvisoPorTipo: {} };
    expect(avisoParaOCuidador(problema('pouca_luz'), { agoraMs: T0 + 45_000, ultimoRastreamentoOkMs: T0 - 5000, estado })).toMatch(/escuro demais/);
    expect(avisoParaOCuidador(problema('pouca_luz'), { agoraMs: T0 + 45_000, ultimoRastreamentoOkMs: null, estado })).toBeNull();
  });

  describe('nota de volta só com o olhar de volta (revisão de segurança de 19/10/2026)', () => {
    afterEach(() => { vi.useRealTimers(); });

    function montar() {
      vi.useFakeTimers();
      let ouvinte: ((p: ProblemaPersistente | null) => void) | null = null;
      const pedir = vi.fn();
      const nota = vi.fn();
      const relogio = { agora: T0 + 45_000, ok: T0 - 1000 as number | null };
      const desligar = ligarAvisoDoProblemaAoCuidador({
        ouvir: (cb) => { ouvinte = cb; return () => { ouvinte = null; }; },
        ultimoOk: () => relogio.ok,
        pedir,
        nota,
        agora: () => relogio.agora,
        novoId: () => 'id',
      });
      return { emitir: (p: ProblemaPersistente | null) => ouvinte!(p), pedir, nota, relogio, desligar };
    }

    it('a câmera voltou, mas o rosto não: nada de "voltou a funcionar"; a nota vem quando o olhar volta de fato', () => {
      const t = montar();
      t.emitir(problema('camera'));
      expect(t.pedir).toHaveBeenCalledTimes(1);
      // Troca de problema: o persistente anterior "resolve", mas o olhar não voltou.
      t.emitir(null);
      vi.advanceTimersByTime(CONFERIR_A_VOLTA_MS * 6);
      expect(t.nota).not.toHaveBeenCalled();
      // O rosto voltou e o rastreamento ficou bom.
      t.relogio.ok = t.relogio.agora + 60_000;
      vi.advanceTimersByTime(CONFERIR_A_VOLTA_MS);
      expect(t.nota).toHaveBeenCalledTimes(1);
      expect(t.nota).toHaveBeenCalledWith(TEXTO_DE_VOLTA);
      vi.advanceTimersByTime(CONFERIR_A_VOLTA_MS * 6);
      expect(t.nota).toHaveBeenCalledTimes(1);
      t.desligar();
    });

    it('com o olhar ainda fora, um segundo problema avisado substitui o primeiro, e a nota sai uma vez só', () => {
      const t = montar();
      t.emitir(problema('camera'));
      t.emitir(null);
      t.relogio.agora += 60_000;
      t.emitir(problema('contraluz', t.relogio.agora - 45_000));
      expect(t.pedir).toHaveBeenCalledTimes(2);
      t.relogio.ok = t.relogio.agora + 1_000;
      t.emitir(null);
      expect(t.nota).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(CONFERIR_A_VOLTA_MS * 4);
      expect(t.nota).toHaveBeenCalledTimes(1);
      t.desligar();
    });

    it('desligar para a conferência', () => {
      const t = montar();
      t.emitir(problema('camera'));
      t.emitir(null);
      t.desligar();
      t.relogio.ok = t.relogio.agora + 60_000;
      vi.advanceTimersByTime(CONFERIR_A_VOLTA_MS * 4);
      expect(t.nota).not.toHaveBeenCalled();
    });
  });
});

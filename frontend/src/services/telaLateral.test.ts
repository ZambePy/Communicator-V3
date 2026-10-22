import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { marcarTelaLateral, telaLateralDeOrigem, _reiniciarTelaLateralParaTestes } from './telaLateral';

// Revisão de 21/10/2026 (Important 1): no modo só horizontal, sair da tela de
// socorro levava ao menu, que quem só olha para os lados não usa. A saída
// volta para a tela lateral de onde o paciente veio.

describe('tela lateral de origem', () => {
  beforeEach(() => {
    _reiniciarTelaLateralParaTestes();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    _reiniciarTelaLateralParaTestes();
  });

  it('sem nada marcado, a origem é o Sim · Não (a tela lateral que sempre existe)', () => {
    expect(telaLateralDeOrigem()).toBe('/sim-nao');
  });

  it('vale a última tela lateral marcada, e ela sobrevive a recarregar a página', () => {
    marcarTelaLateral('/teclado-lateral');
    expect(telaLateralDeOrigem()).toBe('/teclado-lateral');
    expect(sessionStorage.getItem('irisflow.telaLateralDeOrigem')).toBe('/teclado-lateral');
    // Recarregou: a memória do módulo some, a da sessão fica.
    _reiniciarTelaLateralParaTestes({ manterSessao: true });
    expect(telaLateralDeOrigem()).toBe('/teclado-lateral');
    marcarTelaLateral('/sim-nao');
    expect(telaLateralDeOrigem()).toBe('/sim-nao');
  });

  it('um valor estranho gravado na sessão não vira rota', () => {
    sessionStorage.setItem('irisflow.telaLateralDeOrigem', '/configuracoes');
    expect(telaLateralDeOrigem()).toBe('/sim-nao');
  });

  it('sem armazenamento (bloqueado), a memória do módulo basta', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(telaLateralDeOrigem()).toBe('/sim-nao');
    marcarTelaLateral('/teclado-lateral');
    expect(telaLateralDeOrigem()).toBe('/teclado-lateral');
  });
});

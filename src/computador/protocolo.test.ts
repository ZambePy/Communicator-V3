import { describe, it, expect } from 'vitest';
import { acaoValida, amostraValida, CANAIS } from './protocolo';

/**
 * O IPC é a fronteira de confiança do processo principal: a validação de
 * forma é o que impede um renderer comprometido de mandar qualquer coisa.
 * Estes testes fixam a forma das ações que existem — em especial a `selecao`,
 * que atravessa DUAS fronteiras (sobreposição → main → app).
 */
describe('acaoValida', () => {
  it('aceita a seleção com centro, olhar e tamanho plausível', () => {
    expect(acaoValida({ tipo: 'selecao', centro: { x: 10, y: 20 }, olhar: { x: 12, y: 18 }, tamanhoPx: 72 })).toBe(true);
  });
  it('recusa seleção sem ponto, com NaN ou com tamanho absurdo', () => {
    expect(acaoValida({ tipo: 'selecao', centro: { x: 10 }, olhar: { x: 12, y: 18 }, tamanhoPx: 72 })).toBe(false);
    expect(acaoValida({ tipo: 'selecao', centro: { x: NaN, y: 1 }, olhar: { x: 1, y: 1 }, tamanhoPx: 72 })).toBe(false);
    expect(acaoValida({ tipo: 'selecao', centro: { x: 1, y: 1 }, olhar: { x: 1, y: 1 }, tamanhoPx: 0 })).toBe(false);
    expect(acaoValida({ tipo: 'selecao', centro: { x: 1, y: 1 }, olhar: { x: 1, y: 1 }, tamanhoPx: 10_000 })).toBe(false);
  });
  it('continua recusando tipo desconhecido e lixo', () => {
    expect(acaoValida({ tipo: 'formatar' })).toBe(false);
    expect(acaoValida(null)).toBe(false);
    expect(acaoValida('sair')).toBe(false);
  });
  it('o canal da seleção existe e é distinto dos outros', () => {
    const valores = Object.values(CANAIS);
    expect(valores).toContain('irisflow:desktop-selection');
    expect(new Set(valores).size).toBe(valores.length);
  });
  it('amostra válida continua exigindo os sete campos', () => {
    expect(amostraValida({ x: 1, y: 2, t: 3, hasFace: true, eyeState: 'open', degraded: false, uncalibrated: false })).toBe(true);
    expect(amostraValida({ x: 1, y: 2, t: 3, hasFace: true, eyeState: 'piscando', degraded: false, uncalibrated: false })).toBe(false);
  });
});

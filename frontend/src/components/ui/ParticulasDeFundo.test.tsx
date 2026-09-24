import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ParticulasDeFundo } from './ParticulasDeFundo';

/**
 * Partículas de fundo da Home (o efeito do site). Decorativas: fora da árvore
 * de acessibilidade, inertes ao olhar e ausentes com "reduzir movimento".
 */
function preferirMenosMovimento(sim: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((q: string) => ({
      matches: sim && q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

describe('ParticulasDeFundo', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('é decorativa: aria-hidden, e a camada é a do CSS inerte ao olhar', () => {
    preferirMenosMovimento(false);
    render(<ParticulasDeFundo />);
    const camada = screen.getByTestId('particulas-de-fundo');
    expect(camada).toHaveAttribute('aria-hidden', 'true');
    expect(camada).toHaveClass('particulas-de-fundo');
  });

  it('tem a mesma densidade do site (18 partículas), cada uma com a sua deriva', () => {
    preferirMenosMovimento(false);
    render(<ParticulasDeFundo />);
    const pontos = screen
      .getByTestId('particulas-de-fundo')
      .querySelectorAll('.particulas-de-fundo__ponto');
    expect(pontos).toHaveLength(18);
    const p = pontos[0] as HTMLElement;
    expect(p.style.getPropertyValue('--p-dy')).toMatch(/^-\d/);
    expect(p.style.animationDuration).toMatch(/s$/);
  });

  it('com "reduzir movimento" não cria partícula nenhuma', () => {
    preferirMenosMovimento(true);
    render(<ParticulasDeFundo />);
    expect(screen.getByTestId('particulas-de-fundo').children).toHaveLength(0);
  });
});

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { GazeGrid } from './GazeGrid';

/**
 * `rolarSoSeNaoCouber`: a grade só vira contêiner de rolagem quando as linhas,
 * no piso de 5°, não cabem na altura dela.
 *
 * Sem isto a zona de acerto de 12 px da última linha fazia a grade da Home
 * transbordar ~10 px sem faltar espaço: barra de rolagem fantasma e, depois de
 * rolar, a primeira linha e o anel de dwell cortados no topo.
 */

const nove = Array.from({ length: 9 }, (_, i) => <div key={i}>{i}</div>);

function montar(altura: number, props: Partial<React.ComponentProps<typeof GazeGrid>> = {}) {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(altura);
  const { container } = render(
    <GazeGrid columns={3} rows={3} gap={28} {...props}>
      {nove}
    </GazeGrid>
  );
  return container.querySelector('.gaze-grid') as HTMLElement;
}

describe('GazeGrid · rolarSoSeNaoCouber', () => {
  beforeEach(() => {
    // Alvo mínimo de 5° da geometria padrão a 1920×1080 (23,6″, 60 cm).
    document.documentElement.style.setProperty('--gaze-target-min', '193px');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--gaze-target-min');
  });

  it('cabendo (3 × 193 + 2 × 28 = 635 ≤ 748), não recorta nem rola', () => {
    const grade = montar(748, { rolarSoSeNaoCouber: true });
    expect(grade.style.overflow).toBe('visible');
  });

  it('não cabendo, rola como antes — o piso de 5° não encolhe', () => {
    const grade = montar(600, { rolarSoSeNaoCouber: true });
    expect(grade.style.overflowY).toBe('auto');
    expect(grade.style.gridTemplateRows).toBe('repeat(3, minmax(193px, 1fr))');
  });

  it('sem a opção, a grade continua sempre com rolagem (as outras telas não mudam)', () => {
    const grade = montar(748);
    expect(grade.style.overflowY).toBe('auto');
    expect(grade.style.overflowX).toBe('hidden');
  });
});

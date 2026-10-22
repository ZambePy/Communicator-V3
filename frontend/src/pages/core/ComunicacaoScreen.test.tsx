import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { ComunicacaoScreen, CARTOES_DA_COMUNICACAO } = await import('./ComunicacaoScreen');

describe('hub da Comunicação', () => {
  it('cada cartão leva à sua tela; as frases rápidas continuam a um olhar', () => {
    for (const c of CARTOES_DA_COMUNICACAO) {
      const r = render(
        <MemoryRouter initialEntries={['/comunicacao']}>
          <Routes>
            <Route path="/comunicacao" element={<ComunicacaoScreen />} />
            <Route path={c.rota} element={<p>destino {c.id}</p>} />
          </Routes>
        </MemoryRouter>,
      );
      fireEvent.click(screen.getByRole('button', { name: new RegExp(c.titulo) }));
      expect(screen.getByText(`destino ${c.id}`)).toBeInTheDocument();
      r.unmount();
    }
    expect(CARTOES_DA_COMUNICACAO[0].rota).toBe('/phrases');
    expect(CARTOES_DA_COMUNICACAO.some((c) => c.rota === '/sim-nao')).toBe(true);
  });

  it('todo cartão leva a uma rota que existe no App (e a de gravar a voz também)', () => {
    const app = readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf8');
    for (const c of CARTOES_DA_COMUNICACAO) expect(app).toContain(`path="${c.rota}"`);
    expect(app).toContain('path="/minha-voz/gravar"');
  });

  it('o mapa da dor e a voz guardada entram no hub (19/10/2026), e a grade passa a 3 colunas × 2 linhas', () => {
    expect(CARTOES_DA_COMUNICACAO.map((c) => c.rota)).toEqual(expect.arrayContaining(['/dor', '/minha-voz']));
    // Seis alvos: o máximo recomendado por tela para pacientes (GazeGrid).
    expect(CARTOES_DA_COMUNICACAO).toHaveLength(6);
    const { container } = render(
      <MemoryRouter initialEntries={['/comunicacao']}>
        <ComunicacaoScreen />
      </MemoryRouter>,
    );
    const grade = container.querySelector('.gaze-grid') as HTMLElement;
    expect(grade.style.gridTemplateColumns).toBe('repeat(3, minmax(0, 1fr))');
    expect(grade.style.gridTemplateRows).toMatch(/^repeat\(2, minmax\(/);
  });
});

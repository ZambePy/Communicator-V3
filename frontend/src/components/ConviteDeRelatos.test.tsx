import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// FE-16: o convite ficava fixo no canto inferior direito de TODAS as telas —
// teclado, frases, menu, calibração —, cobrindo alvos do paciente até alguém
// clicar. Agora só aparece na área do cuidador.
vi.mock('../cloud/CloudContext', () => ({ useCloud: () => ({ vinculo: { beneficiaryId: 'b1' } }) }));
vi.mock('./TravaDoCuidador', () => ({
  ehRotaDoCuidador: (p: string) => ['/settings', '/caregiver', '/conta', '/historico', '/relatorio'].some((r) => p === r || p.startsWith(`${r}/`)),
}));
vi.mock('../services/diagnostico/relatosAutomaticos', () => ({
  conviteJaVisto: () => false,
  relatosAutomaticosLigados: () => false,
  definirRelatosAutomaticos: vi.fn(),
  marcarConviteVisto: vi.fn(),
}));

import { ConviteDeRelatos } from './ConviteDeRelatos';

const em = (rota: string) =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <ConviteDeRelatos />
    </MemoryRouter>
  );

describe('ConviteDeRelatos', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['/keyboard', '/menu', '/calibration-check', '/phrases'])('não aparece nas telas do paciente (%s)', (rota) => {
    em(rota);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('aparece na área do cuidador', () => {
    em('/settings');
    expect(screen.getByRole('dialog')).toHaveTextContent(/Avisar a IrisFlow quando o aplicativo falhar/);
  });
});

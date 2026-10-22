import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';

// Relato de 18/10/2026: com o teste de precisão rodando, a emergência levava a
// `/emergency` e o overlay dos pontos continuava por cima. Trocar de rota
// interrompe a rodada; montar a árvore (sem troca nenhuma) não.

const interromper = vi.fn(() => true);
const fecharPainel = vi.fn();
vi.mock('@tracker/accuracy', () => ({
  interromperTesteDePrecisao: (motivo: string) => interromper(motivo),
  fecharPainelDeDiagnostico: () => fecharPainel(),
}));

const { FechaPaineisAoNavegar } = await import('./FechaPaineisAoNavegar');

const VaiParaEmergencia: React.FC = () => {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/emergency?autoTrigger=other')}>emergência</button>;
};

function montar() {
  return render(
    <MemoryRouter initialEntries={['/calibration-check']}>
      <FechaPaineisAoNavegar />
      <Routes>
        <Route path="/calibration-check" element={<VaiParaEmergencia />} />
        <Route path="/emergency" element={<p>tela de emergência</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FechaPaineisAoNavegar', () => {
  beforeEach(() => {
    interromper.mockClear();
    fecharPainel.mockClear();
  });

  it('na montagem fecha o painel, mas não interrompe o teste', () => {
    montar();
    expect(fecharPainel).toHaveBeenCalledTimes(1);
    expect(interromper).not.toHaveBeenCalled();
  });

  it('ao sair da tela do teste para a emergência, interrompe a rodada e fecha o painel', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'emergência' }));
    expect(screen.getByText('tela de emergência')).toBeInTheDocument();
    expect(interromper).toHaveBeenCalledTimes(1);
    expect(interromper).toHaveBeenCalledWith(expect.stringContaining('/calibration-check'));
    expect(interromper).toHaveBeenCalledWith(expect.stringContaining('/emergency'));
    expect(fecharPainel).toHaveBeenCalledTimes(2);
  });
});

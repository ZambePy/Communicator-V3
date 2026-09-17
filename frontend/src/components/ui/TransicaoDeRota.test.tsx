import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { TransicaoDeRota } from './TransicaoDeRota';

/**
 * O mecanismo tem uma sutileza que só um teste pega: a classe de animação já
 * está no nó desde o render anterior. Sem remover e recolocar, a segunda rota
 * entraria sem animação nenhuma — e o bug seria invisível num snapshot, porque
 * o HTML fica idêntico nos dois casos.
 */

/** Conta quantas vezes a classe foi retirada e reposta no nó. */
function observarReaplicacoes(alvo: HTMLElement): { total: () => number } {
  let total = 0;
  const observador = new MutationObserver((registros) => {
    for (const r of registros) {
      if (r.attributeName === 'class' && alvo.classList.contains('rota-entrando')) total += 1;
    }
  });
  observador.observe(alvo, { attributes: true, attributeFilter: ['class'] });
  return { total: () => total };
}

const Primeira: React.FC = () => {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate('/segunda')}>
      ir
    </button>
  );
};

function montar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TransicaoDeRota>
        <Routes>
          <Route path="/" element={<Primeira />} />
          <Route path="/segunda" element={<p>segunda tela</p>} />
        </Routes>
      </TransicaoDeRota>
    </MemoryRouter>
  );
}

describe('TransicaoDeRota', () => {
  it('envolve as rotas num contêiner com a classe de entrada', () => {
    montar();
    expect(screen.getByTestId('container-de-rota')).toHaveClass('rota-entrando');
  });

  it('reaplica a classe a cada troca de rota, para a animação rodar de novo', async () => {
    montar();
    const conteiner = screen.getByTestId('container-de-rota');
    const observado = observarReaplicacoes(conteiner);

    await act(async () => {
      screen.getByRole('button', { name: 'ir' }).click();
    });

    expect(screen.getByText('segunda tela')).toBeInTheDocument();
    // A classe continua lá — e passou por uma remoção/reposição no caminho.
    expect(conteiner).toHaveClass('rota-entrando');
    expect(observado.total()).toBeGreaterThan(0);
  });

  it('não remonta a rota: o contêiner é o mesmo nó depois de navegar', async () => {
    montar();
    const antes = screen.getByTestId('container-de-rota');

    await act(async () => {
      screen.getByRole('button', { name: 'ir' }).click();
    });

    // Remontar o contêiner a cada navegação (o que uma `key` nova faria)
    // derrubaria junto o estado de qualquer tela que estivesse no meio de algo.
    expect(screen.getByTestId('container-de-rota')).toBe(antes);
  });
});

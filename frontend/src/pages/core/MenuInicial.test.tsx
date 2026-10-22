import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { SettingsProvider } from '../../context/SettingsContext';
import { MenuInicial } from './MenuInicial';

// -----------------------------------------------------------------------------
// A tela inicial (rodada 3, 21/10/2026): o menu de sempre, ou, com o modo
// hospital ligado, a tela do quarto. Quase toda tela do app volta para `/menu`
// (são 25 pontos); desviar ali, num lugar só, faz o modo hospital valer em todas
// sem tocar nelas. A tabela de rotas do App (/menu, /menu-completo, /hospital) é
// testada em `rotasDoInicio.test.tsx`.
// -----------------------------------------------------------------------------

const Voltar: React.FC = () => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>voltar do navegador</button>;
};

const montar = (entradas = ['/menu']) =>
  render(
    <SettingsProvider>
      <MemoryRouter initialEntries={entradas} initialIndex={entradas.length - 1}>
        <Routes>
          <Route path="/antes" element={<p>tela de antes</p>} />
          <Route path="/menu" element={<MenuInicial><p>menu de sempre</p></MenuInicial>} />
          <Route path="/hospital" element={<><p>tela do hospital</p><Voltar /></>} />
        </Routes>
      </MemoryRouter>
    </SettingsProvider>,
  );

const ligarOModoHospital = () =>
  localStorage.setItem('irisflow_settings', JSON.stringify({ modoHospital: true, schemaVersion: 1 }));

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('MenuInicial', () => {
  it('com o modo hospital desligado (o padrão), /menu é o menu de sempre', () => {
    montar();
    expect(screen.getByText('menu de sempre')).toBeInTheDocument();
    expect(screen.queryByText('tela do hospital')).toBeNull();
  });

  it('com o modo hospital ligado, /menu leva à tela do hospital', () => {
    ligarOModoHospital();
    montar();
    expect(screen.getByText('tela do hospital')).toBeInTheDocument();
    expect(screen.queryByText('menu de sempre')).toBeNull();
  });

  // Revisão final, rodada 1 (M8, 21/10/2026): a tela do hospital é uma grade de 10 alvos acionados pelo
  // ponto do olhar, que quem perdeu o olhar vertical não opera — e as telas laterais voltam para /menu,
  // então desviar para outra tela lateral prenderia o cuidador fora do menu. Com os dois modos, o modo
  // só horizontal vale: /menu é o menu de sempre (o mesmo de quem só liga o horizontal).
  it('com o modo hospital E o só horizontal ligados, o horizontal vale: /menu NÃO vai à grade do hospital', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ modoHospital: true, modoHorizontal: true, schemaVersion: 1 }));
    montar();
    expect(screen.getByText('menu de sempre')).toBeInTheDocument();
    expect(screen.queryByText('tela do hospital')).toBeNull();
  });

  it('só o modo só horizontal ligado: /menu é o menu de sempre', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ modoHorizontal: true, schemaVersion: 1 }));
    montar();
    expect(screen.getByText('menu de sempre')).toBeInTheDocument();
  });

  it('um valor estranho no disco não liga o modo: só `true` liga', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ modoHospital: 'sim', schemaVersion: 1 }));
    montar();
    expect(screen.getByText('menu de sempre')).toBeInTheDocument();
  });

  it('o desvio troca a entrada do histórico: o "voltar" do navegador não cai de novo em /menu', () => {
    ligarOModoHospital();
    montar(['/antes', '/menu']);
    expect(screen.getByText('tela do hospital')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'voltar do navegador' }));
    // Se o desvio empilhasse, voltaria a /menu e seria desviado outra vez.
    expect(screen.getByText('tela de antes')).toBeInTheDocument();
  });
});

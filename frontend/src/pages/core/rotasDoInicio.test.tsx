import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes } from 'react-router-dom';
import { SettingsProvider } from '../../context/SettingsContext';
import { rotasDoInicio } from './rotasDoInicio';

// -----------------------------------------------------------------------------
// As rotas do início do app (rodada 3, 21/10/2026), como o `App` as monta: /menu
// (que, com o modo hospital ligado, leva à tela do quarto), /menu-completo (o
// menu sem desvio) e /hospital. As telas e o portão de acesso são de mentira; o
// resto é de verdade: a tabela de rotas, o `MenuInicial` e as configurações.
//
// Antes estas conferências liam o texto do `App.tsx`, e quebravam a qualquer
// reformatação e nos conflitos de merge com as outras tarefas que mexem ali.
// -----------------------------------------------------------------------------

let portaoFechado = false;
/** O portão de acesso (no app, o `ProtectedRoute`): fechado, não deixa passar nada. */
const Portao: React.FC<{ children: React.ReactNode }> = ({ children }) => (portaoFechado ? <p>portão fechado</p> : <>{children}</>);
const MenuCompleto: React.FC = () => <p>menu completo</p>;
const Hospital: React.FC = () => <p>tela do hospital</p>;

const abrir = (rota: string) =>
  render(
    <SettingsProvider>
      <MemoryRouter initialEntries={[rota]}>
        <Routes>{rotasDoInicio({ MenuCompleto, Hospital, Portao })}</Routes>
      </MemoryRouter>
    </SettingsProvider>,
  );

const ligarOModoHospital = () =>
  localStorage.setItem('irisflow_settings', JSON.stringify({ modoHospital: true, schemaVersion: 1 }));

beforeEach(() => {
  localStorage.clear();
  portaoFechado = false;
});
afterEach(() => localStorage.clear());

describe('rotasDoInicio', () => {
  it('com o modo hospital desligado (o padrão), /menu abre o menu completo', () => {
    abrir('/menu');
    expect(screen.getByText('menu completo')).toBeInTheDocument();
    expect(screen.queryByText('tela do hospital')).toBeNull();
  });

  it('com o modo hospital ligado, /menu leva à tela do hospital', () => {
    ligarOModoHospital();
    abrir('/menu');
    expect(screen.getByText('tela do hospital')).toBeInTheDocument();
    expect(screen.queryByText('menu completo')).toBeNull();
  });

  it('/menu-completo abre o menu completo mesmo com o modo ligado: é por ele que se sai do modo hospital', () => {
    ligarOModoHospital();
    abrir('/menu-completo');
    expect(screen.getByText('menu completo')).toBeInTheDocument();
    expect(screen.queryByText('tela do hospital')).toBeNull();
  });

  it.each([
    ['desligado', false],
    ['ligado', true],
  ])('/hospital abre a tela do hospital com o modo %s', (_nome, ligado) => {
    if (ligado) ligarOModoHospital();
    abrir('/hospital');
    expect(screen.getByText('tela do hospital')).toBeInTheDocument();
  });

  // Com o modo ligado, /menu desvia para /hospital, que também tem portão: por isso
  // /menu é conferido com o modo desligado também, onde nada o desvia.
  it.each([
    ['/menu', false],
    ['/menu', true],
    ['/menu-completo', false],
    ['/menu-completo', true],
    ['/hospital', false],
    ['/hospital', true],
  ])('%s (modo hospital ligado: %s) passa pelo portão de acesso: fechado, não mostra tela nenhuma', (rota, ligado) => {
    portaoFechado = true;
    if (ligado) ligarOModoHospital();
    abrir(rota);
    expect(screen.getByText('portão fechado')).toBeInTheDocument();
    expect(screen.queryByText('tela do hospital')).toBeNull();
    expect(screen.queryByText('menu completo')).toBeNull();
  });
});

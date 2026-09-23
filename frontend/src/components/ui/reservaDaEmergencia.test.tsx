import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EmergencyProvider,
  EMERGENCIA_ALTURA_PX,
  EMERGENCIA_LARGURA_PX,
} from '../../context/EmergencyContext';

vi.mock('../../context/GazeContext', () => ({ useGaze: () => ({ isDegraded: false, state: 'tracking' }) }));

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (rel: string) => readFileSync(resolve(AQUI, '../..', rel), 'utf8');
const css = ler('index.css');

/**
 * A Emergência é `position: fixed` e global: não ocupa espaço no fluxo de
 * nenhuma tela. O defeito visto na gravação — "Voltar ao tutorial" e
 * "Galeria (0)" em cima do botão — vinha de cada tela desenhar o próprio
 * cabeçalho com margens próprias, sem saber que o botão existe.
 *
 * O contrato agora tem três pontas, e este arquivo prende as três:
 *   1. o botão se posiciona pelas variáveis `--emergencia-*`;
 *   2. o provider publica `html[data-emergencia]` só quando o botão está no topo;
 *   3. cabeçalhos e faixas do topo levam `reserva-emergencia` (ou a variante
 *      de coluna), que só age com esse atributo.
 */
describe('reserva do botão de Emergência', () => {
  beforeEach(() => document.documentElement.removeAttribute('data-emergencia'));

  it('o provider publica data-emergencia="topo" nas telas do paciente', () => {
    render(
      <MemoryRouter initialEntries={['/menu']}>
        <EmergencyProvider>
          <div />
        </EmergencyProvider>
      </MemoryRouter>
    );
    expect(document.documentElement.getAttribute('data-emergencia')).toBe('topo');
  });

  it('sem botão (telas do cuidador), sem reserva', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <EmergencyProvider>
          <div />
        </EmergencyProvider>
      </MemoryRouter>
    );
    expect(document.documentElement.hasAttribute('data-emergencia')).toBe(false);
  });

  it('com o alarme aberto o botão sai, e a reserva também', () => {
    render(
      <MemoryRouter initialEntries={['/menu']}>
        <EmergencyProvider>
          <div />
        </EmergencyProvider>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Emergência/ }));
    expect(document.documentElement.hasAttribute('data-emergencia')).toBe(false);
  });

  it('o botão se posiciona pelas MESMAS variáveis que as telas reservam', () => {
    render(
      <MemoryRouter initialEntries={['/menu']}>
        <EmergencyProvider>
          <div />
        </EmergencyProvider>
      </MemoryRouter>
    );
    const caixa = screen.getByRole('button', { name: /Emergência/ }).parentElement as HTMLElement;
    expect(caixa.style.top).toBe('var(--emergencia-topo)');
    expect(caixa.style.right).toBe('var(--emergencia-direita)');
  });

  it('as constantes do botão batem com as variáveis do CSS', () => {
    expect(css).toMatch(new RegExp(`--emergencia-largura:\\s*${EMERGENCIA_LARGURA_PX}px`));
    expect(css).toMatch(new RegExp(`--emergencia-altura:\\s*${EMERGENCIA_ALTURA_PX}px`));
  });

  it('a reserva só age com o botão no topo, e desconta a largura dele', () => {
    expect(css).toMatch(/html\[data-emergencia='topo'\] \.reserva-emergencia \{[^}]*--reserva-emergencia-x/);
    expect(css).toMatch(/html\[data-emergencia='topo'\] \.reserva-emergencia--caixa \{[^}]*margin-right/);
    expect(css).toMatch(/html\[data-emergencia='topo'\] \.coluna-livre-da-emergencia \{[^}]*--reserva-emergencia-x/);
    // O cabeçalho canônico e o botão usam a mesma margem da página.
    expect(css).toMatch(/\.gaze-header \{[^}]*right: var\(--pagina-margem-x\)/);
    expect(css).toMatch(/--emergencia-direita: var\(--pagina-margem-x\)/);
    expect(css).toMatch(/\.gaze-header__emergencia \{[^}]*var\(--emergencia-largura\)/);
  });

  it.each([
    ['pages/GamesMenu.tsx', 'reserva-emergencia'],
    ['pages/KeyboardScreen.tsx', 'reserva-emergencia--caixa'],
    ['pages/KeyboardScreen.tsx', '"reserva-emergencia"'],
    ['pages/entertainment/PhotoCaptureScreen.tsx', 'reserva-emergencia'],
    ['pages/entertainment/GalleryScreen.tsx', 'reserva-emergencia'],
    ['pages/entertainment/NewsScreen.tsx', 'reserva-emergencia'],
    ['pages/health/MeditationScreen.tsx', 'reserva-emergencia'],
    ['pages/games/MemoryGame.tsx', 'reserva-emergencia'],
    ['pages/games/FollowTarget.tsx', 'reserva-emergencia'],
    ['pages/BubblePopGame.tsx', 'reserva-emergencia'],
    ['components/ui/PageHeader.tsx', 'reserva-emergencia'],
    ['pages/tutorial/TutorialWizard.tsx', 'coluna-livre-da-emergencia'],
    ['pages/setup/SetupWizard.tsx', 'coluna-livre-da-emergencia'],
    ['pages/VirtualMouseScreen.tsx', 'coluna-livre-da-emergencia'],
    ['components/GazeStatusBanner.tsx', 'coluna-livre-da-emergencia'],
  ])('%s reserva o espaço da Emergência (%s)', (arquivo, classe) => {
    expect(ler(arquivo)).toContain(classe);
  });

  it.each([
    'pages/GamesMenu.tsx',
    'pages/entertainment/GalleryScreen.tsx',
    'pages/entertainment/NewsScreen.tsx',
    'pages/tutorial/TutorialWizard.tsx',
  ])('%s rola num contêiner próprio, não no documento', (arquivo) => {
    // Documento que rola leva o conteúdo para baixo do botão fixo.
    const codigo = ler(arquivo);
    expect(codigo).toContain("height: '100dvh'");
    expect(codigo).not.toMatch(/minHeight: '100vh'/);
  });
});

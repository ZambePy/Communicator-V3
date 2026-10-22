import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { OpcoesDeFala, ResultadoDaFala } from '../services/voz';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 5): as telas
// davam a fala por feita. O teclado acendia o brilho de "falou" no toque, os
// pictogramas diziam "Última fala" no toque, e as frases cumpriam a missão
// "ouça o computador falar" com ou sem som. Agora "falou" só quando falou.
// -----------------------------------------------------------------------------

/** Cada chamada de `falarDoPaciente`, com o controle de quando ela "começa" e termina. */
interface Chamada {
  texto: string;
  opcoes: OpcoesDeFala;
  terminar: (r: ResultadoDaFala) => void;
}
const chamadas: Chamada[] = [];

vi.mock('../services/voz/falaDoPaciente', async (original) => ({
  ...(await original<typeof import('../services/voz/falaDoPaciente')>()),
  falarDoPaciente: vi.fn(
    (texto: string, opcoes: OpcoesDeFala = {}) =>
      new Promise<ResultadoDaFala>((terminar) => chamadas.push({ texto, opcoes, terminar })),
  ),
}));
const missao = vi.hoisted(() => ({ cumprirMissao: vi.fn() }));
vi.mock('./tutorial/missao', async (original) => ({
  ...(await original<typeof import('./tutorial/missao')>()),
  cumprirMissao: missao.cumprirMissao,
}));
vi.mock('../components/FaixaDeMissao', () => ({ FaixaDeMissao: () => null }));
vi.mock('../components/ui/DicaContextual', () => ({ DicaContextual: () => null }));
vi.mock('../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../cloud/eventos', () => ({ emitirFalaDoPaciente: vi.fn() }));
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({ subscribe: vi.fn(() => vi.fn()), isComposing: false, setIsComposing: vi.fn() }),
  useIsDwelling: () => false,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { KeyboardScreen } from './KeyboardScreen';
import { QuickPhrasesScreen } from './QuickPhrasesScreen';
import { PictogramScreen } from './core/PictogramScreen';
import { SettingsProvider } from '../context/SettingsContext';

beforeEach(() => {
  chamadas.length = 0;
  missao.cumprirMissao.mockClear();
});

const ultima = () => chamadas[chamadas.length - 1];

describe('teclado', () => {
  const montar = () => {
    // Um rascunho na sessão: o "Falar" da barra só existe com texto escrito.
    sessionStorage.setItem('irisflow.rascunhoDoTeclado', 'Quero água');
    return render(
      <MemoryRouter>
        <SettingsProvider>
          <KeyboardScreen />
        </SettingsProvider>
      </MemoryRouter>,
    );
  };
  const brilhando = () => screen.getByTestId('kb-compose').className.includes('kb-compose--falou');

  it('o brilho de "falou" acende quando a voz COMEÇA, não no toque; a missão conta quando falou', async () => {
    montar();
    fireEvent.click(screen.getByLabelText('Falar o texto'));
    expect(ultima().texto).toBe('Quero água');
    // Tocou em "Falar", mas o som ainda não saiu: nada de "falou".
    expect(brilhando()).toBe(false);
    await act(async () => {
      ultima().opcoes.aoComecar?.();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(brilhando()).toBe(true);
    expect(missao.cumprirMissao).not.toHaveBeenCalled();
    await act(async () => { ultima().terminar({ origem: 'clonada' }); });
    expect(missao.cumprirMissao).toHaveBeenCalledWith('digitacao');
  });

  it('a voz não saiu: sem brilho e sem missão', async () => {
    montar();
    fireEvent.click(screen.getByLabelText('Falar o texto'));
    await act(async () => { ultima().terminar({ origem: 'nenhuma', motivo: 'sem_voz' }); });
    expect(brilhando()).toBe(false);
    expect(missao.cumprirMissao).not.toHaveBeenCalled();
  });
});

describe('frases rápidas', () => {
  const montar = () =>
    render(
      <MemoryRouter>
        <QuickPhrasesScreen />
      </MemoryRouter>,
    );

  it('a missão "ouça o computador falar" só conta quando a frase saiu', async () => {
    montar();
    fireEvent.click(screen.getByText('Pode abrir a janela?'));
    expect(missao.cumprirMissao).not.toHaveBeenCalled();
    await act(async () => { ultima().terminar({ origem: 'nenhuma', motivo: 'nao_comecou' }); });
    expect(missao.cumprirMissao).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Pode abrir a janela?'));
    await act(async () => { ultima().terminar({ origem: 'sistema' }); });
    expect(missao.cumprirMissao).toHaveBeenCalledWith('comunicacao');
  });
});

describe('pictogramas', () => {
  const montar = () =>
    render(
      <MemoryRouter>
        <PictogramScreen />
      </MemoryRouter>,
    );
  const rotulo = () => screen.getByTestId('rotulo-da-fala').textContent;

  it('"Última fala" só depois que a fala saiu; se não saiu, a faixa diz isso', async () => {
    montar();
    expect(rotulo()).toBe('Nada dito ainda');
    fireEvent.click(screen.getByText('Estou com Sede'));
    expect(rotulo()).toBe('Falando…');
    await act(async () => { ultima().terminar({ origem: 'clonada' }); });
    expect(rotulo()).toBe('Última fala');

    fireEvent.click(screen.getByText('Estou com Dor'));
    await act(async () => { ultima().terminar({ origem: 'nenhuma', motivo: 'erro' }); });
    expect(rotulo()).toBe('Não saiu em voz alta');
  });

  it('uma escolha nova manda no rótulo, mesmo que a anterior termine depois', async () => {
    montar();
    fireEvent.click(screen.getByText('Estou com Sede'));
    const primeira = ultima();
    fireEvent.click(screen.getByText('Estou com Dor'));
    await act(async () => { ultima().terminar({ origem: 'sistema' }); });
    await act(async () => { primeira.terminar({ origem: 'nenhuma', motivo: 'erro' }); });
    expect(rotulo()).toBe('Última fala');
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { definirPerfilAtivo, logSentence, setConsent } from '../../utils/clinicalLogger';
import { DWELL_SELECTOR } from '../../context/GazeContext';
import { salvarNoDiario } from '../../services/consulta/diario';
import { adicionarPergunta, lerPerguntas, marcarComoFeita } from '../../services/consulta/perguntas';

// Rodada 1 da revisão (21/10/2026): /consulta mostra o cursor do olhar, e o
// despachante de dwell aciona QUALQUER `button, a, [role=button]` sob o olhar.
// Só o GazeButton tem alvo de 5°; um botão comum (PrimaryButton, do cuidador)
// é pequeno e, fixado por acaso, agia sozinho — o pior era "Tirar da lista",
// que apaga uma pergunta que custou minutos de escrita, sem desfazer.
//
// Regra desta pasta: tudo o que o dwell alcança é alvo de olhar de verdade
// (`.gaze-button`) ou leva `data-no-dwell="true"` NO PRÓPRIO botão (o
// despachante lê a marca no elemento acionado, não no ancestral).

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ currentProfile: { id: 'p1', name: 'Maria Souza' } }),
}));

import { PerguntasDaConsulta } from './PerguntasDaConsulta';
import { DiarioRapido } from './DiarioRapido';
import { FolhaDaConsulta } from './FolhaDaConsulta';
import { ConsultaScreen } from './ConsultaScreen';

const AGORA = Date.parse('2026-10-21T15:00:00Z');

/** Quem o dwell alcança e não é alvo de olhar nem se declarou fora do dwell. */
const alcancadosSemSerAlvo = (raiz: ParentNode): string[] =>
  Array.from(raiz.querySelectorAll<HTMLElement>(DWELL_SELECTOR))
    .filter((el) => !el.classList.contains('gaze-button') && el.dataset.noDwell !== 'true')
    .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}"`);

describe('telas da consulta: o que o olhar alcança', () => {
  beforeEach(() => {
    localStorage.clear();
    definirPerfilAtivo('p1');
    setConsent(true);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('perguntas', () => {
    it('com pendentes, feitas e uma frase do teclado: nada alcançável é botão comum sem marca', () => {
      adicionarPergunta('Posso aumentar a dose?', 'cuidador', AGORA);
      adicionarPergunta('Qual o próximo exame?', 'cuidador', AGORA);
      adicionarPergunta('Quando volto?', 'cuidador', AGORA);
      const feita = lerPerguntas('p1').find((p) => p.texto === 'Quando volto?')!;
      marcarComoFeita(feita.id, true);
      logSentence('Estou com dor, o que fazer?');
      const { container } = render(<PerguntasDaConsulta />);
      // Os três botões de cada item e o de adicionar estão na tela.
      expect(screen.getAllByRole('button', { name: /tirar da lista/i })).toHaveLength(3);
      expect(screen.getAllByRole('button', { name: /já perguntei/i })).toHaveLength(2);
      expect(screen.getByRole('button', { name: /voltar para a lista/i })).toBeInTheDocument();
      expect(container.querySelectorAll('button.gaze-button').length).toBeGreaterThan(0);
      expect(alcancadosSemSerAlvo(container)).toEqual([]);
    });

    it('"Tirar da lista" é só de mouse e teclado: o dwell não o alcança, e o clique ainda tira', () => {
      adicionarPergunta('Posso aumentar a dose?', 'cuidador', AGORA);
      render(<PerguntasDaConsulta />);
      const tirar = screen.getByRole('button', { name: /tirar da lista/i });
      expect(tirar).toHaveAttribute('data-no-dwell', 'true');
      fireEvent.click(tirar);
      expect(lerPerguntas('p1')).toHaveLength(0);
    });
  });

  describe('diário', () => {
    it('os passos do olhar são só alvos de olhar', () => {
      const { container } = render(<DiarioRapido />);
      expect(alcancadosSemSerAlvo(container)).toEqual([]);
    });

    it('o resumo: "Salvar nota" é do cuidador e fica fora do dwell, e o clique ainda guarda', () => {
      salvarNoDiario({ sono: 4, humor: 2 }, AGORA);
      const { container } = render(<DiarioRapido />);
      fireEvent.change(screen.getByLabelText(/nota do dia/i), { target: { value: 'Dormiu bem' } });
      const salvar = screen.getByRole('button', { name: /salvar nota/i });
      expect(salvar).toHaveAttribute('data-no-dwell', 'true');
      expect(alcancadosSemSerAlvo(container)).toEqual([]);
      fireEvent.click(salvar);
      expect(screen.getByText(/nota guardada/i)).toBeInTheDocument();
    });
  });

  describe('folha', () => {
    it('7 dias, 30 dias, imprimir e salvar em PDF ficam fora do dwell', () => {
      (window as unknown as { irisflowConsulta: unknown }).irisflowConsulta = { salvarPdf: vi.fn(), imprimir: vi.fn() };
      const { container } = render(<FolhaDaConsulta />);
      expect(screen.getByRole('button', { name: '7 dias' })).toHaveAttribute('data-no-dwell', 'true');
      expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('data-no-dwell', 'true');
      expect(screen.getByRole('button', { name: /salvar em pdf/i })).toBeInTheDocument();
      expect(alcancadosSemSerAlvo(container)).toEqual([]);
      delete (window as unknown as { irisflowConsulta?: unknown }).irisflowConsulta;
    });

    it('trocar o período continua funcionando com o clique', () => {
      render(<FolhaDaConsulta />);
      fireEvent.click(screen.getByRole('button', { name: '30 dias' }));
      expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('o começo da consulta', () => {
    it('as três portas e o Voltar são alvos de olhar', () => {
      const { container } = render(
        <MemoryRouter initialEntries={['/consulta']}>
          <ConsultaScreen />
        </MemoryRouter>,
      );
      expect(alcancadosSemSerAlvo(container)).toEqual([]);
    });
  });
});

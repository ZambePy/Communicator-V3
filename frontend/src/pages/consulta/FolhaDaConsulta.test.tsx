import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { definirPerfilAtivo, setConsent } from '../../utils/clinicalLogger';
import { salvarNoDiario } from '../../services/consulta/diario';
import { adicionarPergunta } from '../../services/consulta/perguntas';
import { CLASSE_DE_IMPRESSAO_DA_CONSULTA } from '../settings/prancha/imprimir';

// Folha da consulta (21/10/2026): a prévia, o 7 ou 30 dias e o caminho até o
// papel, que é o da prancha — processo principal no app instalado, diálogo do
// navegador fora dele. Botões do cuidador (`data-no-dwell`): uma janela de
// impressão aberta por engano ficaria na frente de quem só tem o olhar.

let nome: string | null = 'Maria Souza';
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ currentProfile: nome ? { id: 'p1', name: nome } : null }),
}));

import { FolhaDaConsulta } from './FolhaDaConsulta';

/**
 * Espera o fluxo de imprimir/salvar terminar de verdade: a ponte foi chamada e o
 * botão voltou ao rótulo de repouso, habilitado. O fluxo espera dois quadros de
 * pintura antes de chamar a ponte, e os 50 ms fixos de antes não bastaram no
 * Windows do GitHub (Release #14, 22/10/2026).
 */
async function esperarFim(botao: RegExp, chamado: () => void): Promise<void> {
  await waitFor(() => {
    chamado();
    expect(screen.getByRole('button', { name: botao })).toBeEnabled();
  }, { timeout: 5000 });
}

const AGORA = Date.parse('2026-10-21T15:00:00Z');

const ponte = (p: Record<string, unknown>) => {
  (window as unknown as { irisflowConsulta: unknown }).irisflowConsulta = p;
};

describe('FolhaDaConsulta', () => {
  beforeEach(() => {
    localStorage.clear();
    nome = 'Maria Souza';
    definirPerfilAtivo('p1');
    setConsent(true);
    delete (window as unknown as { irisflowConsulta?: unknown }).irisflowConsulta;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.classList.remove(CLASSE_DE_IMPRESSAO_DA_CONSULTA);
    document.head.querySelectorAll('style[data-consulta]').forEach((s) => s.remove());
  });

  describe('a prévia', () => {
    it('abre com 7 dias, o nome do paciente e o que a pessoa registrou', () => {
      salvarNoDiario({ sono: 4, humor: 2, nota: 'Noite boa.' }, AGORA - 24 * 3600_000);
      adicionarPergunta('Posso aumentar a dose?', 'cuidador', AGORA);
      render(<FolhaDaConsulta />);
      const folha = screen.getByTestId('folha-da-consulta');
      expect(folha).toHaveTextContent('Maria Souza');
      expect(folha).toHaveTextContent('Últimos 7 dias');
      expect(within(folha).getByRole('row', { name: /ter 20\/10/ })).toHaveTextContent('Noite boa.');
      expect(folha).toHaveTextContent('Posso aumentar a dose?');
      expect(screen.getAllByTestId('folha-da-consulta')).toHaveLength(1);
    });

    it('sem perfil com nome, a folha diz "Paciente" — não deixa o campo em branco', () => {
      nome = null;
      render(<FolhaDaConsulta />);
      expect(screen.getByTestId('folha-da-consulta')).toHaveTextContent('Paciente');
    });

    it('7 e 30 dias: o botão marca o escolhido e a folha muda', () => {
      render(<FolhaDaConsulta />);
      const sete = screen.getByRole('button', { name: '7 dias' });
      const trinta = screen.getByRole('button', { name: '30 dias' });
      expect(sete).toHaveAttribute('aria-pressed', 'true');
      expect(trinta).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(trinta);
      expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: '7 dias' })).toHaveAttribute('aria-pressed', 'false');
      const folha = screen.getByTestId('folha-da-consulta');
      expect(folha).toHaveTextContent('Últimos 30 dias');
      expect(within(folha).getAllByRole('row', { name: /\d\d\/\d\d/ }).length).toBeGreaterThanOrEqual(30);
    });

    it('diz, junto da prévia, que a folha é de uma página A4 em pé', () => {
      render(<FolhaDaConsulta />);
      expect(screen.getByText(/uma página A4 em pé/i)).toBeInTheDocument();
    });
  });

  describe('imprimir', () => {
    it('os botões são do cuidador (fora do dwell); sem o app instalado, não há PDF', () => {
      render(<FolhaDaConsulta />);
      expect(screen.getByRole('button', { name: /imprimir folha/i })).toHaveAttribute('data-no-dwell', 'true');
      expect(screen.queryByRole('button', { name: /salvar em pdf/i })).toBeNull();
    });

    it('a cópia de impressão está na página quando o diálogo abre, em A4 em pé, e sai depois', async () => {
      let copia = false;
      let modo = false;
      const print = vi.spyOn(window, 'print').mockImplementation(() => {
        copia = document.body.querySelector('.consulta-impressao [data-testid="folha-da-consulta"]') !== null;
        modo = document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA);
        window.dispatchEvent(new Event('afterprint'));
      });
      render(<FolhaDaConsulta />);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /imprimir folha/i })); });
      await esperarFim(/imprimir folha/i, () => expect(print).toHaveBeenCalledTimes(1));
      expect(copia).toBe(true);
      expect(modo).toBe(true);
      expect(document.body.querySelector('.consulta-impressao')).toBeNull();
      expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA)).toBe(false);
    });

    it('a cópia leva o período escolhido (30 dias)', async () => {
      let linhas = 0;
      vi.spyOn(window, 'print').mockImplementation(() => {
        const copia = document.body.querySelector('.consulta-impressao [data-testid="folha-da-consulta"]')!;
        linhas = copia.querySelectorAll('table[aria-label="Dia a dia"] tbody tr').length;
        window.dispatchEvent(new Event('afterprint'));
      });
      render(<FolhaDaConsulta />);
      fireEvent.click(screen.getByRole('button', { name: '30 dias' }));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /imprimir folha/i })); });
      await esperarFim(/imprimir folha/i, () => expect(linhas).toBe(30));
    });

    it('no app instalado: vai pelo processo principal (sem window.print) e diz em qual impressora saiu', async () => {
      const print = vi.spyOn(window, 'print').mockImplementation(() => {});
      let copiaNaHora = false;
      const imprimir = vi.fn(async () => {
        copiaNaHora = document.body.querySelector('.consulta-impressao [data-testid="folha-da-consulta"]') !== null
          && document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA);
        return { ok: true as const, impressora: 'HP LaserJet' };
      });
      ponte({ salvarPdf: vi.fn(), imprimir });
      render(<FolhaDaConsulta />);
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /imprimir folha/i })); });
      await esperarFim(/imprimir folha/i, () => expect(imprimir).toHaveBeenCalledTimes(1));
      expect(print).not.toHaveBeenCalled();
      expect(copiaNaHora).toBe(true);
      expect(screen.getByRole('status')).toHaveTextContent('Folha enviada para a impressora HP LaserJet.');
    });

    it('impressão cancelada não diz nada; impressora que recusa diz em palavras', async () => {
      const imprimir = vi.fn()
        .mockResolvedValueOnce({ ok: false, cancelado: true })
        .mockResolvedValueOnce({ ok: false, erro: 'A impressora recusou o trabalho.' });
      ponte({ salvarPdf: vi.fn(), imprimir });
      render(<FolhaDaConsulta />);
      const botao = screen.getByRole('button', { name: /imprimir folha/i });
      await act(async () => { fireEvent.click(botao); });
      await esperarFim(/imprimir folha/i, () => expect(imprimir).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      await act(async () => { fireEvent.click(botao); });
      await esperarFim(/imprimir folha/i, () => expect(imprimir).toHaveBeenCalledTimes(2));
      expect(screen.getByRole('alert')).toHaveTextContent('A impressora recusou o trabalho.');
    });
  });

  describe('salvar em PDF (app instalado)', () => {
    it('pede ao processo principal com a cópia na página e diz onde salvou', async () => {
      const salvarPdf = vi.fn(async () => {
        expect(document.body.querySelector('.consulta-impressao')).not.toBeNull();
        return { ok: true as const, caminho: 'C:\\Users\\Ana\\Documents\\Folha da consulta - IrisFlow.pdf' };
      });
      ponte({ salvarPdf });
      render(<FolhaDaConsulta />);
      const pdf = screen.getByRole('button', { name: /salvar em pdf/i });
      expect(pdf).toHaveAttribute('data-no-dwell', 'true');
      await act(async () => { fireEvent.click(pdf); });
      await esperarFim(/salvar em pdf/i, () => expect(salvarPdf).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('status')).toHaveTextContent('Folha salva em C:\\Users\\Ana\\Documents');
      expect(document.body.querySelector('.consulta-impressao')).toBeNull();
    });

    it('PDF cancelado fica em silêncio; PDF que falhou diz em palavras', async () => {
      const salvarPdf = vi.fn()
        .mockResolvedValueOnce({ ok: false, cancelado: true })
        .mockResolvedValueOnce({ ok: false, erro: 'Não foi possível gravar o arquivo nessa pasta.' });
      ponte({ salvarPdf });
      render(<FolhaDaConsulta />);
      const pdf = screen.getByRole('button', { name: /salvar em pdf/i });
      await act(async () => { fireEvent.click(pdf); });
      await esperarFim(/salvar em pdf/i, () => expect(salvarPdf).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      await act(async () => { fireEvent.click(pdf); });
      await esperarFim(/salvar em pdf/i, () => expect(salvarPdf).toHaveBeenCalledTimes(2));
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível gravar o arquivo nessa pasta.');
    });
  });
});

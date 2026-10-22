import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { definirPerfilAtivo, logDor, setConsent } from '../../utils/clinicalLogger';
import { _redefinirFalhasDeGravacao } from '../../services/local/falhasDeGravacao';
import { lerDiario, MAX_NOTA, salvarNoDiario } from '../../services/consulta/diario';
import { DiarioRapido } from './DiarioRapido';

// Diário rápido (21/10/2026): sono e humor com o olhar, em dois toques; a dor
// vem do mapa da dor (ninguém digita de novo); a nota é do cuidador.

const AGORA = Date.parse('2026-10-21T15:00:00Z'); // quarta, 12h em Brasília

describe('DiarioRapido', () => {
  beforeEach(() => {
    localStorage.clear();
    _redefinirFalhasDeGravacao();
    definirPerfilAtivo('p1');
    setConsent(true);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const hoje = () => lerDiario('p1').find((e) => e.dia === '2026-10-21');

  describe('primeiro passo: o sono', () => {
    it('pergunta pelo sono e oferece cinco degraus com palavra e número, mais Pular — seis alvos', () => {
      const { container } = render(<DiarioRapido />);
      expect(screen.getByRole('heading', { name: /como foi o sono/i })).toBeInTheDocument();
      for (const palavra of ['Muito ruim', 'Ruim', 'Regular', 'Bom', 'Muito bom']) {
        expect(screen.getByRole('button', { name: new RegExp(`^${palavra} \\(\\d\\)$`) })).toBeInTheDocument();
      }
      expect(screen.getByRole('button', { name: /pular/i })).toBeInTheDocument();
      // Seis alvos no máximo por tela do paciente.
      expect(container.querySelectorAll('button.gaze-button')).toHaveLength(6);
    });

    it('tocar em "Bom" grava sono 4 e passa para o humor', () => {
      render(<DiarioRapido />);
      fireEvent.click(screen.getByRole('button', { name: 'Bom (4)' }));
      expect(hoje()?.sono).toBe(4);
      expect(screen.getByRole('heading', { name: /como você está hoje/i })).toBeInTheDocument();
    });

    it('Pular segue adiante sem gravar nada', () => {
      render(<DiarioRapido />);
      fireEvent.click(screen.getByRole('button', { name: /pular/i }));
      expect(hoje()).toBeUndefined();
      expect(screen.getByRole('heading', { name: /como você está hoje/i })).toBeInTheDocument();
    });
  });

  describe('segundo passo: o humor, em cinco rostos', () => {
    beforeEach(() => salvarNoDiario({ sono: 4 }, AGORA));

    it('abre direto no humor quando o sono de hoje já foi marcado', () => {
      render(<DiarioRapido />);
      expect(screen.getByRole('heading', { name: /como você está hoje/i })).toBeInTheDocument();
    });

    it('cada rosto tem a palavra por escrito — o desenho nunca é o único sinal', () => {
      const { container } = render(<DiarioRapido />);
      for (const palavra of ['Muito mal', 'Mal', 'Mais ou menos', 'Bem', 'Muito bem']) {
        const botao = screen.getByRole('button', { name: new RegExp(`^${palavra} \\(\\d\\)$`) });
        expect(botao.querySelector('svg')).not.toBeNull();
        expect(botao).toHaveTextContent(palavra);
      }
      expect(container.querySelectorAll('button.gaze-button')).toHaveLength(6);
    });

    it('os cinco rostos são diferentes (a boca muda)', () => {
      render(<DiarioRapido />);
      const bocas = [1, 2, 3, 4, 5].map((n) => {
        const b = screen.getAllByRole('button').find((x) => new RegExp(`\\(${n}\\)$`).test(x.getAttribute('aria-label') ?? ''));
        return b!.querySelector('path')!.getAttribute('d');
      });
      expect(new Set(bocas).size).toBe(5);
    });

    it('tocar em "Bem" grava humor 4, mantém o sono e vai ao resumo', () => {
      render(<DiarioRapido />);
      fireEvent.click(screen.getByRole('button', { name: 'Bem (4)' }));
      expect(hoje()).toMatchObject({ sono: 4, humor: 4 });
      expect(screen.getByRole('heading', { name: /hoje/i })).toBeInTheDocument();
    });
  });

  describe('resumo do dia', () => {
    beforeEach(() => salvarNoDiario({ sono: 4, humor: 2 }, AGORA));

    it('abre no resumo quando sono e humor de hoje já estão marcados, com palavra e número', () => {
      render(<DiarioRapido />);
      const resumo = screen.getByRole('region', { name: /resumo de hoje/i });
      expect(resumo).toHaveTextContent('Sono: Bom (4)');
      expect(resumo).toHaveTextContent('Humor: Mal (2)');
    });

    it('a dor vem do mapa da dor, com nível e lugar, sem ninguém digitar', () => {
      logDor({ local: 'cabeca', lugar: 'Cabeça', nivel: 7, frase: 'Estou com dor de cabeça.' });
      render(<DiarioRapido />);
      expect(screen.getByRole('region', { name: /resumo de hoje/i })).toHaveTextContent(/Dor: 7 de 10 · Cabeça/);
    });

    it('sem relato de dor hoje, diz isso (e não "0")', () => {
      render(<DiarioRapido />);
      expect(screen.getByRole('region', { name: /resumo de hoje/i })).toHaveTextContent(/Dor: nenhum relato no mapa da dor hoje/i);
    });

    it('"Mudar o sono" volta ao primeiro passo com o valor atual marcado', () => {
      render(<DiarioRapido />);
      fireEvent.click(screen.getByRole('button', { name: /mudar o sono/i }));
      expect(screen.getByRole('button', { name: 'Bom (4)' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Ruim (2)' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('depois de mudar o sono, volta ao resumo — não empurra para o humor de novo', () => {
      render(<DiarioRapido />);
      fireEvent.click(screen.getByRole('button', { name: /mudar o sono/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Regular (3)' }));
      expect(hoje()).toMatchObject({ sono: 3, humor: 2 });
      expect(screen.getByRole('region', { name: /resumo de hoje/i })).toHaveTextContent('Sono: Regular (3)');
      expect(screen.queryByRole('heading', { name: /como você está hoje/i })).toBeNull();
    });

    it('mudar o humor troca o valor sem apagar o sono', () => {
      render(<DiarioRapido />);
      fireEvent.click(screen.getByRole('button', { name: /mudar o humor/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Muito bem (5)' }));
      expect(hoje()).toMatchObject({ sono: 4, humor: 5 });
    });

    it('a nota é salva à parte e a tela confirma', () => {
      render(<DiarioRapido />);
      const campo = screen.getByLabelText(/nota do dia/i);
      expect(campo).toHaveAttribute('maxlength', String(MAX_NOTA));
      fireEvent.change(campo, { target: { value: 'Dormi bem, mas amanheci cansado.' } });
      fireEvent.click(screen.getByRole('button', { name: /salvar nota/i }));
      expect(hoje()).toMatchObject({ sono: 4, humor: 2, nota: 'Dormi bem, mas amanheci cansado.' });
      expect(screen.getByRole('status')).toHaveTextContent(/nota guardada/i);
    });

    it('a nota de hoje, já guardada, aparece no campo', () => {
      salvarNoDiario({ nota: 'Já escrita' }, AGORA);
      render(<DiarioRapido />);
      expect(screen.getByLabelText(/nota do dia/i)).toHaveValue('Já escrita');
    });

    it('o resumo tem poucos alvos para o olhar (mudar o sono, mudar o humor)', () => {
      const { container } = render(<DiarioRapido />);
      expect(container.querySelectorAll('button.gaze-button')).toHaveLength(2);
    });
  });

  describe('quando não grava, a tela diz', () => {
    it('sem autorização do histórico: mensagem clara e fica no mesmo passo', () => {
      setConsent(false);
      render(<DiarioRapido />);
      fireEvent.click(screen.getByRole('button', { name: 'Bom (4)' }));
      expect(screen.getByRole('alert')).toHaveTextContent(/histórico clínico está desligado/i);
      expect(screen.getByRole('heading', { name: /como foi o sono/i })).toBeInTheDocument();
    });

    it('armazenamento cheio: mensagem de falha e fica no mesmo passo', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<DiarioRapido />);
      fireEvent.click(screen.getByRole('button', { name: 'Bom (4)' }));
      expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível guardar/i);
      expect(screen.getByRole('heading', { name: /como foi o sono/i })).toBeInTheDocument();
    });

    it('a mensagem some quando o próximo toque dá certo', () => {
      setConsent(false);
      render(<DiarioRapido />);
      fireEvent.click(screen.getByRole('button', { name: 'Bom (4)' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      setConsent(true);
      fireEvent.click(screen.getByRole('button', { name: 'Bom (4)' }));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('nota sem autorização: mensagem de alerta, não "guardada"', () => {
      salvarNoDiario({ sono: 4, humor: 2 }, AGORA);
      render(<DiarioRapido />);
      setConsent(false);
      fireEvent.change(screen.getByLabelText(/nota do dia/i), { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: /salvar nota/i }));
      expect(screen.getByRole('alert')).toHaveTextContent(/nada foi guardado/i);
      expect(screen.queryByText(/nota guardada/i)).toBeNull();
    });
  });

  it('o resumo não mostra nada do dia anterior depois da meia-noite de Brasília', () => {
    salvarNoDiario({ sono: 5, humor: 5 }, Date.parse('2026-10-20T15:00:00Z'));
    render(<DiarioRapido />);
    // Hoje (21/10) está vazio: começa pelo sono.
    expect(screen.getByRole('heading', { name: /como foi o sono/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Muito bom (5)' })).toHaveAttribute('aria-pressed', 'false');
  });
});

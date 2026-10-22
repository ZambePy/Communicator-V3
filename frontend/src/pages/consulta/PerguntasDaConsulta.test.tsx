import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { definirPerfilAtivo, logSentence, setConsent } from '../../utils/clinicalLogger';
import { _redefinirFalhasDeGravacao } from '../../services/local/falhasDeGravacao';
import { MAX_PERGUNTAS, MAX_TEXTO_DA_PERGUNTA, adicionarPergunta, lerPerguntas } from '../../services/consulta/perguntas';
import { PerguntasDaConsulta } from './PerguntasDaConsulta';

// Perguntas para levar ao médico (21/10/2026): quem passa meses sem falar
// esquece o que queria perguntar. Duas origens: o cuidador digita; o paciente
// escreve pelo teclado do olhar e as frases dele que terminam em "?" ficam
// disponíveis para levar à consulta com um toque.

const AGORA = Date.parse('2026-10-21T15:00:00Z');

describe('PerguntasDaConsulta', () => {
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

  const lista = () => lerPerguntas('p1');
  const escrever = (texto: string) => fireEvent.change(screen.getByLabelText(/nova pergunta/i), { target: { value: texto } });

  describe('o cuidador digita', () => {
    it('lista vazia diz que está vazia e como começar', () => {
      render(<PerguntasDaConsulta />);
      expect(screen.getByText(/nenhuma pergunta na lista ainda/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/nova pergunta/i)).toBeInTheDocument();
    });

    it('adiciona, mostra com o autor e limpa o campo', () => {
      render(<PerguntasDaConsulta />);
      escrever('Posso aumentar a dose do remédio?');
      fireEvent.click(screen.getByRole('button', { name: /adicionar pergunta/i }));
      expect(lista()).toHaveLength(1);
      expect(lista()[0]).toMatchObject({ texto: 'Posso aumentar a dose do remédio?', quem: 'cuidador', feita: false });
      const itens = within(screen.getByRole('list', { name: /perguntas para levar/i })).getAllByRole('listitem');
      expect(itens).toHaveLength(1);
      expect(itens[0]).toHaveTextContent('Posso aumentar a dose do remédio?');
      expect(itens[0]).toHaveTextContent(/do cuidador/i);
      expect(screen.getByLabelText(/nova pergunta/i)).toHaveValue('');
    });

    it('o campo respeita o tamanho máximo e o botão espera ter texto', () => {
      render(<PerguntasDaConsulta />);
      expect(screen.getByLabelText(/nova pergunta/i)).toHaveAttribute('maxlength', String(MAX_TEXTO_DA_PERGUNTA));
      expect(screen.getByRole('button', { name: /adicionar pergunta/i })).toBeDisabled();
      escrever('   ');
      expect(screen.getByRole('button', { name: /adicionar pergunta/i })).toBeDisabled();
      escrever('Qual o próximo exame?');
      expect(screen.getByRole('button', { name: /adicionar pergunta/i })).toBeEnabled();
    });

    it('a mesma pergunta duas vezes: diz que já está na lista e não duplica', () => {
      adicionarPergunta('Qual o próximo exame?', 'cuidador', AGORA);
      render(<PerguntasDaConsulta />);
      escrever('qual o próximo exame?');
      fireEvent.click(screen.getByRole('button', { name: /adicionar pergunta/i }));
      expect(screen.getByRole('alert')).toHaveTextContent(/já está na lista/i);
      expect(lista()).toHaveLength(1);
    });

    it('sem autorização do histórico: diz que nada foi guardado, e o texto continua no campo', () => {
      setConsent(false);
      render(<PerguntasDaConsulta />);
      escrever('Posso viajar?');
      fireEvent.click(screen.getByRole('button', { name: /adicionar pergunta/i }));
      expect(screen.getByRole('alert')).toHaveTextContent(/nada foi guardado/i);
      expect(screen.getByLabelText(/nova pergunta/i)).toHaveValue('Posso viajar?');
    });

    it('lista cheia: diz o teto e o que fazer', () => {
      for (let i = 0; i < MAX_PERGUNTAS; i += 1) adicionarPergunta(`Pergunta número ${i}?`, 'cuidador', AGORA + i);
      render(<PerguntasDaConsulta />);
      escrever('Mais uma?');
      fireEvent.click(screen.getByRole('button', { name: /adicionar pergunta/i }));
      expect(screen.getByRole('alert')).toHaveTextContent(String(MAX_PERGUNTAS));
    });

    it('mostra quantas perguntas há em relação ao teto', () => {
      adicionarPergunta('Uma?', 'cuidador', AGORA);
      adicionarPergunta('Duas?', 'cuidador', AGORA + 1);
      render(<PerguntasDaConsulta />);
      expect(screen.getByText(new RegExp(`2 de ${MAX_PERGUNTAS}`))).toBeInTheDocument();
    });
  });

  describe('o paciente escreve pelo teclado', () => {
    beforeEach(() => {
      logSentence('Quando posso voltar a comer?');
      logSentence('Estou com sede.');
      logSentence('Posso ver minha filha amanhã?');
    });

    it('oferece só as frases que são perguntas, para levar com um toque', () => {
      render(<PerguntasDaConsulta />);
      const secao = screen.getByRole('region', { name: /escritas no teclado/i });
      expect(within(secao).getByRole('button', { name: /quando posso voltar a comer\?/i })).toBeInTheDocument();
      expect(within(secao).getByRole('button', { name: /posso ver minha filha amanhã\?/i })).toBeInTheDocument();
      expect(within(secao).queryByRole('button', { name: /estou com sede/i })).toBeNull();
    });

    it('tocar numa delas a leva à lista como pergunta do paciente e a tira das sugestões', () => {
      render(<PerguntasDaConsulta />);
      fireEvent.click(screen.getByRole('button', { name: /quando posso voltar a comer\?/i }));
      expect(lista()).toHaveLength(1);
      expect(lista()[0]).toMatchObject({ texto: 'Quando posso voltar a comer?', quem: 'paciente' });
      const itens = within(screen.getByRole('list', { name: /perguntas para levar/i })).getAllByRole('listitem');
      expect(itens[0]).toHaveTextContent(/do paciente/i);
      expect(within(screen.getByRole('region', { name: /escritas no teclado/i })).queryByRole('button', { name: /quando posso voltar a comer/i })).toBeNull();
    });

    it('sem perguntas escritas, a seção nem aparece', () => {
      localStorage.clear();
      definirPerfilAtivo('p1');
      setConsent(true);
      logSentence('Estou com sede.');
      render(<PerguntasDaConsulta />);
      expect(screen.queryByRole('region', { name: /escritas no teclado/i })).toBeNull();
    });

    it('as sugestões são alvos do olhar, no máximo quatro por vez, e a tela diz que há mais', () => {
      for (let i = 0; i < 6; i += 1) logSentence(`Pergunta do teclado ${i}?`);
      const { container } = render(<PerguntasDaConsulta />);
      const secao = screen.getByRole('region', { name: /escritas no teclado/i });
      expect(secao.querySelectorAll('button.gaze-button')).toHaveLength(4);
      expect(container.querySelectorAll('button.gaze-button').length).toBeLessThanOrEqual(6);
      expect(secao).toHaveTextContent(/há mais \d+/i);
    });
  });

  describe('durante a consulta', () => {
    beforeEach(() => {
      adicionarPergunta('Primeira?', 'cuidador', AGORA);
      adicionarPergunta('Segunda?', 'paciente', AGORA + 1);
    });

    it('"Já perguntei" tira da lista de pendentes e guarda em "Já feitas"', () => {
      render(<PerguntasDaConsulta />);
      const primeira = screen.getByText('Primeira?').closest('li')!;
      fireEvent.click(within(primeira).getByRole('button', { name: /já perguntei/i }));
      expect(lista().find((p) => p.texto === 'Primeira?')?.feita).toBe(true);
      expect(within(screen.getByRole('list', { name: /perguntas para levar/i })).queryByText('Primeira?')).toBeNull();
      expect(screen.getByText(/já feitas \(1\)/i)).toBeInTheDocument();
    });

    it('"Tirar da lista" apaga de vez', () => {
      render(<PerguntasDaConsulta />);
      const segunda = screen.getByText('Segunda?').closest('li')!;
      fireEvent.click(within(segunda).getByRole('button', { name: /tirar da lista/i }));
      expect(lista().map((p) => p.texto)).toEqual(['Primeira?']);
    });

    it('uma pergunta já feita pode voltar para a lista', () => {
      render(<PerguntasDaConsulta />);
      fireEvent.click(within(screen.getByText('Primeira?').closest('li')!).getByRole('button', { name: /já perguntei/i }));
      fireEvent.click(screen.getByText(/já feitas \(1\)/i));
      fireEvent.click(screen.getByRole('button', { name: /voltar para a lista/i }));
      expect(lista().find((p) => p.texto === 'Primeira?')?.feita).toBe(false);
    });

    it('se não conseguir gravar a mudança, diz', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(<PerguntasDaConsulta />);
      fireEvent.click(within(screen.getByText('Primeira?').closest('li')!).getByRole('button', { name: /já perguntei/i }));
      expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível guardar/i);
    });
  });
});

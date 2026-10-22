import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import React from 'react';
import { GROUPS, GROUPS_SIMBOLOS } from '../../KeyboardScreen';
import { ACOES_NO_PAPEL, FRASES_DA_PRANCHA, montarPrancha } from './montarPrancha';
import { CLASSE_DE_IMPRESSAO, PAGINA_DA_PRANCHA, imprimirPrancha, ligarModoDeImpressao } from './imprimir';
import { PranchaImpressa } from './PranchaImpressa';

// Prancha de letras impressa (pedido de 19/10/2026): o plano C, com o MESMO
// arranjo do teclado da tela, impressa pelo cuidador nas Configurações.

describe('o arranjo da prancha', () => {
  it('é o do teclado da tela, lido da mesma fonte: seis quadros 3×2, as mesmas posições', () => {
    const quadros = montarPrancha();
    expect(quadros).toHaveLength(6);
    for (const q of quadros) expect(q.itens).toHaveLength(6);
    expect(quadros.slice(0, 5).map((q) => q.itens.map((i) => i.texto))).toEqual(GROUPS);
    // Quem mudar o teclado muda a prancha: nada aqui é cópia.
    const outro = montarPrancha([['X', 'Y', 'Z', 'W', 'K', 'Espaço']]);
    expect(outro[0].itens.map((i) => i.texto)).toEqual(['X', 'Y', 'Z', 'W', 'K', 'Espaço']);
    expect(outro[0].itens[5]).toEqual({ texto: 'Espaço', tipo: 'acao', dica: ACOES_NO_PAPEL['Espaço'] });
  });

  it('todas as letras de A a Z estão lá, uma vez cada; as ações têm o que querem dizer no papel', () => {
    const letras = montarPrancha().flatMap((q) => q.itens).filter((i) => i.tipo === 'letra').map((i) => i.texto);
    expect([...letras].sort().join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    const acoes = montarPrancha().flatMap((q) => q.itens).filter((i) => i.tipo === 'acao');
    expect(acoes.map((a) => a.texto)).toEqual(['Espaço', 'Falar', 'Apagar', 'Limpar']);
    for (const a of acoes) expect(a.dica).toBeTruthy();
    // A camada de símbolos continua só na tela (o teclado a tem; a folha, não).
    expect(GROUPS_SIMBOLOS.length).toBeGreaterThan(0);
  });

  it('o sexto quadro (o das palavras, na tela) leva as frases prontas', () => {
    expect(montarPrancha()[5].itens.map((i) => i.texto)).toEqual(FRASES_DA_PRANCHA);
  });
});

describe('modo de impressão', () => {
  afterEach(() => {
    document.documentElement.classList.remove(CLASSE_DE_IMPRESSAO);
    document.head.querySelectorAll('style[data-prancha]').forEach((s) => s.remove());
  });

  it('liga a página A4 deitada só enquanto imprime, e desliga sem deixar resto', () => {
    const desligar = ligarModoDeImpressao();
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO)).toBe(true);
    expect(document.head.querySelector('style[data-prancha]')?.textContent).toBe(PAGINA_DA_PRANCHA);
    desligar();
    desligar();
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO)).toBe(false);
    expect(document.head.querySelector('style[data-prancha]')).toBeNull();
  });

  it('imprimir chama o print com o modo ligado e desliga quando a impressão termina', async () => {
    let ligadoNoPrint = false;
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      ligadoNoPrint = document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO);
      window.dispatchEvent(new Event('afterprint'));
    });
    await imprimirPrancha();
    expect(print).toHaveBeenCalledTimes(1);
    expect(ligadoNoPrint).toBe(true);
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO)).toBe(false);
    print.mockRestore();
  });
});

describe('Configurações → Prancha de letras impressa', () => {
  beforeEach(() => {
    delete (window as unknown as { irisflowPrancha?: unknown }).irisflowPrancha;
  });

  it('tem a prévia e "Imprimir prancha"; sem o app instalado, não oferece PDF', () => {
    render(<PranchaImpressa estiloDoCartao={{}} />);
    expect(screen.getAllByTestId('prancha-de-letras')).toHaveLength(1);
    const imprimir = screen.getByRole('button', { name: /Imprimir prancha/ });
    // Botão do cuidador: o olhar não abre uma janela de impressão por engano.
    expect(imprimir).toHaveAttribute('data-no-dwell', 'true');
    expect(screen.queryByRole('button', { name: /Salvar em PDF/ })).toBeNull();
  });

  it('a cópia de impressão está na página quando o diálogo abre, e sai depois', async () => {
    let copiaNoPrint = false;
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      copiaNoPrint = document.body.querySelector('.prancha-impressao [data-testid="prancha-de-letras"]') !== null;
      window.dispatchEvent(new Event('afterprint'));
    });
    render(<PranchaImpressa estiloDoCartao={{}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Imprimir prancha/ })); });
    // Espera o diálogo abrir e a impressão acabar (a cópia sai), sem prazo fixo.
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.body.querySelector('.prancha-impressao')).toBeNull());
    expect(copiaNoPrint).toBe(true);
    print.mockRestore();
  });

  it('no app instalado: "Salvar em PDF" pede ao processo principal e diz onde salvou', async () => {
    const salvarPdf = vi.fn(async () => {
      expect(document.body.querySelector('.prancha-impressao')).not.toBeNull();
      return { ok: true as const, caminho: 'C:\\Users\\Ana\\Documents\\Prancha de letras - IrisFlow.pdf' };
    });
    (window as unknown as { irisflowPrancha: unknown }).irisflowPrancha = { salvarPdf };
    render(<PranchaImpressa estiloDoCartao={{}} />);
    const pdf = screen.getByRole('button', { name: /Salvar em PDF/ });
    expect(pdf).toHaveAttribute('data-no-dwell', 'true');
    await act(async () => { fireEvent.click(pdf); });
    // A mensagem só aparece quando o processo principal responde: espera por ela, sem prazo fixo.
    expect(await screen.findByRole('status')).toHaveTextContent('Prancha salva em C:\\Users\\Ana\\Documents');
    expect(salvarPdf).toHaveBeenCalledTimes(1);
  });

  it('PDF cancelado não mostra nada; PDF que falhou diz em palavras', async () => {
    const salvarPdf = vi.fn()
      .mockResolvedValueOnce({ ok: false, cancelado: true })
      .mockResolvedValueOnce({ ok: false, erro: 'Não foi possível gravar o arquivo nessa pasta.' });
    (window as unknown as { irisflowPrancha: unknown }).irisflowPrancha = { salvarPdf };
    render(<PranchaImpressa estiloDoCartao={{}} />);
    const pdf = screen.getByRole('button', { name: /Salvar em PDF/ });
    // Espera a volta do processo principal (o botão volta a valer), sem prazo fixo.
    const clicarEEsperar = async (vezes: number) => {
      await act(async () => { fireEvent.click(pdf); });
      await waitFor(() => expect(salvarPdf).toHaveBeenCalledTimes(vezes));
      await waitFor(() => expect(pdf).not.toBeDisabled());
    };
    await clicarEEsperar(1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await clicarEEsperar(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível gravar o arquivo nessa pasta.');
  });

  // Revisão de UX de 20/10/2026, achado 8: o `window.print()` segurava a
  // página até o diálogo fechar (o app inteiro parava, a Emergência incluída).
  // No app instalado a impressão vai pelo processo principal.
  it('no app instalado: "Imprimir prancha" vai pelo processo principal (sem window.print) e diz se a folha saiu', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    let copiaNaHora = false;
    const imprimir = vi.fn(async () => {
      copiaNaHora = document.body.querySelector('.prancha-impressao [data-testid="prancha-de-letras"]') !== null
        && document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO);
      return { ok: true as const, impressora: 'HP LaserJet' };
    });
    (window as unknown as { irisflowPrancha: unknown }).irisflowPrancha = { salvarPdf: vi.fn(), imprimir };
    render(<PranchaImpressa estiloDoCartao={{}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Imprimir prancha/ })); });
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(imprimir).toHaveBeenCalledTimes(1);
    expect(print).not.toHaveBeenCalled();
    expect(copiaNaHora).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent('Prancha enviada para a impressora HP LaserJet.');
    // Depois, a cópia sai e o modo de impressão desliga.
    expect(document.body.querySelector('.prancha-impressao')).toBeNull();
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO)).toBe(false);
    print.mockRestore();
  });

  it('impressão cancelada não mostra nada; a que falhou diz em palavras; a padrão diz "padrão"', async () => {
    const imprimir = vi.fn()
      .mockResolvedValueOnce({ ok: false, cancelado: true })
      .mockResolvedValueOnce({ ok: false, erro: 'Nenhuma impressora foi encontrada neste computador. Use "Salvar em PDF" e imprima de outro lugar.' })
      .mockResolvedValueOnce({ ok: true, impressora: null });
    (window as unknown as { irisflowPrancha: unknown }).irisflowPrancha = { salvarPdf: vi.fn(), imprimir };
    render(<PranchaImpressa estiloDoCartao={{}} />);
    const botao = screen.getByRole('button', { name: /Imprimir prancha/ });
    // Espera a volta do processo principal (o botão volta a valer), sem prazo fixo.
    const clicarEEsperar = async (vezes: number) => {
      await act(async () => { fireEvent.click(botao); });
      await waitFor(() => expect(imprimir).toHaveBeenCalledTimes(vezes));
      await waitFor(() => expect(botao).not.toBeDisabled());
    };
    await clicarEEsperar(1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    await clicarEEsperar(2);
    expect(screen.getByRole('alert')).toHaveTextContent('Nenhuma impressora foi encontrada neste computador.');
    await clicarEEsperar(3);
    expect(screen.getByRole('status')).toHaveTextContent('Prancha enviada para a impressora padrão.');
  });

  it('a folha tem NÃO à esquerda e SIM à direita (como a tela Sim · Não) e o nome IrisFlow discreto', () => {
    render(<PranchaImpressa estiloDoCartao={{}} />);
    const folha = screen.getByTestId('prancha-de-letras');
    const topo = folha.querySelector('.prancha__topo')!;
    expect(topo.firstElementChild).toHaveTextContent('NÃO');
    expect(topo.lastElementChild).toHaveTextContent('SIM');
    expect(within(folha).getByText('IrisFlow')).toHaveClass('prancha__marca');
  });
});

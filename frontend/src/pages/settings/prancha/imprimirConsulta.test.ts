import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSE_DE_IMPRESSAO,
  CLASSE_DE_IMPRESSAO_DA_CONSULTA,
  PAGINA_DA_CONSULTA,
  PAGINA_DA_PRANCHA,
  imprimirConsulta,
  ligarModoDeImpressaoDaConsulta,
  ponteDaConsulta,
  ponteDaPrancha,
  salvarConsultaEmPdf,
} from './imprimir';

// A folha da consulta reaproveita o caminho da prancha (cópia escondida, classe
// no <html>, `@page` só durante a impressão, processo principal quando há) —
// em A4 EM PÉ e com a ponte dela.

const limpar = () => {
  document.documentElement.classList.remove(CLASSE_DE_IMPRESSAO, CLASSE_DE_IMPRESSAO_DA_CONSULTA);
  document.head.querySelectorAll('style[data-prancha], style[data-consulta]').forEach((s) => s.remove());
  delete (window as unknown as { irisflowConsulta?: unknown }).irisflowConsulta;
  delete (window as unknown as { irisflowPrancha?: unknown }).irisflowPrancha;
};

describe('modo de impressão da consulta', () => {
  afterEach(limpar);

  it('a página é A4 em pé e a classe é própria — a da prancha (deitada) não se mistura', () => {
    expect(PAGINA_DA_CONSULTA).toMatch(/A4 portrait/);
    expect(PAGINA_DA_PRANCHA).toMatch(/A4 landscape/);
    expect(CLASSE_DE_IMPRESSAO_DA_CONSULTA).not.toBe(CLASSE_DE_IMPRESSAO);
  });

  it('liga só enquanto imprime e desliga sem deixar resto (nem a classe, nem o @page)', () => {
    const desligar = ligarModoDeImpressaoDaConsulta();
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA)).toBe(true);
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO)).toBe(false);
    expect(document.head.querySelector('style[data-consulta]')?.textContent).toBe(PAGINA_DA_CONSULTA);
    expect(document.head.querySelector('style[data-prancha]')).toBeNull();
    desligar();
    desligar();
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA)).toBe(false);
    expect(document.head.querySelector('style[data-consulta]')).toBeNull();
  });
});

describe('pontes do app instalado', () => {
  afterEach(limpar);

  it('cada folha lê a sua: a da consulta não é a da prancha', () => {
    const daPrancha = { salvarPdf: vi.fn() };
    const daConsulta = { salvarPdf: vi.fn() };
    (window as unknown as { irisflowPrancha: unknown }).irisflowPrancha = daPrancha;
    expect(ponteDaConsulta()).toBeNull();
    (window as unknown as { irisflowConsulta: unknown }).irisflowConsulta = daConsulta;
    expect(ponteDaConsulta()).toBe(daConsulta);
    expect(ponteDaPrancha()).toBe(daPrancha);
  });
});

describe('imprimirConsulta', () => {
  afterEach(() => {
    limpar();
    vi.restoreAllMocks();
  });

  it('no navegador: window.print com o modo da consulta ligado, e desliga ao terminar', async () => {
    let ligadoNoPrint = false;
    let prancha = true;
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      ligadoNoPrint = document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA);
      prancha = document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO);
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(await imprimirConsulta()).toBeNull();
    expect(print).toHaveBeenCalledTimes(1);
    expect(ligadoNoPrint).toBe(true);
    expect(prancha).toBe(false);
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA)).toBe(false);
  });

  it('no app instalado: pelo processo principal (sem window.print), com o modo ligado enquanto ele trabalha', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    let ligadoNaHora = false;
    const imprimir = vi.fn(async () => {
      ligadoNaHora = document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA);
      return { ok: true as const, impressora: 'HP LaserJet' };
    });
    (window as unknown as { irisflowConsulta: unknown }).irisflowConsulta = { salvarPdf: vi.fn(), imprimir };
    expect(await imprimirConsulta()).toEqual({ ok: true, impressora: 'HP LaserJet' });
    expect(imprimir).toHaveBeenCalledTimes(1);
    expect(print).not.toHaveBeenCalled();
    expect(ligadoNaHora).toBe(true);
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA)).toBe(false);
  });

  it('a ponte que quebra vira mensagem em palavras — e o modo desliga mesmo assim', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    (window as unknown as { irisflowConsulta: unknown }).irisflowConsulta = {
      salvarPdf: vi.fn(),
      imprimir: vi.fn(async () => {
        throw new Error('canal fechado');
      }),
    };
    expect(await imprimirConsulta()).toEqual({ ok: false, erro: 'Não foi possível imprimir agora.' });
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA)).toBe(false);
  });
});

describe('salvarConsultaEmPdf', () => {
  afterEach(() => {
    limpar();
    vi.restoreAllMocks();
  });

  it('pede o PDF com o modo da consulta ligado e desliga depois', async () => {
    let ligadoNaHora = false;
    const salvarPdf = vi.fn(async () => {
      ligadoNaHora = document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA);
      return { ok: true as const, caminho: 'C:\\Docs\\Folha da consulta - IrisFlow.pdf' };
    });
    expect(await salvarConsultaEmPdf({ salvarPdf })).toEqual({ ok: true, caminho: 'C:\\Docs\\Folha da consulta - IrisFlow.pdf' });
    expect(ligadoNaHora).toBe(true);
    expect(document.documentElement.classList.contains(CLASSE_DE_IMPRESSAO_DA_CONSULTA)).toBe(false);
  });

  it('falha vira mensagem, não exceção', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await salvarConsultaEmPdf({
      salvarPdf: async () => {
        throw new Error('x');
      },
    });
    expect(r).toEqual({ ok: false, erro: 'Não foi possível gerar o PDF agora.' });
  });
});

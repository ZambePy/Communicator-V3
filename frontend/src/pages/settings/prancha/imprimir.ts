/**
 * Imprimir a prancha de letras e salvá-la em PDF.
 *
 * A folha é desenhada numa cópia escondida (`.prancha-impressao`, direto no
 * <body>); durante a impressão uma classe no <html> faz as regras de
 * `@media print` esconderem o app e mostrarem só ela, e um `@page` A4
 * deitado entra na página só nesse intervalo — fora dele, nenhuma outra
 * impressão do app herda o tamanho da prancha. Na TELA nada muda: todas as
 * regras moram em `@media print`.
 *
 * A folha da consulta (21/10/2026) usa exatamente este caminho, em A4 EM PÉ e
 * com a ponte dela (`irisflowConsulta`): cada folha é um `ModoDeImpressao`, e
 * as funções abaixo são as mesmas para as duas.
 */

export type ResultadoDoPdf = { ok: true; caminho: string } | { ok: false; cancelado?: boolean; erro?: string };
/** `impressora: null` = a padrão do sistema. */
export type ResultadoDaImpressao = { ok: true; impressora?: string | null } | { ok: false; cancelado?: boolean; erro?: string };

/** Ponte do preload (`irisflowPrancha`): só existe no app instalado. */
export interface PonteDaPrancha {
  salvarPdf: () => Promise<ResultadoDoPdf>;
  /**
   * Imprime pelo processo principal (revisão de UX de 20/10/2026, achado 8):
   * o `window.print()` segura a thread da página até o diálogo fechar, e o
   * app inteiro parava — o olhar, a varredura e a Emergência. Opcional: um
   * preload antigo não tem.
   */
  imprimir?: () => Promise<ResultadoDaImpressao>;
}

export function ponteDaPrancha(w: Window | undefined = typeof window === 'undefined' ? undefined : window): PonteDaPrancha | null {
  if (!w) return null;
  return (w as unknown as { irisflowPrancha?: PonteDaPrancha }).irisflowPrancha ?? null;
}

/** Ponte do preload da folha da consulta (`irisflowConsulta`): a mesma forma da da prancha. */
export function ponteDaConsulta(w: Window | undefined = typeof window === 'undefined' ? undefined : window): PonteDaPrancha | null {
  if (!w) return null;
  return (w as unknown as { irisflowConsulta?: PonteDaPrancha }).irisflowConsulta ?? null;
}

export const CLASSE_DE_IMPRESSAO = 'imprimindo-prancha';
export const PAGINA_DA_PRANCHA = '@page { size: A4 landscape; margin: 0; }';
export const CLASSE_DE_IMPRESSAO_DA_CONSULTA = 'imprimindo-consulta';
export const PAGINA_DA_CONSULTA = '@page { size: A4 portrait; margin: 0; }';

/** O que muda de uma folha para outra no renderer. */
interface ModoDeImpressao {
  classe: string;
  pagina: string;
  /** Atributo do <style> do `@page`, para o teste (e a limpeza) achá-lo. */
  marca: 'data-prancha' | 'data-consulta';
  /** Prefixo das linhas de log. */
  log: string;
}

const MODO_DA_PRANCHA: ModoDeImpressao = { classe: CLASSE_DE_IMPRESSAO, pagina: PAGINA_DA_PRANCHA, marca: 'data-prancha', log: '[prancha]' };
const MODO_DA_CONSULTA: ModoDeImpressao = { classe: CLASSE_DE_IMPRESSAO_DA_CONSULTA, pagina: PAGINA_DA_CONSULTA, marca: 'data-consulta', log: '[consulta]' };

function ligarModo(modo: ModoDeImpressao, doc: Document): () => void {
  const estilo = doc.createElement('style');
  estilo.setAttribute(modo.marca, 'pagina');
  estilo.textContent = modo.pagina;
  doc.head.appendChild(estilo);
  doc.documentElement.classList.add(modo.classe);
  let desligado = false;
  return () => {
    if (desligado) return;
    desligado = true;
    doc.documentElement.classList.remove(modo.classe);
    estilo.remove();
  };
}

/** Liga o modo de impressão da prancha e devolve como desligar (idempotente). */
export function ligarModoDeImpressao(doc: Document = document): () => void {
  return ligarModo(MODO_DA_PRANCHA, doc);
}

/** Liga o modo de impressão da folha da consulta (A4 em pé) e devolve como desligar (idempotente). */
export function ligarModoDeImpressaoDaConsulta(doc: Document = document): () => void {
  return ligarModo(MODO_DA_CONSULTA, doc);
}

/** Dois quadros: a cópia de impressão acabou de entrar na página e precisa estar desenhada. */
function esperarPintura(w: Window): Promise<void> {
  return new Promise((r) => {
    if (typeof w.requestAnimationFrame !== 'function') {
      setTimeout(r, 0);
      return;
    }
    w.requestAnimationFrame(() => w.requestAnimationFrame(() => r()));
  });
}

/** Teto da espera pelo `afterprint`: o diálogo do sistema pode ficar aberto um tempo. */
const ESPERA_MAXIMA_MS = 120_000;

/**
 * Imprime a folha. No app instalado, pelo processo principal (a página
 * continua viva enquanto o cuidador escolhe a impressora); o resultado diz se
 * saiu. No navegador, o `window.print()` de sempre — e `null`: o navegador
 * não conta o que aconteceu.
 */
async function imprimirFolha(modo: ModoDeImpressao, w: Window, ponte: PonteDaPrancha | null): Promise<ResultadoDaImpressao | null> {
  const desligar = ligarModo(modo, w.document);
  if (ponte?.imprimir) {
    try {
      await esperarPintura(w);
      return await ponte.imprimir();
    } catch (e) {
      console.warn(`${modo.log} a impressão não saiu:`, e);
      return { ok: false, erro: 'Não foi possível imprimir agora.' };
    } finally {
      desligar();
    }
  }
  try {
    await esperarPintura(w);
    await new Promise<void>((resolve) => {
      let feito = false;
      let teto: ReturnType<typeof setTimeout> | null = null;
      const fim = () => {
        if (feito) return;
        feito = true;
        w.removeEventListener('afterprint', fim);
        if (teto) clearTimeout(teto);
        resolve();
      };
      w.addEventListener('afterprint', fim);
      teto = setTimeout(fim, ESPERA_MAXIMA_MS);
      try {
        // Só no navegador (sem o app instalado): no Chromium o `print()`
        // segura até o diálogo fechar, e o `afterprint` já chegou quando ele
        // volta.
        w.print();
      } catch (e) {
        console.warn(`${modo.log} a impressão não abriu:`, e);
        fim();
      }
    });
  } finally {
    desligar();
  }
  return null;
}

async function salvarFolhaEmPdf(modo: ModoDeImpressao, ponte: PonteDaPrancha, w: Window): Promise<ResultadoDoPdf> {
  const desligar = ligarModo(modo, w.document);
  try {
    await esperarPintura(w);
    return await ponte.salvarPdf();
  } catch (e) {
    console.warn(`${modo.log} o PDF não saiu:`, e);
    return { ok: false, erro: 'Não foi possível gerar o PDF agora.' };
  } finally {
    desligar();
  }
}

export function imprimirPrancha(w: Window = window, ponte: PonteDaPrancha | null = ponteDaPrancha(w)): Promise<ResultadoDaImpressao | null> {
  return imprimirFolha(MODO_DA_PRANCHA, w, ponte);
}

export function salvarPranchaEmPdf(ponte: PonteDaPrancha, w: Window = window): Promise<ResultadoDoPdf> {
  return salvarFolhaEmPdf(MODO_DA_PRANCHA, ponte, w);
}

export function imprimirConsulta(w: Window = window, ponte: PonteDaPrancha | null = ponteDaConsulta(w)): Promise<ResultadoDaImpressao | null> {
  return imprimirFolha(MODO_DA_CONSULTA, w, ponte);
}

export function salvarConsultaEmPdf(ponte: PonteDaPrancha, w: Window = window): Promise<ResultadoDoPdf> {
  return salvarFolhaEmPdf(MODO_DA_CONSULTA, ponte, w);
}

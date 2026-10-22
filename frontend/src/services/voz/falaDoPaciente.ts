/**
 * A fala do PACIENTE nas telas de comunicação (Teclado, Frases, Pictogramas,
 * Minhas opções, Conversa).
 *
 * Relato de 18/10/2026 (auditoria de falhas silenciosas, item 5): as telas
 * chamavam `void falar(...).catch(console.warn)` e davam a fala por feita — o
 * teclado acendia o brilho de "falou", as frases cumpriam a missão "ouça o
 * computador falar" — mesmo quando nada tinha saído. Para quem só tem o olhar,
 * uma frase que some sem som e sem aviso é um pedido que ninguém ouviu.
 *
 * Aqui a fala passa por um caminho só: se nada saiu por FALHA, o texto vai em
 * letra grande para a tela (`AvisoDeFalaQueNaoSaiu`), para quem estiver perto
 * ler; e a tela recebe o resultado para só dizer "falou" quando falou.
 */

import { falar, type OpcoesDeFala } from './index';
import { falaFalhou, falaSaiu, type ResultadoDaFala } from './resultado';

/** Evento na `window` com a frase que não saiu (`detail`: `DetalheDaFalaQueNaoSaiu`). */
export const EVENTO_DE_FALA_QUE_NAO_SAIU = 'irisflow:fala-que-nao-saiu';

export interface DetalheDaFalaQueNaoSaiu {
  texto: string;
  motivo?: string;
  /** Opções da fala original, para o "Tentar de novo" repetir igual. */
  opcoes?: Omit<OpcoesDeFala, 'aoComecar'>;
}

function mostrarFalaQueNaoSaiu(detalhe: DetalheDaFalaQueNaoSaiu): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DetalheDaFalaQueNaoSaiu>(EVENTO_DE_FALA_QUE_NAO_SAIU, { detail: detalhe }));
}

/**
 * Fala pelo paciente e devolve o que aconteceu. Nunca lança.
 *
 * `null` quando não houve resultado nenhum (só acontece com um `falar` falso
 * nos testes) — nem "falou", nem aviso.
 */
export async function falarDoPaciente(texto: string, opcoes: OpcoesDeFala = {}): Promise<ResultadoDaFala | null> {
  let r: ResultadoDaFala | null | undefined;
  try {
    r = await falar(texto, opcoes);
  } catch (e) {
    // `falar()` não lança por contrato. Se lançar, a frase não pode sumir.
    console.warn('[voz] falar() lançou; a frase vai para a tela:', e);
    r = { origem: 'nenhuma', motivo: 'erro' };
  }
  if (falaFalhou(r)) {
    // O "Tentar de novo" do aviso não acende nada na tela de origem.
    const semCallback: OpcoesDeFala = { ...opcoes };
    delete semCallback.aoComecar;
    mostrarFalaQueNaoSaiu({ texto: texto.trim(), motivo: r?.motivo, opcoes: semCallback });
  }
  return r ?? null;
}

export { falaFalhou, falaSaiu };

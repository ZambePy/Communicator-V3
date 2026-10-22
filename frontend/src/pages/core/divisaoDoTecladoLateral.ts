/**
 * Teclado lateral: o alfabeto por divisão binária (modo só horizontal, pedido
 * de 21/10/2026).
 *
 * Quem só move os olhos para os lados escolhe entre DUAS metades por vez:
 * cada escolha divide ao meio o que sobrou, até sobrar um símbolo — a letra,
 * o espaço, o apagar ou o falar. São no máximo 5 escolhas por símbolo (29
 * símbolos). A ordem é a alfabética, de propósito: o paciente sabe sem ler
 * que o "S" está na metade da direita.
 *
 * Com uma palavra começada e uma previsão que a continua, o começo de cada
 * letra oferece a previsão como um dos lados e o teclado inteiro como o outro.
 * Sem palavra começada não há previsão: a reserva do assistente (as palavras
 * mais usadas, sem relação com o que se escreve) custaria uma escolha a mais
 * em toda letra.
 *
 * Módulo puro: sem DOM e sem React.
 */
import { normalizar } from '@tracker/assistente';

export type SimboloLateral =
  | { tipo: 'letra'; valor: string }
  | { tipo: 'espaco' }
  | { tipo: 'apagar' }
  | { tipo: 'falar' };

export const SIMBOLOS_DO_TECLADO_LATERAL: readonly SimboloLateral[] = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((valor): SimboloLateral => ({ tipo: 'letra', valor })),
  { tipo: 'espaco' },
  { tipo: 'apagar' },
  { tipo: 'falar' },
];

/** O recorte em jogo, `[inicio, fim)` dos símbolos; `null` = o começo de cada letra. */
export type EstadoDoTecladoLateral = { inicio: number; fim: number } | null;

export type LadoDoTeclado =
  | { tipo: 'previsao'; palavra: string }
  /** `fim - inicio === 1`: o lado é um símbolo só, e escolhê-lo é a ação. */
  | { tipo: 'faixa'; inicio: number; fim: number };

export type ResultadoDaEscolha =
  | { tipo: 'estreitar'; estado: { inicio: number; fim: number } }
  | { tipo: 'simbolo'; simbolo: SimboloLateral }
  | { tipo: 'previsao'; palavra: string };

/** Divide `[inicio, fim)` ao meio; com número ímpar, a esquerda leva o do meio. */
function dividir(inicio: number, fim: number): { esquerda: LadoDoTeclado; direita: LadoDoTeclado } {
  const meio = inicio + Math.ceil((fim - inicio) / 2);
  return { esquerda: { tipo: 'faixa', inicio, fim: meio }, direita: { tipo: 'faixa', inicio: meio, fim } };
}

/** Os dois lados agora. `previsao` só vale no começo de cada letra (`estado === null`). */
export function ladosDoTeclado(
  estado: EstadoDoTecladoLateral,
  previsao: string | null,
): { esquerda: LadoDoTeclado; direita: LadoDoTeclado } {
  const total = SIMBOLOS_DO_TECLADO_LATERAL.length;
  if (estado === null && previsao) {
    return { esquerda: { tipo: 'previsao', palavra: previsao }, direita: { tipo: 'faixa', inicio: 0, fim: total } };
  }
  const { inicio, fim } = estado ?? { inicio: 0, fim: total };
  return dividir(inicio, fim);
}

export function escolherLado(lado: LadoDoTeclado): ResultadoDaEscolha {
  if (lado.tipo === 'previsao') return { tipo: 'previsao', palavra: lado.palavra };
  if (lado.fim - lado.inicio <= 1) return { tipo: 'simbolo', simbolo: SIMBOLOS_DO_TECLADO_LATERAL[lado.inicio] };
  return { tipo: 'estreitar', estado: { inicio: lado.inicio, fim: lado.fim } };
}

/** Os símbolos de um lado de faixa (vazio para a previsão). */
export function simbolosDoLado(lado: LadoDoTeclado): SimboloLateral[] {
  return lado.tipo === 'faixa' ? SIMBOLOS_DO_TECLADO_LATERAL.slice(lado.inicio, lado.fim) : [];
}

/** O que a escolha de um símbolo faz no texto. `falar`: a frase a falar (e a linha fica limpa). */
export function aplicarSimbolo(texto: string, s: SimboloLateral): { texto: string; falar?: string } {
  switch (s.tipo) {
    case 'letra':
      return { texto: texto + s.valor };
    case 'espaco':
      // Nem espaço no começo nem dois seguidos: cada espaço custa até 5 escolhas.
      return { texto: texto === '' || /\s$/.test(texto) ? texto : `${texto} ` };
    case 'apagar':
      return { texto: texto.slice(0, -1) };
    case 'falar': {
      const frase = texto.trim();
      return frase ? { texto: '', falar: frase } : { texto };
    }
  }
}

/** A palavra que está sendo escrita: o que vem depois do último espaço. */
export function palavraEmCurso(texto: string): string {
  const m = /(\S+)$/.exec(texto);
  return m ? m[1] : '';
}

/** Completa a palavra em curso com a previsão, em maiúsculas como as letras, e põe o espaço. */
export function aplicarPrevisao(texto: string, palavra: string): string {
  const parcial = palavraEmCurso(texto);
  const antes = parcial ? texto.slice(0, texto.length - parcial.length) : texto;
  return `${antes}${palavra.trim().toLocaleUpperCase('pt-BR')} `;
}

let falhaDaPrevisaoAvisada = false;

/**
 * A previsão para o texto: a primeira sugestão que CONTINUA a palavra em
 * curso (sem acento e sem caixa, como o assistente compara). `null` sem
 * palavra começada, ou sem sugestão que a continue.
 */
export function previsaoDoTeclado(texto: string, sugerir: (texto: string) => readonly string[]): string | null {
  const parcial = palavraEmCurso(texto);
  if (!parcial) return null;
  let sugestoes: readonly string[];
  try {
    sugestoes = sugerir(texto);
  } catch (e) {
    // Sem previsão o teclado continua inteiro; o aviso vai ao console uma vez.
    if (!falhaDaPrevisaoAvisada) {
      falhaDaPrevisaoAvisada = true;
      console.warn('[teclado lateral] a previsão de palavra falhou; o teclado segue sem ela', e);
    }
    return null;
  }
  const alvo = normalizar(parcial);
  for (const s of sugestoes) {
    const n = normalizar(s);
    if (n && n !== alvo && n.startsWith(alvo)) return s.trim().toLocaleUpperCase('pt-BR');
  }
  return null;
}

import type { Missao } from './missao';

/**
 * Ordem dos passos do tutorial.
 *
 * É a ordem do aprendizado, não uma lista arbitrária. Primeiro a INTERAÇÃO
 * (como se clica com o olhar, quanto tempo, e o tempo é ajustável); depois o
 * que se faz com ela, na ordem em que importa para quem não consegue falar:
 *
 *   1. `oQueEDwell`  — sem isso a prática é só uma tela que muda sozinha.
 *   2. `pratica`     — sentir o tempo no próprio olhar.
 *   3. `ajuste`      — ajustar à luz do que acabou de ser sentido. Ajustar
 *                      antes de praticar seria ajustar às cegas.
 *   4. `comunicacao` — dizer algo pronto, que é o caminho mais curto entre
 *                      "aprendi a clicar" e "fui entendido".
 *   5. `digitacao`   — escrever uma frase própria. É o passo que a jornada
 *                      inteira existe para chegar, e o ÚNICO com trava:
 *                      ver alguém escrever a primeira frase pelo olhar é o
 *                      que convence paciente e cuidador de que isto funciona.
 *   6. `conversa`    — responder, que é o outro lado da comunicação.
 *   7. `lazer`       — os jogos. Não é enfeite: foi o que os pacientes em
 *                      teste mais elogiaram, e é o que faz treinar o olhar
 *                      deixar de ser exercício.
 *   8. `recursos`    — o resto do app no mapa mental, sem visitar um a um.
 *   9. `emergencia`  — por último: é dwell MAIS LONGO, e não faz sentido
 *                      antes de o dwell comum estar entendido.
 *  10. `concluido`   — conclusão, com o caminho para refazer.
 *
 * **Ajustes não está aqui, e é decisão.** É a tela em que uma escolha errada
 * quebra o rastreamento que o paciente acabou de calibrar, e ele não tem como
 * saber disso. O tutorial cita Ajustes como informação para o cuidador (ver
 * `MaisRecursos`), nunca como destino obrigatório do paciente.
 */
export const PASSOS_DO_TUTORIAL = [
  'oQueEDwell',
  'pratica',
  'ajuste',
  'comunicacao',
  'digitacao',
  'conversa',
  'lazer',
  'recursos',
  'emergencia',
  'concluido',
] as const;

export type PassoDoTutorial = (typeof PASSOS_DO_TUTORIAL)[number];

export function ehPassoDoTutorial(v: unknown): v is PassoDoTutorial {
  return typeof v === 'string' && (PASSOS_DO_TUTORIAL as readonly string[]).includes(v);
}

/**
 * Passos que se cumprem na TELA REAL, e qual missão cada um pede.
 *
 * O tutorial manda a pessoa para o teclado de verdade e para os jogos de
 * verdade em vez de desenhar miniaturas deles aqui dentro — ver o cabeçalho de
 * `missao.ts`.
 */
export const MISSAO_DO_PASSO: Partial<Record<PassoDoTutorial, Missao>> = {
  comunicacao: 'comunicacao',
  digitacao: 'digitacao',
  conversa: 'conversa',
  lazer: 'lazer',
};

/**
 * O passo que pede uma missão — o inverso de `MISSAO_DO_PASSO`.
 *
 * É por ele que a tela real sabe se a pessoa está no meio do tutorial NESTE
 * passo: a missão ativa some assim que é cumprida, mas o passo guardado fica
 * até a pessoa sair do tutorial, e é isso que mantém a faixa de volta visível.
 */
export function passoDaMissao(m: Missao): PassoDoTutorial | null {
  for (const p of PASSOS_DO_TUTORIAL) if (MISSAO_DO_PASSO[p] === m) return p;
  return null;
}

/**
 * O ÚNICO passo que trava o avanço até a ação ser feita pelo olhar.
 *
 * Por que só este: escrever a primeira frase é o que transforma "o app
 * responde ao meu olhar" em "eu consigo dizer o que eu quiser", e é a única
 * coisa do tutorial que ninguém aprende assistindo. Os outros passos convidam;
 * este espera.
 *
 * Por que a trava tem escapatória (ver `ESPERA_MAXIMA_MS`): o mesmo motivo do
 * `SetupWizard`. Uma trava sem saída num app assistivo é uma armadilha — se o
 * rastreamento estiver ruim naquele minuto, ou a pessoa estiver cansada, ela
 * fica presa numa tela sem poder nem pedir ajuda. "Pular o tutorial" continua
 * disponível em todos os passos, inclusive neste.
 */
export const PASSO_COM_TRAVA: PassoDoTutorial = 'digitacao';

/**
 * Depois disto, o Continuar do passo travado libera sozinho.
 *
 * 90 s é bem mais que o tempo de escrever uma palavra curta pelo olhar (~4 s
 * por letra a 1,5 s de dwell numa árvore de dois níveis) e curto o bastante
 * para ninguém achar que o app parou. Mesma ideia da espera máxima do
 * `SetupWizard`.
 */
export const ESPERA_MAXIMA_MS = 90_000;

export const indiceDoPassoDoTutorial = (p: PassoDoTutorial) => PASSOS_DO_TUTORIAL.indexOf(p);

export function proximoPassoDoTutorial(p: PassoDoTutorial): PassoDoTutorial | null {
  const i = indiceDoPassoDoTutorial(p);
  return i >= 0 && i < PASSOS_DO_TUTORIAL.length - 1 ? PASSOS_DO_TUTORIAL[i + 1] : null;
}

/** Voltar não tem condição: nada aqui pode prender o paciente num passo. */
export function passoAnteriorDoTutorial(p: PassoDoTutorial): PassoDoTutorial | null {
  const i = indiceDoPassoDoTutorial(p);
  return i > 0 ? PASSOS_DO_TUTORIAL[i - 1] : null;
}

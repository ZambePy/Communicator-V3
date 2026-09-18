/**
 * Janela de estabilidade do passo de posicionamento.
 *
 * Sem ela, "Continuar" fica habilitado no primeiro frame verde — e o cuidador
 * clica no instante de sorte, com o paciente numa pose que ele não sustenta. A
 * calibração inteira parte de uma posição que durou 30 ms.
 *
 * O comportamento que dá sentido à janela é o **reset**: cair para amarelo
 * zera. Um acumulador que apenas somasse tempo verde aprovaria três segundos
 * picotados em trinta lampejos de cem milissegundos — exatamente o caso que a
 * janela existe para reprovar.
 *
 * Máquina pura, sem timer nem relógio próprio: o chamador passa o instante. Dá
 * para testar a regra inteira sem `vi.useFakeTimers`.
 */

export const ESTABILIDADE_EXIGIDA_MS = 3000;

export interface EstadoDeEstabilidade {
  /** Instante do primeiro frame verde da sequência atual. `null` = não está verde. */
  readonly desdeMs: number | null;
}

export const inicial = (): EstadoDeEstabilidade => ({ desdeMs: null });

export function acumular(
  estado: EstadoDeEstabilidade,
  verde: boolean,
  agoraMs: number
): EstadoDeEstabilidade {
  if (!verde) return { desdeMs: null };
  // Já estava verde: preserva o início, senão a contagem reiniciaria a cada
  // amostra e nunca chegaria à janela.
  return estado.desdeMs === null ? { desdeMs: agoraMs } : estado;
}

export function msEstavel(estado: EstadoDeEstabilidade, agoraMs: number): number {
  if (estado.desdeMs === null) return 0;
  // `Math.max(0, …)`: o estado pode atravessar uma suspensão da aba, e tempo
  // negativo virando "estável" liberaria o botão sem ninguém ter ficado parado.
  return Math.max(0, agoraMs - estado.desdeMs);
}

export function estavel(estado: EstadoDeEstabilidade, agoraMs: number): boolean {
  return msEstavel(estado, agoraMs) >= ESTABILIDADE_EXIGIDA_MS;
}

/**
 * Depois de quanto tempo TENTANDO a porta abre assim mesmo.
 *
 * A janela de 3 s é uma boa regra e uma armadilha ruim. Quem tem movimento
 * involuntário de cabeça, câmera ruim ou sala escura pode nunca encadear três
 * segundos verdes — e aí "Continuar" fica desabilitado para sempre, no meio do
 * preparo, sem nada na tela explicando o que fazer. É o mesmo desfecho do bug
 * do tutorial: a pessoa conclui que o app travou.
 *
 * 45 s é longo o bastante para que ninguém chegue aqui por pressa (a janela de
 * 3 s costuma fechar em poucos segundos) e curto o bastante para não virar
 * abandono. Ao liberar, a tela AVISA que a posição não ficou estável — a
 * calibração seguinte pode ficar pior, e isso é informação, não um detalhe a
 * esconder.
 */
export const ESPERA_MAXIMA_MS = 45000;

/**
 * A porta de posicionamento deve estar aberta?
 *
 * `true` por estabilidade atingida OU por tempo esgotado. O segundo caso é
 * degradação deliberada: preso é pior que impreciso.
 */
export function podeSeguir(
  estado: EstadoDeEstabilidade,
  agoraMs: number,
  desdeQuandoTentaMs: number,
): boolean {
  return estavel(estado, agoraMs) || agoraMs - desdeQuandoTentaMs >= ESPERA_MAXIMA_MS;
}

/** Liberou por tempo, sem nunca ter ficado estável — a tela precisa avisar. */
export function liberadoPorEspera(
  estado: EstadoDeEstabilidade,
  agoraMs: number,
  desdeQuandoTentaMs: number,
): boolean {
  return !estavel(estado, agoraMs) && agoraMs - desdeQuandoTentaMs >= ESPERA_MAXIMA_MS;
}

/** Fração [0..1] para a barra de progresso da tela. */
export function progresso(estado: EstadoDeEstabilidade, agoraMs: number): number {
  return Math.min(1, msEstavel(estado, agoraMs) / ESTABILIDADE_EXIGIDA_MS);
}

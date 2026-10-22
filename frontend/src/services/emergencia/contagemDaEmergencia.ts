/**
 * Quanto dura a contagem da Emergência (decisão 5 da rodada 3, 21/10/2026).
 *
 * A contagem é o intervalo entre acionar a Emergência e o pedido de socorro
 * sair de verdade: nele o CANCELAR desfaz um engano. Durante anos foram 5 s
 * fixos. Quem tem o olhar muito lento precisa de mais tempo para alcançar o
 * CANCELAR; quem mora com alguém ao lado, ou está num quarto de hospital, quer
 * o socorro mais depressa. Por isso o cuidador ajusta em Configurações.
 *
 * A faixa existe por dois motivos de segurança:
 *  - o mínimo de 3 s: o CANCELAR é acionado por 1 s de olhar (ou por um aperto
 *    curto do acionador, depois de soltar e da pausa de 0,7 s da varredura);
 *    com menos de 3 s o engano deixa de poder ser desfeito;
 *  - o máximo de 10 s: acima disso o socorro de verdade espera demais.
 * E um valor inválido NUNCA vira 0: com a contagem zerada o pedido sairia no
 * mesmo instante, sem CANCELAR.
 *
 * Módulo sem dependências: o `SettingsContext` (leitura do disco) e o
 * `EmergencyContext` (a contagem) leem a mesma faixa daqui.
 */

/** O padrão de sempre. */
export const CONTAGEM_PADRAO_S = 5;
export const CONTAGEM_MIN_S = 3;
export const CONTAGEM_MAX_S = 10;

/**
 * Leva qualquer valor para a faixa 3–10 s, em segundos inteiros (a contagem
 * anda de 1 em 1 s). O que não é um número válido volta ao padrão.
 */
export function limitarContagemDaEmergencia(s: unknown): number {
  if (typeof s !== 'number' || !Number.isFinite(s)) return CONTAGEM_PADRAO_S;
  return Math.min(CONTAGEM_MAX_S, Math.max(CONTAGEM_MIN_S, Math.round(s)));
}

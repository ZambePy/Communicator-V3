import { ORDEM_DA_CALIBRACAO } from '@/components/produto/calibracao'

/* O campo de pontos da abertura (CampoDeCalibracao.tsx), rodada 3,
   21/10/2026. Pedido do dono: movimento e efeito de fundo, mas elegantes e
   saídos do produto. O que sai do produto aqui é a primeira tela do paciente:
   os 13 pontos da calibração. A geometria é a de produto/calibracao.ts (a do
   app); este arquivo só decide QUANDO cada coisa acontece — contas puras, para
   o teste conferir a ordem sem navegador.

   A linha do tempo da entrada (ms desde o carregamento):
   - os 13 pontos acendem um a um, na ordem da calibração (o centro primeiro),
     em cerca de 1,5 s;
   - o anel de fixação visita os 6 primeiros da ordem, enchendo como o dwell do
     app, e para;
   - o campo se apaga até o repouso e, de tempos em tempos, um ponto respira. */

/** O primeiro ponto acende logo depois da primeira pintura. */
export const ENTRADA_INICIO_MS = 250
/** Intervalo entre um ponto e o seguinte da ordem: 12 intervalos ≈ 1,3 s. */
export const ENTRADA_PASSO_MS = 105

/** Quantos pontos o anel de fixação visita antes de parar. */
export const VISITAS_DO_ANEL = 6
/** O anel enche em 650 ms (o dwell mais curto do app é 800 ms; aqui é só um aceno). */
export const ANEL_DWELL_MS = 650
/** O respiro entre uma visita e a seguinte: o olhar muda de ponto. */
export const ANEL_SALTO_MS = 130
/** O anel só começa quando os seis primeiros pontos já existem. */
export const ANEL_INICIO_MS = 900

/** No topo das páginas internas (CampoDoTopo.tsx) o anel enche uma vez só, no ponto do
 *  centro, logo depois de ele acender (ENTRADA_INICIO_MS + a subida do ponto). */
export const ANEL_DO_TOPO_INICIO_MS = 600

/** De quanto em quanto tempo um ponto diferente respira, depois da entrada. */
export const INTERVALO_DO_RESPIRO_MS = 4000

/** Posição do ponto `indice` (de PONTOS_DA_CALIBRACAO) na ordem da calibração: 0 a 12. */
export function ordemDoPonto(indice: number): number {
  return ORDEM_DA_CALIBRACAO.indexOf(indice)
}

/** Quando o ponto `indice` acende, em ms desde o carregamento. */
export function atrasoDeEntradaMs(indice: number): number {
  return ENTRADA_INICIO_MS + ordemDoPonto(indice) * ENTRADA_PASSO_MS
}

/** Os pontos que o anel visita, na ordem da calibração. */
export function pontosDoAnel(): number[] {
  return ORDEM_DA_CALIBRACAO.slice(0, VISITAS_DO_ANEL)
}

/** Quando a visita `v` do anel começa. */
export function atrasoDoAnelMs(v: number): number {
  return ANEL_INICIO_MS + v * (ANEL_DWELL_MS + ANEL_SALTO_MS)
}

/** Quando tudo isso terminou: o campo já está no repouso e os respiros podem começar. */
export const DURACAO_DA_ENTRADA_MS = atrasoDoAnelMs(VISITAS_DO_ANEL - 1) + ANEL_DWELL_MS + 700

/**
 * O ponto que respira no n-ésimo respiro. Anda de 5 em 5 pela ordem da
 * calibração (5 e 13 são primos entre si): nunca o mesmo ponto duas vezes
 * seguidas, nunca um vizinho atrás do outro, e passa pelos 13 antes de repetir.
 */
export function pontoDoRespiro(n: number): number {
  const total = ORDEM_DA_CALIBRACAO.length
  return ORDEM_DA_CALIBRACAO[(((VISITAS_DO_ANEL + n * 5) % total) + total) % total]
}

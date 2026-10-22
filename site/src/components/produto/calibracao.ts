/**
 * Os 13 pontos da calibração, como o app os mostra (pedido de 20/10/2026: o
 * momento da calibração na página Como funciona, e o desenho da chamada
 * final, que mostrava a grade do Modo Computador).
 *
 * A geometria é a do perfil padrão do app (src/calibration.ts,
 * `alvosDeCalibracao`) na tela de referência da equipe — 23,6" em 16:9, a
 * 60 cm: a grade de 3 × 3 dentro do orçamento de ângulo (colunas em 17,1 /
 * 50 / 82,9 % e linhas em 5 / 50 / 83,75 % — a de baixo sobe porque a
 * pálpebra cobre a íris com a câmera no alto) e os quatro cantos da tela a
 * 5 % da borda.
 *
 * A ordem é a que o app usa (frontend/src/pages/calibration/ordemDaGrade.ts,
 * `ordemDescorrelacionada`, ligada no pipeline V3), calculada para essa
 * mesma geometria: começa no centro e não anda junto com x nem com y, para a
 * deriva lenta da cabeça não se confundir com o olhar. O teste confere essas
 * propriedades, com as mesmas contas do app.
 */

export type Ponto = { x: number; y: number }

/** Os 9 da grade, linha a linha, e depois os 4 cantos (frações da tela). */
export const PONTOS_DA_CALIBRACAO: readonly Ponto[] = [
  { x: 0.171, y: 0.05 },
  { x: 0.5, y: 0.05 },
  { x: 0.829, y: 0.05 },
  { x: 0.171, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.829, y: 0.5 },
  { x: 0.171, y: 0.8375 },
  { x: 0.5, y: 0.8375 },
  { x: 0.829, y: 0.8375 },
  { x: 0.05, y: 0.05 },
  { x: 0.95, y: 0.05 },
  { x: 0.05, y: 0.95 },
  { x: 0.95, y: 0.95 },
]

/** Índices de PONTOS_DA_CALIBRACAO na ordem em que o alvo os visita. */
export const ORDEM_DA_CALIBRACAO: readonly number[] = [4, 12, 2, 0, 3, 11, 6, 1, 10, 5, 8, 7, 9]

/**
 * Tempos do site, mais curtos que os do app (lá cada ponto leva ~2,3 s, com a
 * coleta): o alvo viaja com a curva do app, chega 1,5× maior e se contrai
 * (CONTRACAO_MS no app, aqui encurtada), fica parado um instante — a coleta —
 * e deixa um ponto pequeno no lugar.
 */
export const TEMPOS_DA_CALIBRACAO = {
  inicioMs: 350,
  viagemMs: 180,
  contracaoMs: 240,
  coletaMs: 140,
  /** O resultado em palavras aparece depois do último ponto. */
  resultadoMs: 360,
} as const

export const ESCALA_DE_CHEGADA = 1.5

const porPonto = () => TEMPOS_DA_CALIBRACAO.viagemMs + TEMPOS_DA_CALIBRACAO.contracaoMs + TEMPOS_DA_CALIBRACAO.coletaMs

/** Quando a calibração inteira termina (o resultado já à vista). */
export function duracaoDaCalibracao(): number {
  const T = TEMPOS_DA_CALIBRACAO
  return T.inicioMs + ORDEM_DA_CALIBRACAO.length * porPonto() + T.resultadoMs
}

export type QuadroDaCalibracao = {
  /** Quantos pontos já foram coletados (deixaram o ponto pequeno). */
  feitos: number
  /** O alvo: de onde vem, para onde vai, quanto da viagem passou (0 a 1), a escala e se está aceso. */
  alvo: { de: Ponto | null; para: Ponto; viagem: number; escala: number; visivel: number } | null
  /** 0 a 1: o resultado aparecendo. */
  resultado: number
  fim: boolean
}

const entre = (v: number) => Math.min(1, Math.max(0, v))

/** Curva de saída suave, a da contração do alvo no app (cubic-bezier(0.22, 1, 0.36, 1), aproximada). */
function saida(p: number): number {
  return 1 - Math.pow(1 - entre(p), 3)
}

/** O que a tela da calibração mostra em `t` ms. Pura: o componente desenha, o teste confere. */
export function quadroDaCalibracao(t: number): QuadroDaCalibracao {
  const T = TEMPOS_DA_CALIBRACAO
  const n = ORDEM_DA_CALIBRACAO.length
  const ciclo = porPonto()
  const desde = t - T.inicioMs
  if (desde < 0) return { feitos: 0, alvo: null, resultado: 0, fim: false }

  const i = Math.floor(desde / ciclo)
  if (i >= n) {
    const resultado = entre((desde - n * ciclo) / T.resultadoMs)
    return { feitos: n, alvo: null, resultado, fim: resultado >= 1 }
  }

  const dentro = desde - i * ciclo
  const para = PONTOS_DA_CALIBRACAO[ORDEM_DA_CALIBRACAO[i]]
  // O primeiro aparece no lugar; os outros viajam do anterior.
  const de = i === 0 ? null : PONTOS_DA_CALIBRACAO[ORDEM_DA_CALIBRACAO[i - 1]]
  const viagem = de ? entre(dentro / T.viagemMs) : 1
  const contracao = entre((dentro - T.viagemMs) / T.contracaoMs)
  const escala = ESCALA_DE_CHEGADA - (ESCALA_DE_CHEGADA - 1) * saida(contracao)
  const visivel = i === 0 ? entre(dentro / 120) : 1
  return { feitos: i, alvo: { de, para, viagem, escala, visivel }, resultado: 0, fim: false }
}

/** A curva da viagem do alvo no app: cubic-bezier(0.33, 0, 0.2, 1), resolvida em x. */
export function curvaDaViagem(p: number): number {
  const x = entre(p)
  // Newton sobre a cúbica de Bézier em x; poucos passos bastam.
  const bx = (s: number) => 3 * (1 - s) * (1 - s) * s * 0.33 + 3 * (1 - s) * s * s * 0.2 + s * s * s
  const by = (s: number) => 3 * (1 - s) * s * s * 1 + s * s * s
  let s = x
  for (let k = 0; k < 6; k++) {
    const dx = (bx(s + 1e-4) - bx(s - 1e-4)) / 2e-4
    if (Math.abs(dx) < 1e-6) break
    s = entre(s - (bx(s) - x) / dx)
  }
  return by(s)
}

import { useEffect, useState, type CSSProperties } from 'react'
import { PONTOS_DA_CALIBRACAO } from '@/components/produto/calibracao'
import { useInView } from '@/hooks/useInView'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useTique } from '@/hooks/useTique'
import {
  ANEL_DWELL_MS,
  ANEL_INICIO_MS,
  ANEL_SALTO_MS,
  DURACAO_DA_ENTRADA_MS,
  INTERVALO_DO_RESPIRO_MS,
  atrasoDeEntradaMs,
  pontoDoRespiro,
  pontosDoAnel,
} from './ritmoDoCampo'
import './campo-de-calibracao.css'

/** Fração da tela (0 a 1) como porcentagem curta: 0,171 → "17.1%". */
const porcento = (fracao: number) => `${+(fracao * 100).toFixed(2)}%`

/** Posição de cada ponto na caixa da abertura, e o ponto de cada visita do anel. */
const VISITA_DO_PONTO = new Map(pontosDoAnel().map((ponto, visita) => [ponto, visita]))

/**
 * O campo de pontos atrás da abertura (rodada 3, 21/10/2026): os 13 pontos da
 * calibração do IrisFlow — a primeira tela do paciente — na mesma geometria
 * do app (produto/calibracao.ts), esticada sobre a área da abertura.
 *
 * Ao carregar, os pontos acendem na ORDEM DA CALIBRAÇÃO (o centro primeiro) em
 * cerca de 1,5 s, e um anel teal de fixação visita os seis primeiros, enchendo
 * como o dwell do app, e para. Depois o campo fica bem apagado (opacidade de
 * repouso ~0,13, a do CSS) e, a cada ~4 s, um ponto diferente respira de leve.
 *
 * Pedido do dono (21/10/2026): movimento e efeito de fundo, mas elegantes e
 * saídos do produto. Ele já recusou o olho de partículas, a grade de
 * quadrados, o feixe de luz, a marca d'água e a aurora: este campo é o
 * contrário de uma grade decorativa — são os alvos de verdade, nos lugares de
 * verdade, quase invisíveis. O texto da abertura fica por cima, intacto.
 *
 * - Só SVG e CSS; só `transform`, `opacity` e `stroke-dashoffset` animam.
 * - O respiro só bate com a abertura na tela e a aba visível (useTique); fora
 *   disso não há temporizador algum.
 * - Movimento reduzido: os 13 pontos já no repouso, sem anel e sem respiro.
 * - Decorativo: fora do leitor de tela, sem nada que receba foco ou clique.
 */
export function CampoDeCalibracao() {
  const reduzido = useReducedMotion()
  // `once: false`: a abertura sai da tela e o respiro para com ela.
  const { ref, inView } = useInView<HTMLDivElement>({ once: false, threshold: 0.05, rootMargin: '0px' })
  const [passada, setPassada] = useState(false)
  const [respiro, setRespiro] = useState(-1)

  // A entrada (pontos + anel) termina e o campo vai para o repouso.
  useEffect(() => {
    if (reduzido) return
    const id = window.setTimeout(() => setPassada(true), DURACAO_DA_ENTRADA_MS)
    return () => window.clearTimeout(id)
  }, [reduzido])

  useTique(inView && passada && !reduzido, INTERVALO_DO_RESPIRO_MS, () => setRespiro((n) => n + 1))

  const noRespiro = respiro >= 0 ? pontoDoRespiro(respiro) : -1
  const comAnel = !reduzido && !passada
  const estilo = {
    '--anel-inicio': `${ANEL_INICIO_MS}ms`,
    '--anel-dwell': `${ANEL_DWELL_MS}ms`,
    '--anel-passo': `${ANEL_DWELL_MS + ANEL_SALTO_MS}ms`,
  } as CSSProperties

  return (
    <div
      ref={ref}
      className={`v3-campo${reduzido ? ' is-parado' : ''}${passada ? ' is-passada' : ''}`}
      style={estilo}
      aria-hidden="true"
    >
      {PONTOS_DA_CALIBRACAO.map((p, i) => {
        const visita = VISITA_DO_PONTO.get(i)
        return (
          <div
            key={i}
            className={`v3-campo__ponto${i === noRespiro ? ' is-respira' : ''}`}
            data-ponto={i}
            style={{ '--x': porcento(p.x), '--y': porcento(p.y), '--atraso': `${atrasoDeEntradaMs(i)}ms` } as CSSProperties}
          >
            <svg className="v3-campo__base" viewBox="0 0 40 40" focusable="false">
              <circle className="v3-campo__aro" cx="20" cy="20" r="15" />
              <circle className="v3-campo__miolo" cx="20" cy="20" r="2.4" />
            </svg>
            {comAnel && visita !== undefined && (
              <svg className="v3-campo__fixa" viewBox="0 0 40 40" focusable="false" style={{ '--v': visita } as CSSProperties}>
                <circle cx="20" cy="20" r="15" pathLength={1} />
              </svg>
            )}
          </div>
        )
      })}
    </div>
  )
}

import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useTique } from '@/hooks/useTique'
import { PONTOS_DA_CALIBRACAO } from '@/components/produto/calibracao'
import { FIXACAO_NO_PERCURSO_MS, PASSO_DO_PERCURSO_MS, pontoDoPasso, pontosFeitos, proximoPasso } from './percursoDaChamada'
import './ilustracoes.css'

/**
 * Ilustrações em SVG embutido: poucos traços, sempre ligadas ao que a seção
 * diz.
 *
 * Regras de movimento, as mesmas do resto do site:
 *  - só `transform` e `opacity` animam (o teste lê o CSS e confere);
 *  - a animação só roda com a ilustração na tela (`is-rodando`, por
 *    IntersectionObserver) — fora dela fica parada e não gasta nada;
 *  - com movimento reduzido a regra global de global.css encurta tudo para um
 *    quadro, e cada ilustração fica no desenho de repouso;
 *  - são decoração: fora do leitor de tela e do foco, porque o texto ao lado
 *    já diz o que elas mostram.
 */

/** Id de SVG a partir do `useId` do React, sem os dois-pontos (que atrapalham em `url(#…)`). */
function useIdDeSvg(prefixo: string): string {
  return `${prefixo}-${useId().replace(/:/g, '')}`
}

function Palco({ className, children, largura, altura, viewBox }: {
  className: string
  /** Uma função recebe se a ilustração está na tela agora (para quem anda por temporizador, e não só por CSS). */
  children: ReactNode | ((naTela: boolean) => ReactNode)
  largura: number
  altura: number
  viewBox: string
}) {
  // `once: false`: a ilustração para de animar quando sai da tela.
  const { ref, inView } = useInView<HTMLSpanElement>({ once: false, threshold: 0.2, rootMargin: '0px' })
  return (
    <span ref={ref} className={`ilustracao ${className}${inView ? ' is-rodando' : ''}`} aria-hidden="true">
      <svg viewBox={viewBox} width={largura} height={altura} focusable="false">
        {typeof children === 'function' ? children(inView) : children}
      </svg>
    </span>
  )
}

/**
 * Privacidade: a imagem da webcam é lida DENTRO do computador (a linha de
 * leitura desce pela tela) e os dados ficam lá (os pontos giram por dentro,
 * sem sair), com o cadeado que fecha quando a seção aparece.
 */
export function CofreDoComputador() {
  const id = useIdDeSvg('cofre')
  return (
    <Palco className="ilustracao--cofre" viewBox="0 0 120 100" largura={104} altura={87}>
      <defs>
        <clipPath id={`${id}-tela`}>
          <rect x="10" y="8" width="100" height="62" rx="6" />
        </clipPath>
      </defs>
      <rect x="6" y="4" width="108" height="70" rx="9" className="cofre__moldura" />
      <path d="M52 74 L48 88 H72 L68 74" className="cofre__pe" />
      <path d="M40 90 H80" className="cofre__pe" />
      <circle cx="60" cy="4" r="2" className="cofre__camera" />
      <g clipPath={`url(#${id}-tela)`}>
        {/* Silhueta do rosto que a câmera lê. */}
        <circle cx="60" cy="34" r="11" className="cofre__rosto" />
        <path d="M38 70 Q40 50 60 50 Q80 50 82 70" className="cofre__rosto" />
        <rect x="10" y="8" width="100" height="2" className="cofre__leitura" />
        <g className="cofre__orbita">
          <circle cx="60" cy="16" r="2.2" className="cofre__dado" />
          <circle cx="82" cy="46" r="2.2" className="cofre__dado" />
          <circle cx="38" cy="46" r="2.2" className="cofre__dado" />
        </g>
      </g>
      <g className="cofre__selo">
        <circle cx="98" cy="68" r="15" className="cofre__selo-fundo" />
        <path d="M92.5 67 V63 a5.5 5.5 0 0 1 11 0 V67" className="cofre__alca" />
        <rect x="90" y="66" width="16" height="12" rx="3" className="cofre__corpo" />
      </g>
    </Palco>
  )
}

/** Tela de 16:9 do desenho (a da bancada de referência), em unidades do viewBox. */
const TELA = { x: 10, y: 10, largura: 300, altura: 169 }

/**
 * Os 13 alvos da calibração, na posição em que o app os mostra numa tela
 * 16:9 (components/produto/calibracao.ts): a grade de 3 × 3 dentro do
 * orçamento de ângulo e os quatro cantos da tela a 5 % da borda. Até
 * 20/10/2026 o desenho trazia a grade do Modo Computador (3 × 3 na borda e
 * quatro alvos nas diagonais), que não é a da primeira tela do paciente.
 */
export function posicoesDaCalibracao(): { x: number; y: number }[] {
  return PONTOS_DA_CALIBRACAO.map((p) => ({ x: p.x, y: p.y }))
}

/**
 * A tela da calibração: os 13 alvos. Na chamada final (rodada 3, 21/10/2026,
 * pedido do dono: animações ligadas ao conteúdo) um anel de fixação percorre
 * os 13 pontos NA ORDEM DO APP, devagar: chega, enche como o dwell, e o ponto
 * fica marcado quando ele passa ao próximo; depois dos 13, recomeça. Só enquanto
 * a figura está na tela e a aba visível (useTique; o enchimento em CSS pausa
 * com `.ilustracao`). As contas do percurso: percursoDaChamada.ts.
 *
 * Com movimento reduzido, o desenho de sempre, parado: o alvo do centro aceso —
 * o aro fechado de quem fixou o olhar ali.
 */
export function AlvosDeCalibracao() {
  const reduzido = useReducedMotion()
  return (
    <Palco className={`ilustracao--alvos${reduzido ? '' : ' is-animada'}`} viewBox="0 0 320 189" largura={320} altura={189}>
      {(naTela) => <PontosDaCalibracao naTela={naTela} animar={!reduzido} />}
    </Palco>
  )
}

function PontosDaCalibracao({ naTela, animar }: { naTela: boolean; animar: boolean }) {
  const alvos = posicoesDaCalibracao()
  const [passo, setPasso] = useState(0)
  useTique(animar && naTela, PASSO_DO_PERCURSO_MS, () => setPasso(proximoPasso))

  const feitos = animar ? pontosFeitos(passo) : []
  const sob = animar ? pontoDoPasso(passo) : null
  const centroFixo = !animar
  const pos = (i: number) => ({ cx: TELA.x + alvos[i].x * TELA.largura, cy: TELA.y + alvos[i].y * TELA.altura })

  return (
    <>
      <rect
        x={TELA.x}
        y={TELA.y}
        width={TELA.largura}
        height={TELA.altura}
        rx="14"
        className="alvos__tela"
      />
      {alvos.map((a, i) => {
        const { cx, cy } = pos(i)
        const centro = centroFixo && a.x === 0.5 && a.y === 0.5
        return (
          <g key={i} className={`alvos__alvo${centro ? ' alvos__alvo--fixado' : ''}${feitos.includes(i) ? ' alvos__alvo--feito' : ''}`}>
            <circle cx={cx} cy={cy} r={centro ? 11 : 7} className="alvos__aro" />
            <circle cx={cx} cy={cy} r={centro ? 3.4 : 2.2} className="alvos__ponto" />
          </g>
        )
      })}
      {animar && (
        // O anel viaja (transform, com transição) e enche (stroke-dashoffset, reiniciado a cada passo pela chave).
        <g
          className={`alvos__anel${sob === null ? ' is-completo' : ''}`}
          data-ponto={sob ?? undefined}
          style={
            {
              transform: `translate(${pos(sob ?? 4).cx}px, ${pos(sob ?? 4).cy}px)`,
              '--fixacao': `${FIXACAO_NO_PERCURSO_MS}ms`,
            } as CSSProperties
          }
        >
          <circle key={passo} className="alvos__anel-aro" r="11" pathLength={1} />
        </g>
      )}
    </>
  )
}

import { useId, type ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'
import './ilustracoes.css'

/**
 * Ilustrações animadas em SVG embutido, no espírito dos exemplos do SVGator:
 * poucos traços, movimento contínuo e discreto, e sempre ligado ao que a seção
 * diz — o olho que procura e pisca, o computador que guarda os dados, o olhar
 * que vira voz.
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
  children: ReactNode
  largura: number
  altura: number
  viewBox: string
}) {
  // `once: false`: a ilustração para de animar quando sai da tela.
  const { ref, inView } = useInView<HTMLSpanElement>({ once: false, threshold: 0.2, rootMargin: '0px' })
  return (
    <span ref={ref} className={`ilustracao ${className}${inView ? ' is-rodando' : ''}`} aria-hidden="true">
      <svg viewBox={viewBox} width={largura} height={altura} focusable="false">
        {children}
      </svg>
    </span>
  )
}

/** O contorno de amêndoa do olho, compartilhado pelas ilustrações. */
const CONTORNO_DO_OLHO = 'M4 28 Q48 -8 92 28 Q48 64 4 28 Z'

/**
 * Um olho que procura em volta e pisca, desenhado em 96 × 56. A piscada
 * achata o olho inteiro na linha do meio (`scaleY`), em vez de desenhar uma
 * pálpebra: assim ele funciona sobre qualquer fundo.
 */
function Olho({ id, olhar = true }: { id: string; olhar?: boolean }) {
  return (
    <g className="olho__pisca">
      <defs>
        <clipPath id={`${id}-recorte`}>
          <path d={CONTORNO_DO_OLHO} />
        </clipPath>
        <radialGradient id={`${id}-iris`} cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#3fd6c2" />
          <stop offset="100%" stopColor="#2f66c2" />
        </radialGradient>
      </defs>
      <path d={CONTORNO_DO_OLHO} className="olho__branco" />
      <g clipPath={`url(#${id}-recorte)`}>
        <g className={olhar ? 'olho__iris olho__iris--procura' : 'olho__iris'}>
          <circle cx="48" cy="28" r="13" fill={`url(#${id}-iris)`} />
          <circle cx="48" cy="28" r="5.5" className="olho__pupila" />
          <circle cx="52.5" cy="23.5" r="2.2" className="olho__brilho" />
        </g>
      </g>
      <path d={CONTORNO_DO_OLHO} className="olho__contorno" />
    </g>
  )
}

/** Capítulos da home: "Feito para ser usado só com os olhos." */
export function OlhoQuePisca() {
  const id = useIdDeSvg('olho')
  return (
    <Palco className="ilustracao--olho" viewBox="0 0 96 56" largura={72} altura={42}>
      <Olho id={id} />
    </Palco>
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

/** Chamada final: "Só falta a voz." — o olho e as ondas de som que saem dele. */
export function OlharQueFala() {
  const id = useIdDeSvg('fala')
  return (
    <Palco className="ilustracao--fala" viewBox="0 0 150 56" largura={150} altura={56}>
      <Olho id={id} olhar={false} />
      <g className="fala__ondas">
        <path d="M104 18 Q110 28 104 38" className="fala__onda fala__onda--1" />
        <path d="M114 11 Q124 28 114 45" className="fala__onda fala__onda--2" />
        <path d="M124 4 Q138 28 124 52" className="fala__onda fala__onda--3" />
      </g>
    </Palco>
  )
}

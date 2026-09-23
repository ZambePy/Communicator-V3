import { useEffect, useState, type CSSProperties } from 'react'
import { useInView } from '@/hooks/useInView'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import './gaze-story.css'

/* ============================================================
   Ilustração animada do hero: um pictograma de cadeirante, de frente
   para o monitor, usa o IrisFlow com o olhar. Na tela está uma captura
   real da tela inicial do app (o menu do paciente); o feixe de olhar
   leva o cursor até um botão de verdade, o anel de fixação enche e o
   botão acende, como no app quando a fixação se completa. Olhar de
   passagem não aciona nada: o anel começa e volta a zero.

   Três camadas no mesmo viewBox: a cena (SVG), a captura sobre a tela
   do monitor (<img> com srcset, para o navegador escolher a resolução)
   e o olhar (SVG com o realce do botão, o feixe e o cursor).

   Pictograma original, desenhado aqui, sem rosto, como os de
   sinalização. Com movimento reduzido fica o estado final, parado:
   cursor no botão "Comunicação", anel cheio e botão aceso.
   ============================================================ */

/** viewBox comum às três camadas. */
const VB_W = 600
const VB_H = 350

/** Tela do monitor na cena: 16:9, a proporção da captura. */
const TELA = { x: 176, y: 20, w: 400, h: 225 }
const RAIO_DA_TELA = 3

/** Moldura do monitor, 7 unidades em volta da tela. */
const MONITOR = { x: TELA.x - 7, y: TELA.y - 7, w: TELA.w + 14, h: TELA.h + 14 }
const CENTRO_DO_MONITOR = TELA.x + TELA.w / 2

/** Tampo da mesa e chão da cena. */
const TAMPO = 276
const CHAO = 336

/** Onde o pictograma fica na cena (as coordenadas dele são locais). */
const PICTO = { x: -10, y: 115, escala: 0.9 }

/** Cabeça do pictograma já na cena: é dela que sai o feixe. */
const CABECA = {
  x: PICTO.x + 100 * PICTO.escala,
  y: PICTO.y + 30 * PICTO.escala,
  r: 24 * PICTO.escala,
}

/* Botões da tela inicial em fração da captura (x, y, largura, altura),
   medidos em 1600 × 900 por scripts/capturar-tela-do-app.mjs. Se o layout
   do app mudar, rode o script de novo: ele refaz as imagens de
   public/produto/ e imprime estes números. */
const BOTOES = {
  comunicacao: { x: 0.063, y: 0.2078, w: 0.2797, h: 0.2333 },
  teclado: { x: 0.3602, y: 0.2078, w: 0.2797, h: 0.2333 },
  computador: { x: 0.6573, y: 0.2078, w: 0.2797, h: 0.2333 },
  lazer: { x: 0.3602, y: 0.4722, w: 0.2797, h: 0.2333 },
  conversa: { x: 0.6573, y: 0.4722, w: 0.2797, h: 0.2333 },
}

type IdDoBotao = keyof typeof BOTOES

/** O ícone redondo fica a 36% da altura do botão: o cursor mira nele e o
    anel o contorna sem cobrir o nome. */
const ICONE_Y = 0.36

/** Canto do botão na captura: 24 px em 1600, levado à escala da tela. */
const RAIO_DO_BOTAO = (24 / 1600) * TELA.w

/** Anel de fixação em volta do cursor (raio e perímetro). */
const ANEL_R = 9.5
const ANEL_C = 2 * Math.PI * ANEL_R

/* Roteiro em laço: passa por um botão sem acionar, depois escolhe. */
const ROTEIRO: { botao: IdDoBotao; aciona: boolean }[] = [
  { botao: 'teclado', aciona: false },
  { botao: 'comunicacao', aciona: true },
  { botao: 'conversa', aciona: false },
  { botao: 'lazer', aciona: true },
  { botao: 'computador', aciona: true },
]

/** O passo que fica parado com movimento reduzido (e na primeira pintura). */
const PASSO_FINAL = 1

type Fase = 'vai' | 'passa' | 'fixa' | 'aciona'

/* "vai" e "fixa" casam com o CSS: a transição do feixe e do cursor
   (600 ms) e o anel que enche (gs-fixa, 1300 ms). */
const DURACAO: Record<Fase, number> = {
  vai: 600,
  passa: 700,
  fixa: 1300,
  aciona: 1600,
}

function proximo(passo: number, fase: Fase): [number, Fase] {
  if (fase === 'vai') return [passo, ROTEIRO[passo].aciona ? 'fixa' : 'passa']
  if (fase === 'fixa') return [passo, 'aciona']
  return [(passo + 1) % ROTEIRO.length, 'vai']
}

/** Caixa do botão, alvo do cursor e feixe da cabeça até ele, na cena. */
function mirar(id: IdDoBotao) {
  const b = BOTOES[id]
  const caixa = {
    x: TELA.x + b.x * TELA.w,
    y: TELA.y + b.y * TELA.h,
    w: b.w * TELA.w,
    h: b.h * TELA.h,
  }
  const alvo = { x: caixa.x + caixa.w / 2, y: caixa.y + caixa.h * ICONE_Y }
  const dx = alvo.x - CABECA.x
  const dy = alvo.y - CABECA.y
  const dist = Math.hypot(dx, dy)
  // o feixe nasce na borda da cabeça e termina na borda do anel, sem
  // tingir o ícone do botão
  const saida = CABECA.r + 3
  return {
    caixa,
    origem: { x: CABECA.x + (dx / dist) * saida, y: CABECA.y + (dy / dist) * saida },
    angulo: (Math.atan2(dy, dx) * 180) / Math.PI,
    /** Da origem ao cursor. */
    alcance: dist - saida,
  }
}

/* Feixe e cursor usam a mesma sequência de transformações (origem, ângulo,
   distância): na transição o navegador interpola cada uma, e o cursor
   percorre o mesmo arco da ponta do feixe, sem se descolar dela. */
function transformarFeixe(m: ReturnType<typeof mirar>) {
  const comprimento = m.alcance - ANEL_R - 1
  return `translate(${m.origem.x}px, ${m.origem.y}px) rotate(${m.angulo}deg) scaleX(${comprimento / 100})`
}

function transformarCursor(m: ReturnType<typeof mirar>) {
  // o último giro desfaz o ângulo: o anel continua começando às 12 h
  return `translate(${m.origem.x}px, ${m.origem.y}px) rotate(${m.angulo}deg) translateX(${m.alcance}px) rotate(${-m.angulo}deg)`
}

/** A captura cobre exatamente a tela desenhada no SVG. */
const ESTILO_DA_TELA: CSSProperties = {
  left: `${(TELA.x / VB_W) * 100}%`,
  top: `${(TELA.y / VB_H) * 100}%`,
  width: `${(TELA.w / VB_W) * 100}%`,
  height: `${(TELA.h / VB_H) * 100}%`,
  borderRadius: `${(RAIO_DA_TELA / TELA.w) * 100}% / ${(RAIO_DA_TELA / TELA.h) * 100}%`,
}

/* Largura em que a captura aparece, para o srcset: 2/3 da ilustração,
   que tem até 600 px (no hero em duas colunas, até ~570 px). */
const TAMANHOS = '(min-width: 1024px) 380px, (min-width: 648px) 400px, calc(66.7vw - 32px)'

const DESCRICAO =
  'Ilustração: pessoa em cadeira de rodas usando o IrisFlow com o olhar, com a tela inicial do app no ' +
  'monitor. O olhar para por um instante num botão do menu, o anel de fixação se completa e o botão acende.'

/* Pictograma de cadeirante virado para a tela (à direita), em
   coordenadas locais. Formas cheias de cantos redondos, peças separadas
   por um respiro: cabeça, tronco com coxa, antebraço, perna com pé,
   barra de empurrar e a roda em "C", aberta em cima, na frente. */
function Pictograma() {
  return (
    <g className="gs-picto" transform={`translate(${PICTO.x} ${PICTO.y}) scale(${PICTO.escala})`}>
      <circle cx="100" cy="30" r="24" />
      {/* tronco e coxa numa peça só, para a dobra do quadril ficar lisa */}
      <path d="M80 79a17 17 0 0 1 17-17h4a17 17 0 0 1 17 17v55q0 6 6 6h45a15 15 0 0 1 0 30H94a14 14 0 0 1-14-14Z" />
      <rect x="100" y="108" width="70" height="18" rx="9" />
      <rect x="36" y="72" width="32" height="14" rx="7" />
      <path className="gs-picto__traco" d="M174 157 202 232" strokeWidth="26" />
      <path className="gs-picto__traco" d="M204 239h22" strokeWidth="12" />
      <path className="gs-picto__traco" d="M156.2 204.2A62 62 0 1 1 64.4 127.2" strokeWidth="16" />
    </g>
  )
}

export function GazeStory({ className = '' }: { className?: string }) {
  const reduced = useReducedMotion()
  // Só anima enquanto está na tela: fora dela, nenhum timer roda.
  const { ref, inView } = useInView<HTMLDivElement>({ once: false, threshold: 0.05, rootMargin: '0px' })
  const [passo, setPasso] = useState(PASSO_FINAL)
  const [fase, setFase] = useState<Fase>('aciona')

  useEffect(() => {
    if (reduced || !inView) return
    const t = window.setTimeout(() => {
      const [p, f] = proximo(passo, fase)
      setPasso(p)
      setFase(f)
    }, DURACAO[fase])
    return () => window.clearTimeout(t)
  }, [passo, fase, reduced, inView])

  const p = reduced ? PASSO_FINAL : passo
  const f: Fase = reduced ? 'aciona' : fase
  const m = mirar(ROTEIRO[p].botao)

  return (
    <div
      ref={ref}
      role="img"
      aria-label={DESCRICAO}
      className={`gaze-story is-${f}${reduced ? ' is-static' : ''} ${className}`}
    >
      {/* ---------- cena: fundo, mesa, monitor e pictograma ---------- */}
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="gaze-story__cena" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="gs-brilho" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2f66c2" stopOpacity="0.4" />
            <stop offset="70%" stopColor="#2f66c2" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#2f66c2" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="300" cy="172" rx="300" ry="185" fill="url(#gs-brilho)" />
        <ellipse cx="300" cy={CHAO + 3} rx="285" ry="9" fill="#02070f" opacity="0.5" />

        {/* mesa de pé central */}
        <rect x={CENTRO_DO_MONITOR - 125} y={TAMPO} width="250" height="8" rx="4" fill="#34507e" />
        <rect x={CENTRO_DO_MONITOR - 5} y={TAMPO + 8} width="10" height={CHAO - TAMPO - 9} fill="#2a426b" />
        <ellipse cx={CENTRO_DO_MONITOR} cy={CHAO} rx="40" ry="6" fill="#2a426b" />

        {/* monitor: pé, moldura, tela e a webcam comum presa em cima */}
        <rect
          x={CENTRO_DO_MONITOR - 8}
          y={MONITOR.y + MONITOR.h - 2}
          width="16"
          height={TAMPO - MONITOR.y - MONITOR.h + 2}
          fill="#2a426b"
        />
        <rect x={CENTRO_DO_MONITOR - 30} y={TAMPO - 5} width="60" height="6" rx="3" fill="#44669c" />
        <rect
          x={MONITOR.x}
          y={MONITOR.y}
          width={MONITOR.w}
          height={MONITOR.h}
          rx="10"
          fill="#081325"
          stroke="#c9d6ea"
          strokeWidth="2"
        />
        <rect
          className="gs-tela"
          x={TELA.x}
          y={TELA.y}
          width={TELA.w}
          height={TELA.h}
          rx={RAIO_DA_TELA}
          fill="#0c1a33"
        />
        <rect
          x={CENTRO_DO_MONITOR - 12}
          y={MONITOR.y - 8}
          width="24"
          height="9"
          rx="4.5"
          fill="#15243d"
          stroke="#c9d6ea"
          strokeWidth="1.2"
        />
        <circle cx={CENTRO_DO_MONITOR} cy={MONITOR.y - 3.5} r="2.1" fill="#04101f" />
        <circle className="gs-cam" cx={CENTRO_DO_MONITOR + 7} cy={MONITOR.y - 3.5} r="1.1" fill="#3fd6c2" />

        <Pictograma />
      </svg>

      {/* ---------- a tela inicial de verdade ---------- */}
      <img
        className="gaze-story__tela"
        src="/produto/tela-inicial-800.webp"
        srcSet="/produto/tela-inicial-800.webp 800w, /produto/tela-inicial-1600.webp 1600w"
        sizes={TAMANHOS}
        width={1600}
        height={900}
        alt=""
        decoding="async"
        style={ESTILO_DA_TELA}
      />

      {/* ---------- olhar: realce do botão, feixe e cursor ---------- */}
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="gaze-story__olhar" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="gs-feixe" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#3fd6c2" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#3fd6c2" stopOpacity="0.18" />
          </linearGradient>
        </defs>

        {f !== 'vai' && (
          <g className="gs-alvo" key={`alvo-${p}`}>
            <rect
              className="gs-alvo__brilho"
              x={m.caixa.x}
              y={m.caixa.y}
              width={m.caixa.w}
              height={m.caixa.h}
              rx={RAIO_DO_BOTAO}
            />
            <rect
              className="gs-alvo__fundo"
              x={m.caixa.x}
              y={m.caixa.y}
              width={m.caixa.w}
              height={m.caixa.h}
              rx={RAIO_DO_BOTAO}
            />
          </g>
        )}

        <g className="gs-feixe" style={{ transform: transformarFeixe(m) }}>
          <polygon points="0,-1.2 100,-8 100,8 0,1.2" fill="url(#gs-feixe)" />
        </g>

        <g className="gs-cursor" style={{ transform: transformarCursor(m) }}>
          <circle r={ANEL_R} className="gs-cursor__trilho" />
          <circle
            r={ANEL_R}
            key={`${p}-${f}`}
            className="gs-cursor__anel"
            strokeDasharray={ANEL_C}
            strokeDashoffset={f === 'aciona' ? 0 : ANEL_C}
            transform="rotate(-90)"
          />
          {f === 'aciona' && !reduced && <circle r={ANEL_R} className="gs-cursor__onda" key={`onda-${p}`} />}
          <circle r="1.8" className="gs-cursor__ponto" />
        </g>
      </svg>
    </div>
  )
}

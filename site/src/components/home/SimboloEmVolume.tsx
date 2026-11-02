import { useEffect, useRef, type CSSProperties } from 'react'
import './simbolo-em-volume.css'

/* As quatro lâminas e a pupila do símbolo, copiadas de /brand/irisflow-simbolo-negativo.svg
   (exportado do REDUZIDO.ai). O desenho é o oficial: nada aqui muda a forma. */
const LAMINAS = [
  'M 68.496 101.066 L 74.339 103.175 C 82.496 104.511 90.597 104.320 98.199 100.882 C 116.265 92.707 127.636 76.867 128.632 57.425 C 139.214 80.062 132.238 105.023 113.410 120.300 C 95.996 123.722 77.937 116.941 68.496 101.066',
  'M 102.25 91.375 L 104.328 85.519 C 105.613 77.355 105.382 69.253 101.902 61.671 C 93.625 43.652 77.718 32.371 58.273 31.484 C 80.847 20.773 105.847 27.609 121.230 46.351 C 124.753 63.75 118.070 81.843 102.25 91.375',
  'M 59.730 67.773 L 57.535 73.582 C 56.082 81.722 56.148 89.824 59.476 97.476 C 67.386 115.660 83.058 127.261 102.480 128.539 C 79.695 138.792 54.839 131.449 39.839 112.398 C 36.671 94.937 43.718 76.980 59.730 67.773',
  'M 92.550 57.187 L 86.699 55.105 C 78.535 53.800 70.433 54.019 62.847 57.488 C 44.812 65.738 33.507 81.625 32.589 101.066 C 21.914 78.472 28.792 53.488 47.562 38.132 C 64.960 34.640 83.046 41.351 92.550 57.187',
]
/**
 * De onde cada lâmina chega na montagem: a direção dela a partir do centro
 * (em fração do tamanho do símbolo) e quanto ela gira até se encaixar. As
 * quatro vêm de quatro lados, como as peças que se juntam.
 */
const CHEGADA: { x: number; y: number; giro: number }[] = [
  { x: 0.42, y: 0.36, giro: 48 },
  { x: 0.4, y: -0.42, giro: -40 },
  { x: -0.38, y: 0.44, giro: -52 },
  { x: -0.44, y: -0.36, giro: 44 },
]
const PUPILA =
  'M 97.664 72.660 C 102.003 83.851 94.531 96.496 82.675 98.003 C 76.667 98.765 71.347 96.339 67.5 92.742 C 63.277 88.785 61.917 83.308 62.402 77.316 C 63.277 66.402 73.515 58.5 84.246 61.507 C 80.976 65.957 80.710 71.339 84.328 74.328 C 88.226 77.542 93.109 77.660 97.664 72.660'
const CAIXA = '24 22 113 116'

/** Quantas cópias formam a espessura das lâminas e da pupila (cada uma, um passo para trás). */
const CAMADAS = 16
const CAMADAS_PUPILA = 8

/** Mistura duas cores #rrggbb (t = 0 dá a primeira). As laterais escurecem para trás. */
function mistura(a: string, b: string, t: number): string {
  const ca = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const cb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return `rgb(${ca.map((v, i) => Math.round(v + (cb[i] - v) * t)).join(', ')})`
}
/** A face no azul da marca; a lateral do azul 700 até um marinho fundo. */
const COR_FACE = '#1b54a8'
const COR_LATERAL = ['#17458a', '#0b2147'] as const
const COR_PUPILA = '#f3f6fb'
const COR_PUPILA_LATERAL = ['#b7c6de', '#7d93b8'] as const

type Props = {
  className?: string
  /**
   * Quando as peças se montam. `carga` (abertura): uma vez, quando a página
   * abre. `rolagem` (fecho): presa à rolagem, enquanto a faixa entra na tela.
   */
  montagem?: 'carga' | 'rolagem'
}

/**
 * O símbolo da IrisFlow em volume (redesenho de 01/11/2026). Referências: a
 * marca como objeto sólido das homes bem avaliadas da biblioteca da taste, e
 * o Nike Reactor (o objeto que se monta peça por peça na frente de quem vê).
 *
 * O desenho oficial, empilhado em camadas que formam a espessura: a face no
 * azul da marca, as laterais num azul mais fundo, a pupila no papel. Cada
 * lâmina é uma peça: elas chegam de quatro lados, girando, e se encaixam; a
 * pupila cai no centro; o aro de fixação fecha em 1,5 s. Depois ele flutua
 * devagar e, com mouse, se inclina um pouco para o ponteiro.
 *
 * Decorativo: o nome da marca está no cabeçalho e no título. Com movimento
 * reduzido, já está montado e parado, num ângulo que mostra o volume. O botão
 * de pausa do fundo também para a flutuação.
 */
export function SimboloEmVolume({ className = '', montagem = 'carga' }: Props) {
  const mira = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = mira.current
    if (!el || typeof window.matchMedia !== 'function') return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let alvoX = 0
    let alvoY = 0
    let x = 0
    let y = 0
    let quadro = 0
    const passo = () => {
      x += (alvoX - x) * 0.06
      y += (alvoY - y) * 0.06
      el.style.transform = `rotateY(${(x * 14).toFixed(2)}deg) rotateX(${(-y * 10).toFixed(2)}deg)`
      quadro = Math.abs(alvoX - x) + Math.abs(alvoY - y) > 0.001 ? requestAnimationFrame(passo) : 0
    }
    const mover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      const r = el.getBoundingClientRect()
      alvoX = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth * 0.5)))
      alvoY = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight * 0.5)))
      if (!quadro) quadro = requestAnimationFrame(passo)
    }
    window.addEventListener('pointermove', mover, { passive: true })
    return () => {
      cancelAnimationFrame(quadro)
      window.removeEventListener('pointermove', mover)
    }
  }, [])

  return (
    <div className={`simbolo3d simbolo3d--${montagem} ${className}`} aria-hidden="true">
      <div ref={mira} className="simbolo3d__mira">
        <div className="simbolo3d__corpo">
          <svg className="simbolo3d__aro" viewBox={CAIXA} focusable="false">
            <circle className="simbolo3d__aro-trilho" cx="80.57" cy="79.79" r="56" pathLength={1} />
            <circle className="simbolo3d__aro-traco" cx="80.57" cy="79.79" r="56" pathLength={1} />
          </svg>
          {LAMINAS.map((d, b) => (
            <div
              key={d}
              className="simbolo3d__peca"
              style={
                {
                  '--b': b,
                  '--de-x': `${CHEGADA[b].x * 100}%`,
                  '--de-y': `${CHEGADA[b].y * 100}%`,
                  '--giro': `${CHEGADA[b].giro}deg`,
                } as CSSProperties
              }
            >
              {/* Do fundo para a face: se o 3D achatar (durante a montagem), a face fica por cima. */}
              {Array.from({ length: CAMADAS }, (_, i) => CAMADAS - 1 - i).map((k) => (
                <svg
                  key={k}
                  className="simbolo3d__camada"
                  viewBox={CAIXA}
                  focusable="false"
                  style={{ '--k': k, fill: k === 0 ? COR_FACE : mistura(COR_LATERAL[0], COR_LATERAL[1], k / (CAMADAS - 1)) } as CSSProperties}
                >
                  <path d={d} />
                </svg>
              ))}
              {/* O fio de luz na borda da face: o brilho do material, parado (não segue o ponteiro). */}
              <svg className="simbolo3d__brilho" viewBox={CAIXA} focusable="false">
                <path d={d} />
              </svg>
            </div>
          ))}
          <div className="simbolo3d__peca simbolo3d__peca--pupila">
            {Array.from({ length: CAMADAS_PUPILA }, (_, i) => CAMADAS_PUPILA - 1 - i).map((k) => (
              <svg
                key={k}
                className="simbolo3d__pupila"
                viewBox={CAIXA}
                focusable="false"
                style={{ '--k': k, fill: k === 0 ? COR_PUPILA : mistura(COR_PUPILA_LATERAL[0], COR_PUPILA_LATERAL[1], k / (CAMADAS_PUPILA - 1)) } as CSSProperties}
              >
                <path d={PUPILA} />
              </svg>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

import { useMemo } from 'react'
import './ambient.css'

type Props = {
  /** Densidade de partículas. */
  particles?: number
  /** Mostra a linha de varredura vertical, alusão à leitura da webcam. */
  scan?: boolean
  /** Em fundo claro o efeito entra bem mais discreto, para não competir
   *  com o texto. O contraste do corpo é requisito, não preferência. */
  light?: boolean
}

/**
 * Movimento ambiente de fundo: gradientes líquidos em morphing,
 * partículas à deriva e uma linha de varredura sutil. É puramente
 * decorativo, e por isso sai marcado como aria-hidden.
 */
export function AmbientBackground({ particles = 26, scan = true, light = false }: Props) {
  const dots = useMemo(
    () =>
      Array.from({ length: particles }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 1.5 + Math.random() * 3.5,
        dx: `${(Math.random() - 0.5) * 120}px`,
        dy: `${-80 - Math.random() * 220}px`,
        duration: 14 + Math.random() * 20,
        delay: -Math.random() * 30,
        opacity: 0.18 + Math.random() * 0.42,
        teal: Math.random() > 0.65,
      })),
    [particles],
  )

  return (
    <div className={`ambient${light ? ' ambient--light' : ''}`} aria-hidden="true">
      <div className="ambient__mesh" />
      <span className="ambient__blob ambient__blob--a anim-blob" />
      <span className="ambient__blob ambient__blob--b anim-blob" />
      <span className="ambient__blob ambient__blob--c anim-blob" />
      <div className="ambient__grid" />
      {scan && !light && <span className="ambient__scan" />}
      <div className="ambient__particles">
        {dots.map((d) => (
          <span
            key={d.id}
            className={`ambient__dot${d.teal ? ' ambient__dot--teal' : ''}`}
            style={
              {
                left: `${d.left}%`,
                top: `${d.top}%`,
                width: d.size,
                height: d.size,
                '--p-dx': d.dx,
                '--p-dy': d.dy,
                '--p-opacity': d.opacity,
                animationDuration: `${d.duration}s`,
                animationDelay: `${d.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  )
}

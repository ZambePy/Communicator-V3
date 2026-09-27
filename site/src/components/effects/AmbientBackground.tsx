import { useMemo, type CSSProperties } from 'react'
import { useLowPower } from '@/hooks/useReducedMotion'
import './ambient.css'

type Props = {
  /** `destaque` nas aberturas e chamadas; `suave` nas páginas de fluxo
   *  (beta, conta, acesso), onde o efeito entra bem mais discreto para não
   *  competir com formulário; `particulas` nas faixas de conteúdo: só as
   *  partículas, sem luz nem grade (e quase sem custo). */
  variante?: 'destaque' | 'suave' | 'particulas'
  /** Quantas partículas à deriva (padrão: 14 no destaque, 10 nos outros). */
  particulas?: number
  /** Linha de varredura vertical — alusão à leitura contínua da webcam. */
  varredura?: boolean
}

/**
 * Movimento ambiente de fundo: um gradiente que se desloca, manchas de luz
 * que mudam de forma devagar, uma grade tênue, partículas à deriva e, na
 * abertura, a linha de varredura. É puramente decorativo (aria-hidden).
 *
 * Custo: cada mancha com blur de 72 px é uma camada cara de compor. Em
 * máquinas modestas (≤ 4 núcleos) e telas estreitas o componente entra em
 * modo leve: metade das partículas, uma mancha parada e sem varredura. Com
 * movimento reduzido fica só o gradiente parado (ver ambient.css).
 */
export function AmbientBackground({ variante = 'destaque', particulas, varredura = false }: Props) {
  const leve = useLowPower()
  const suave = variante === 'suave'
  const soParticulas = variante === 'particulas'
  const pedidas = particulas ?? (variante === 'destaque' ? 14 : 10)
  const quantas = leve ? Math.ceil(pedidas / 2) : pedidas

  const pontos = useMemo(
    () =>
      Array.from({ length: quantas }, (_, i) => ({
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
    [quantas],
  )

  return (
    <div className={`ambient ambient--${variante}${leve ? ' ambient--leve' : ''}`} aria-hidden="true">
      {!soParticulas && (
        <>
          <div className="ambient__mesh" />
          <span className="ambient__blob ambient__blob--a anim-blob" />
          {!leve && <span className="ambient__blob ambient__blob--b anim-blob" />}
          <div className="ambient__grid" />
        </>
      )}
      {varredura && !suave && !soParticulas && !leve && <span className="ambient__scan" />}
      {pontos.length > 0 && (
        <div className="ambient__particles">
          {pontos.map((d) => (
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
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

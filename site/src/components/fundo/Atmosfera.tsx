import { useEffect, useRef, type CSSProperties } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import './atmosfera.css'

export type VarianteDaAtmosfera = 'abertura' | 'topo' | 'calmo' | 'chamada'

type Particula = { x: number; y: number; tamanho: number; duracao: number; atraso: number; deriva: number }

const QUANTAS: Record<VarianteDaAtmosfera, number> = { abertura: 26, topo: 14, calmo: 0, chamada: 18 }

/** Gerador pseudoaleatório com semente: as partículas nascem sempre nos mesmos lugares. */
function sementeira(semente: number) {
  let s = semente >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function particulas(n: number, semente = 7): Particula[] {
  const sorteio = sementeira(semente)
  return Array.from({ length: n }, () => ({
    x: +(sorteio() * 100).toFixed(2),
    y: +(15 + sorteio() * 80).toFixed(2),
    tamanho: +(1.5 + sorteio() * 2.5).toFixed(2),
    duracao: Math.round(9 + sorteio() * 12),
    atraso: -Math.round(sorteio() * 20),
    deriva: Math.round(30 + sorteio() * 70),
  }))
}

/**
 * Fundo vivo das aberturas e da chamada final: manchas de cor da marca que
 * derivam devagar, uma faixa de aurora, partículas que sobem sozinhas e um
 * grão fino por cima. Nada segue o mouse.
 *
 * Só `transform` e `opacity` animam. Fora da tela, tudo pausa; com movimento
 * reduzido, fica a imagem parada, sem partículas.
 */
export function Atmosfera({ variante = 'topo', className = '' }: { variante?: VarianteDaAtmosfera; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduzido = useReducedMotion()
  const lista = reduzido ? [] : particulas(QUANTAS[variante], variante.length * 11)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entradas) => {
        el.dataset.pausado = entradas[entradas.length - 1].isIntersecting ? 'nao' : 'sim'
      },
      { rootMargin: '80px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const comAurora = variante === 'abertura' || variante === 'chamada'

  return (
    <div ref={ref} className={`atmosfera atmosfera--${variante} ${className}`.trim()} aria-hidden="true">
      <div className="atmosfera__malha">
        <span className="atmosfera__mancha atmosfera__mancha--1" />
        <span className="atmosfera__mancha atmosfera__mancha--2" />
        <span className="atmosfera__mancha atmosfera__mancha--3" />
        {variante !== 'calmo' && <span className="atmosfera__mancha atmosfera__mancha--4" />}
      </div>
      {comAurora && <div className="atmosfera__aurora" />}
      {lista.length > 0 && (
        <div className="atmosfera__particulas">
          {lista.map((p, i) => (
            <span
              key={i}
              style={
                {
                  '--x': `${p.x}%`,
                  '--y': `${p.y}%`,
                  '--t': `${p.tamanho}px`,
                  '--d': `${p.duracao}s`,
                  '--a': `${p.atraso}s`,
                  '--sobe': `-${p.deriva}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="atmosfera__grao" />
    </div>
  )
}

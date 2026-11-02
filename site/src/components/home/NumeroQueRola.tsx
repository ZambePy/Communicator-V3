import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

/**
 * Um número em que cada algarismo rola de 0 até o valor, uma vez, quando chega
 * à tela, as colunas um instante uma depois da outra (redesenho de
 * 01/11/2026, quadro "Medido"). O que não é algarismo (vírgula, °, %, "px")
 * fica parado. O leitor de tela lê o número inteiro, de uma vez; com movimento
 * reduzido, ou sem IntersectionObserver, o número já está no valor.
 */
export function NumeroQueRola({ valor, className = '' }: { valor: string; className?: string }) {
  const reduzido = useReducedMotion()
  const ref = useRef<HTMLSpanElement>(null)
  const animar = !reduzido && typeof IntersectionObserver !== 'undefined'
  const [chegou, setChegou] = useState(!animar)

  useEffect(() => {
    if (!animar || !ref.current) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setChegou(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    io.observe(ref.current)
    return () => io.disconnect()
  }, [animar])

  let coluna = 0
  return (
    <span ref={ref} className={`rola${chegou ? ' is-chegou' : ''} ${className}`}>
      <span className="sr-only">{valor}</span>
      <span className="rola__digitos" aria-hidden="true">
        {Array.from(valor).map((c, i) =>
          /\d/.test(c) ? (
            <span key={i} className="rola__coluna">
              {/* Os dez algarismos da fita vêm do CSS (::before): são desenho, não texto da página. */}
              <span className="rola__fita" style={{ '--d': c, '--i': coluna++ } as CSSProperties} />
            </span>
          ) : (
            <span key={i}>{c}</span>
          ),
        )}
      </span>
    </span>
  )
}

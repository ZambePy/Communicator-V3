import { useEffect, useRef, useState } from 'react'
import { Reveal } from '@/components/effects/Reveal'
import { COMPARISON } from '@/data/content'
import './comparison.css'

/**
 * Sombras nas bordas da tabela indicando que há mais colunas à direita
 * (ou à esquerda). Sem elas, no celular a terceira coluna some sem aviso.
 */
function useScrollShadows() {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState({ left: false, right: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const left = el.scrollLeft > 4
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
      setState((s) => (s.left === left && s.right === right ? s : { left, right }))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(el)
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return { ref, ...state }
}

const cellClass = (v: string) =>
  v === 'sim' ? 'is-yes' : v === 'não' ? 'is-no' : v === 'parcial' ? 'is-partial' : ''

function Cell({ value }: { value: string }) {
  if (value === 'sim') {
    return (
      <span className="cmp__mark cmp__mark--yes" aria-label="sim">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 12.5 9.5 18 20 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }
  if (value === 'não') {
    return (
      <span className="cmp__mark cmp__mark--no" aria-label="não">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6 6 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      </span>
    )
  }
  return <span className={`cmp__text ${cellClass(value)}`}>{value}</span>
}

export function Comparison() {
  const shadows = useScrollShadows()
  return (
    <section className="section comparison" id="comparativo">
      <div className="container">
        <Reveal anim="fade">
          <span className="eyebrow">Comparativo honesto</span>
        </Reveal>

        <Reveal anim="up">
          <h2 className="comparison__title">
            Onde a IrisFlow ganha <span className="gradient-text">e onde ela perde</span>.
          </h2>
        </Reveal>

        <Reveal anim="zoom" delay={160}>
          <div
            className={`cmp__wrap${shadows.left ? ' can-left' : ''}${shadows.right ? ' can-right' : ''}`}
            ref={shadows.ref}
            tabIndex={0}
            role="region"
            aria-label="Tabela comparativa (rola na horizontal)"
          >
            <table className="cmp">
              <caption className="sr-only">
                Comparação entre a IrisFlow, sistemas de rastreamento ocular dedicados e
                comunicadores nacionais por assinatura
              </caption>
              <thead>
                <tr>
                  <th scope="col">Critério</th>
                  {COMPARISON.columns.map((c, i) => (
                    <th scope="col" key={c} className={i === 0 ? 'is-ours' : ''}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.rows.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row">{row.feature}</th>
                    {row.values.map((v, i) => (
                      <td key={i} className={i === 0 ? 'is-ours' : ''}>
                        <Cell value={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal anim="fade" delay={280}>
          <p className="comparison__honesty">{COMPARISON.honesty}</p>
        </Reveal>
      </div>
    </section>
  )
}

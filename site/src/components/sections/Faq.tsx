import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { FAQ } from '@/data/content'
import './faq.css'

type Props = {
  /** Só estas perguntas (pelo texto), na ordem dada — a home mostra poucas. */
  perguntas?: string[]
  /** Link para a lista completa, quando a seção mostra só uma parte. */
  verTodas?: string
}

export function Faq({ perguntas, verTodas }: Props = {}) {
  const [open, setOpen] = useState<number | null>(0)
  const itens = perguntas
    ? perguntas.map((q) => FAQ.find((f) => f.q === q)).filter((f): f is (typeof FAQ)[number] => Boolean(f))
    : FAQ

  return (
    <section className="faixa faq" id="perguntas">
      <div className="container container--narrow">
        <Reveal anim="up">
          <h2 className="titulo-capitulo faq__title">O que as famílias mais perguntam.</h2>
        </Reveal>

        <ul className="faq__list">
          {itens.map((item, i) => {
            const isOpen = open === i
            return (
              <Reveal key={item.q} anim="up" delay={Math.min(i, 5) * 60} as="li">
                <div className={`faq__item${isOpen ? ' is-open' : ''}`}>
                  <h3 className="faq__q">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-${i}`}
                    >
                      <span>{item.q}</span>
                      <span className="faq__icon" aria-hidden="true">
                        <span />
                        <span />
                      </span>
                    </button>
                  </h3>
                  <div id={`faq-${i}`} className="faq__a" hidden={!isOpen}>
                    <p>{item.a}</p>
                  </div>
                </div>
              </Reveal>
            )
          })}
        </ul>

        {verTodas && (
          <Link to={verTodas} className="link-seta faq__todas">
            Ver todas as perguntas
          </Link>
        )}
      </div>
    </section>
  )
}

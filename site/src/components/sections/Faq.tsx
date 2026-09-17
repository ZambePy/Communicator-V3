import { useState } from 'react'
import { Reveal } from '@/components/effects/Reveal'
import { FAQ } from '@/data/content'
import './faq.css'

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="section faq" id="perguntas">
      <div className="container container--narrow">
        <Reveal anim="fade">
          <span className="eyebrow">Perguntas frequentes</span>
        </Reveal>

        <Reveal anim="up">
          <h2 className="faq__title">O que as famílias mais perguntam.</h2>
        </Reveal>

        <ul className="faq__list">
          {FAQ.map((item, i) => {
            const isOpen = open === i
            return (
              <Reveal key={item.q} anim="up" delay={i * 60} as="li">
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
      </div>
    </section>
  )
}

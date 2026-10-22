import { useEffect, useState, type ReactNode } from 'react'
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

/**
 * A resposta abre e fecha com a altura animada (20/10/2026): a linha da grade
 * vai de 0fr a 1fr, e as perguntas de baixo descem junto, em vez de pular.
 * É a única animação do site que mexe no layout, e só no clique da pessoa.
 * Fechada, a resposta fica `hidden` (fora do foco e do leitor de tela), mas só
 * depois de terminar de fechar; ao abrir, sai do `hidden` um quadro antes de
 * crescer, para a transição ter de onde partir. Com movimento reduzido, a
 * regra global encurta a transição: abre e fecha na hora.
 */
const FECHAR_MS = 220

function Resposta({ id, aberta, children }: { id: string; aberta: boolean; children: ReactNode }) {
  const [presente, setPresente] = useState(aberta)
  const [expandida, setExpandida] = useState(aberta)
  useEffect(() => {
    if (aberta) {
      setPresente(true)
      let q2 = 0
      const q1 = window.requestAnimationFrame(() => {
        q2 = window.requestAnimationFrame(() => setExpandida(true))
      })
      return () => {
        window.cancelAnimationFrame(q1)
        window.cancelAnimationFrame(q2)
      }
    }
    setExpandida(false)
    const t = window.setTimeout(() => setPresente(false), FECHAR_MS + 40)
    return () => window.clearTimeout(t)
  }, [aberta])
  return (
    <div id={id} className={`faq__a${expandida ? ' is-aberta' : ''}`} hidden={!presente}>
      <div className="faq__a-dentro">{children}</div>
    </div>
  )
}

export function Faq({ perguntas, verTodas }: Props = {}) {
  const [open, setOpen] = useState<number | null>(0)
  const itens = perguntas
    ? perguntas.map((q) => FAQ.find((f) => f.q === q)).filter((f): f is (typeof FAQ)[number] => Boolean(f))
    : FAQ

  return (
    <section className="faixa faq" id="perguntas">
      {/* No computador, o título fica à esquerda, parado, e as perguntas
          correm à direita: a lista lê como um índice, não como uma pilha de
          caixas. */}
      <div className="container faq__grade">
        <Reveal anim="up" className="faq__cabeca">
          <h2 className="titulo-capitulo faq__title">O que as famílias mais perguntam.</h2>
          {verTodas && (
            <Link to={verTodas} className="link-seta faq__todas faq__todas--topo">
              Ver todas as perguntas
            </Link>
          )}
        </Reveal>

        <div className="faq__corpo">
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
                  <Resposta id={`faq-${i}`} aberta={isOpen}>
                    <p>{item.a}</p>
                  </Resposta>
                </div>
              </Reveal>
            )
          })}
        </ul>

        {verTodas && (
          <Link to={verTodas} className="link-seta faq__todas faq__todas--fim">
            Ver todas as perguntas
          </Link>
        )}
        </div>
      </div>
    </section>
  )
}

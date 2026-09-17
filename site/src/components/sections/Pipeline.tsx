import { useEffect, useRef, useState } from 'react'
import { AnimatedHeadline } from '@/components/effects/AnimatedHeadline'
import { Reveal } from '@/components/effects/Reveal'
import { PIPELINE } from '@/data/content'
import './pipeline.css'

/**
 * Pipeline de rastreamento em scrollytelling: uma linha se desenha
 * conforme a seção é percorrida e cada estágio acende ao entrar em foco.
 */
export function Pipeline() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [fill, setFill] = useState(0)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        const vh = window.innerHeight
        const total = rect.height + vh * 0.5
        const seen = Math.min(Math.max(vh * 0.75 - rect.top, 0), total)
        const p = Math.min(seen / total, 1)
        setFill(p)
        setActive(Math.min(Math.floor(p * PIPELINE.length), PIPELINE.length - 1))
      })
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <section className="section pipeline" id="pipeline">
      <div className="container">
        <Reveal anim="fade">
          <span className="eyebrow">Como funciona</span>
        </Reveal>

        <AnimatedHeadline
          text="Da webcam até a coordenada na tela, em seis estágios."
          as="h2"
          highlight={['seis', 'estágios.']}
          className="pipeline__title"
        />

        <Reveal anim="up" delay={140}>
          <p className="lead pipeline__lead">
            O ciclo inteiro roda a cada quadro de vídeo, no computador da própria pessoa. Nenhuma
            imagem sai do dispositivo.
          </p>
        </Reveal>

        <div className="pipeline__track" ref={sectionRef}>
          <div className="pipeline__line" aria-hidden="true">
            <span className="pipeline__line-fill" style={{ transform: `scaleY(${fill})` }} />
          </div>

          <ol className="pipeline__steps">
            {PIPELINE.map((s, i) => (
              <li
                key={s.step}
                className={`pipeline__step${i <= active ? ' is-on' : ''}`}
              >
                <span className="pipeline__dot" aria-hidden="true" />
                <div className="pipeline__body">
                  <span className="pipeline__num">{s.step}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

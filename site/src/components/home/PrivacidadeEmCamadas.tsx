import { useState } from 'react'
import { Reveal } from '@/components/effects/Reveal'
import { PRIVACIDADE_EM_CAMADAS as P } from '@/data/home'
import './privacidade-camadas.css'

/** Os raios dos três aros, de dentro para fora (o computador no centro). */
const RAIOS = [88, 136, 184]

/**
 * "A câmera vê. Ninguém mais." (redesenho de 01/11/2026): a privacidade nas
 * três camadas, como aros concêntricos (o motivo da página): no centro, o que
 * nunca sai do computador; em volta, o que sai só com conta; por fora, o que
 * pede autorização. À esquerda, a mesma coisa em palavras: apontar, tocar ou
 * focar uma camada acende o aro dela. Todo o texto fica sempre à vista; o
 * desenho só acompanha. A camada acesa é marcada com aria-current (é uma
 * escolha entre três, não três interruptores independentes).
 */
export function PrivacidadeEmCamadas() {
  const [ativa, setAtiva] = useState(0)

  return (
    <section className="camadas home-faixa" aria-labelledby="camadas-titulo">
      <div className="container camadas__grade">
        <div className="camadas__texto">
          <Reveal as="header" anim="up">
            <h2 id="camadas-titulo" className="home-titulo">
              {P.titulo}
            </h2>
            <p className="home-sub">{P.texto}</p>
          </Reveal>
          <ul className="camadas__lista">
            {P.camadas.map((c, i) => (
              <Reveal as="li" anim="up" delay={80 + i * 80} key={c.id}>
                <button
                  type="button"
                  className={`camadas__item${i === ativa ? ' is-ativa' : ''}`}
                  aria-current={i === ativa ? 'true' : undefined}
                  onPointerEnter={() => setAtiva(i)}
                  onFocus={() => setAtiva(i)}
                  onClick={() => setAtiva(i)}
                >
                  <span className="camadas__nome">{c.nome}</span>
                  <span className="camadas__desc">{c.texto}</span>
                </button>
              </Reveal>
            ))}
          </ul>
        </div>

        <Reveal anim="zoom" className="camadas__desenho">
          <svg viewBox="0 0 400 400" aria-hidden="true" focusable="false" className={`camadas__aros camadas__aros--${ativa}`}>
            {[...RAIOS].reverse().map((r, k) => {
              const i = RAIOS.length - 1 - k
              return <circle key={r} className={`camadas__aro camadas__aro--${i}${i === ativa ? ' is-ativa' : ''}`} cx="200" cy="200" r={r} />
            })}
            {/* No centro, o computador com a câmera: o que nunca sai dele. */}
            <g className="camadas__computador">
              <rect x="158" y="166" width="84" height="58" rx="8" />
              <rect className="camadas__tela" x="166" y="174" width="68" height="42" rx="3" />
              <circle className="camadas__camera" cx="200" cy="170" r="2.6" />
              <rect x="186" y="224" width="28" height="8" />
              <rect x="172" y="232" width="56" height="7" rx="3.5" />
            </g>
            {/* O aro ativo ganha o traço de fixação, fechando. */}
            <circle key={ativa} className="camadas__fixa" cx="200" cy="200" r={RAIOS[ativa] + 6} pathLength={1} />
          </svg>
        </Reveal>
      </div>
    </section>
  )
}

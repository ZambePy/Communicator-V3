import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Icon } from '@/components/ui/Icon'
import { SEGMENTS } from '@/data/content'
import './segments.css'

/**
 * "Isto é para você": um bloco por condição, com o encaixe e a ressalva
 * honesta. Vem antes do produto porque a família precisa se reconhecer
 * antes de ler qualquer especificação.
 */
export function Segments() {
  return (
    <section className="section segments" id="para-quem">
      <div className="container">
        <Reveal anim="fade">
          <span className="eyebrow">Para quem é</span>
        </Reveal>
        <Reveal anim="up">
          <h2 className="segments__title">
            Condições diferentes, <span className="gradient-text">um mesmo canal: o olhar.</span>
          </h2>
        </Reveal>
        <Reveal anim="up" delay={120}>
          <p className="lead segments__lead">
            O que muda de um caso para outro é o ritmo, o vocabulário e o cuidado na avaliação.
            Cada bloco abaixo diz onde o IrisFlow encaixa e onde ainda pede cautela.
          </p>
        </Reveal>

        <ul className="segments__grid">
          {SEGMENTS.map((s, i) => (
            <Reveal key={s.id} anim="up" delay={140 + i * 80} as="li">
              <article className="segment panel" id={`para-${s.id}`}>
                <span className="segment__icon">
                  <Icon name={s.icon} size={24} />
                </span>
                <h3 className="segment__title">{s.title}</h3>
                <p className="segment__fit">{s.fit}</p>
                <p className="segment__caveat">
                  <Icon name="info" size={16} />
                  <span>{s.caveat}</span>
                </p>
              </article>
            </Reveal>
          ))}
          <Reveal anim="up" delay={140 + SEGMENTS.length * 80} as="li">
            <div className="segment segment--more">
              <h3 className="segment__title">Outra condição?</h3>
              <p className="segment__fit">
                Distrofias musculares avançadas, síndrome do encarceramento e outros quadros com o
                olhar preservado também entram. Conte o caso e a gente responde se faz sentido
                testar.
              </p>
              <Link to="/contato" className="segment__link underline-grow">
                Falar com a equipe
              </Link>
            </div>
          </Reveal>
        </ul>
      </div>
    </section>
  )
}

import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Portrait } from '@/components/ui/Portrait'
import { HUMAN, TEAM } from '@/data/content'
import './human.css'

/**
 * A faixa que responde "para quem isso serve" antes de qualquer número —
 * e mostra quem está do outro lado do e-mail: os três retratos, pequenos
 * e redondos, ao lado da frase de missão.
 */
export function Human() {
  return (
    <section className="section human" id="por-que">
      <div className="container">
        <div className="human__inner">
          <Reveal anim="up">
            <div>
              <h2 className="human__title">{HUMAN.title}</h2>
              <ul className="human__lines">
                {HUMAN.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal anim="fade" delay={220}>
            <div className="human__report">
              <p className="human__quote">{HUMAN.report}</p>
              <p className="human__source">{HUMAN.source}</p>
              <p className="human__close">{HUMAN.close}</p>
            </div>
          </Reveal>
        </div>

        <Reveal anim="up" delay={120} className="human__team">
          <div className="team-strip">
            <ul className="team-strip__list">
              {TEAM.map((p) => (
                <li key={p.name} className="team-strip__item">
                  <Portrait photo={p.photo} alt={p.alt} size={120} />
                  <span className="team-strip__name">{p.name.split(' ')[0]}</span>
                  <span className="team-strip__role">{p.role}</span>
                </li>
              ))}
            </ul>
            <div className="team-strip__text">
              <p className="team-strip__mission">{HUMAN.mission}</p>
              <p className="team-strip__who">
                As três pessoas que fazem a IrisFlow.{' '}
                <Link to="/sobre#equipe" className="link-ok underline-grow">
                  Conheça a equipe
                </Link>
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

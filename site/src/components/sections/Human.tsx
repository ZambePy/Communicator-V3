import { Reveal } from '@/components/effects/Reveal'
import { HUMAN } from '@/data/content'
import './human.css'

/**
 * A faixa que responde "para quem isso serve" antes de qualquer número.
 * Deliberadamente sem cartões e com uma única entrada animada: o resto
 * da página já se move bastante, e aqui o silêncio faz parte do recado.
 */
export function Human() {
  return (
    <section className="section human" id="por-que">
      <div className="container human__inner">
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
    </section>
  )
}

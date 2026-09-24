import { AnimatedHeadline } from '@/components/effects/AnimatedHeadline'
import { Reveal } from '@/components/effects/Reveal'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { DIFFERENTIATORS } from '@/data/content'
import './differentiators.css'

export function Differentiators() {
  return (
    <section className="section differentiators" id="diferenciais">
      <div className="container">
        <Reveal anim="fade">
          <span className="eyebrow">Diferenciais</span>
        </Reveal>

        <AnimatedHeadline
          text="Rastreamento por webcam não é novidade. A diferença está em seis decisões de projeto."
          as="h2"
          highlight={['seis', 'decisões']}
          className="differentiators__title"
        />

        <Reveal anim="up" delay={140}>
          <p className="lead differentiators__lead">
            Cada uma responde a um problema que aparece no uso de verdade — cansaço, postura, luz
            ruim, internet instável, privacidade — e as de rastreamento só entraram no produto
            depois de medidas.
          </p>
        </Reveal>

        <ul className="differentiators__grid">
          {DIFFERENTIATORS.map((d, i) => (
            <Reveal key={d.title} anim="up" delay={i * 90} as="li">
              <Card as="div">
                <CardIcon tone={i % 2 === 0 ? 'blue' : 'teal'}>
                  <Icon name={d.icon} size={26} />
                </CardIcon>
                <h3>{d.title}</h3>
                <p>{d.text}</p>
              </Card>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

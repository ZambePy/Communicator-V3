import { AnimatedHeadline } from '@/components/effects/AnimatedHeadline'
import { Reveal } from '@/components/effects/Reveal'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { BRAND, MODULES } from '@/data/content'
import './modules.css'

export function Modules({ limit }: { limit?: number }) {
  const list = limit ? MODULES.slice(0, limit) : MODULES

  return (
    <section className="section modules" id="modulos">
      <div className="container">
        <Reveal anim="fade">
          <span className="eyebrow">A plataforma</span>
        </Reveal>

        <AnimatedHeadline
          text="Não é um cursor controlado pelo olhar. É um ambiente inteiro."
          as="h2"
          highlight={['ambiente', 'inteiro.']}
          className="modules__title"
        />

        <Reveal anim="up" delay={140}>
          <p className="lead modules__lead">
            No {BRAND.product}, o rastreamento é a camada de entrada. Sobre ela foram construídos
            ambientes completos de comunicação, controle do sistema, lazer terapêutico,
            acompanhamento pelo cuidador e resposta a emergências, todos operados por fixação, com
            poucos alvos grandes e bem espaçados.
          </p>
        </Reveal>

        <ul className="modules__grid">
          {list.map((m, i) => (
            <Reveal key={m.name} anim="up" delay={i * 80} as="li" className="modules__item">
              <Card as="div">
                <CardIcon tone={m.state === 'Implementado' ? 'blue' : 'teal'}>
                  <Icon name={m.icon} size={26} />
                </CardIcon>
                <h3>{m.name}</h3>
                <p>{m.description}</p>
                <span className={`tag ${m.state === 'Implementado' ? 'tag--ok' : 'tag--wip'}`}>
                  {m.state}
                </span>
              </Card>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

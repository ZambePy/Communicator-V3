import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { BETA, BETA_CTA, ELIGIBILITY } from '@/data/content'
import './eligibility.css'

/**
 * Checklist de elegibilidade: três perguntas que a família consegue
 * responder sem profissional. Nada é gravado; é leitura guiada.
 */
export function Eligibility() {
  return (
    <section className="section section--soft eligibility" id="elegibilidade">
      <div className="container eligibility__inner">
        <div>
          <Reveal anim="fade">
            <span className="eyebrow">Antes de instalar</span>
          </Reveal>
          <Reveal anim="up">
            <h2 className="eligibility__title">{ELIGIBILITY.title}</h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead eligibility__lead">{ELIGIBILITY.lead}</p>
          </Reveal>
          <Reveal anim="up" delay={200}>
            <div className="eligibility__actions">
              <Button to={BETA.ativo ? BETA_CTA.to : '/cadastro'}>
                {BETA.ativo ? BETA_CTA.label : 'Testar grátis'}
              </Button>
              <Link to="/contato" className="underline-grow eligibility__link">
                {ELIGIBILITY.extra}
              </Link>
            </div>
          </Reveal>
        </div>

        <ol className="eligibility__list">
          {ELIGIBILITY.items.map((item, i) => (
            <Reveal key={item.q} anim="right" delay={160 + i * 110} as="li">
              <div className="check-item">
                <span className="check-item__n" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M4 12.5 9.5 18 20 6.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <div>
                  <h3 className="check-item__q">{item.q}</h3>
                  <p className="check-item__why">{item.why}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

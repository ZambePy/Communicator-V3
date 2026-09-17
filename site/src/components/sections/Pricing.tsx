import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { BETA, BETA_CTA, PLAN_GUARANTEES, TRIAL_DAYS } from '@/data/content'
import { usePlans } from '@/hooks/usePlans'
import './pricing.css'

export function Pricing({ compact = false }: { compact?: boolean }) {
  // Preço e nome vêm da tabela `plans`; bullets e notas, do content.ts.
  const { plans } = usePlans()
  // Durante a beta a contratação fica pausada: os cards continuam com
  // preço, mas o botão é desabilitado (docs/BETA.md §1). Fora da beta,
  // ainda vale o `purchasable` de cada plano, vindo do banco.
  const pausada = BETA.ativo

  return (
    <section className={`section pricing${compact ? ' pricing--compact' : ''}`} id="planos">
      <div className="container">
        <Reveal anim="fade">
          <span className="eyebrow">Planos</span>
        </Reveal>

        <Reveal anim="up">
          <h2 className="pricing__title">
            Três planos. <span className="gradient-text">Sem hardware, sem fidelidade.</span>
          </h2>
        </Reveal>

        <Reveal anim="up" delay={120}>
          <p className="lead pricing__lead">
            Escolha pelo que a pessoa precisa hoje, não pelo que ela talvez venha a precisar. Dá
            para mudar de plano depois, e os {TRIAL_DAYS} dias de avaliação valem para os três,
            antes de qualquer cobrança e sem cartão.
          </p>
        </Reveal>

        {pausada && (
          <Reveal anim="up" delay={150}>
            <div className="pricing__beta" role="status">
              <div>
                <strong>Durante a beta, a contratação de planos está pausada.</strong>
                <p>
                  Participe gratuitamente pela página Beta: acesso completo, sem cartão e sem
                  cobrança, em troca do seu retorno sobre o uso.
                </p>
              </div>
              <Button to={BETA_CTA.to} variant="teal">
                {BETA_CTA.label}
              </Button>
            </div>
          </Reveal>
        )}

        <div className="plans">
          {plans.map((plan, i) => (
            <Reveal key={plan.id} anim="zoom" delay={180 + i * 110}>
              <article className={`plan panel${plan.recommended ? ' plan--recommended' : ''}`}>
                {plan.recommended && (
                  <span className="plan__ribbon">Recomendado</span>
                )}

                <header className="plan__head">
                  <h3 className="plan__name">{plan.name}</h3>
                  <p className="plan__tagline">{plan.tagline}</p>
                  <p className="plan__price">
                    <span className="plan__currency">R$</span>
                    <span className="plan__amount">{plan.price}</span>
                    <span className="plan__period">{plan.period}</span>
                  </p>
                  <p className="plan__meta">
                    <span>{plan.devices}</span>
                    <span aria-hidden="true">·</span>
                    <span>{plan.support}</span>
                  </p>
                </header>

                <ul className="plan__list">
                  {plan.includes.map((item, j) => (
                    <li key={item} style={{ animationDelay: `${j * 60}ms` }}>
                      <span className="plan__check" aria-hidden="true">
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
                      {item}
                    </li>
                  ))}
                </ul>

                {plan.note && (
                  <p className="plan__note">
                    <Icon name="info" size={18} aria-hidden="true" />
                    <span>{plan.note}</span>
                  </p>
                )}

                {pausada || plan.purchasable === false ? (
                  <>
                    <Button size="lg" full disabled aria-disabled="true">
                      Indisponível durante a beta
                    </Button>
                    <p className="plan__fine">
                      A compra reabre depois da beta. Enquanto isso, o acesso é gratuito.
                    </p>
                  </>
                ) : (
                  <>
                    <Button to={`/cadastro?plano=${plan.id}`} size="lg" full>
                      {plan.recommended ? `Assinar ${plan.name}` : `Escolher ${plan.name}`}
                    </Button>
                    <p className="plan__fine">
                      {TRIAL_DAYS} dias grátis. Sem cartão para começar.
                    </p>
                  </>
                )}
              </article>
            </Reveal>
          ))}
        </div>

        <div className="pricing__guarantees">
          {PLAN_GUARANTEES.map((g, i) => (
            <Reveal key={g.title} anim="up" delay={520 + i * 100}>
              <div className="guarantee">
                <span className="guarantee__icon">
                  <Icon name={g.icon} size={24} />
                </span>
                <div>
                  <h3>{g.title}</h3>
                  <p>{g.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal anim="fade" delay={860}>
          <p className="pricing__note">
            Para clínicas, associações de pacientes e profissionais prescritores, o acesso durante
            o programa de validação é gratuito. E se a mensalidade não couber no orçamento da
            família, existe o programa IrisFlow Doa: pergunte antes de desistir.{' '}
            <Link to="/contato#validacao" className="underline-grow">
              Fale com a equipe
            </Link>
            .
          </p>
        </Reveal>
      </div>
    </section>
  )
}

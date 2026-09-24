import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import {
  BETA,
  BETA_CTA,
  BETA_PLAN,
  CONDITIONS_SHORT,
  PLAN_GUARANTEES,
  TRIAL_DAYS,
  type Plan,
} from '@/data/content'
import { Skeleton } from '@/components/ui/Skeleton'
import { usePlans } from '@/hooks/usePlans'
import './pricing.css'

function Check() {
  return (
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
  )
}

function PlanList({ items }: { items: string[] }) {
  return (
    <ul className="plan__list">
      {items.map((item, j) => (
        <li key={item} style={{ animationDelay: `${j * 60}ms` }}>
          <Check />
          {item}
        </li>
      ))}
    </ul>
  )
}

/**
 * Durante a beta: o plano Beta em destaque ("Disponível agora — grátis
 * durante o beta") e, abaixo, os planos pagos marcados "Em breve", com o
 * PREÇO PREVISTO. Nada ali é contratável: o botão é desabilitado e diz
 * "Em breve".
 *
 * Os preços previstos vêm da tabela `plans` do Supabase (usePlans) e, sem
 * ela, da reserva em `PLANS` (src/data/content.ts) — é lá que a equipe
 * edita. Fora da beta (BETA.ativo = false) a grade volta a ser a de venda.
 */
export function Pricing({ compact = false }: { compact?: boolean }) {
  const { plans, loading } = usePlans()
  const beta = BETA.ativo

  const price = (plan: Plan) =>
    loading ? (
      <Skeleton width="4.2ch" height="0.9em" radius="8px" className="plan__amount-skeleton" />
    ) : (
      <span className="plan__amount">{plan.price}</span>
    )

  return (
    <section className={`section pricing${compact ? ' pricing--compact' : ''}`} id="planos">
      <div className="container">
        <Reveal anim="fade">
          <span className="eyebrow">Planos</span>
        </Reveal>

        <Reveal anim="up">
          <h2 className="pricing__title">
            {beta ? (
              <>
                Grátis durante a beta. <span className="gradient-text">Planos pagos só depois.</span>
              </>
            ) : (
              <>
                Três planos. <span className="gradient-text">Sem hardware, sem fidelidade.</span>
              </>
            )}
          </h2>
        </Reveal>

        <Reveal anim="up" delay={120}>
          <p className="lead pricing__lead">
            {beta ? (
              <>
                Para famílias com {CONDITIONS_SHORT}: enquanto durar a beta, o aplicativo completo é
                gratuito, sem cartão e sem cobrança. Os planos abaixo são os previstos para depois
                da beta — ainda não dá para contratá-los, e os valores podem mudar até o
                lançamento.
              </>
            ) : (
              <>
                Para famílias com {CONDITIONS_SHORT}: escolha pelo que a pessoa precisa hoje, não
                pelo que ela talvez venha a precisar. Dá para mudar de plano depois, e os{' '}
                {TRIAL_DAYS} dias de avaliação valem para os três, antes de qualquer cobrança e sem
                cartão.
              </>
            )}
          </p>
        </Reveal>

        {beta && (
          <Reveal anim="zoom" delay={160}>
            <article className="plan plan--beta panel" aria-labelledby="plano-beta-titulo">
              <div className="plan-beta__main">
                <span className="plan__status plan__status--now">Disponível agora</span>
                <h3 className="plan__name" id="plano-beta-titulo">
                  {BETA_PLAN.name}
                </h3>
                <p className="plan__price">
                  <span className="plan__currency">R$</span>
                  <span className="plan__amount">0</span>
                  <span className="plan__period">grátis durante o beta</span>
                </p>
                <p className="plan__tagline">{BETA_PLAN.tagline}</p>
                <Button to={BETA_CTA.to} variant="teal" size="lg">
                  {BETA_CTA.labelLong}
                </Button>
                <p className="plan__fine plan__fine--left">Sem cartão. Sem cobrança depois.</p>
              </div>
              <PlanList items={BETA_PLAN.includes} />
            </article>
          </Reveal>
        )}

        {beta && (
          <Reveal anim="fade" delay={200}>
            <h3 className="pricing__future-title">Depois da beta · preços previstos</h3>
          </Reveal>
        )}

        <div className="plans">
          {plans.map((plan, i) => (
            <Reveal key={plan.id} anim="zoom" delay={220 + i * 110}>
              <article
                className={`plan panel${plan.recommended && !beta ? ' plan--recommended' : ''}${beta ? ' plan--soon' : ''}`}
              >
                {beta ? (
                  <span className="plan__status plan__status--soon">Em breve</span>
                ) : (
                  plan.recommended && <span className="plan__ribbon">Recomendado</span>
                )}

                <header className="plan__head">
                  <h3 className="plan__name">{plan.name}</h3>
                  <p className="plan__tagline">{plan.tagline}</p>
                  {beta && <p className="plan__forecast">Preço previsto</p>}
                  <p className="plan__price" aria-busy={loading}>
                    <span className="plan__currency">R$</span>
                    {price(plan)}
                    <span className="plan__period">{plan.period}</span>
                  </p>
                  <p className="plan__meta">
                    <span>{plan.devices}</span>
                    <span aria-hidden="true">·</span>
                    <span>{plan.support}</span>
                  </p>
                </header>

                <PlanList items={plan.includes} />

                {plan.note && (
                  <p className="plan__note">
                    <Icon name="info" size={18} aria-hidden="true" />
                    <span>{plan.note}</span>
                  </p>
                )}

                {beta || plan.purchasable === false ? (
                  <>
                    <Button size="lg" full disabled variant="secondary">
                      Em breve
                    </Button>
                    <p className="plan__fine">
                      {beta
                        ? 'Ainda não está à venda. Durante a beta, use de graça.'
                        : 'Indisponível no momento.'}
                    </p>
                  </>
                ) : (
                  <>
                    <Button to={`/cadastro?plano=${plan.id}`} size="lg" full>
                      {plan.recommended ? `Assinar ${plan.name}` : `Escolher ${plan.name}`}
                    </Button>
                    <p className="plan__fine">{TRIAL_DAYS} dias grátis. Sem cartão para começar.</p>
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
            o programa de validação é gratuito. E, se depois da beta a mensalidade não couber no
            orçamento da família, fale com a gente antes de desistir.{' '}
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

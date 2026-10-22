import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import {
  BETA,
  BETA_CTA,
  BETA_PLAN,
  PLAN_GUARANTEES,
  TRIAL_DAYS,
} from '@/data/content'
import { usePlans } from '@/hooks/usePlans'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
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
      {items.map((item) => (
        <li key={item}>
          <Check />
          {item}
        </li>
      ))}
    </ul>
  )
}

/**
 * Durante a beta: o plano Beta em destaque ("Disponível agora", grátis
 * durante a beta) e, abaixo, os planos pagos marcados "Em breve", com o
 * PREÇO PREVISTO. Nada ali é contratável: o botão é desabilitado e a frase
 * embaixo diz por quê.
 *
 * Os preços previstos vêm da tabela `plans` do Supabase (usePlans) e, sem
 * ela, da reserva em `PLANS` (src/data/content.ts), que é onde a equipe
 * edita. O número da reserva aparece na hora e, se o banco responder com
 * outro valor, troca em silêncio: antes havia um esqueleto no lugar e, com o
 * banco lento ou fora do ar, o preço (o dado mais procurado da página) ficava
 * em branco (auditoria de 21/10/2026). Fora da beta (BETA.ativo = false) a
 * grade volta a ser a de venda.
 */
export function Pricing({ compact = false }: { compact?: boolean }) {
  const { plans } = usePlans()
  const lancou = useJaLancou(useBetaProgram().launchAt)
  const beta = BETA.ativo
  // Os títulos seguem o h1 da página: na beta, o plano Beta e "Depois da beta"
  // são h2 e os planos pagos ficam embaixo deste; fora dela, cada plano é h2.
  const TituloDoPlano = beta ? 'h3' : 'h2'

  return (
    <section className={`faixa pricing${compact ? ' pricing--compact' : ''}`} id="planos" aria-label="Planos">
      <div className="container">
        {beta && (
          <Reveal anim="up">
            <article className="plan plan--beta panel" aria-labelledby="plano-beta-titulo">
              <div className="plan-beta__main">
                <span className="plan__status plan__status--now">Disponível agora</span>
                <h2 className="plan__name" id="plano-beta-titulo">
                  {BETA_PLAN.name}
                </h2>
                <p className="plan__price">
                  <span className="plan__currency">R$</span>
                  <span className="plan__amount">0</span>
                  <span className="plan__period">durante a beta</span>
                </p>
                <p className="plan__tagline">{BETA_PLAN.tagline}</p>
                {/* Um caminho só para o download: depois do lançamento, o botão leva
                    a /baixar, como a chamada final e as outras páginas. */}
                <Button to={lancou ? '/baixar' : BETA_CTA.to} variant="teal" size="lg" chamada>
                  {lancou ? 'Baixar grátis' : BETA_CTA.labelLong}
                </Button>
              </div>
              <PlanList items={BETA_PLAN.includes} />
            </article>
          </Reveal>
        )}

        {beta && (
          <Reveal anim="fade">
            <h2 className="pricing__future-title">Preços previstos para depois da beta</h2>
          </Reveal>
        )}

        <div className="plans">
          {plans.map((plan, i) => (
            <Reveal key={plan.id} anim="up" delay={i * 80}>
              <article
                className={`plan panel${plan.recommended && !beta ? ' plan--recommended' : ''}${beta ? ' plan--soon' : ''}`}
              >
                {beta ? (
                  <span className="plan__status plan__status--soon">Em breve</span>
                ) : (
                  plan.recommended && <span className="plan__ribbon">Recomendado</span>
                )}

                <header className="plan__head">
                  <TituloDoPlano className="plan__name">{plan.name}</TituloDoPlano>
                  <p className="plan__tagline">{plan.tagline}</p>
                  {beta && <p className="plan__forecast">Preço previsto</p>}
                  <p className="plan__price">
                    <span className="plan__currency">R$</span>
                    <span className="plan__amount">{plan.price}</span>
                    <span className="plan__period">{plan.period}</span>
                  </p>
                  <p className="plan__meta">
                    <span>{plan.devices}</span>
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
            <Reveal key={g.title} anim="up" delay={i * 80}>
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

        <Reveal anim="fade">
          <p className="pricing__note">
            Clínicas, associações de pacientes e profissionais que prescrevem têm acesso gratuito
            durante o programa de validação. Se depois da beta a mensalidade não couber no
            orçamento da família, fale com a gente antes de desistir.{' '}
            <Link to="/contato#validacao" className="underline-grow">
              Falar com a equipe
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  )
}

import { Link } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { IrisMark } from '@/components/layout/Logo'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import {
  BETA,
  BETA_CTA,
  HERO,
  PLATFORMS,
  PRIVACY_LINE,
  TRIAL_DAYS,
} from '@/data/content'
import { usePlans } from '@/hooks/usePlans'
import './hero.css'

/** O título com uma palavra em gradiente, como nos títulos de seção. */
function tituloComDestaque(titulo: string, destaque?: string) {
  const i = destaque ? titulo.lastIndexOf(destaque) : -1
  if (!destaque || i < 0) return titulo
  return (
    <>
      {titulo.slice(0, i)}
      <span className="gradient-text">{destaque}</span>
      {titulo.slice(i + destaque.length)}
    </>
  )
}

/**
 * Hero da home: a mensagem e a chamada à esquerda (sempre na primeira
 * dobra, no desktop e no celular) e, à direita, a marca da IrisFlow — o
 * símbolo da íris girando devagar, com o halo e os anéis que se expandem.
 * Uma imagem só, sem nada disputando atenção com o título.
 */
export function Hero() {
  const { cheapest } = usePlans()

  return (
    <section className="hero on-dark">
      <AmbientBackground particles={18} />

      <div className="container hero__inner">
        <div className="hero__copy">
          <Reveal anim="fade">
            <span className="eyebrow hero__eyebrow">{HERO.eyebrow}</span>
          </Reveal>

          <h1 className="hero__title">
            <span className="hero__title-mask">
              <span className="hero__title-line" style={{ animationDelay: '120ms' }}>
                {tituloComDestaque(HERO.title, HERO.titleAccent)}
              </span>
            </span>
          </h1>

          <Reveal anim="up" delay={320}>
            <p className="lead hero__lead">{HERO.lead}</p>
          </Reveal>

          <Reveal anim="up" delay={420}>
            {/* data-sticky-hide: enquanto estes botões estão na tela, a barra
                fixa de CTA do celular fica escondida (StickyCta). */}
            <div className="hero__actions" data-sticky-hide>
              {BETA.ativo ? (
                <Button to={BETA_CTA.to} size="lg">
                  {HERO.primary}
                </Button>
              ) : (
                <Button to="/cadastro" size="lg">
                  Testar grátis por {TRIAL_DAYS} dias
                </Button>
              )}
              <Button to="/como-funciona" variant="secondary" size="lg">
                {HERO.secondary}
              </Button>
            </div>
          </Reveal>

          <Reveal anim="fade" delay={540}>
            <p className="hero__privacy">
              <Icon name="cadeado" size={18} />
              <span>{PRIVACY_LINE}</span>
            </p>
          </Reveal>

          <Reveal anim="fade" delay={640}>
            <p className="hero__fine">
              {BETA.ativo ? (
                <>
                  Beta gratuita · Sem cartão · {PLATFORMS.long} ·{' '}
                  <Link to={BETA_CTA.to} className="underline-grow">
                    como participar
                  </Link>
                </>
              ) : (
                <>
                  Sem cartão para começar · Sem fidelidade · a partir de R$ {cheapest.price} por
                  mês depois da avaliação ·{' '}
                  <Link to="/planos" className="underline-grow">
                    ver os três planos
                  </Link>
                </>
              )}
            </p>
          </Reveal>
        </div>

        <Reveal anim="zoom" delay={260} duration={1100} className="hero__mock">
          <div className="hero__marca">
            <IrisMark size={440} />
          </div>
        </Reveal>
      </div>

      <div className="hero__scroll" aria-hidden="true">
        <span className="hero__scroll-line" />
        <span className="hero__scroll-text">role</span>
      </div>
    </section>
  )
}

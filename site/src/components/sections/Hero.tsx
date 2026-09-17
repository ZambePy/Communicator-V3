import { Link } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Logo } from '@/components/layout/Logo'
import { Typewriter } from '@/components/effects/Typewriter'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { BETA, BETA_CTA, BRAND, HERO_PHRASES, TRIAL_DAYS } from '@/data/content'
import { usePlans } from '@/hooks/usePlans'
import './hero.css'

export function Hero() {
  const { cheapest } = usePlans()

  return (
    <section className="hero on-dark">
      <AmbientBackground particles={26} />

      <div className="container hero__inner">
        <Reveal anim="zoom" duration={1000}>
          <Logo variant="full" tone="negativo" size="xl" link={false} className="hero__logo" />
        </Reveal>

        <Reveal anim="fade" delay={260}>
          <p className="hero__tagline">Seu olhar tem voz.</p>
        </Reveal>

        {/* Uma janela por linha: cada máscara revela exatamente uma linha,
            então o texto é quebrado à mão em vez de deixado ao acaso. */}
        <h1 className="hero__title">
          <span className="hero__title-mask">
            <span className="hero__title-line" style={{ animationDelay: '420ms' }}>
              Tecnologia assistiva
            </span>
          </span>
          <span className="hero__title-mask">
            <span className="hero__title-line" style={{ animationDelay: '520ms' }}>
              que devolve a fala
            </span>
          </span>
          <span className="hero__title-mask">
            <span className="hero__title-line" style={{ animationDelay: '620ms' }}>
              a quem <span className="accent-text">ainda tem o olhar</span>.
            </span>
          </span>
        </h1>

        <Reveal anim="up" delay={700}>
          <p className="lead hero__lead">
            Quando alguém perde a fala, a família não sai atrás de tecnologia. Sai atrás de um
            jeito de continuar conversando. O {BRAND.product} transforma o movimento dos olhos em
            palavra e em controle do computador, usando a webcam que já está em casa — sem
            equipamento de dezenas de milhares de reais e sem enviar uma única imagem para a
            internet.
          </p>
        </Reveal>

        <Reveal anim="up" delay={820}>
          <div className="hero__say" aria-label="Exemplo de frase composta pelo olhar">
            <span className="hero__say-label">escrevendo com o olhar</span>
            <p className="hero__say-text">
              <Typewriter phrases={HERO_PHRASES} />
            </p>
          </div>
        </Reveal>

        <Reveal anim="up" delay={920}>
          <div className="hero__actions">
            {BETA.ativo ? (
              <Button to={BETA_CTA.to} size="lg">
                {BETA_CTA.labelLong}
              </Button>
            ) : (
              <Button to="/cadastro" size="lg">
                Testar grátis por {TRIAL_DAYS} dias
              </Button>
            )}
            <Button to="/como-funciona" variant="secondary" size="lg">
              Ver como funciona
            </Button>
          </div>
        </Reveal>

        <Reveal anim="fade" delay={1040}>
          <p className="hero__fine">
            {BETA.ativo ? (
              <>
                Beta fechada e gratuita · Sem cartão · Sem cobrança ·{' '}
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

      <div className="hero__scroll" aria-hidden="true">
        <span className="hero__scroll-line" />
        <span className="hero__scroll-text">role</span>
      </div>
    </section>
  )
}

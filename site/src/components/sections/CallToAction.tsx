import { Reveal } from '@/components/effects/Reveal'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { IrisMark } from '@/components/layout/Logo'
import { Button } from '@/components/ui/Button'
import { BETA, BETA_CTA, TRIAL_DAYS } from '@/data/content'
import './cta.css'

export function CallToAction() {
  return (
    <section className="cta on-dark">
      <AmbientBackground particles={16} scan={false} />

      <div className="container cta__inner">
        <Reveal anim="zoom">
          <IrisMark size={92} />
        </Reveal>

        <Reveal anim="up" delay={140}>
          <h2 className="cta__title">
            A pessoa continua lá. <span className="accent-text">Só falta a voz.</span>
          </h2>
        </Reveal>

        <Reveal anim="up" delay={240}>
          <p className="cta__lead">
            Instale no computador que já está em casa, calibre em cerca de meio minuto e veja
            com os próprios olhos se funciona para o seu caso.{' '}
            {BETA.ativo
              ? 'Durante a beta o acesso é gratuito e sem cartão, e nenhum texto de site substitui essa verificação.'
              : 'Não pedimos cartão para começar, e nenhum texto de site substitui essa verificação.'}
          </p>
        </Reveal>

        <Reveal anim="up" delay={340}>
          <div className="cta__actions">
            {BETA.ativo ? (
              <Button to={BETA_CTA.to} size="lg" variant="teal">
                {BETA_CTA.labelLong}
              </Button>
            ) : (
              <Button to="/cadastro" size="lg" variant="teal">
                Começar os {TRIAL_DAYS} dias gratuitos
              </Button>
            )}
            <Button to="/contato" size="lg" variant="secondary">
              Falar com a equipe
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

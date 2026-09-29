import { Reveal } from '@/components/effects/Reveal'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { OlharQueFala } from '@/components/effects/Ilustracoes'
import { Button } from '@/components/ui/Button'
import { EtiquetaLancamento } from '@/components/ui/EtiquetaLancamento'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { diaPorExtenso } from '@/lib/lancamento'
import { BETA, BETA_CTA, TRIAL_DAYS } from '@/data/content'
import './cta.css'

/** Chamada final das páginas de conteúdo: uma frase, duas ações e, antes do
 *  lançamento, o dia em que o download abre. */
export function CallToAction() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)

  return (
    <section className="cta on-dark">
      <AmbientBackground />

      <div className="container cta__inner">
        <Reveal anim="fade" className="cta__ilustracao">
          <OlharQueFala />
        </Reveal>
        <Reveal anim="up">
          <h2 className="cta__title">
            A pessoa continua lá. <span className="accent-text">Só falta a voz.</span>
          </h2>
        </Reveal>

        <Reveal anim="up" delay={100}>
          <p className="cta__lead">
            Instale no computador que já está em casa e veja com os próprios olhos se funciona para
            o seu caso.{' '}
            {BETA.ativo ? 'Na beta, sem cartão e sem cobrança.' : 'Sem cartão para começar.'}
          </p>
        </Reveal>

        <Reveal anim="up" delay={200}>
          <div className="cta__actions">
            {BETA.ativo ? (
              <Button to={lancou ? '/baixar' : BETA_CTA.to} size="lg" variant="teal">
                {lancou ? 'Baixar grátis' : BETA_CTA.labelLong}
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

        {BETA.ativo && !lancou && (
          <Reveal anim="fade" delay={300}>
            <p className="cta__data">
              <EtiquetaLancamento lancamento={program.launchAt} variante="curta" />
              Download a partir de {diaPorExtenso(program.launchAt)}
            </p>
          </Reveal>
        )}
      </div>
    </section>
  )
}

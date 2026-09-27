import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Button } from '@/components/ui/Button'
import { EtiquetaLancamento } from '@/components/ui/EtiquetaLancamento'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { diaPorExtenso } from '@/lib/lancamento'
import { BETA, BETA_CTA, HERO, PLATFORMS } from '@/data/content'
import { DEMO_COMMUNICATOR } from '@/data/home'
import { MonitorDemo } from './Aparelhos'
import './hero-produto.css'

/**
 * Abertura da home: uma frase, uma linha de apoio, duas chamadas — e o
 * produto funcionando, num monitor, com a gravação real da tela.
 */
export function HeroProduto() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const [antes, destaque] = [HERO.title.replace(HERO.titleAccent, '').trim(), HERO.titleAccent]

  return (
    <section className="hero-produto on-dark" aria-labelledby="hero-titulo">
      <AmbientBackground />

      <div className="container hero-produto__texto">
        {BETA.ativo && (
          <p className="hero-produto__aviso anim-entrada">
            {lancou ? (
              <span>Beta gratuita, com download aberto.</span>
            ) : (
              <>
                <EtiquetaLancamento lancamento={program.launchAt} variante="curta" />
                <span>Beta gratuita. Download a partir de {diaPorExtenso(program.launchAt)}.</span>
              </>
            )}
          </p>
        )}

        <h1 id="hero-titulo" className="hero-produto__titulo anim-entrada anim-entrada--2">
          {antes} <span className="accent-text">{destaque}</span>
        </h1>

        <p className="hero-produto__lead anim-entrada anim-entrada--3">{HERO.lead}</p>

        <div className="hero-produto__acoes anim-entrada anim-entrada--4">
          {BETA.ativo ? (
            <Button to={lancou ? '/baixar' : BETA_CTA.to} size="lg">
              {lancou ? 'Baixar grátis' : BETA_CTA.label}
            </Button>
          ) : (
            <Button to="/planos" size="lg">
              {HERO.primary}
            </Button>
          )}
          <Button to="/como-funciona" size="lg" variant="secondary">
            {HERO.secondary}
          </Button>
        </div>

        <ul className="hero-produto__fatos anim-entrada anim-entrada--5" aria-label="Em resumo">
          <li>Webcam comum</li>
          <li>Nenhuma imagem sai do computador</li>
          <li>{PLATFORMS.short}</li>
        </ul>
      </div>

      <div className="hero-produto__aparelho">
        <MonitorDemo demo={DEMO_COMMUNICATOR} />
      </div>
    </section>
  )
}

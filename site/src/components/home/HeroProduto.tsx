import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Button } from '@/components/ui/Button'
import { EtiquetaLancamento } from '@/components/ui/EtiquetaLancamento'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { diaPorExtenso } from '@/lib/lancamento'
import { BETA, BETA_CTA, HERO, PLATFORMS } from '@/data/content'
import { DEMO_COMMUNICATOR } from '@/data/home'
import { useInView } from '@/hooks/useInView'
import { VideoEmMoldura } from './Aparelhos'
import './hero-produto.css'

/**
 * Abertura da home: a mensagem e as chamadas à esquerda (sempre na primeira
 * dobra, no computador e no celular) e, à direita, o produto funcionando —
 * a gravação real da tela num retângulo arredondado com o brilho da marca,
 * com o halo e os anéis que se expandem por trás, sobre o fundo de
 * partículas.
 */
export function HeroProduto() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const [antes, destaque] = [HERO.title.replace(HERO.titleAccent, '').trim(), HERO.titleAccent]
  // A aura, os anéis e a flutuação só se mexem com o vídeo na tela: a aura é
  // um desfoque de 26 px animado, e rodá-la com a página rolada lá embaixo
  // gasta GPU à toa.
  const { ref: refDoAparelho, inView: aparelhoNaTela } = useInView<HTMLDivElement>({
    once: false,
    threshold: 0.05,
    rootMargin: '0px',
  })

  return (
    <section className="hero-produto on-dark" aria-labelledby="hero-titulo">
      <AmbientBackground particulas={18} varredura />

      <div className="container hero-produto__grade">
        <div className="hero-produto__texto">
          {BETA.ativo && (
            <p className="aviso-pilula anim-entrada">
              {lancou ? (
                <>
                  <EtiquetaLancamento lancamento={program.launchAt} />
                  <span>Download gratuito para {BETA.sistemaDoLancamento}.</span>
                </>
              ) : (
                <>
                  <EtiquetaLancamento lancamento={program.launchAt} variante="curta" />
                  <span>Beta gratuita. Download a partir de {diaPorExtenso(program.launchAt)}.</span>
                </>
              )}
            </p>
          )}

          <h1 id="hero-titulo" className="hero-produto__titulo">
            <span className="hero-produto__titulo-mascara">
              <span className="hero-produto__titulo-linha">
                {antes} <span className="accent-text">{destaque}</span>
              </span>
            </span>
          </h1>

          <p className="hero-produto__lead anim-entrada anim-entrada--3">{HERO.lead}</p>

          {/* data-sticky-hide: enquanto estes botões estão na tela, a barra fixa
              de chamada do celular fica escondida (StickyCta). */}
          <div className="hero-produto__acoes anim-entrada anim-entrada--4" data-sticky-hide>
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

        <div ref={refDoAparelho} className={`hero-produto__aparelho${aparelhoNaTela ? ' is-rodando' : ''}`}>
          <span className="hero-produto__halo" aria-hidden="true" />
          <span className="hero-produto__anel" aria-hidden="true" />
          <span className="hero-produto__anel hero-produto__anel--2" aria-hidden="true" />
          <div className="hero-produto__video">
            <VideoEmMoldura demo={DEMO_COMMUNICATOR} />
          </div>
        </div>
      </div>

      <div className="hero-produto__rolar" aria-hidden="true">
        <span className="hero-produto__rolar-linha" />
        <span className="hero-produto__rolar-texto">role</span>
      </div>
    </section>
  )
}

import { Button } from '@/components/ui/Button'
import { EtiquetaLancamento } from '@/components/ui/EtiquetaLancamento'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { diaPorExtenso } from '@/lib/lancamento'
import { BETA, BETA_CTA, HERO, PLATFORMS } from '@/data/content'
import './hero-produto.css'

/**
 * Abertura da home: título grande à esquerda e, à direita, para quem é, as
 * chamadas e os fatos. No celular, uma coluna. O fundo vivo mora na home
 * (Home.tsx), atrás desta abertura e do monitor que vem logo abaixo.
 *
 * O título mistura pesos com sentido: "Seu olhar" leve, "tem voz" pesado. Para
 * o leitor de tela e a busca, o h1 é a frase inteira.
 */
export function HeroProduto() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const tituloForte = HERO.title.slice(HERO.tituloLeve.length).trim()

  return (
    <section className="hero-produto" aria-labelledby="hero-titulo">
      <div className="container hero-produto__grade">
        {BETA.ativo && (
          <p className="aviso-pilula hero-produto__aviso">
            {lancou ? (
              // Um selo só, no lugar do selo mais a frase (auditoria de 21/10/2026, P2-6).
              <EtiquetaLancamento lancamento={program.launchAt} rotulo={`Beta gratuita para ${BETA.sistemaDoLancamento}`} />
            ) : (
              <>
                <EtiquetaLancamento lancamento={program.launchAt} variante="curta" />
                <span>Beta gratuita. Download a partir de {diaPorExtenso(program.launchAt)}.</span>
              </>
            )}
          </p>
        )}

        <h1 id="hero-titulo" className="hero-produto__titulo">
          <span className="hero-produto__leve">{HERO.tituloLeve}</span>{' '}
          <span className="hero-produto__forte">{tituloForte}</span>
        </h1>

        <div className="hero-produto__apoio">
          {/* Para quem é vem primeiro, mais claro; o que ele faz, logo depois. */}
          <p className="hero-produto__lead">
            <span className="hero-produto__publico">{HERO.publico}</span> {HERO.lead}
          </p>

          {/* data-sticky-hide: enquanto estes botões estão na tela, a barra fixa
              de chamada do celular fica escondida (StickyCta). */}
          <div className="hero-produto__acoes" data-sticky-hide>
            {BETA.ativo ? (
              <Button to={lancou ? '/baixar' : BETA_CTA.to} size="lg" chamada>
                {lancou ? 'Baixar grátis' : BETA_CTA.label}
              </Button>
            ) : (
              <Button to="/planos" size="lg" chamada>
                {HERO.primary}
              </Button>
            )}
            <Button to="/como-funciona" size="lg" variant="secondary">
              {HERO.secondary}
            </Button>
          </div>

          <ul className="hero-produto__fatos" aria-label="Em resumo">
            {HERO.fatos.map((fato) => (
              <li key={fato}>{fato}</li>
            ))}
            <li>{PLATFORMS.short}</li>
          </ul>
        </div>
      </div>
    </section>
  )
}

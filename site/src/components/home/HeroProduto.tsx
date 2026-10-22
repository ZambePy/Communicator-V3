import { Button } from '@/components/ui/Button'
import { CampoDeCalibracao } from '@/components/v3/CampoDeCalibracao'
import { EtiquetaLancamento } from '@/components/ui/EtiquetaLancamento'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { diaPorExtenso } from '@/lib/lancamento'
import { BETA, BETA_CTA, HERO, PLATFORMS } from '@/data/content'
import './hero-produto.css'

/**
 * Abertura da home. Composição editorial, sem efeito: no computador, o título
 * grande à esquerda e, à direita, alinhados pela base dele, o parágrafo, as
 * duas chamadas e os três fatos; no celular, uma coluna. O fundo é o marinho
 * da marca, chapado. O visual da abertura é o produto de verdade: a gravação
 * do app no monitor (Capitulos), que começa logo abaixo e já aparece, pelo
 * topo, na primeira tela.
 *
 * Rodada 3 (21/10/2026): a abertura tinha grade, feixe de luz, o nome gigante
 * atrás do título e um olho de partículas, ocupando a tela toda. O dono viu e
 * recusou (21/10/2026, "parece feito por IA"): tudo isso saiu, e a altura
 * deixou de ser a da tela.
 *
 * Efeitos de fundo e de movimento (pedido do dono, 21/10/2026, depois de
 * aprovar este desenho: "só falta o efeito de fundo e mais animações"). Atrás
 * do texto, o campo dos 13 pontos da calibração, quase invisível
 * (CampoDeCalibracao); no título, "tem voz" se fecha da esquerda para a direita
 * como o anel de fixação (hero-produto.css), uma vez. Nada disso muda o texto,
 * a composição ou as cores.
 *
 * O título mistura os pesos com sentido: "Seu olhar" leve (Inter 400) e
 * "tem voz" pesado (Sora 700) — o olhar é leve, a voz pesa. O h1 continua
 * sendo a frase inteira para o leitor de tela e para a busca.
 *
 * As colunas (5 : 7) são as mesmas de Capitulos, logo abaixo: o parágrafo e
 * as chamadas começam na mesma linha vertical que o monitor.
 */
export function HeroProduto() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const tituloForte = HERO.title.slice(HERO.tituloLeve.length).trim()

  return (
    <section className="hero-produto" aria-labelledby="hero-titulo">
      <CampoDeCalibracao />
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

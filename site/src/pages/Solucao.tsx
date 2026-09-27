import { PageHead } from '@/components/layout/PageHead'
import { ExploradorDeModulos } from '@/components/produto/ExploradorDeModulos'
import { Capitulo, Detalhe, Recursos } from '@/components/pagina/Blocos'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Comparison } from '@/components/sections/Comparison'
import { CallToAction } from '@/components/sections/CallToAction'
import { Button } from '@/components/ui/Button'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { BETA, BETA_CTA } from '@/data/content'
import { ADOCAO, DECISOES, LIMITES, MODULOS_EM_TELA } from '@/data/produto'
import './solucao.css'

/**
 * /solucao — o produto. A abertura já é o app: a lista de módulos com a tela
 * de verdade de cada um. Depois, as decisões que pesam no dia a dia, o apoio
 * na instalação e o comparativo honesto, com o que ainda falta.
 */
export default function Solucao() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)

  return (
    <>
      <PageHead
        eyebrow="IrisFlow Communicator"
        title="Tudo o que a pessoa precisa, pelo olhar."
        highlight={['olhar.']}
        lead="Escrever e falar, usar o computador inteiro, conversar com a família e pedir ajuda. Um app no computador, com a webcam que já existe."
        visual={<ExploradorDeModulos modulos={MODULOS_EM_TELA} />}
      >
        {BETA.ativo && !lancou ? (
          <Button to={BETA_CTA.to}>{BETA_CTA.label}</Button>
        ) : (
          <Button to="/baixar">Baixar grátis</Button>
        )}
        <Button to="/planos" variant="ghost">
          Ver os planos
        </Button>
      </PageHead>

      <section className="faixa on-light" aria-labelledby="decisoes-titulo">
        <div className="container">
          <Capitulo
            id="decisoes-titulo"
            titulo="Seis decisões que fazem diferença no dia a dia."
            texto="Cada uma responde a um problema que aparece em casa: cansaço, postura, luz ruim, internet instável e privacidade."
          />
          <Recursos itens={DECISOES} />
        </div>
      </section>

      <section className="faixa on-dark" aria-labelledby="adocao-titulo">
        <AmbientBackground variante="suave" />
        <div className="container">
          <Capitulo
            id="adocao-titulo"
            titulo="Ninguém fica sozinho na instalação."
            texto="Tecnologia assistiva costuma ir para a gaveta por falta de apoio, não por defeito. Por isso o primeiro uso faz parte do produto."
          />
          <Recursos itens={ADOCAO} colunas={4} />
        </div>
      </section>

      <div className="on-light">
        <Comparison>
          <Detalhe resumo="O que o IrisFlow ainda não entrega">
            <ul className="solucao__limites">
              {LIMITES.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Detalhe>
        </Comparison>
      </div>

      <CallToAction />
    </>
  )
}

import { PageHead } from '@/components/layout/PageHead'
import { ExploradorDeModulos } from '@/components/produto/ExploradorDeModulos'
import { Capitulo, Detalhe, Recursos } from '@/components/pagina/Blocos'
import { Comparison } from '@/components/sections/Comparison'
import { CallToAction } from '@/components/sections/CallToAction'
import { Button } from '@/components/ui/Button'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { BETA, BETA_CTA } from '@/data/content'
import { ADOCAO, DECISOES, LIMITES, MODULOS_EM_TELA } from '@/data/produto'
import './solucao.css'
import { FundoDaPagina } from '@/components/layout/FundoDaPagina'

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
      <FundoDaPagina />
      <PageHead
        title="Escrever, falar e pedir ajuda só com o olhar."
        lead="O IrisFlow Communicator é um aplicativo para Windows. Ele usa a webcam do computador para a pessoa escrever, falar em voz alta, usar o computador e chamar quem cuida."
        visual={<ExploradorDeModulos modulos={MODULOS_EM_TELA} />}
      >
        {BETA.ativo && !lancou ? (
          <Button to={BETA_CTA.to} chamada>
            {BETA_CTA.label}
          </Button>
        ) : (
          <Button to="/baixar" chamada>
            Baixar grátis
          </Button>
        )}
        <Button to="/planos" variant="ghost">
          Ver os planos
        </Button>
      </PageHead>

      <section className="faixa on-raised" aria-labelledby="decisoes-titulo">
        <div className="container">
          <Capitulo
            id="decisoes-titulo"
            titulo="Pensado para o dia a dia em casa."
            texto="Cansaço, postura, luz ruim, internet instável: cada detalhe responde a um problema real."
          />
          <Recursos itens={DECISOES} />
        </div>
      </section>

      <section className="faixa on-dark" aria-labelledby="adocao-titulo">
        <div className="container">
          <Capitulo
            id="adocao-titulo"
            titulo="Ninguém fica sozinho na instalação."
            texto="Tecnologia assistiva costuma ir para a gaveta por falta de apoio, não por defeito. Por isso o primeiro uso faz parte do produto."
          />
          <Recursos itens={ADOCAO} colunas={4} />
        </div>
      </section>

      <div className="on-raised">
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

      <CallToAction
        titulo="Veja no seu computador."
        texto="Baixe a beta, faça a calibração e veja se funciona no seu caso. É grátis e não pede cartão."
      />
    </>
  )
}

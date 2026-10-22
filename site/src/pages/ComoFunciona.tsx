import { Link } from 'react-router-dom'
import { PageHead } from '@/components/layout/PageHead'
import { PassosComTela, Estagios } from '@/components/produto/Passos'
import { Capitulo, Detalhe, Recursos } from '@/components/pagina/Blocos'
import { Reveal } from '@/components/effects/Reveal'
import { DwellDemo } from '@/components/sections/DwellDemo'
import { CalibracaoAoVivo } from '@/components/produto/CalibracaoAoVivo'
import { CallToAction } from '@/components/sections/CallToAction'
import { EscritaPeloOlhar } from '@/components/home/olhar/EscritaPeloOlhar'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { BETA, BETA_CTA, BRAND, SEGMENTS } from '@/data/content'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { ESCRITA_PELO_OLHAR, ESTAGIOS, PASSOS_DO_PRIMEIRO_USO, TRAVAS, TRES_PERGUNTAS } from '@/data/produto'
import './como-funciona.css'
import { FundoDaPagina } from '@/components/layout/FundoDaPagina'

/**
 * /como-funciona — do primeiro uso à seleção pelo olhar. A abertura mostra os
 * quatro passos com as telas de verdade; depois vêm o caminho do vídeo até o
 * clique, o teclado escrevendo com o olhar (que veio da abertura da home na
 * rodada 3, 21/10/2026: lá voltou a gravação real), a calibração ponto a
 * ponto (uma vez, quando chega à tela), a prancha para experimentar, as
 * travas contra o clique sem querer e para quem o IrisFlow serve.
 */
export default function ComoFunciona() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  return (
    <>
      <FundoDaPagina />
      <PageHead
        title="Do olhar à voz, em quatro passos."
        lead="O primeiro uso leva poucos minutos. Tudo o que a câmera vê fica no computador."
        visual={<PassosComTela passos={PASSOS_DO_PRIMEIRO_USO} />}
      />

      <section className="faixa on-raised" aria-labelledby="estagios-titulo">
        <div className="container">
          <Capitulo
            id="estagios-titulo"
            titulo="Como o olhar vira clique."
            texto="Seis etapas, dezenas de vezes por segundo, todas dentro do computador."
          />
          <Estagios itens={ESTAGIOS} />
          <div className="como__tecnico">
            <Detalhe resumo="Para quem quer o detalhe técnico">
              <p>
                O rosto e a íris são localizados com o MediaPipe, e uma rede neural de pesquisa, a
                L2CS-Net, calcula o ângulo do olhar. Um modelo por olho, ajustado na calibração,
                estima o ponto da tela; depois vêm as compensações de postura, a correção dos
                cantos e um filtro que segura o cursor sem atrasá-lo.
              </p>
              <p>
                Na medição de referência da equipe, com essa rede, o erro médio ficou em 1,40°, ou
                cerca de 1,5 cm na tela, a 60 cm. Trabalhos publicados com webcam ficam, em geral,
                entre 2,4° e 4,2°. Foi uma medição com um só operador, em ambiente controlado. A
                versão atual da beta, com os ajustes mais recentes do rastreamento, ainda vai ser
                medida.
              </p>
              <p>
                <a href={BRAND.code} target="_blank" rel="noopener noreferrer" className="link-seta">
                  Código, protocolo e medições no GitHub
                  <span className="sr-only"> (abre em outra aba)</span>
                </a>
              </p>
            </Detalhe>
          </div>
        </div>
      </section>

      <section className="faixa on-dark como__escrita" aria-labelledby="escrita-titulo">
        <div className="container como__escrita-grade">
          <div>
            <h2 id="escrita-titulo" className="titulo-capitulo">
              {ESCRITA_PELO_OLHAR.titulo}
            </h2>
            <p className="texto-capitulo">{ESCRITA_PELO_OLHAR.texto}</p>
          </div>
          <figure className="como__teclado">
            <EscritaPeloOlhar />
          </figure>
        </div>
      </section>

      <section className="faixa on-raised" aria-labelledby="calibracao-titulo">
        <div className="container calib-faixa__grade">
          <div>
            <h2 id="calibracao-titulo" className="titulo-capitulo">
              Treze pontos, cerca de um minuto.
            </h2>
            <p className="texto-capitulo">
              A pessoa só acompanha com os olhos o alvo que anda pela tela. Em cada ponto ele encolhe, para
              o olhar firmar no meio dele.
            </p>
            <p className="calib-faixa__nota">
              A ordem dos pontos não é a de leitura. Ela é escolhida para que um movimento lento da
              cabeça não seja confundido com o olhar. No fim, o resultado vem em palavras.
            </p>
          </div>
          <CalibracaoAoVivo />
        </div>
      </section>

      <div className="on-dark como__demo">
        <DwellDemo />
      </div>

      <section className="faixa on-raised" aria-labelledby="travas-titulo">
        <div className="container">
          <Capitulo
            id="travas-titulo"
            titulo="Quatro travas contra o clique sem querer."
            texto="A meta é menos de um clique sem querer por hora. Ainda não medimos isso em uso contínuo: fica para o programa de validação."
          />
          <Recursos itens={TRAVAS} colunas={4} />
        </div>
      </section>

      <section className="faixa on-dark" id="para-quem" aria-labelledby="para-quem-titulo">
        <div className="container">
          <Capitulo
            id="para-quem-titulo"
            titulo="Para quem o IrisFlow serve."
            texto="Condições diferentes, o mesmo canal: o olhar. O que muda é o ritmo, o vocabulário e o cuidado na avaliação."
          />
          <ul className="condicoes">
            {SEGMENTS.map((s, i) => (
              <Reveal key={s.id} as="li" anim="up" delay={60 * i} className="condicoes__item" id={`para-${s.id}`}>
                <span className="condicoes__icone">
                  <Icon name={s.icon} size={22} />
                </span>
                <h3 className="condicoes__titulo">{s.title}</h3>
                <p className="condicoes__texto">{s.fit}</p>
                <p className="condicoes__cuidado">
                  <Icon name="info" size={16} />
                  <span>{s.caveat}</span>
                </p>
              </Reveal>
            ))}
            <Reveal as="li" anim="up" delay={60 * SEGMENTS.length} className="condicoes__item condicoes__item--outra">
              <h3 className="condicoes__titulo">Outra condição?</h3>
              <p className="condicoes__texto">
                Distrofias musculares, síndrome do encarceramento e outros quadros com o olhar
                preservado também podem funcionar. Conte o caso.
              </p>
              <Link to="/contato" className="link-seta">
                Falar com a equipe
              </Link>
            </Reveal>
          </ul>

          <div className="como__perguntas">
            <Reveal anim="up">
              <h3 className="como__perguntas-titulo">Três perguntas antes de instalar</h3>
              <p className="como__perguntas-texto">
                Se a resposta for sim para as três, vale testar, de graça, com a webcam que já está
                em casa.
              </p>
            </Reveal>
            <Recursos itens={TRES_PERGUNTAS} numerar nivel={4} />
            <Reveal anim="up" className="como__perguntas-acoes">
              {/* Antes do lançamento, a inscrição; depois, o download (como na Solução). */}
              {BETA.ativo && !lancou ? (
                <Button to={BETA_CTA.to} chamada>
                  {BETA_CTA.label}
                </Button>
              ) : (
                <Button to="/baixar" chamada>
                  Baixar grátis
                </Button>
              )}
              <Link to="/contato" className="link-seta">
                Ficou em dúvida? A equipe responde caso a caso
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      <CallToAction
        titulo="Leva poucos minutos para testar."
        texto="Instale, calibre e escreva a primeira frase com o olhar. É grátis na beta e não pede cartão."
      />
    </>
  )
}

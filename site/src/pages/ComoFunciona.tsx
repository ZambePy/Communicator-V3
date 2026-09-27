import { Link } from 'react-router-dom'
import { PageHead } from '@/components/layout/PageHead'
import { PassosComTela, Estagios } from '@/components/produto/Passos'
import { Capitulo, Detalhe, Recursos } from '@/components/pagina/Blocos'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { DwellDemo } from '@/components/sections/DwellDemo'
import { CallToAction } from '@/components/sections/CallToAction'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { BETA, BETA_CTA, BRAND, SEGMENTS } from '@/data/content'
import { ESTAGIOS, PASSOS_DO_PRIMEIRO_USO, TRAVAS, TRES_PERGUNTAS } from '@/data/produto'
import './como-funciona.css'

/**
 * /como-funciona — do primeiro uso à seleção pelo olhar. A abertura mostra os
 * quatro passos com as telas de verdade; depois vêm o caminho do vídeo até o
 * clique, a prancha para experimentar, as travas contra o clique sem querer e
 * para quem o IrisFlow serve.
 */
export default function ComoFunciona() {
  return (
    <>
      <PageHead
        eyebrow="Como funciona"
        title="Do olhar à voz, em quatro passos."
        highlight={['voz,']}
        lead="Instalar, preparar, calibrar e falar. O primeiro uso leva poucos minutos, e nada do que a câmera vê sai do computador."
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
                O rosto e a íris são localizados com o MediaPipe. Um modelo por olho, ajustado na
                calibração, estima o ponto da tela; depois vêm as compensações de postura, a
                correção dos cantos e um filtro que segura o cursor sem atrasá-lo.
              </p>
              <p>
                Na medição de referência da equipe, com o modelo de pesquisa, o erro médio ficou em
                1,40° — cerca de 1,5 cm na tela, a 60 cm. Trabalhos publicados com webcam ficam,
                em geral, entre 2,4° e 4,2°. Foi uma medição com um só operador, em ambiente
                controlado; a versão da beta, que roda sem o modelo de pesquisa, ainda vai ser
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

      <div className="on-dark como__demo">
        <DwellDemo />
      </div>

      <section className="faixa on-raised" aria-labelledby="travas-titulo">
        <div className="container">
          <Capitulo
            id="travas-titulo"
            titulo="Quatro travas contra o clique sem querer."
            texto="A meta é menos de um acionamento acidental por hora. A medição em uso contínuo vem com o programa de validação."
          />
          <Recursos itens={TRAVAS} colunas={4} />
        </div>
      </section>

      <section className="faixa on-dark" id="para-quem" aria-labelledby="para-quem-titulo">
        <AmbientBackground variante="suave" />
        <div className="container">
          <Capitulo
            id="para-quem-titulo"
            titulo="Para quem é."
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
                Se a resposta for sim para as três, vale testar — de graça, com a webcam que já está
                em casa.
              </p>
            </Reveal>
            <Recursos itens={TRES_PERGUNTAS} numerar />
            <Reveal anim="up" className="como__perguntas-acoes">
              <Button to={BETA.ativo ? BETA_CTA.to : '/baixar'}>{BETA.ativo ? BETA_CTA.label : 'Baixar grátis'}</Button>
              <Link to="/contato" className="link-seta">
                Ficou em dúvida? A equipe responde caso a caso
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      <CallToAction />
    </>
  )
}

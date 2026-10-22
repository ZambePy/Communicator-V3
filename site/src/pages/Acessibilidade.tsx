import { PageHead } from '@/components/layout/PageHead'
import { Capitulo, Recursos } from '@/components/pagina/Blocos'
import { Reveal } from '@/components/effects/Reveal'
import { DwellTarget } from '@/components/effects/DwellTarget'
import { CallToAction } from '@/components/sections/CallToAction'
import { A11Y_PRINCIPLES } from '@/data/content'
import { FundoDaPagina } from '@/components/layout/FundoDaPagina'

const COMPROMISSOS_DO_SITE = [
  { titulo: 'Contraste alto', texto: 'Entre texto e fundo, e nenhum texto essencial em corpo pequeno.' },
  { titulo: 'Foco sempre visível', texto: 'Todo elemento interativo mostra um contorno de três pixels.' },
  { titulo: 'Teclado de ponta a ponta', texto: 'Com atalho para pular direto ao conteúdo.' },
  { titulo: 'Menos movimento, se você pedir', texto: 'Com a preferência do sistema ligada, o site fica parado.' },
  { titulo: 'Leitores de tela', texto: 'Marcação semântica, com rótulos e regiões anunciados.' },
  { titulo: 'Nada só por cor', texto: 'Alvos de toque generosos e hierarquia visual explícita.' },
]

/** /acessibilidade — os princípios das telas, para experimentar, e o que o site cumpre. */
export default function Acessibilidade() {
  return (
    <>
      <FundoDaPagina />
      <PageHead
        title="Quatro regras que valem em todas as telas."
        lead="Quem usa o olhar não tem mouse nem barra do sistema para se orientar. Por isso o app e este site seguem quatro regras."
      />

      <section className="faixa on-raised" aria-label="Os quatro princípios">
        <div className="container">
          <Recursos
            itens={A11Y_PRINCIPLES.map((p) => ({ titulo: p.title, texto: p.text }))}
            colunas={4}
            numerar
            nivel={2}
          />
        </div>
      </section>

      <section className="faixa on-dark" aria-labelledby="retorno-titulo">
        <div className="container">
          <Capitulo
            id="retorno-titulo"
            titulo="Experimente o aviso em três momentos."
            texto="Pare o cursor sobre um botão, ou chegue nele pela tecla Tab. O contorno aparece, a cor muda e o aro enche até confirmar."
          />
          <div className="grid grid--3">
            <Reveal anim="up">
              <DwellTarget label="Rápido" dwellMs={800} hint="0,8 s" />
            </Reveal>
            <Reveal anim="up" delay={80}>
              <DwellTarget label="Padrão" dwellMs={1500} hint="1,5 s" />
            </Reveal>
            <Reveal anim="up" delay={160}>
              <DwellTarget label="Confortável" dwellMs={2500} hint="2,5 s" />
            </Reveal>
          </div>
          <p className="aside-note">
            O padrão é 1,5 segundo. O tempo ideal muda com o cansaço e com a condição de cada pessoa,
            então o cuidador ajusta de 0,4 a 4 segundos.
          </p>
        </div>
      </section>

      <section className="faixa on-raised" aria-labelledby="site-titulo">
        <div className="container">
          <Capitulo id="site-titulo" titulo="O que este site cumpre." />
          <Recursos itens={COMPROMISSOS_DO_SITE} />
        </div>
      </section>

      <CallToAction
        titulo="Conte o que faltou."
        texto="Se alguma coisa neste site ou no app não funciona para você, escreva para a equipe. Corrigir acessibilidade vem antes de qualquer outro item."
        principal={{ label: 'Falar com a equipe', to: '/contato' }}
        secundario={false}
      />
    </>
  )
}

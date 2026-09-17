import { PageHead } from '@/components/layout/PageHead'
import { Reveal } from '@/components/effects/Reveal'
import { DwellTarget } from '@/components/effects/DwellTarget'
import { Card } from '@/components/ui/Card'
import { CallToAction } from '@/components/sections/CallToAction'
import { A11Y_PRINCIPLES } from '@/data/content'

export default function Acessibilidade() {
  return (
    <>
      <PageHead
        eyebrow="Acessibilidade"
        title="Quatro princípios que valem para todas as telas, sem exceção."
        highlight={['sem', 'exceção.']}
        lead="Não são recomendações: são requisitos de projeto, aplicados tanto ao produto quanto a este site. Quem navega por fixação não dispõe da barra do sistema operacional como referência, e a interface precisa compensar isso."
      />

      <section className="section">
        <div className="container">
          <div className="grid grid--2">
            {A11Y_PRINCIPLES.map((p, i) => (
              <Reveal key={p.n} anim="up" delay={i * 100}>
                <Card as="div">
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '2.6rem',
                      lineHeight: 1,
                      color: 'var(--ok)',
                    }}
                  >
                    {p.n}
                  </span>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <Reveal anim="fade">
            <span className="eyebrow">O retorno em três estágios</span>
          </Reveal>
          <Reveal anim="up">
            <h2 style={{ maxWidth: '22ch', marginBottom: 'var(--sp-4)' }}>
              Passe o cursor sobre os alvos abaixo, ou chegue até eles pela tecla Tab.
            </h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead" style={{ maxWidth: '70ch', marginBottom: 'var(--sp-6)' }}>
              Cada alvo mostra o contorno de destaque ao receber o olhar, muda de cor durante a
              seleção e completa um aro de progresso até confirmar. Compare os três tempos de
              fixação que o produto oferece.
            </p>
          </Reveal>

          <div className="grid grid--3">
            <Reveal anim="up" delay={100}>
              <DwellTarget label="Rápido" dwellMs={800} hint="800 ms" />
            </Reveal>
            <Reveal anim="up" delay={200}>
              <DwellTarget label="Padrão" dwellMs={1500} hint="1500 ms" />
            </Reveal>
            <Reveal anim="up" delay={300}>
              <DwellTarget label="Confortável" dwellMs={2500} hint="2500 ms" />
            </Reveal>
          </div>

          <Reveal anim="fade" delay={420}>
            <p
              style={{
                marginTop: 'var(--sp-5)',
                maxWidth: '84ch',
                fontSize: '0.95rem',
                color: 'var(--text-dim)',
                paddingLeft: 'var(--sp-5)',
                borderLeft: '2px solid var(--line)',
              }}
            >
              O tempo padrão de 1500 ms se mostrou adequado nos testes de usabilidade já
              realizados, mas a IrisFlow mantém as opções de 800 e 2500 ms porque o tempo ideal varia
              com a fadiga e com o estágio da condição.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container container--narrow">
          <Reveal anim="up">
            <h2>Compromissos deste site</h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <ul style={{ fontSize: '1rem' }}>
              <li>Contraste elevado entre texto e fundo, sem texto essencial em corpo reduzido.</li>
              <li>Foco visível em todo elemento interativo, com contorno de três pixels.</li>
              <li>Navegação completa por teclado, com atalho para pular direto ao conteúdo.</li>
              <li>
                Todas as animações respeitam a preferência de movimento reduzido do sistema
                operacional. Quando ela está ativa, o site fica estático.
              </li>
              <li>Marcação semântica, com rótulos e regiões anunciados a leitores de tela.</li>
              <li>
                Alvos de toque generosos, hierarquia visual explícita e nenhuma informação
                transmitida apenas por cor.
              </li>
            </ul>
          </Reveal>
          <Reveal anim="fade" delay={240}>
            <p style={{ fontSize: '0.95rem', color: 'var(--text-dim)' }}>
              Encontrou uma barreira? Escreva para irisflowteam@gmail.com. Corrigir acessibilidade
              é prioridade acima de qualquer item do roteiro.
            </p>
          </Reveal>
        </div>
      </section>

      <CallToAction />
    </>
  )
}

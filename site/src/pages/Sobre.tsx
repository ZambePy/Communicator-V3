import { PageHead } from '@/components/layout/PageHead'
import { Reveal } from '@/components/effects/Reveal'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { CallToAction } from '@/components/sections/CallToAction'
import { Logo } from '@/components/layout/Logo'
import {
  VALUES,
  ROADMAP,
  TEAM,
  COMMITMENTS,
  SDGS,
  CODE_POSITION,
  BRAND,
} from '@/data/content'
import './sobre.css'

const ROLES: Record<string, string> = {
  'Concluído': 'tag--ok',
  'Em realização': 'tag--wip',
  'Próxima tarefa': 'tag--wip',
  Pendente: 'tag--neutral',
}

export default function Sobre() {
  return (
    <>
      <PageHead
        eyebrow="A empresa"
        title="A IrisFlow existe para que uma pessoa com ELA, AVC ou tetraplegia continue falando com a própria família."
        highlight={['continue falando']}
        lead="Somos três pessoas construindo um comunicador por olhar para quem perdeu a fala e o movimento das mãos e ainda controla os olhos. A restrição que definiu todo o produto: funcionar na webcam que a família já tem, sem equipamento dedicado, com os dados do rosto processados no próprio computador. Tudo o que está nesta página pode ser conferido no produto, nas telas ou no plano de negócios."
      />

      {/* --- quem faz --- */}
      <section className="section">
        <div className="container">
          <Reveal anim="fade">
            <span className="eyebrow">A equipe</span>
          </Reveal>
          <Reveal anim="up">
            <h2 style={{ maxWidth: '28ch', marginBottom: 'var(--sp-4)' }}>
              Três sócios fundadores. Quem responde o e-mail é quem escreve o código.
            </h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead" style={{ maxWidth: '68ch', marginBottom: 'var(--sp-7)' }}>
              A equipe é pequena, e por enquanto isso é uma vantagem: entre a família que relata
              uma dificuldade e a pessoa que muda o programa não existe nenhuma camada no meio.
            </p>
          </Reveal>

          <ul className="team">
            {TEAM.map((person, i) => (
              <Reveal key={person.name} anim="right" delay={i * 90} as="li">
                <div className="team__row">
                  <div>
                    <h3 className="team__name">{person.name}</h3>
                    <p className="team__role">{person.role}</p>
                  </div>
                  <p className="team__text">{person.text}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* --- valores --- */}
      <section className="section">
        <div className="container">
          <Reveal anim="fade">
            <span className="eyebrow">Valores</span>
          </Reveal>
          <Reveal anim="up">
            <h2 style={{ maxWidth: '26ch', marginBottom: 'var(--sp-4)' }}>
              Cada valor aqui corresponde a uma decisão de produto já tomada.
            </h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead" style={{ maxWidth: '70ch', marginBottom: 'var(--sp-7)' }}>
              Não são declarações genéricas: dá para conferir cada uma nas telas do produto.
            </p>
          </Reveal>

          <div className="grid grid--3">
            {VALUES.map((v, i) => (
              <Reveal key={v.title} anim="up" delay={i * 80}>
                <Card as="div">
                  <h3>{v.title}</h3>
                  <p>{v.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* --- compromissos e Agenda 2030 --- */}
      <section className="section">
        <div className="container">
          <Reveal anim="fade">
            <span className="eyebrow">Compromissos</span>
          </Reveal>
          <Reveal anim="up">
            <h2 style={{ maxWidth: '30ch', marginBottom: 'var(--sp-4)' }}>
              Democratizar a comunicação por olhar no Brasil.
            </h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead" style={{ maxWidth: '70ch', marginBottom: 'var(--sp-7)' }}>
              Hoje, um sistema de comunicação por rastreamento ocular custa entre R$ 15 mil e
              R$ 80 mil e depende de revenda física — fora do alcance da maior parte das famílias
              brasileiras que convivem com ELA, tetraplegia, sequela de AVC ou paralisia cerebral.
              A IrisFlow existe para que essa tecnologia assistiva caiba numa assinatura mensal e
              rode no computador que já está em casa. É por isso que cada compromisso abaixo é
              verificável no produto, e não uma frase de apresentação.
            </p>
          </Reveal>

          <div className="grid grid--2">
            {COMMITMENTS.map((c, i) => (
              <Reveal key={c.title} anim="up" delay={i * 90}>
                <Card as="div">
                  <CardIcon tone={i % 2 === 0 ? 'teal' : 'blue'}>
                    <Icon name={c.icon} size={26} />
                  </CardIcon>
                  <h3>{c.title}</h3>
                  <p>{c.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal anim="fade" delay={320}>
            <div className="sdg">
              <p className="sdg__intro">
                A operação se conecta a quatro dos dezessete Objetivos de Desenvolvimento
                Sustentável da Agenda 2030 da ONU.
              </p>
              <div className="sdg__grid">
                {SDGS.map((o) => (
                  <div key={o.n}>
                    <span className="sdg__n">ODS {o.n}</span>
                    <h3 className="sdg__title">{o.title}</h3>
                    <p className="sdg__text">{o.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* --- estágio do projeto --- */}
      <section className="section">
        <div className="container">
          <Reveal anim="fade">
            <span className="eyebrow">Estágio do projeto</span>
          </Reveal>
          <Reveal anim="up">
            <h2 style={{ maxWidth: '24ch', marginBottom: 'var(--sp-6)' }}>
              O que já está pronto, o que está em construção e o que ainda falta.
            </h2>
          </Reveal>

          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--sp-4)' }}>
            {ROADMAP.map((r, i) => (
              <Reveal key={r.title} anim="right" delay={i * 90} as="li">
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--sp-5)',
                    padding: 'var(--sp-5)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--r-lg)',
                    background: 'var(--surface)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className={`tag ${ROLES[r.when] ?? 'tag--neutral'}`} style={{ flex: 'none' }}>
                    {r.when}
                  </span>
                  <div style={{ flex: '1 1 320px' }}>
                    <h3 style={{ fontSize: '1.14rem', marginBottom: '6px' }}>{r.title}</h3>
                    <p style={{ margin: 0, fontSize: '0.97rem' }}>{r.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* --- posição sobre o código: mudou na virada comercial, e é melhor dizer --- */}
      <section className="section section--tight">
        <div className="container">
          <Reveal anim="fade">
            <span className="eyebrow">Código-fonte</span>
          </Reveal>
          <Reveal anim="up">
            <h2 style={{ maxWidth: '24ch', marginBottom: 'var(--sp-4)' }}>{CODE_POSITION.title}</h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead" style={{ maxWidth: '68ch', marginBottom: 'var(--sp-6)' }}>
              {CODE_POSITION.lead}
            </p>
          </Reveal>

          <div className="grid grid--2">
            <Reveal anim="right" delay={160}>
              <Card as="div">
                <CardIcon tone="blue">
                  <Icon name="cadeado" size={26} />
                </CardIcon>
                <h3>{CODE_POSITION.closed.title}</h3>
                <p>{CODE_POSITION.closed.text}</p>
              </Card>
            </Reveal>
            <Reveal anim="left" delay={160}>
              <Card as="div">
                <CardIcon tone="teal">
                  <Icon name="cadeado-aberto" size={26} />
                </CardIcon>
                <h3>{CODE_POSITION.open.title}</h3>
                <p>{CODE_POSITION.open.text}</p>
                <a
                  href={BRAND.repo}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline-grow"
                  style={{ color: 'var(--ok)', fontWeight: 600 }}
                >
                  Ver a {BRAND.repoLabel}
                </a>
              </Card>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container container--narrow center">
          <Reveal anim="zoom">
            <div style={{ display: 'grid', placeItems: 'center', gap: 'var(--sp-4)' }}>
              <Logo variant="full" size="lg" link={false} />
              <h2 style={{ maxWidth: '20ch' }}>{BRAND.tagline}</h2>
              <p className="lead" style={{ maxWidth: '58ch' }}>
                Se você chegou até esta página, provavelmente é por causa de alguém. Escreva e
                conte o caso: quem responde somos nós três.
              </p>
              <a
                href={`mailto:${BRAND.email}`}
                className="underline-grow"
                style={{ color: 'var(--ok)', fontWeight: 600 }}
              >
                {BRAND.email}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <CallToAction />
    </>
  )
}

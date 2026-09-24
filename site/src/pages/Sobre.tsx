import { PageHead } from '@/components/layout/PageHead'
import { Reveal } from '@/components/effects/Reveal'
import { Counter } from '@/components/effects/Counter'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Picture } from '@/components/ui/Picture'
import { Portrait } from '@/components/ui/Portrait'
import { CallToAction } from '@/components/sections/CallToAction'
import { Logo } from '@/components/layout/Logo'
import {
  VALUES,
  ROADMAP,
  TEAM,
  TEAM_PHOTO,
  ORIGIN,
  HUMAN,
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
        lead="Somos três pessoas construindo um comunicador por olhar para quem perdeu a fala e o movimento das mãos e ainda controla os olhos. A restrição que definiu todo o produto: funcionar na webcam que a família já tem, sem equipamento dedicado, com os dados do rosto processados no próprio computador."
      />

      {/* --- foto dos três + missão --- */}
      <section className="section section--tight about-hero">
        <div className="container">
          <Reveal anim="zoom" duration={1000}>
            <figure className="about-hero__figure">
              <Picture
                base={TEAM_PHOTO.base}
                alt={TEAM_PHOTO.alt}
                widths={[800, 1600]}
                sizes="(max-width: 1000px) 100vw, 960px"
                width={1600}
                height={1066}
                loading="eager"
                fetchPriority="high"
                className="about-hero__pic"
              />
              <figcaption className="about-hero__caption">
                <p className="about-hero__mission">{HUMAN.mission}</p>
                <p className="about-hero__who">
                  Giulia Calioni, Marcus Vinicius Duarte e Gabriel Zambe, fundadores da IrisFlow.
                </p>
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </section>

      {/* --- história de origem --- */}
      <section className="section origin">
        <div className="container origin__inner">
          <div>
            <Reveal anim="fade">
              <span className="eyebrow">Como começou</span>
            </Reveal>
            <Reveal anim="up">
              <h2 className="origin__title">{ORIGIN.title}</h2>
            </Reveal>
          </div>
          <div className="origin__text">
            {ORIGIN.paragraphs.map((p, i) => (
              <Reveal key={p.slice(0, 24)} anim="up" delay={100 + i * 90}>
                <p>{p}</p>
              </Reveal>
            ))}
          </div>
        </div>

        <div className="container">
          <ul className="impact">
            {ORIGIN.numbers.map((n, i) => (
              <Reveal key={n.label} anim="up" delay={160 + i * 90} as="li">
                <span className="impact__value">
                  <Counter value={n.value} suffix={n.suffix} decimals={'decimals' in n ? n.decimals : 0} />
                </span>
                <p className="impact__label">{n.label}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* --- quem faz --- */}
      <section className="section section--soft" id="equipe">
        <div className="container">
          <Reveal anim="fade">
            <span className="eyebrow">A equipe</span>
          </Reveal>
          <Reveal anim="up">
            <h2 className="section-title" style={{ '--title-w': '28ch' } as React.CSSProperties}>
              Três sócios fundadores. Quem responde o e-mail é quem escreve o código.
            </h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead section-lead" style={{ '--lead-w': '68ch' } as React.CSSProperties}>
              A equipe é pequena, e por enquanto isso é uma vantagem: entre a família que relata
              uma dificuldade e a pessoa que muda o programa não existe nenhuma camada no meio.
            </p>
          </Reveal>

          <ul className="team">
            {TEAM.map((person, i) => (
              <Reveal key={person.name} anim="up" delay={i * 110} as="li">
                <article className="member">
                  <Portrait photo={person.photo} alt={person.alt} size={180} />
                  <div className="member__body">
                    <h3 className="member__name">{person.name}</h3>
                    <p className="member__role">{person.role}</p>
                    <p className="member__line">{person.line}</p>
                    <p className="member__text">{person.text}</p>
                  </div>
                </article>
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
            <h2 className="section-title">
              Cada valor aqui corresponde a uma decisão de produto já tomada.
            </h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead section-lead">
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
            <h2 className="section-title" style={{ '--title-w': '30ch' } as React.CSSProperties}>
              {HUMAN.mission}
            </h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead section-lead">
              Hoje, um sistema de comunicação por rastreamento ocular custa entre R$ 15 mil e
              R$ 80 mil e depende de revenda física — fora do alcance da maior parte das famílias
              brasileiras que convivem com ELA, AVC, esclerose múltipla, lesão medular ou paralisia
              cerebral. A IrisFlow existe para que essa tecnologia assistiva caiba numa assinatura
              mensal e rode no computador que já está em casa. É por isso que cada compromisso
              abaixo é verificável no produto, e não uma frase de apresentação.
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
            <h2 className="section-title roadmap__title">
              O que já está pronto, o que está em construção e o que ainda falta.
            </h2>
          </Reveal>

          <ol className="roadmap">
            {ROADMAP.map((r, i) => (
              <Reveal key={r.title} anim="right" delay={i * 90} as="li">
                <div className="roadmap__item">
                  <span className={`tag ${ROLES[r.when] ?? 'tag--neutral'}`}>{r.when}</span>
                  <div className="roadmap__body">
                    <h3 className="roadmap__h">{r.title}</h3>
                    <p className="roadmap__text">{r.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* --- código aberto: o repositório do produto é público (GPL-3.0) --- */}
      <section className="section section--tight">
        <div className="container">
          <Reveal anim="fade">
            <span className="eyebrow">Código-fonte</span>
          </Reveal>
          <Reveal anim="up">
            <h2 className="section-title">{CODE_POSITION.title}</h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead section-lead section-lead--tight">
              {CODE_POSITION.lead}{' '}
              <a
                href={BRAND.code}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-grow link-ok"
              >
                Ver o código no GitHub
                <span className="sr-only"> (abre em outra aba)</span>
              </a>
            </p>
          </Reveal>

          <div className="grid grid--2">
            <Reveal anim="right" delay={160}>
              <Card as="div">
                <CardIcon tone="teal">
                  <Icon name="cadeado-aberto" size={26} />
                </CardIcon>
                <h3>{CODE_POSITION.what.title}</h3>
                <p>{CODE_POSITION.what.text}</p>
              </Card>
            </Reveal>
            <Reveal anim="left" delay={160}>
              <Card as="div">
                <CardIcon tone="blue">
                  <Icon name="escudo" size={26} />
                </CardIcon>
                <h3>{CODE_POSITION.why.title}</h3>
                <p>{CODE_POSITION.why.text}</p>
              </Card>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container container--narrow center">
          <Reveal anim="zoom">
            <div className="about-close">
              <Logo variant="full" tone="negativo" size="lg" link={false} />
              <h2 className="about-close__title">{BRAND.tagline}</h2>
              <p className="lead about-close__lead">
                Se você chegou até esta página, provavelmente é por causa de alguém. Escreva e
                conte o caso: quem responde somos nós três.
              </p>
              <a href={`mailto:${BRAND.email}`} className="underline-grow link-ok">
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

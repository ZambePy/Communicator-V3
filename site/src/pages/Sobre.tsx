import { PageHead } from '@/components/layout/PageHead'
import { Capitulo, Numeros, Recursos } from '@/components/pagina/Blocos'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Picture } from '@/components/ui/Picture'
import { Portrait } from '@/components/ui/Portrait'
import { CallToAction } from '@/components/sections/CallToAction'
import {
  BRAND,
  COMMITMENTS,
  HUMAN,
  ORIGIN,
  PROBLEM,
  ROADMAP,
  SDGS,
  TEAM,
  TEAM_PHOTO,
  VALUES,
} from '@/data/content'
import './sobre.css'

const SITUACAO: Record<string, string> = {
  Concluído: 'is-feito',
  'Em realização': 'is-agora',
  'Próxima tarefa': 'is-proximo',
  Pendente: 'is-depois',
}

/**
 * /sobre — a empresa. A foto dos três logo na abertura; depois por que isso
 * importa (a família inteira perde a conversa), o que a pesquisa mostrou,
 * de onde veio o projeto, quem faz, no que acreditamos e em que pé estamos.
 */
export default function Sobre() {
  return (
    <>
      <PageHead
        eyebrow="A empresa"
        title="Para nenhuma família ficar sem voz."
        highlight={['voz.']}
        lead="Somos três pessoas construindo a comunicação pelo olhar que cabe no computador que a família já tem — sem aparelho de dezenas de milhares de reais."
        visual={
          <figure className="sobre-foto">
            <Picture
              base={TEAM_PHOTO.base}
              alt={TEAM_PHOTO.alt}
              widths={[800, 1600]}
              sizes="(max-width: 1200px) 100vw, 1160px"
              width={1600}
              height={1066}
              loading="eager"
              fetchPriority="high"
              className="sobre-foto__imagem"
            />
            <figcaption className="sobre-foto__legenda">Giulia, Marcus e Gabriel, fundadores da IrisFlow.</figcaption>
          </figure>
        }
      />

      <section className="faixa on-raised" aria-labelledby="humano-titulo">
        <div className="container sobre-humano">
          <Reveal anim="up">
            <h2 id="humano-titulo" className="titulo-capitulo">
              {HUMAN.title}
            </h2>
            <ul className="sobre-humano__linhas">
              {HUMAN.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <blockquote className="sobre-relato">
              <p>{HUMAN.report}</p>
              <footer>{HUMAN.source}</footer>
            </blockquote>
          </Reveal>
        </div>
      </section>

      <section className="faixa on-dark" aria-labelledby="pesquisa-titulo">
        <AmbientBackground variante="suave" />
        <div className="container">
          <Capitulo
            id="pesquisa-titulo"
            titulo="O que ouvimos na pesquisa."
            texto="O preço, e não a tecnologia, é o que separa essas famílias da comunicação pelo olhar."
          />
          <Numeros
            itens={PROBLEM.stats.map((s) => ({
              valor: `${s.value.toLocaleString('pt-BR', { minimumFractionDigits: s.decimals })}${s.suffix}`,
              rotulo: s.label,
            }))}
          />
          <p className="sobre-nota">{PROBLEM.note}</p>
        </div>
      </section>

      <section className="faixa on-raised" id="equipe" aria-labelledby="origem-titulo">
        <div className="container">
          <div className="sobre-origem">
            <Reveal anim="up">
              <h2 id="origem-titulo" className="titulo-capitulo">
                {ORIGIN.title}
              </h2>
            </Reveal>
            <div className="sobre-origem__texto">
              {ORIGIN.paragraphs.map((p, i) => (
                <Reveal key={p.slice(0, 24)} anim="up" delay={80 * i}>
                  <p>{p}</p>
                </Reveal>
              ))}
            </div>
          </div>

          <ul className="sobre-equipe">
            {TEAM.map((pessoa, i) => (
              <Reveal key={pessoa.name} as="li" anim="up" delay={90 * i} className="sobre-equipe__pessoa">
                <Portrait photo={pessoa.photo} alt={pessoa.alt} size={132} />
                <h3 className="sobre-equipe__nome">{pessoa.name}</h3>
                <p className="sobre-equipe__papel">{pessoa.role}</p>
                <p className="sobre-equipe__linha">{pessoa.line}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="faixa on-dark" aria-labelledby="valores-titulo">
        <AmbientBackground variante="suave" />
        <div className="container">
          <Capitulo
            id="valores-titulo"
            titulo="No que a gente acredita."
            texto="Cada valor corresponde a uma decisão que já está nas telas do produto."
          />
          <Recursos itens={VALUES.map((v) => ({ titulo: v.title, texto: v.text }))} />

          <div className="sobre-compromissos">
            <Capitulo titulo="Compromissos que dá para conferir." />
            <Recursos
              itens={COMMITMENTS.map((c) => ({ icone: c.icon, titulo: c.title, texto: c.text }))}
              colunas={4}
            />
            <a href={BRAND.code} target="_blank" rel="noopener noreferrer" className="link-seta">
              Ver o código no GitHub
              <span className="sr-only"> (abre em outra aba)</span>
            </a>
          </div>

          <ul className="sobre-ods" aria-label="Objetivos de Desenvolvimento Sustentável da ONU">
            {SDGS.map((o) => (
              <li key={o.n}>
                <span className="sobre-ods__numero">ODS {o.n}</span>
                <span className="sobre-ods__titulo">{o.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="faixa on-raised" aria-labelledby="roteiro-titulo">
        <div className="container">
          <Capitulo
            id="roteiro-titulo"
            titulo="Em que pé estamos."
            texto="O que está pronto, o que está em andamento e o que ainda falta."
          />
          <ol className="roteiro">
            {ROADMAP.map((r, i) => (
              <Reveal key={r.title} as="li" anim="up" delay={70 * i} className={`roteiro__item ${SITUACAO[r.when] ?? ''}`}>
                <span className="roteiro__situacao">{r.when}</span>
                <h3 className="roteiro__titulo">{r.title}</h3>
                <p className="roteiro__texto">{r.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <CallToAction />
    </>
  )
}

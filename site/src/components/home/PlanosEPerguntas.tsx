import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Faq } from '@/components/sections/Faq'
import { Button } from '@/components/ui/Button'
import { useBetaProgram } from '@/hooks/useBetaProgram'
import { usePlans } from '@/hooks/usePlans'
import { BETA } from '@/data/content'
import { PERGUNTAS_DA_HOME, PLANOS_NA_HOME as P } from '@/data/home'
import './planos-e-perguntas.css'

/** dd/mm/aaaa no horário de Brasília (a data do fim da beta). */
export function dataCurta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

/** Quantos itens de cada plano aparecem na home (a lista inteira fica em /planos). */
const ITENS_NA_HOME = 3

/**
 * A beta, os planos e as perguntas (redesenho de 01/11/2026, pedido do dono:
 * o cartão pequeno com três quadradinhos de preço não apresentava nada). No
 * alto, a promessa da beta em tamanho de manchete, com o R$ 0 grande e um aro
 * que se fecha em volta do zero quando ele entra na tela. Embaixo, os três
 * planos inteiros (usePlans: o banco ou a reserva), com a frase, o preço
 * previsto, o que vem nele e o recomendado no azul da marca. Sem a beta, o
 * alto vira o título dos planos. Depois, as perguntas, com o título à
 * esquerda e a lista à direita.
 */
export function PlanosEPerguntas() {
  const program = useBetaProgram()
  const { plans } = usePlans()
  const ate = dataCurta(program.endsAt)

  return (
    <div className="planos-perguntas home-faixa home-faixa--elevada on-raised">
      <div className="container">
        <section className="plano-beta" aria-labelledby="plano-beta-titulo">
          <Reveal className="plano-beta__topo">
            <div className="plano-beta__chamada">
              <h2 id="plano-beta-titulo" className="plano-beta__titulo">
                {BETA.ativo ? P.tituloBeta : P.tituloSemBeta}
              </h2>
              <p className="plano-beta__texto">{BETA.ativo ? P.textoBeta : P.textoSemBeta}</p>
            </div>
            {BETA.ativo && (
              <p className="plano-beta__preco">
                <strong>
                  R$ <span className="plano-beta__zero">
                    0
                    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                      <circle cx="50" cy="50" r="46" pathLength={1} />
                    </svg>
                  </span>
                </strong>
                {ate && (
                  <span>
                    {P.ate} {ate}
                  </span>
                )}
              </p>
            )}
          </Reveal>

          <ul className="plano-beta__depois">
            {plans.map((p, i) => (
              <Reveal
                as="li"
                key={p.id}
                delay={i * 90}
                className={`plano-beta__plano${p.recommended ? ' is-recomendado' : ''}`}
              >
                <div className="plano-beta__cabeca">
                  <h3 className="plano-beta__nome">{p.name}</h3>
                  {p.recommended && <span className="plano-beta__selo">O recomendado</span>}
                </div>
                <p className="plano-beta__frase">{p.tagline}</p>
                <p className="plano-beta__linha-preco">
                  <strong className="plano-beta__valor">R$ {p.price}</strong>
                  <span className="plano-beta__mes">{P.porMes}</span>
                </p>
                {BETA.ativo && ate && <p className="plano-beta__agora">Grátis na beta, {P.ate} {ate}</p>}
                <ul className="plano-beta__itens">
                  {p.includes.slice(0, ITENS_NA_HOME).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="plano-beta__extra">
                  {p.devices}. {p.support}.
                </p>
                {p.note && <p className="plano-beta__nota">{p.note}</p>}
              </Reveal>
            ))}
          </ul>

          <Reveal className="plano-beta__acoes">
            {BETA.ativo && (
              <Button to="/beta" size="lg">
                Entrar na beta grátis
              </Button>
            )}
            <Link to="/planos" className="link-seta plano-beta__link">
              {P.link}
            </Link>
          </Reveal>
        </section>

        <div className="planos-perguntas__faq">
          <Faq perguntas={PERGUNTAS_DA_HOME} verTodas="/planos#perguntas" variante="coluna" />
        </div>
      </div>
    </div>
  )
}

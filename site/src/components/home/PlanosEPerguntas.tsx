import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Faq } from '@/components/sections/Faq'
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

/**
 * A beta e as perguntas, lado a lado (desenho de 31/10/2026). O cartão diz que
 * na beta tudo é grátis até a data do fim (beta_program.ends_at, com a reserva
 * do content.ts) e mostra os três preços previstos para depois (usePlans: o
 * banco ou a reserva). Sem a beta, o cartão vira os três preços. Ao lado, as
 * perguntas da home (Faq, em coluna).
 */
export function PlanosEPerguntas() {
  const program = useBetaProgram()
  const { plans } = usePlans()
  const ate = dataCurta(program.endsAt)

  return (
    <div className="planos-perguntas home-faixa home-faixa--elevada on-raised">
      <div className="container planos-perguntas__grade">
        <section aria-labelledby="plano-beta-titulo">
          <Reveal className="plano-beta">
          <h2 id="plano-beta-titulo" className="plano-beta__titulo">
            {BETA.ativo ? P.tituloBeta : P.tituloSemBeta}
          </h2>
          {BETA.ativo && (
            <p className="plano-beta__preco">
              <strong>R$ 0</strong>
              {ate && (
                <span>
                  {P.ate} {ate}
                </span>
              )}
            </p>
          )}
          <p className="plano-beta__texto">{BETA.ativo ? P.textoBeta : P.textoSemBeta}</p>
          <ul className="plano-beta__depois">
            {plans.map((p) => (
              <li key={p.id} className="plano-beta__plano">
                <span className="plano-beta__nome">{p.name}</span>
                <strong className="plano-beta__valor">R$ {p.price}</strong>
                <span className="plano-beta__mes">{P.porMes}</span>
              </li>
            ))}
          </ul>
          <Link to="/planos" className="link-seta plano-beta__link">
            {P.link}
          </Link>
          </Reveal>
        </section>

        <Faq perguntas={PERGUNTAS_DA_HOME} verTodas="/planos#perguntas" variante="coluna" />
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { usePlans } from '@/hooks/usePlans'
import { BETA, type PlanId } from '@/data/content'

/** O essencial de cada plano, em três linhas. A comparação inteira fica em /planos. */
const DESTAQUES: Partial<Record<PlanId, string[]>> = {
  essencial: ['Teclado, frases rápidas e voz', 'O Windows inteiro pelo olhar', 'Emergência e IrisFlow Cuidador'],
  completo: ['Tudo do Essencial', 'Lazer e bem-estar pelo olhar', 'Assistente de escrita e relatórios'],
  voz: ['Tudo do Completo', 'Clonagem da própria voz', 'Suporte dedicado'],
}

export function PlanosResumo() {
  const { plans } = usePlans()
  return (
    <section className="planos-resumo on-light" aria-labelledby="planos-resumo-titulo">
      <div className="container">
        <Reveal anim="up">
          <h2 id="planos-resumo-titulo" className="titulo-capitulo">
            {BETA.ativo ? 'Na beta, tudo é grátis.' : 'Um plano para cada momento.'}
          </h2>
          <p className="texto-capitulo">
            {BETA.ativo
              ? 'Sem cartão e sem cobrança durante o programa. Estes são os planos previstos para depois dele.'
              : 'Todos com 15 dias para testar antes de pagar e cancelamento a qualquer momento.'}
          </p>
        </Reveal>

        <div className="planos-resumo__grade">
          {plans.map((p, i) => (
            <Reveal key={p.id} anim="up" delay={80 * i} className={`plano-mini${p.recommended ? ' plano-mini--destaque' : ''}`}>
              <div className="plano-mini__topo">
                <h3 className="plano-mini__nome">{p.name}</h3>
                {p.recommended && <span className="plano-mini__selo">recomendado</span>}
              </div>
              <p className="plano-mini__preco">
                <span className="plano-mini__moeda">R$</span>
                <strong>{p.price}</strong>
                <span className="plano-mini__periodo">/mês</span>
              </p>
              <ul className="plano-mini__lista">
                {(DESTAQUES[p.id] ?? p.includes.slice(0, 3)).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <span className="plano-mini__aparelhos">{p.devices}</span>
            </Reveal>
          ))}
        </div>

        <Link to="/planos" className="link-seta planos-resumo__link">
          Comparar os planos
        </Link>
      </div>
    </section>
  )
}

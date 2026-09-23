import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchPlans } from '@/services/api'
import { cheapestPlan, getPlan as getPlanIn, PLANS, type Plan } from '@/data/content'

/**
 * Planos à venda, lidos da tabela `plans` do Supabase.
 *
 * Começa na reserva do content.ts e troca quando a consulta volta, então a
 * grade nunca fica em branco esperando o banco. Se a leitura falhar (sem
 * rede, sem .env.local, RLS), a reserva continua na tela — o preço lá pode
 * estar desatualizado, mas é melhor que uma página de planos vazia.
 *
 * O resultado bom é guardado no módulo, porque Hero, Pricing e ProblemSection
 * aparecem na mesma página e cada um chamaria o banco de novo. A falha NÃO é
 * guardada: `fetchPlans` devolve o próprio array `PLANS` quando cai na
 * reserva, e é por essa identidade que se distingue "veio do banco" de "não
 * veio" — a próxima montagem tenta outra vez.
 */

let cache: Plan[] | null = null
let pendente: Promise<Plan[]> | null = null

function carregar(): Promise<Plan[]> {
  if (cache) return Promise.resolve(cache)
  if (!pendente) {
    pendente = fetchPlans()
      .then((planos) => {
        if (planos !== PLANS) cache = planos
        return planos
      })
      .finally(() => {
        pendente = null
      })
  }
  return pendente
}

/** Só para os testes: esquece o que foi lido do banco. */
export function _resetPlansCache() {
  cache = null
  pendente = null
}

export type PlansState = {
  plans: Plan[]
  /** Mesma regra de `getPlan` do content.ts, aplicada à lista atual. */
  getPlan: (id: string | null | undefined) => Plan
  /** Menor preço da lista atual, para "a partir de R$ X". */
  cheapest: Plan
  /** Verdadeiro quando `plans` já é o que veio do banco, e não a reserva. */
  fromDatabase: boolean
  /** Verdadeiro enquanto a primeira consulta ao banco não voltou. */
  loading: boolean
}

export function usePlans(): PlansState {
  const [plans, setPlans] = useState<Plan[]>(() => cache ?? PLANS)
  const [loading, setLoading] = useState<boolean>(() => cache === null)

  useEffect(() => {
    let vivo = true

    carregar()
      .then((p) => {
        if (vivo) setPlans(p)
      })
      .catch(() => {
        /* fetchPlans nunca rejeita; se rejeitar, a reserva fica */
      })
      .finally(() => {
        if (vivo) setLoading(false)
      })

    return () => {
      vivo = false
    }
  }, [])

  const getPlan = useCallback((id: string | null | undefined) => getPlanIn(id, plans), [plans])
  const cheapest = useMemo(() => cheapestPlan(plans), [plans])

  return { plans, getPlan, cheapest, fromDatabase: plans !== PLANS, loading }
}

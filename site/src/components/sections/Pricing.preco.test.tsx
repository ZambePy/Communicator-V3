import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PLANS, type Plan } from '@/data/content'

/* Relato da auditoria de 21/10/2026: em /planos os preços ficavam em caixas em
   branco entre 5 e 12 s quando o banco falhava, e para sempre quando ele
   pendurava, embora a reserva (249, 399, 649) já estivesse na memória e o
   título da página dissesse "a partir de R$ 249". O preço aparece na hora; se
   o banco responder com outro valor, a troca é em silêncio. */

const { buscar } = vi.hoisted(() => ({ buscar: vi.fn() }))
vi.mock('@/services/api', async (importar) => ({
  ...(await importar<typeof import('@/services/api')>()),
  fetchPlans: buscar,
  fetchBetaProgram: () => new Promise(() => {}),
}))

import { Pricing } from './Pricing'
import { _resetPlansCache } from '@/hooks/usePlans'

const valores = () =>
  Array.from(document.querySelectorAll('.plans .plan__amount')).map((e) => e.textContent)

describe('<Pricing /> mostra a reserva enquanto o banco não responde', () => {
  beforeEach(() => {
    _resetPlansCache()
    buscar.mockReset()
  })
  afterEach(() => _resetPlansCache())

  it('banco pendurado: os três preços aparecem na hora, sem esqueleto', () => {
    buscar.mockReturnValue(new Promise(() => {}))
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    )
    expect(valores()).toEqual(['249', '399', '649'])
    expect(document.querySelector('.plan__amount-skeleton')).toBeNull()
    expect(screen.getAllByText('R$')).not.toHaveLength(0)
  })

  it('quando o banco responde com outro valor, o número troca sem esqueleto no meio', async () => {
    let responder!: (p: Plan[]) => void
    buscar.mockReturnValue(new Promise<Plan[]>((r) => (responder = r)))
    render(
      <MemoryRouter>
        <Pricing />
      </MemoryRouter>,
    )
    expect(valores()[0]).toBe('249')
    await act(async () => {
      responder(PLANS.map((p) => (p.id === 'essencial' ? { ...p, price: 259 } : p)))
    })
    expect(valores()).toEqual(['259', '399', '649'])
    expect(document.querySelector('.plan__amount-skeleton')).toBeNull()
  })
})

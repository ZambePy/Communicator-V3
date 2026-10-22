import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'

/* Auditoria de 21/10/2026 (P2-16): o cartão da beta em /planos mandava para a
   inscrição mesmo depois do lançamento, enquanto o resto do site manda baixar:
   dois caminhos para o mesmo download. Depois do lançamento, é "Baixar grátis". */

const { apiFake } = vi.hoisted(() => ({ apiFake: { programa: null as BetaProgram | null } }))
vi.mock('@/services/api', async (importar) => {
  const real = await importar<typeof import('@/services/api')>()
  return {
    ...real,
    fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA,
    fetchPlans: () => new Promise(() => {}),
  }
})

import { Pricing } from './Pricing'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'

const cartaoDaBeta = () => within(document.querySelector('.plan--beta') as HTMLElement)

describe('<Pricing /> o botão do cartão da beta', () => {
  beforeEach(() => esquecerBetaProgram())

  it('depois do lançamento: "Baixar grátis", em /baixar', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    render(<MemoryRouter><Pricing /></MemoryRouter>)
    expect(await cartaoDaBeta().findByRole('link', { name: 'Baixar grátis' })).toHaveAttribute('href', '/baixar')
    expect(screen.queryByRole('link', { name: 'Entrar na beta gratuita' })).toBeNull()
  })

  it('antes do lançamento: a inscrição, em /beta', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
    render(<MemoryRouter><Pricing /></MemoryRouter>)
    expect(await cartaoDaBeta().findByRole('link', { name: 'Entrar na beta gratuita' })).toHaveAttribute('href', '/beta')
  })
})

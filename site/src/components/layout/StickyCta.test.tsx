import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { StickyCta } from './StickyCta'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'

/* A barra fixa do celular segue o cabeçalho: antes do lançamento chama para a
   inscrição da beta; depois, para o download — e some em /baixar, que já é o
   destino. */

const { apiFake } = vi.hoisted(() => ({ apiFake: { programa: null as BetaProgram | null } }))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA }
})

function montar(rota = '/') {
  return render(
    <MemoryRouter initialEntries={[rota]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <StickyCta />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  esquecerBetaProgram()
  sessionStorage.clear()
})

describe('<StickyCta />', () => {
  it('antes do lançamento: "Entrar na beta gratuita", para a inscrição', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
    montar()
    expect(await screen.findByRole('link', { name: 'Entrar na beta gratuita' })).toHaveAttribute('href', '/beta')
  })

  it('depois do lançamento: "Baixar grátis", para /baixar', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    montar()
    expect(await screen.findByRole('link', { name: 'Baixar grátis' })).toHaveAttribute('href', '/baixar')
  })

  it('antes do lançamento, aparece em /baixar (o download ainda está travado)', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
    montar('/baixar')
    expect(await screen.findByRole('link', { name: 'Entrar na beta gratuita' })).toBeInTheDocument()
  })

  it('depois do lançamento, some em /baixar', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    const { container } = montar('/baixar')
    await new Promise((r) => setTimeout(r, 0))
    expect(container.querySelector('.sticky-cta')).toBeNull()
  })
})

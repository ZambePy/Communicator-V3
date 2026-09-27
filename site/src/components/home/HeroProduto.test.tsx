import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HeroProduto } from './HeroProduto'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'
import { BETA_CTA, HERO } from '@/data/content'

/* A abertura da home: antes do lançamento a chamada é a da beta, com o dia;
   depois, "Baixar grátis". E o produto de verdade num monitor, com pausa. */

const { apiFake } = vi.hoisted(() => ({ apiFake: { programa: null as BetaProgram | null } }))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA }
})

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <HeroProduto />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  esquecerBetaProgram()
})

describe('<HeroProduto />', () => {
  it('antes do lançamento: título, chamada da beta e o dia do download', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
    montar()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(HERO.title)
    expect(screen.getByRole('link', { name: BETA_CTA.label })).toHaveAttribute('href', BETA_CTA.to)
    expect(await screen.findByText(/Download a partir de 10 de novembro/)).toBeInTheDocument()
  })

  it('depois do lançamento: "Baixar grátis" leva a /baixar', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    montar()
    expect(await screen.findByRole('link', { name: 'Baixar grátis' })).toHaveAttribute('href', '/baixar')
  })

  it('a demonstração tem descrição e botão de pausa', () => {
    montar()
    expect(screen.getByRole('button', { name: /Pausar a demonstração|Reproduzir a demonstração/ })).toBeInTheDocument()
    expect(document.querySelector('video')).toHaveAttribute('aria-describedby')
  })
})

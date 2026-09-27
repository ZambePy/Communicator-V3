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

  it('texto à esquerda e o monitor à direita, sobre o fundo de partículas', () => {
    const { container } = montar()
    const grade = container.querySelector('.hero-produto__grade')!
    const [texto, aparelho] = Array.from(grade.children)
    expect(texto).toHaveClass('hero-produto__texto')
    expect(texto.querySelector('h1')).not.toBeNull()
    expect(aparelho).toHaveClass('hero-produto__aparelho')
    expect(aparelho.querySelector('.monitor video')).not.toBeNull()
    // Halo e anéis por trás do monitor, fora do leitor de tela.
    expect(aparelho.querySelectorAll('.hero-produto__anel[aria-hidden="true"]')).toHaveLength(2)
    // Fundo animado com partículas e a varredura.
    const fundo = container.querySelector('.hero-produto > .ambient')!
    expect(fundo.querySelectorAll('.ambient__dot').length).toBeGreaterThan(0)
  })

  it('as chamadas escondem a barra fixa do celular enquanto estão na tela', () => {
    const { container } = montar()
    expect(container.querySelector('.hero-produto__acoes')).toHaveAttribute('data-sticky-hide')
  })

  it('a demonstração tem descrição e botão de pausa', () => {
    montar()
    expect(screen.getByRole('button', { name: /Pausar a demonstração|Reproduzir a demonstração/ })).toBeInTheDocument()
    expect(document.querySelector('video')).toHaveAttribute('aria-describedby')
  })
})

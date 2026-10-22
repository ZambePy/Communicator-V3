import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ComoFunciona from './ComoFunciona'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'
import { ESCRITA_PELO_OLHAR } from '@/data/produto'

/* As "três perguntas" terminam na chamada certa para o momento da beta: a
   inscrição antes do lançamento, o download depois (como na Solução). E o
   detalhe técnico diz o que a beta roda hoje: a rede L2CS-Net. */

const { apiFake } = vi.hoisted(() => ({ apiFake: { programa: null as BetaProgram | null } }))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA }
})

// O teclado animado (que veio da abertura da home) chega com o motor sob
// demanda; aqui ele não precisa tocar.
vi.mock('@/components/home/olhar/motorDoOlhar', () => ({
  ligarMotor: () => ({
    agendar: () => {},
    parar: () => {},
    recomecar: () => {},
    assumir: () => {},
    mover: () => {},
    soltar: () => {},
    acionar: () => {},
    desligar: () => {},
  }),
}))

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ComoFunciona />
    </MemoryRouter>,
  )
}

const acoes = () => document.querySelector('.como__perguntas-acoes') as HTMLElement

beforeEach(() => esquecerBetaProgram())

describe('<ComoFunciona />', () => {
  it('antes do lançamento, as três perguntas levam à inscrição', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
    montar()
    expect(await within(acoes()).findByRole('link', { name: 'Entrar na beta' })).toHaveAttribute('href', '/beta')
  })

  it('depois do lançamento, levam ao download', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    montar()
    expect(await within(acoes()).findByRole('link', { name: 'Baixar grátis' })).toHaveAttribute('href', '/baixar')
  })

  it('o detalhe técnico diz que a beta usa a L2CS-Net e ainda vai ser medida', () => {
    montar()
    expect(screen.getByText(/uma rede neural de pesquisa, a\s+L2CS-Net/)).toBeInTheDocument()
    expect(screen.queryByText(/roda sem o modelo de pesquisa/)).not.toBeInTheDocument()
  })

  it('recebe o teclado animado que saiu da abertura da home (rodada 3, 21/10/2026)', () => {
    montar()
    const secao = screen.getByRole('heading', { level: 2, name: ESCRITA_PELO_OLHAR.titulo }).closest('section')!
    const figura = secao.querySelector('figure')!
    expect(figura).not.toBeNull()
    expect(figura.querySelectorAll('.olhar__grade [data-tecla]')).toHaveLength(6)
    expect(within(figura).getByText(/o ponto é o olhar/)).toBeInTheDocument()
  })
})

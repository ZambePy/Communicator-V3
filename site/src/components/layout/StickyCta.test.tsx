import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
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

/* P1-2 da auditoria de 21/10/2026: no celular a barra (75 px) cobria o
   elemento com o foco do teclado, e o contorno de 3 px da página de
   acessibilidade ficava escondido (WCAG 2.4.11, foco não obscurecido). A barra
   sai da frente quando o foco visível está no conteúdo, e só volta quando ele
   sai de lá. */
describe('<StickyCta /> e o foco do teclado', () => {
  function montarComConteudo() {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    Object.defineProperty(window, 'scrollY', { value: 600, configurable: true })
    return render(
      <MemoryRouter initialEntries={['/planos']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <main>
          <button type="button">Pergunta do FAQ</button>
        </main>
        <StickyCta />
      </MemoryRouter>,
    )
  }
  const visivel = (c: HTMLElement) => c.querySelector('.sticky-cta')?.classList.contains('is-visible')

  it('com a página rolada e o foco fora do conteúdo, a barra aparece', async () => {
    const { container } = montarComConteudo()
    await waitFor(() => expect(visivel(container)).toBe(true))
  })

  it('o foco do teclado num elemento do conteúdo tira a barra da frente, e ela volta quando o foco sai', async () => {
    const { container } = montarComConteudo()
    await waitFor(() => expect(visivel(container)).toBe(true))

    const pergunta = screen.getByRole('button', { name: 'Pergunta do FAQ' })
    act(() => pergunta.focus())
    await waitFor(() => expect(visivel(container)).toBe(false))

    act(() => pergunta.blur())
    await waitFor(() => expect(visivel(container)).toBe(true))
  })

  it('o foco na própria barra não a esconde (senão não dá para chegar ao botão)', async () => {
    const { container } = montarComConteudo()
    await waitFor(() => expect(visivel(container)).toBe(true))

    act(() => screen.getByRole('link', { name: 'Baixar grátis' }).focus())
    await new Promise((r) => setTimeout(r, 50))
    expect(visivel(container)).toBe(true)
  })
})

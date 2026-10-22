import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'

/* O menu: Produto, Como funciona, Cuidador e Planos, com "Entrar" na mesma
   pílula e UMA chamada ao lado (a da beta antes do lançamento, "Baixar grátis"
   depois). A aba "Beta", com o selo vermelho, saiu em 21/10/2026 (auditoria
   P2-6 e P2-16): era um segundo caminho para o mesmo download. Quem tem sessão
   vê "Meu perfil" — também antes de responder a pesquisa, quando ainda não há
   conta completa. */

const { sessao, apiFake } = vi.hoisted(() => ({
  sessao: { authenticated: false, loading: false, account: null as unknown },
  apiFake: { programa: null as BetaProgram | null },
}))

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => sessao,
}))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA }
})

function montar(rota = '/') {
  return render(
    <MemoryRouter initialEntries={[rota]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Header />
      <main>conteúdo</main>
      <footer>rodapé</footer>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  esquecerBetaProgram()
  Object.assign(sessao, { authenticated: false, loading: false, account: null })
  apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
})

describe('<Header />', () => {
  it('não há aba "Beta" nem selo no menu: o programa beta é a chamada ao lado, e só ela', async () => {
    montar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).queryByRole('link', { name: /Beta/ })).not.toBeInTheDocument()
    expect(document.querySelector('.header .etiqueta-lancamento')).toBeNull()
    expect((await screen.findAllByRole('link', { name: 'Entrar na beta' }))[0]).toHaveAttribute('href', '/beta')
  })

  it('depois do lançamento a chamada vira "Baixar grátis", e o menu continua sem selo', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    montar()
    expect((await screen.findAllByRole('link', { name: 'Baixar grátis' }))[0]).toHaveAttribute('href', '/baixar')
    expect(document.querySelector('.header .etiqueta-lancamento')).toBeNull()
    expect(screen.queryByText('Liberada')).not.toBeInTheDocument()
  })

  it('cada destino aparece uma vez só, e o traço que corre sob os links é decoração', () => {
    // Até 19/10/2026 havia uma segunda cópia dos rótulos, acesa sob a pílula de
    // vidro, que o leitor de tela tinha de ignorar. O traço não repete texto.
    montar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(nav.querySelector('.nav-pilula__links--aceso')).toBeNull()
    expect(nav.querySelector('.nav-pilula__traco')).toHaveAttribute('aria-hidden', 'true')
    expect(within(nav).getAllByText('Produto')).toHaveLength(1)
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/solucao',
      '/como-funciona',
      '/cuidador',
      '/planos',
      '/entrar',
    ])
  })

  it('sem sessão: "Entrar" vai na pílula das abas e "Entrar na beta" fica ao lado', async () => {
    montar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(within(nav).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
    // Antes do lançamento (a data do banco, que chega depois da reserva).
    const chamada = (await screen.findAllByRole('link', { name: 'Entrar na beta' }))[0]
    expect(chamada).toHaveAttribute('href', '/beta')
    expect(nav.contains(chamada)).toBe(false)
    expect(screen.queryByRole('link', { name: 'Meu perfil' })).not.toBeInTheDocument()
  })

  it('o traço aparece ao passar o mouse no "Entrar", como nas abas', () => {
    montar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    expect(nav.style.getPropertyValue('--pilula-visivel')).toBe('0')
    fireEvent.mouseEnter(within(nav).getByRole('link', { name: 'Entrar' }))
    expect(nav.style.getPropertyValue('--pilula-visivel')).toBe('1')
  })

  it('com sessão, mesmo antes da pesquisa (sem conta): "Meu perfil" no lugar de "Entrar"', () => {
    sessao.authenticated = true
    montar()
    expect(screen.getAllByRole('link', { name: 'Meu perfil' })[0]).toHaveAttribute('href', '/perfil')
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
  })

  it('enquanto a sessão carrega, nenhum dos dois', () => {
    sessao.loading = true
    montar()
    expect(screen.queryByRole('link', { name: 'Entrar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Meu perfil' })).not.toBeInTheDocument()
  })

  describe('gaveta do menu (tablet e celular)', () => {
    function abrir() {
      fireEvent.click(screen.getByRole('button', { name: 'Abrir menu' }))
      return document.getElementById('menu-mobile')!
    }

    it('fica fora do <header>: o vidro do cabeçalho não pode virar o bloco de contenção dela', () => {
      montar()
      const gaveta = abrir()
      expect(gaveta.closest('header')).toBeNull()
      expect(gaveta).not.toHaveAttribute('hidden')
    })

    it('aberta, a página atrás fica inerte e o foco entra no primeiro item; Esc fecha e devolve o foco', () => {
      montar()
      const gaveta = abrir()
      expect(document.querySelector('main')).toHaveAttribute('inert')
      expect(document.querySelector('footer')).toHaveAttribute('inert')
      expect(document.activeElement).toBe(within(gaveta).getAllByRole('link')[0])

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(gaveta).toHaveAttribute('hidden')
      expect(document.querySelector('main')).not.toHaveAttribute('inert')
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir menu' }))
    })

    it('depois do lançamento, a gaveta chama para "Baixar grátis", como o cabeçalho', async () => {
      apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
      montar()
      const gaveta = abrir()
      expect(await within(gaveta).findByRole('link', { name: 'Baixar grátis' })).toHaveAttribute('href', '/baixar')
      expect(within(gaveta).queryByRole('link', { name: 'Entrar na beta gratuita' })).not.toBeInTheDocument()
      expect(within(gaveta).queryByText('Liberada')).not.toBeInTheDocument()
    })

    it('um toque no destino da página atual também fecha (a rota não muda)', () => {
      montar('/planos')
      const gaveta = abrir()
      fireEvent.click(within(gaveta).getByRole('link', { name: 'Planos' }))
      expect(gaveta).toHaveAttribute('hidden')
    })
  })

  it('/contato não é tratado como /conta (cabeçalho transparente na abertura)', () => {
    const { container } = montar('/contato')
    expect(container.querySelector('header')).not.toHaveClass('is-scrolled')
    montar('/conta')
    expect(document.querySelectorAll('header')[1]).toHaveClass('is-scrolled')
  })
})

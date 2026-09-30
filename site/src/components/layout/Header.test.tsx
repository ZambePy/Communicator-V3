import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'

/* O menu: a aba Beta leva a etiqueta vermelha nos dois estados — o dia até o
   lançamento e "Liberada" depois; quem tem sessão vê "Meu perfil" — também
   antes de responder a pesquisa, quando ainda não há conta completa. */

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
  it('antes do lançamento: a aba Beta leva a etiqueta vermelha com o dia, lida por extenso', async () => {
    montar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    const beta = within(nav).getByRole('link', { name: /Beta/ })
    await within(beta).findByText('10/11')
    expect(beta.querySelector('.etiqueta-lancamento')).not.toBeNull()
    expect(within(beta).getByText('Lançamento em 10 de novembro')).toHaveClass('sr-only')
    expect(within(beta).queryByText('novo')).not.toBeInTheDocument()
  })

  it('depois do lançamento: a etiqueta vermelha diz "Liberada" e a chamada vira "Baixar grátis"', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    montar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    // A pílula da navegação tem uma cópia visual dos rótulos, fora do leitor de
    // tela: a busca vai dentro do link de verdade.
    const beta = within(nav).getByRole('link', { name: /Beta/ })
    expect(await within(beta).findByText('Liberada')).toBeInTheDocument()
    expect(beta.querySelector('.etiqueta-lancamento--liberada')).not.toBeNull()
    expect(within(beta).getByText('Beta liberada: o download está aberto')).toHaveClass('sr-only')
    expect(within(beta).queryByText('10/11')).not.toBeInTheDocument()
    expect((await screen.findAllByRole('link', { name: 'Baixar grátis' }))[0]).toHaveAttribute('href', '/baixar')
  })

  it('a cópia visual da pílula fica fora do leitor de tela', () => {
    montar()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    const copia = nav.querySelector('.nav-pilula__links--aceso')
    expect(copia).not.toBeNull()
    expect(copia).toHaveAttribute('aria-hidden', 'true')
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/solucao',
      '/como-funciona',
      '/cuidador',
      '/planos',
      '/beta',
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

  it('o vidro da pílula aparece ao passar o mouse no "Entrar", como nas abas', () => {
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
      expect(within(gaveta).getByText('Liberada')).toBeInTheDocument()
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

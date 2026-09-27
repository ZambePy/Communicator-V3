import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FronteiraDeErro } from './FronteiraDeErro'
import { JANELA_CONTRA_LACO_MS, ehErroDePedaco, recarregarUmaVez } from '@/lib/recargaAposDeploy'

/* Página que quebra: o resto do site fica de pé. Pedaço que sumiu num deploy:
   recarrega uma vez, nunca em laço. */

const recarregar = vi.fn()
const localOriginal = window.location

beforeEach(() => {
  recarregar.mockReset()
  sessionStorage.clear()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...localOriginal, pathname: '/planos', search: '', hash: '', reload: recarregar },
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: localOriginal })
  vi.restoreAllMocks()
})

function Quebra({ erro }: { erro: Error }): never {
  throw erro
}

describe('recarga depois de um deploy', () => {
  it('reconhece as mensagens dos navegadores para pedaço que não carregou', () => {
    expect(ehErroDePedaco(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Planos-abc.js'))).toBe(true)
    expect(ehErroDePedaco(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(ehErroDePedaco(new Error('error loading dynamically imported module'))).toBe(true)
    expect(ehErroDePedaco(new TypeError('x.map is not a function'))).toBe(false)
  })

  it('recarrega uma vez por destino; a segunda falha logo em seguida não recarrega de novo', () => {
    expect(recarregarUmaVez(1_000)).toBe(true)
    expect(recarregarUmaVez(2_000)).toBe(false)
    expect(recarregar).toHaveBeenCalledTimes(1)
    // passada a janela, um deploy novo volta a poder recarregar
    expect(recarregarUmaVez(2_000 + JANELA_CONTRA_LACO_MS)).toBe(true)
  })

  it('sem rede não recarrega (o navegador mostraria a página de erro dele)', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(recarregarUmaVez()).toBe(false)
    expect(recarregar).not.toHaveBeenCalled()
    onLine.mockRestore()
  })
})

describe('<FronteiraDeErro />', () => {
  it('erro comum: aviso com "Recarregar" e o caminho para o início, sem texto técnico', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <FronteiraDeErro>
          <Quebra erro={new TypeError('w.map is not a function')} />
        </FronteiraDeErro>
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Esta página não abriu.')
    expect(screen.queryByText(/is not a function/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar a página' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/')
    expect(recarregar).not.toHaveBeenCalled()
  })

  it('pedaço que sumiu num deploy: recarrega o endereço', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <FronteiraDeErro>
          <Quebra erro={new TypeError('Failed to fetch dynamically imported module: /assets/Planos-velho.js')} />
        </FronteiraDeErro>
      </MemoryRouter>,
    )
    expect(recarregar).toHaveBeenCalledTimes(1)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { NavigationEnhancer } from './NavigationEnhancer'
import { PISCADA } from './piscada'

// O pedaço da rota: pronto, a não ser que o teste diga que ainda vem.
const pedaco = vi.hoisted(() => ({ carregado: true, chegar: (): void => {} }))
vi.mock('@/routes', async (original) => ({
  ...(await original<typeof import('@/routes')>()),
  isRouteLoaded: () => pedaco.carregado,
  preloadRoute: () =>
    pedaco.carregado
      ? Promise.resolve()
      : new Promise<void>((r) => {
          pedaco.chegar = r
        }),
}))

/* A piscada no clique: as pálpebras fecham, a rota troca com elas fechadas e
   elas abrem sobre a página nova — em qualquer navegador, sem a View
   Transitions API. Com movimento reduzido, ou numa âncora da mesma página, ou
   com Ctrl/Cmd, o clique segue direto para o roteador. */

const matchMediaOriginal = window.matchMedia

afterEach(() => {
  // A capa das pálpebras vai direto para o <body>, fora do que o render limpa.
  document.querySelectorAll('.palpebras').forEach((e) => e.remove())
  Reflect.deleteProperty(document as unknown as Record<string, unknown>, 'startViewTransition')
  window.matchMedia = matchMediaOriginal
  pedaco.carregado = true
  vi.useRealTimers()
})

function Onde() {
  const { pathname, hash } = useLocation()
  return (
    <main id="conteudo" data-rota={pathname}>
      <p data-testid="onde">
        {pathname}
        {hash}
      </p>
    </main>
  )
}

function montar(aoClicar?: () => void) {
  return render(
    <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NavigationEnhancer />
      <Link to="/cuidador" onClick={aoClicar}>
        Cuidador
      </Link>
      <Link to="/planos">Planos</Link>
      <Link to="/#produto">Produto</Link>
      <Routes>
        <Route path="*" element={<Onde />} />
      </Routes>
    </MemoryRouter>,
  )
}

// Em passos: dentro de um act o React só monta a página nova no fim dele, e
// a abertura depende dela.
const avancar = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

const capa = () => document.querySelector('.palpebras')

describe('<NavigationEnhancer /> e a piscada', () => {
  it('as pálpebras fecham no clique; a rota troca com elas fechadas; depois abrem e saem', async () => {
    vi.useFakeTimers()
    // Mesmo onde a API existe, ela não é usada: a capa é do DOM.
    const vt = vi.fn()
    Object.assign(document, { startViewTransition: vt })
    montar()
    fireEvent.click(screen.getByText('Cuidador'))
    // Fechando: a capa está lá e a rota ainda não mudou.
    expect(capa()).not.toBeNull()
    expect(capa()).not.toHaveClass('is-abrindo')
    expect(screen.getByTestId('onde')).toHaveTextContent('/')
    await avancar(PISCADA.fecharMs + 10)
    // Fechadas: a página nova chegou por baixo delas.
    expect(screen.getByTestId('onde')).toHaveTextContent('/cuidador')
    // Pintada uma vez, as pálpebras abrem...
    await avancar(110)
    expect(capa()).toHaveClass('is-abrindo')
    // ... e saem.
    await avancar(PISCADA.abrirMs + 10)
    expect(capa()).toBeNull()
    expect(vt).not.toHaveBeenCalled()
  })

  it('se o pedaço da rota ainda vem, a troca espera por ele com as pálpebras fechadas (até 350 ms)', async () => {
    vi.useFakeTimers()
    pedaco.carregado = false
    montar()
    fireEvent.click(screen.getByText('Cuidador'))
    await avancar(PISCADA.fecharMs + 100)
    // Fechadas, esperando o pedaço: a rota ainda não trocou.
    expect(screen.getByTestId('onde')).toHaveTextContent('/')
    expect(capa()).not.toHaveClass('is-abrindo')
    pedaco.chegar()
    await avancar(10)
    expect(screen.getByTestId('onde')).toHaveTextContent('/cuidador')

    // E se não chegar, troca assim mesmo no teto (a página mostra o esqueleto).
    fireEvent.click(screen.getByText('Planos'))
    await avancar(PISCADA.abrirMs + 120)
    fireEvent.click(screen.getByText('Planos'))
    await avancar(340)
    expect(screen.getByTestId('onde')).toHaveTextContent('/cuidador')
    await avancar(20)
    expect(screen.getByTestId('onde')).toHaveTextContent('/planos')
  })

  it('o onClick de quem usa o link roda na hora (a gaveta do celular fecha antes da piscada)', () => {
    const fechar = vi.fn()
    montar(fechar)
    fireEvent.click(screen.getByText('Cuidador'))
    expect(fechar).toHaveBeenCalledTimes(1)
    // E o <Link> não navega sozinho: quem troca a rota é a piscada.
    expect(screen.getByTestId('onde')).toHaveTextContent('/')
  })

  it('com as pálpebras fechando, outro clique não muda o destino; abrindo, começa outra piscada', async () => {
    vi.useFakeTimers()
    montar()
    fireEvent.click(screen.getByText('Cuidador'))
    fireEvent.click(screen.getByText('Planos'))
    expect(document.querySelectorAll('.palpebras')).toHaveLength(1)
    await avancar(PISCADA.fecharMs + 10)
    expect(screen.getByTestId('onde')).toHaveTextContent('/cuidador')
    await avancar(110)
    expect(capa()).toHaveClass('is-abrindo')
    fireEvent.click(screen.getByText('Planos'))
    // A capa que abria sai, e uma nova fecha.
    expect(document.querySelectorAll('.palpebras')).toHaveLength(1)
    expect(capa()).not.toHaveClass('is-abrindo')
    await avancar(PISCADA.fecharMs + 10)
    expect(screen.getByTestId('onde')).toHaveTextContent('/planos')
    await avancar(110)
    await avancar(PISCADA.abrirMs + 10)
    expect(capa()).toBeNull()
  })

  it('âncora da mesma página não pisca', () => {
    montar()
    fireEvent.click(screen.getByText('Produto'))
    expect(capa()).toBeNull()
    expect(screen.getByTestId('onde')).toHaveTextContent('/#produto')
  })

  it('com movimento reduzido, nada é interceptado', () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduce'),
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia
    montar()
    fireEvent.click(screen.getByText('Cuidador'))
    expect(capa()).toBeNull()
    expect(screen.getByTestId('onde')).toHaveTextContent('/cuidador')
  })

  it('Ctrl/Cmd+clique (nova aba) não pisca', () => {
    montar()
    fireEvent.click(screen.getByText('Cuidador'), { ctrlKey: true })
    expect(capa()).toBeNull()
  })

  it('desmontado no meio da piscada, a capa não fica na tela', () => {
    const { unmount } = montar()
    fireEvent.click(screen.getByText('Cuidador'))
    expect(capa()).not.toBeNull()
    unmount()
    expect(capa()).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { FundoDaPagina } from './FundoDaPagina'
import { PageHead } from './PageHead'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { PONTEIRO_FINO, responderMidia } from '@/test/observador'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

/* O Layout é o que as rotas têm em comum: liga as páginas internas ao fundo
   vivo e não tem nenhum efeito que siga o mouse. */

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => ({ authenticated: false, loading: false, account: null }),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => real.BETA_PROGRAM_RESERVA }
})

let restaurarMidia = () => {}
beforeEach(() => {
  esquecerBetaProgram()
  window.localStorage.setItem('irisflow:consent', 'refused')
})
afterEach(() => {
  restaurarMidia()
  restaurarMidia = () => {}
})

function rota(caminho: string, pagina: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[caminho]} future={FUTURO_DO_ROTEADOR}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={pagina} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('<Layout />', () => {
  it('nenhum efeito segue o mouse: nada de luz nem anel no <body>, com ou sem mouse', () => {
    restaurarMidia = responderMidia(PONTEIRO_FINO)
    rota('/sobre', <PageHead title="Sobre" />)
    expect(document.querySelector('.v3-luz, .v3-cursor')).toBeNull()
  })

  it('uma página que pede <FundoDaPagina /> ganha o fundo vivo na faixa de abertura', () => {
    const { container } = rota(
      '/planos',
      <>
        <FundoDaPagina variante="calmo" />
        <PageHead title="Planos" />
      </>,
    )
    const fundo = container.querySelector('main .page-head > .atmosfera')
    expect(fundo).not.toBeNull()
    expect(fundo).toHaveClass('atmosfera--calmo')
    expect(container.querySelector('.v3-campo, .v3-campo__ponto')).toBeNull()
  })

  it('uma página que não pede, não ganha (as faixas lisas continuam lisas)', () => {
    const { container } = rota('/termos', <PageHead title="Termos" />)
    expect(container.querySelector('.atmosfera')).toBeNull()
  })
})

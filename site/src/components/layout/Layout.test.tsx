import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './Layout'
import { FundoDaPagina } from './FundoDaPagina'
import { PageHead } from './PageHead'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { MOVIMENTO_REDUZIDO, PONTEIRO_FINO, responderMidia } from '@/test/observador'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

/* O Layout é o que as rotas têm em comum. Desde a rodada 4 (21/10/2026, pedido
   do dono: "efeitos de fundo em todas as páginas, o mesmo sistema da home") ele
   leva a luz do olhar para o site inteiro e liga as páginas internas ao fundo
   dos 13 pontos. */

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

const luz = () => document.body.querySelector('.v3-luz')

describe('<Layout />', () => {
  it('a luz do olhar vale em qualquer página, não só na home (com mouse)', () => {
    restaurarMidia = responderMidia(PONTEIRO_FINO)
    rota('/sobre', <PageHead title="Sobre" />)
    expect(luz()).not.toBeNull()
  })

  it('sem mouse (toque) a luz não existe', () => {
    rota('/sobre', <PageHead title="Sobre" />)
    expect(luz()).toBeNull()
  })

  it('com movimento reduzido a luz não existe, mesmo com mouse', () => {
    restaurarMidia = responderMidia(PONTEIRO_FINO, MOVIMENTO_REDUZIDO)
    rota('/sobre', <PageHead title="Sobre" />)
    expect(luz()).toBeNull()
  })

  it('uma página que pede <FundoDaPagina /> ganha os 13 pontos na faixa de abertura', () => {
    const { container } = rota(
      '/planos',
      <>
        <FundoDaPagina variante="calmo" />
        <PageHead title="Planos" />
      </>,
    )
    const fundo = container.querySelector('main .page-head__fundo')
    expect(fundo).not.toBeNull()
    expect(fundo!.querySelectorAll('.v3-campo__ponto')).toHaveLength(13)
    expect(fundo!.querySelector('.v3-campo')).toHaveClass('v3-campo--calmo')
  })

  it('uma página que não pede, não ganha (as faixas lisas continuam lisas)', () => {
    const { container } = rota('/termos', <PageHead title="Termos" />)
    expect(container.querySelector('.page-head__fundo')).toBeNull()
  })
})

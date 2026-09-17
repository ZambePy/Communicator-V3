import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Beta from './Beta'
import type { Account } from '@/context/AccountContext'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'

/* ============================================================
   Página /beta (docs/BETA.md).

   Três estados decididos pela sessão: sem conta mostra o formulário; com
   conta mostra o painel de download com "acesso beta até"; com as
   inscrições fechadas, o aviso sem formulário. E a regra que muda em
   relação ao /cadastro: o CPF é opcional — vazio passa, inválido não.
   ============================================================ */

const contaBeta: Account = {
  id: 'sub-beta',
  profile: {
    buyerName: 'Maria Aparecida Souza',
    email: 'maria@exemplo.com.br',
    phone: '(11) 90000-0000',
    document: '',
    userName: 'João',
    relation: 'conjuge',
    condition: 'ela',
    os: 'windows',
    newsletter: true,
  },
  status: 'ativa',
  createdAt: '2026-09-15T00:00:00Z',
  trialEndsAt: '2026-09-15T00:00:00Z',
  nextChargeAt: '2027-03-31T23:59:59-03:00',
  priceBRL: 0,
  planId: 'beta',
}

// vi.hoisted: as fábricas dos vi.mock abaixo são içadas e precisam enxergar isto
const { sessao, registerBeta, apiFake } = vi.hoisted(() => {
  const sessao = {
    account: null as Account | null,
    authenticated: false,
    loading: false,
  }
  const registerBeta = vi.fn()
  const apiFake = {
    programa: null as BetaProgram | null,
    markBetaDownload: vi.fn(async () => {}),
  }
  return { sessao, registerBeta, apiFake }
})

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => ({ ...sessao, registerBeta }),
}))

vi.mock('@/hooks/useDownloads', () => ({
  useDownloads: () => ({ windows: 'https://exemplo.com/irisflow.exe', macos: '#', linux: '#' }),
}))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return {
    ...real,
    APP_CUIDADOR_URL: '',
    fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA,
    markBetaDownload: apiFake.markBetaDownload,
  }
})

function montar() {
  return render(
    // as flags só calam os avisos de migração para o v7
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Beta />
    </MemoryRouter>,
  )
}

/** Preenche a etapa 1 com dados válidos; o CPF é o único que varia. */
function preencherEtapa1(cpf: string) {
  fireEvent.change(screen.getByLabelText('Nome completo'), {
    target: { value: 'Maria Aparecida Souza' },
  })
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'maria@exemplo.com.br' } })
  fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '11900000000' } })
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: cpf } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo123' } })
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'segredo123' } })
}

// O jsdom não navega: um clique em <a target="_blank"> só vira aviso de
// "not implemented". Cancelar o padrão evita o ruído sem afetar o teste.
const cancelarNavegacao = (e: Event) => e.preventDefault()

beforeEach(() => {
  vi.clearAllMocks()
  sessao.account = null
  sessao.authenticated = false
  sessao.loading = false
  apiFake.programa = null
  window.scrollTo = vi.fn()
  window.addEventListener('click', cancelarNavegacao)
})

afterEach(() => {
  window.removeEventListener('click', cancelarNavegacao)
})

describe('<Beta /> sem sessão', () => {
  it('mostra o cabeçalho da beta e o formulário na primeira etapa', () => {
    montar()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/durante a beta/i)
    expect(screen.getByLabelText('Nome completo')).toBeInTheDocument()
    expect(screen.getByLabelText('CPF')).toBeInTheDocument()
    expect(screen.getByText(/Opcional na beta/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar')
    // nada de painel de download sem conta
    expect(screen.queryByText(/Acesso beta até/)).not.toBeInTheDocument()
  })

  it('exibe a data e a versão que vieram de beta_program', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, currentVersion: '1.0.0-beta.7' }
    montar()

    await waitFor(() => expect(screen.getByText('1.0.0-beta.7')).toBeInTheDocument())
  })

  it('CPF vazio passa na etapa 1', () => {
    montar()
    preencherEtapa1('')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByText(/Dados de quem vai usar/)).toBeInTheDocument()
    expect(screen.queryByText(/CPF inválido/)).not.toBeInTheDocument()
  })

  it('CPF válido também passa', () => {
    montar()
    preencherEtapa1('123.456.789-09')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByText(/Dados de quem vai usar/)).toBeInTheDocument()
  })

  it('CPF inválido não passa', () => {
    montar()
    preencherEtapa1('111.111.111-11')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByText(/CPF inválido/)).toBeInTheDocument()
    expect(screen.queryByText(/Dados de quem vai usar/)).not.toBeInTheDocument()
  })

  it('com sessão aberta mas sem conta, mostra o formulário e avisa que ficou pela metade', () => {
    sessao.authenticated = true
    montar()

    expect(screen.getByLabelText('Nome completo')).toBeInTheDocument()
    expect(screen.getByText(/ficou pela metade/)).toBeInTheDocument()
  })
})

describe('<Beta /> com inscrições fechadas', () => {
  it('mostra o aviso com link para o contato, sem formulário', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, open: false }
    montar()

    await waitFor(() =>
      expect(screen.getByText(/inscrições da beta estão fechadas/)).toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: /Deixar meu contato/ })).toHaveAttribute(
      'href',
      '/contato',
    )
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument()
  })
})

describe('<Beta /> com conta', () => {
  it('mostra o painel de download com "Acesso beta até" e registra o clique no instalador', () => {
    sessao.account = contaBeta
    sessao.authenticated = true
    montar()

    expect(screen.getByText(/Acesso beta até/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument()
    // sem VITE_APP_CUIDADOR_URL, o link do app do cuidador chega por e-mail
    expect(screen.getByText(/chega por e-mail/)).toBeInTheDocument()

    const windows = screen.getByRole('link', { name: 'Windows' })
    expect(windows).toHaveAttribute('href', 'https://exemplo.com/irisflow.exe')
    fireEvent.click(windows)
    expect(apiFake.markBetaDownload).toHaveBeenCalledWith('windows')

    // sem release nem variável de ambiente, o botão fica desabilitado
    expect(screen.getByRole('button', { name: 'macOS' })).toBeDisabled()
  })
})

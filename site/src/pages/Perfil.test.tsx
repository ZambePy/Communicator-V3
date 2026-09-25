import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Perfil from './Perfil'
import type { Account } from '@/context/AccountContext'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram, type InscricaoBeta, type PerfilBasico } from '@/services/api'

/* ============================================================
   /perfil — "Meu perfil": a situação da inscrição, os dados da conta e as
   respostas da pesquisa (editáveis), o download (travado até o lançamento)
   e, depois dele, os computadores.
   ============================================================ */

const ANTES = '2099-11-10T03:00:00Z'
const DEPOIS = '2020-11-10T03:00:00Z'

const contaBeta: Account = {
  id: 'sub-beta',
  profile: {
    buyerName: 'Maria Aparecida Souza',
    email: 'maria@exemplo.com.br',
    phone: '11900000000',
    document: '',
    userName: 'João',
    relation: 'conjuge',
    condition: 'ela',
    os: 'windows',
    newsletter: true,
  },
  status: 'ativa',
  createdAt: '2026-09-25T00:00:00Z',
  trialEndsAt: '2026-09-25T00:00:00Z',
  nextChargeAt: '2027-03-31T23:59:59-03:00',
  priceBRL: 0,
  planId: 'beta',
}

const perfil: PerfilBasico = {
  buyerName: 'Maria Aparecida Souza',
  email: 'maria@exemplo.com.br',
  phone: '11900000000',
  newsletter: true,
  createdAt: '2026-09-24T22:37:43Z',
  emailConfirmedAt: '2026-09-24T22:38:02Z',
}

const inscricao: InscricaoBeta = {
  wantsCaregiverApp: true,
  feedbackConsent: false,
  howFound: 'Associação',
  registeredAt: '2026-09-25T10:00:00Z',
  downloadedAt: null,
}

const { sessao, acoes, apiFake } = vi.hoisted(() => ({
  sessao: {
    account: null as Account | null,
    authenticated: true,
    loading: false,
    sessionError: null as string | null,
  },
  acoes: {
    signOut: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    atualizarDadosDaConta: vi.fn(async () => {}),
    responderPesquisa: vi.fn(async () => ({}) as Account),
  },
  apiFake: {
    programa: null as BetaProgram | null,
    perfil: null as PerfilBasico | null,
    inscricao: null as InscricaoBeta | null,
  },
}))

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => ({ ...sessao, ...acoes }),
}))

vi.mock('@/components/sections/LinkedDevices', () => ({
  LinkedDevices: () => <p>painel de computadores</p>,
}))

vi.mock('@/hooks/useDownloads', async () => {
  const { buildDownloads, platformsText } = await import('@/lib/releases')
  return {
    useDownloads: () => ({
      platforms: buildDownloads('dono/repo', ['windows']),
      detected: 'windows',
      releasesPage: 'https://github.com/dono/repo/releases',
      status: 'github',
      platformsText: platformsText(['windows']),
    }),
  }
})

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return {
    ...real,
    fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA,
    fetchPerfilBasico: async () => apiFake.perfil,
    fetchInscricaoBeta: async () => apiFake.inscricao,
    markBetaDownload: vi.fn(async () => {}),
  }
})

function montar() {
  return render(
    <MemoryRouter initialEntries={['/perfil']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/entrar" element={<p>tela de acesso</p>} />
        <Route path="/" element={<p>página inicial</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  esquecerBetaProgram()
  vi.clearAllMocks()
  Object.assign(sessao, { account: contaBeta, authenticated: true, loading: false, sessionError: null })
  apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: ANTES }
  apiFake.perfil = perfil
  apiFake.inscricao = inscricao
})

describe('<Perfil />', () => {
  it('sem sessão, manda para o acesso', async () => {
    sessao.authenticated = false
    sessao.account = null
    montar()
    expect(await screen.findByText('tela de acesso')).toBeInTheDocument()
  })

  it('logada sem a pesquisa: mostra a conta e chama para a pesquisa, sem redirecionar', async () => {
    sessao.account = null
    apiFake.inscricao = null
    montar()

    expect(await screen.findByText('Falta a pesquisa rápida')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Responder a pesquisa rápida' })).toHaveAttribute('href', '/beta')
    expect(screen.getByText(/Você ainda não respondeu/)).toBeInTheDocument()
    expect(screen.getByText('Maria Aparecida Souza')).toBeInTheDocument()
    expect(screen.queryByText('Instaladores da beta')).not.toBeInTheDocument()
  })

  it('inscrição completa antes do lançamento: dados, respostas, etiqueta vermelha e download travado', async () => {
    montar()

    expect(await screen.findByRole('heading', { name: 'Olá, Maria' })).toBeInTheDocument()
    expect(screen.getByText('Inscrição completa')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'A beta abre em 10 de novembro' })).toBeInTheDocument()
    expect(document.querySelector('.perfil__situacao .etiqueta-lancamento')).not.toBeNull()
    // respostas da pesquisa, com os rótulos legíveis
    expect(screen.getByText('João')).toBeInTheDocument()
    expect(screen.getByText('Cônjuge')).toBeInTheDocument()
    expect(screen.getByText('Esclerose lateral amiotrófica (ELA)')).toBeInTheDocument()
    await screen.findByText('Associação')
    expect(screen.getByText('Quer usar')).toBeInTheDocument()
    expect(screen.getByText('Não autorizado')).toBeInTheDocument()
    // dados da conta
    expect(screen.getByText('(11) 90000-0000')).toBeInTheDocument()
    expect(screen.getByText(/confirmado/)).toBeInTheDocument()
    // download travado e sem o painel de computadores
    expect(screen.getAllByText(/Disponível em 10\/11/).length).toBeGreaterThan(0)
    expect(screen.queryByText('painel de computadores')).not.toBeInTheDocument()
  })

  it('depois do lançamento: botão de baixar e os computadores vinculados', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: DEPOIS }
    montar()
    expect(await screen.findByRole('heading', { name: 'A beta está aberta: baixe o aplicativo' })).toBeInTheDocument()
    expect(screen.getByText('painel de computadores')).toBeInTheDocument()
  })

  it('editar os dados da conta: valida o telefone e salva nome, telefone e novidades', async () => {
    montar()
    await screen.findByRole('heading', { name: 'Olá, Maria' })
    await screen.findByText('(11) 90000-0000')

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Telefone (opcional)'), { target: { value: '(11) 9000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/Informe o telefone com DDD/)).toBeInTheDocument()
    expect(acoes.atualizarDadosDaConta).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Telefone (opcional)'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Maria A. Souza' } })
    fireEvent.click(screen.getByLabelText(/Quero receber novidades/))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    })
    expect(acoes.atualizarDadosDaConta).toHaveBeenCalledWith({
      nome: 'Maria A. Souza',
      telefone: '',
      newsletter: false,
    })
    expect(await screen.findByText('Dados da conta salvos.')).toBeInTheDocument()
  })

  it('editar as respostas: o formulário vem preenchido e salva pela mesma função da pesquisa', async () => {
    montar()
    await screen.findByText('Associação')

    fireEvent.click(screen.getByRole('button', { name: 'Editar respostas' }))
    expect(screen.getByLabelText('Meu cônjuge')).toBeChecked()
    expect(screen.getByLabelText('Como essa pessoa gosta de ser chamada?')).toHaveValue('João')
    expect(screen.getByLabelText('Condição principal')).toHaveValue('ela')
    expect(screen.getByLabelText('Windows')).toBeChecked()
    expect(screen.getByLabelText('Sim, quero')).toBeChecked()

    fireEvent.click(screen.getByLabelText('Linux'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar respostas' }))
    })
    expect(acoes.responderPesquisa).toHaveBeenCalledWith(
      expect.objectContaining({ relation: 'conjuge', userName: 'João', os: 'linux', howFound: 'Associação' }),
    )
    expect(await screen.findByText('Respostas da pesquisa salvas.')).toBeInTheDocument()
  })

  it('cancelar a edição volta a mostrar as respostas sem salvar', async () => {
    montar()
    await screen.findByText('Associação')
    fireEvent.click(screen.getByRole('button', { name: 'Editar respostas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByText('Cônjuge')).toBeInTheDocument()
    expect(acoes.responderPesquisa).not.toHaveBeenCalled()
  })

  it('sair encerra a sessão e volta para o início', async () => {
    montar()
    await screen.findByRole('heading', { name: 'Olá, Maria' })
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^Sair/ })[0])
    })
    expect(acoes.signOut).toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('página inicial')).toBeInTheDocument())
  })
})

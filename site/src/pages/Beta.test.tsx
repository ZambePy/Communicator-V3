import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Beta from './Beta'
import type { Account } from '@/context/AccountContext'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram, type PerfilBasico } from '@/services/api'

/* ============================================================
   Página /beta: as quatro etapas decididas pela sessão.

   sem sessão → criar conta (e, com "Confirm email", a tela de confirmar);
   sessão sem conta → pesquisa rápida; conta → download, travado até o
   lançamento (beta_program.launch_at) e liberado depois dele.
   ============================================================ */

const ANTES = '2099-11-10T03:00:00Z' // lançamento no futuro: download travado
const DEPOIS = '2020-11-10T03:00:00Z' // lançamento no passado: liberado

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
  createdAt: '2026-09-15T00:00:00Z',
  trialEndsAt: '2026-09-15T00:00:00Z',
  nextChargeAt: '2027-03-31T23:59:59-03:00',
  priceBRL: 0,
  planId: 'beta',
}

const perfil: PerfilBasico = {
  buyerName: 'Maria Aparecida Souza',
  email: 'maria@exemplo.com.br',
  phone: '',
  newsletter: true,
  createdAt: '2026-09-24T22:37:43Z',
  emailConfirmedAt: '2026-09-24T22:38:02Z',
}

const { sessao, acoes, apiFake } = vi.hoisted(() => {
  const sessao = {
    account: null as Account | null,
    authenticated: false,
    loading: false,
    sessionError: null as string | null,
  }
  const acoes = {
    criarContaBeta: vi.fn(async (): Promise<'confirmar' | 'sessao'> => 'confirmar'),
    responderPesquisa: vi.fn(async () => ({}) as Account),
    signOut: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
  }
  const apiFake = {
    programa: null as BetaProgram | null,
    perfil: null as PerfilBasico | null,
    markBetaDownload: vi.fn(async (_os: string) => {}),
    reenviarConfirmacao: vi.fn(async (_email: string) => {}),
  }
  return { sessao, acoes, apiFake }
})

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => ({ ...sessao, ...acoes }),
}))

vi.mock('@/hooks/useDownloads', async () => {
  const { buildDownloads, platformsText } = await import('@/lib/releases')
  // só o Windows publicado; macOS e Linux ficam "Em breve"
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
    APP_CUIDADOR_URL: '',
    fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA,
    fetchPerfilBasico: async () => apiFake.perfil,
    markBetaDownload: apiFake.markBetaDownload,
    reenviarConfirmacao: apiFake.reenviarConfirmacao,
  }
})

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Beta />
    </MemoryRouter>,
  )
}

/** Programa com a data de lançamento pedida. */
function programa(launchAt: string, extra: Partial<BetaProgram> = {}) {
  apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt, ...extra }
}

function preencherConta(p: { confirmacao?: string } = {}) {
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Maria Aparecida Souza' } })
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: '  Maria@Exemplo.com.br ' } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo123' } })
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: p.confirmacao ?? 'segredo123' } })
  fireEvent.click(screen.getByLabelText(/Li e aceito/))
}

beforeEach(() => {
  esquecerBetaProgram()
  Object.assign(sessao, { account: null, authenticated: false, loading: false, sessionError: null })
  apiFake.programa = null
  apiFake.perfil = perfil
  vi.clearAllMocks()
  acoes.criarContaBeta.mockResolvedValue('confirmar')
  // o jsdom não implementa scrollTo
  window.scrollTo = vi.fn() as never
})

describe('etapa 1 — criar conta (sem sessão)', () => {
  it('abre com a etiqueta vermelha do lançamento, o texto da data e a trilha na etapa 1', async () => {
    programa(ANTES)
    montar()
    await screen.findByText(/A beta fica disponível em/)
    expect(screen.getAllByText(/10 de novembro/).length).toBeGreaterThan(0)
    expect(document.querySelector('.etiqueta-lancamento')).toHaveTextContent(/Lançamento 10\/11/)
    expect(screen.getByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument()
    expect(screen.getByText(/Etapa 1 de 4/)).toBeInTheDocument()
    // a conta é só nome, e-mail e senha: nada de pesquisa nesta etapa
    expect(screen.queryByText('Quem vai usar o IrisFlow?')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('CPF')).not.toBeInTheDocument()
  })

  it('enviar vazio não trava: mostra o que falta, os erros e leva o foco ao primeiro campo', async () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(
      await screen.findByText(
        /falta preencher ou corrigir: nome completo, e-mail, senha, confirmação da senha e aceite dos termos/,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Informe seu nome.')).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByLabelText('Nome completo'))
    expect(acoes.criarContaBeta).not.toHaveBeenCalled()
  })

  it('senhas diferentes não passam', async () => {
    montar()
    preencherConta({ confirmacao: 'outra-senha' })
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByText('As duas senhas precisam ser iguais.')).toBeInTheDocument()
    expect(acoes.criarContaBeta).not.toHaveBeenCalled()
  })

  it('conta criada com "Confirm email": etapa 2 com o e-mail normalizado e o caminho de volta ao computador', async () => {
    montar()
    preencherConta()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    })

    // (o campo type="email" já apara os espaços; a normalização final é do api.ts)
    expect(acoes.criarContaBeta).toHaveBeenCalledWith({
      nome: 'Maria Aparecida Souza',
      email: 'Maria@Exemplo.com.br',
      senha: 'segredo123',
      newsletter: true,
    })
    expect(await screen.findByRole('heading', { name: /Confirme seu e-mail para continuar/ })).toBeInTheDocument()
    expect(screen.getByText('maria@exemplo.com.br')).toBeInTheDocument()
    expect(screen.getByText(/Etapa 2 de 4/)).toBeInTheDocument()
    // quem confirmou no celular continua aqui com a senha, e-mail já preenchido
    expect(screen.getByRole('link', { name: 'Já confirmei, continuar aqui' })).toHaveAttribute(
      'href',
      '/entrar?email=maria%40exemplo.com.br',
    )
  })

  it('reenviar o link avisa; corrigir o e-mail volta ao formulário com as senhas limpas', async () => {
    montar()
    preencherConta()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    })
    await screen.findByRole('heading', { name: /Confirme seu e-mail/ })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reenviar o link' }))
    })
    expect(apiFake.reenviarConfirmacao).toHaveBeenCalledWith('maria@exemplo.com.br')
    expect(await screen.findByText(/Enviamos de novo para maria@exemplo.com.br/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Corrigir o e-mail' }))
    expect(await screen.findByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveValue('Maria@Exemplo.com.br')
    expect(screen.getByLabelText('Senha')).toHaveValue('')
  })

  it('falha ao criar a conta aparece acima do formulário', async () => {
    acoes.criarContaBeta.mockRejectedValueOnce(new Error('Não conseguimos enviar o e-mail agora.'))
    montar()
    preencherConta()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    })
    expect(await screen.findByText('Não conseguimos enviar o e-mail agora.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument()
  })

  it('inscrições fechadas: aviso sem formulário', async () => {
    programa(ANTES, { open: false })
    montar()
    expect(await screen.findByText(/As inscrições da beta estão fechadas/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Crie sua conta' })).not.toBeInTheDocument()
  })
})

describe('etapa 3 — pesquisa rápida (sessão sem conta)', () => {
  beforeEach(() => {
    sessao.authenticated = true
  })

  it('chama pelo primeiro nome e não deixa enviar vazio', async () => {
    montar()
    expect(await screen.findByRole('heading', { name: /Maria, falta só a pesquisa rápida/ })).toBeInTheDocument()
    expect(screen.getByText(/Etapa 3 de 4/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Concluir inscrição' }))
    expect(
      await screen.findByText(
        'Para continuar, falta responder: quem vai usar, condição principal, sistema do computador e app do cuidador.',
      ),
    ).toBeInTheDocument()
    expect(acoes.responderPesquisa).not.toHaveBeenCalled()
  })

  it('"Eu mesmo(a)": não pede o nome de novo e grava o nome da conta', async () => {
    montar()
    await screen.findByRole('heading', { name: /falta só a pesquisa/ })

    fireEvent.click(screen.getByLabelText(/Eu mesmo\(a\)/))
    expect(screen.queryByLabelText(/gosta de ser chamad/)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Condição principal'), { target: { value: 'prefiro-nao' } })
    fireEvent.click(screen.getByLabelText('Windows'))
    fireEvent.click(screen.getByLabelText('Agora não'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Concluir inscrição' }))
    })

    expect(acoes.responderPesquisa).toHaveBeenCalledWith({
      relation: 'proprio',
      userName: 'Maria Aparecida Souza',
      condition: 'prefiro-nao',
      os: 'windows',
      wantsCaregiverApp: false,
      feedbackConsent: true,
      howFound: '',
      phone: '',
    })
  })

  it('outra pessoa: pede como ela gosta de ser chamada', async () => {
    montar()
    await screen.findByRole('heading', { name: /falta só a pesquisa/ })

    fireEvent.click(screen.getByLabelText('Meu cônjuge'))
    fireEvent.change(screen.getByLabelText('Condição principal'), { target: { value: 'ela' } })
    fireEvent.click(screen.getByLabelText('Não sei'))
    fireEvent.click(screen.getByLabelText('Sim, quero'))
    fireEvent.click(screen.getByRole('button', { name: 'Concluir inscrição' }))
    expect(await screen.findByText(/falta responder: como a pessoa gosta de ser chamada/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Como essa pessoa gosta de ser chamada?'), { target: { value: 'João' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Concluir inscrição' }))
    })
    expect(acoes.responderPesquisa).toHaveBeenCalledWith(
      expect.objectContaining({ relation: 'conjuge', userName: 'João', os: 'nao-sei', wantsCaregiverApp: true }),
    )
  })

  it('falha de rede ao ler a conta: avisa em vez de afirmar que falta a pesquisa', async () => {
    sessao.sessionError = 'Failed to fetch'
    montar()
    expect(await screen.findByText(/Não foi possível carregar os dados da sua conta/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Concluir inscrição' })).not.toBeInTheDocument()
  })
})

describe('etapa 4 — download (conta beta)', () => {
  beforeEach(() => {
    sessao.authenticated = true
    sessao.account = contaBeta
  })

  it('antes do lançamento: inscrição concluída, Windows travado em 10/11 e nenhum link de arquivo', async () => {
    programa(ANTES)
    montar()
    expect(await screen.findByRole('heading', { name: 'Inscrição concluída, Maria!' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(/Disponível em 10\/11/).length).toBeGreaterThan(0))
    expect(document.querySelector('a[href*="/download/"]')).toBeNull()
    expect(screen.queryByText('Todas as versões')).not.toBeInTheDocument()
    expect(screen.getByText(/Também abre em 10\/11/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver meu perfil' })).toHaveAttribute('href', '/perfil')
  })

  it('depois do lançamento: "Tudo pronto", o instalador liberado e o clique registrado', async () => {
    programa(DEPOIS)
    montar()
    expect(await screen.findByRole('heading', { name: /Tudo pronto, Maria! Baixe o IrisFlow/ })).toBeInTheDocument()
    const painel = document.querySelector('.dl') as HTMLElement
    const baixar = within(painel)
      .getAllByRole('link')
      .find((a) => a.getAttribute('href')?.includes('/download/'))
    expect(baixar).toBeTruthy()
    fireEvent.click(baixar!)
    expect(apiFake.markBetaDownload).toHaveBeenCalledWith('windows')
    expect(screen.getByText('Todas as versões')).toBeInTheDocument()
  })
})

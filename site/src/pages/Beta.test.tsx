import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Beta from './Beta'
import type { Account } from '@/context/AccountContext'
import { BETA_PROGRAM_RESERVA, type BetaProgram, type PerfilBasico } from '@/services/api'
import { RASCUNHO_KEY, salvarRascunhoBeta } from '@/lib/rascunhoBeta'

/* ============================================================
   Página /beta (README da raiz, seção "Site (site/)").

   Estados decididos pela sessão: sem conta mostra o formulário; com
   conta mostra o painel de download com "acesso beta até"; com as
   inscrições fechadas, o aviso sem formulário. Regras que mudam em
   relação ao /cadastro: CPF e telefone são opcionais — vazios passam,
   inválidos não. Com "Confirm email" ligado, o envio dá lugar ao aviso
   de confirmação; quem volta com sessão e sem inscrição conclui sem
   digitar de novo nome, e-mail e senha.
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
const { sessao, registerBeta, signOut, apiFake } = vi.hoisted(() => {
  const sessao = {
    account: null as Account | null,
    authenticated: false,
    loading: false,
    sessionError: null as string | null,
  }
  const registerBeta = vi.fn()
  const signOut = vi.fn(async () => {})
  const apiFake = {
    programa: null as BetaProgram | null,
    perfil: null as PerfilBasico | null,
    markBetaDownload: vi.fn(async () => {}),
    reenviarConfirmacao: vi.fn(async (_email: string) => {}),
  }
  return { sessao, registerBeta, signOut, apiFake }
})

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => ({ ...sessao, registerBeta, signOut, refresh: vi.fn() }),
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
    // as flags só calam os avisos de migração para o v7
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Beta />
    </MemoryRouter>,
  )
}

/** Preenche a etapa 1 com dados válidos; CPF e telefone variam. */
function preencherEtapa1(cpf: string, telefone = '11900000000') {
  fireEvent.change(screen.getByLabelText('Nome completo'), {
    target: { value: 'Maria Aparecida Souza' },
  })
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'maria@exemplo.com.br' } })
  fireEvent.change(screen.getByLabelText('Telefone (opcional)'), { target: { value: telefone } })
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: cpf } })
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo123' } })
  fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'segredo123' } })
}

/** Etapa 2 com dados válidos. */
function preencherEtapa2() {
  fireEvent.change(screen.getByLabelText('Nome da pessoa que vai usar'), { target: { value: 'João' } })
  fireEvent.change(screen.getByLabelText('Sua relação com ela'), { target: { value: 'conjuge' } })
  fireEvent.change(screen.getByLabelText('Condição principal'), { target: { value: 'ela' } })
  fireEvent.change(screen.getByLabelText('Sistema do computador onde a IrisFlow será instalada'), {
    target: { value: 'windows' },
  })
}

/** Da etapa 1 já preenchida até o envio, marcando o aceite dos termos. */
function avancarEEnviar() {
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  preencherEtapa2()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  fireEvent.click(screen.getByLabelText(/Li e aceito/))
  fireEvent.click(screen.getByRole('button', { name: 'Entrar na beta' }))
}

// O jsdom não navega: um clique em <a target="_blank"> só vira aviso de
// "not implemented". Cancelar o padrão SÓ nos links evita o ruído sem
// afetar o teste — em botão de envio e caixa de seleção, cancelar o clique
// impediria o envio e a marcação.
const cancelarNavegacao = (e: Event) => {
  if ((e.target as Element | null)?.closest?.('a')) e.preventDefault()
}

beforeEach(() => {
  vi.clearAllMocks()
  sessao.account = null
  sessao.authenticated = false
  sessao.loading = false
  sessao.sessionError = null
  apiFake.programa = null
  apiFake.perfil = null
  window.localStorage.clear()
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
    expect(screen.getByLabelText('Telefone (opcional)')).toBeInTheDocument()
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

  it('CPF inválido não passa: o erro aparece e o Continuar fica desabilitado', async () => {
    montar()
    preencherEtapa1('111.111.111-11')

    // validação em tempo real: o botão já nasce desabilitado com o CPF inválido
    const continuar = screen.getByRole('button', { name: 'Continuar' })
    expect(continuar).toBeDisabled()
    fireEvent.click(continuar)
    expect(screen.queryByText(/Dados de quem vai usar/)).not.toBeInTheDocument()

    // e a mensagem aparece ao sair do campo, sem precisar clicar em nada
    fireEvent.blur(screen.getByLabelText('CPF'))
    expect(await screen.findByText(/CPF inválido/)).toBeInTheDocument()
    expect(screen.getByLabelText('CPF')).toHaveAttribute('aria-invalid', 'true')
  })

  it('com o Continuar desabilitado, a dica NOMEIA o que falta (leitor de tela e teclado)', () => {
    montar()
    preencherEtapa1('')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    // Etapa 2 em branco: as quatro coisas que faltam aparecem pelo nome.
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    const dica = screen.getByText(/Para continuar, falta corrigir ou preencher:/)
    expect(dica).toHaveTextContent(
      'nome da pessoa que vai usar, relação com ela, condição principal e sistema do computador',
    )
    // Preenchido um, ele sai da lista.
    fireEvent.change(screen.getByLabelText('Nome da pessoa que vai usar'), { target: { value: 'João' } })
    expect(screen.getByText(/Para continuar/)).not.toHaveTextContent('nome da pessoa')
  })

  it('telefone vazio passa na etapa 1', () => {
    montar()
    preencherEtapa1('', '')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByText(/Dados de quem vai usar/)).toBeInTheDocument()
  })

  it('telefone preenchido pela metade não passa: o formato continua validado', async () => {
    montar()
    preencherEtapa1('', '11900')

    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    fireEvent.blur(screen.getByLabelText('Telefone (opcional)'))
    expect(await screen.findByText(/telefone com DDD/)).toBeInTheDocument()
    expect(screen.getByLabelText('Telefone (opcional)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('sem telefone, o resumo diz "Não informado" e a inscrição segue com telefone vazio', async () => {
    registerBeta.mockResolvedValueOnce(contaBeta)
    montar()
    preencherEtapa1('', '')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    preencherEtapa2()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByText('Não informado')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText(/Li e aceito/))
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na beta' }))

    await waitFor(() => expect(registerBeta).toHaveBeenCalledTimes(1))
    const [perfil, senha] = registerBeta.mock.calls[0]
    // quem converte para dígitos/null é o api.ts (ver api.test.ts)
    expect(perfil.phone).toBe('')
    expect(senha).toBe('segredo123')
    // a senha nunca vai junto do perfil
    expect(perfil).not.toHaveProperty('password')
    expect(perfil).not.toHaveProperty('passwordConfirm')
  })
})

describe('<Beta /> com "Confirm email" ligado', () => {
  async function enviarAteAConfirmacao() {
    const { ConfirmacaoDeEmailPendente } = await import('@/services/api')
    registerBeta.mockRejectedValueOnce(new ConfirmacaoDeEmailPendente('maria@exemplo.com.br'))
    montar()
    preencherEtapa1('123.456.789-09')
    avancarEEnviar()
    await screen.findByRole('heading', { name: /Falta confirmar o seu e-mail/ })
  }

  it('troca o formulário pelo aviso de confirmação, com o e-mail e o reenvio', async () => {
    await enviarAteAConfirmacao()

    expect(screen.getByText('maria@exemplo.com.br')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Já confirmei, entrar/ })).toHaveAttribute('href', '/entrar')

    fireEvent.click(screen.getByRole('button', { name: /Reenviar o link/ }))
    await waitFor(() =>
      expect(apiFake.reenviarConfirmacao).toHaveBeenCalledWith('maria@exemplo.com.br'),
    )
    expect(await screen.findByText(/Enviamos de novo/)).toBeInTheDocument()
  })

  it('guarda um rascunho só com o que não é sensível: sem CPF, condição, telefone ou senha', async () => {
    await enviarAteAConfirmacao()

    const bruto = window.localStorage.getItem(RASCUNHO_KEY)
    expect(bruto).not.toBeNull()
    const guardado = JSON.parse(bruto as string)
    expect(guardado.email).toBe('maria@exemplo.com.br')
    expect(guardado.campos).toMatchObject({ userName: 'João', relation: 'conjuge', os: 'windows' })
    for (const proibido of ['document', 'condition', 'phone', 'password', 'passwordConfirm']) {
      expect(guardado.campos).not.toHaveProperty(proibido)
    }
    expect(bruto).not.toContain('123.456.789-09')
    expect(bruto).not.toContain('segredo123')
    expect(bruto).not.toContain('"ela"')
  })

  it('"Corrigir o e-mail" volta para a primeira etapa com os dados em memória', async () => {
    await enviarAteAConfirmacao()

    fireEvent.click(screen.getByRole('button', { name: 'Corrigir o e-mail' }))
    expect(screen.getByLabelText('E-mail')).toHaveValue('maria@exemplo.com.br')
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Maria Aparecida Souza')
  })
})

describe('<Beta /> com sessão aberta e sem inscrição (voltou pelo link do e-mail)', () => {
  beforeEach(() => {
    sessao.authenticated = true
    apiFake.perfil = {
      buyerName: 'Maria Aparecida Souza',
      email: 'maria@exemplo.com.br',
      phone: '11900000000',
      newsletter: false,
    }
  })

  it('não pede nome, e-mail nem senha: mostra os da conta e avisa que ficou pela metade', async () => {
    montar()

    expect(await screen.findByText('maria@exemplo.com.br')).toBeInTheDocument()
    expect(screen.getByText('Maria Aparecida Souza')).toBeInTheDocument()
    expect(screen.getByText(/ficou pela metade/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome completo')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
    // o telefone do perfil volta mascarado, e CPF segue opcional
    expect(screen.getByLabelText('Telefone (opcional)')).toHaveValue('(11) 90000-0000')
    expect(screen.getByLabelText('CPF')).toHaveValue('')
    // o que é sensível é pedido de novo, e a tela diz por quê
    expect(screen.getByText(/nunca ficam guardados/)).toBeInTheDocument()
    // em vez de "Já tem conta? Entrar", a saída é sair desta conta
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })

  it('traz de volta o rascunho do mesmo e-mail e conclui sem senha', async () => {
    salvarRascunhoBeta('maria@exemplo.com.br', {
      userName: 'João',
      relation: 'conjuge',
      os: 'windows',
      wantsCaregiverApp: false,
      feedbackConsent: true,
      howFound: 'Indicação',
    })
    registerBeta.mockResolvedValueOnce(contaBeta)
    montar()

    expect(await screen.findByText(/Recuperamos o que ficou salvo/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByLabelText('Nome da pessoa que vai usar')).toHaveValue('João')
    expect(screen.getByLabelText('Sua relação com ela')).toHaveValue('conjuge')
    // a condição de saúde nunca é guardada: continua em branco e obrigatória
    expect(screen.getByLabelText('Condição principal')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Condição principal'), { target: { value: 'ela' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    fireEvent.click(screen.getByLabelText(/Li e aceito/))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar na beta' }))
    })

    expect(registerBeta).toHaveBeenCalledTimes(1)
    const [perfil, senha] = registerBeta.mock.calls[0]
    expect(senha).toBe('')
    expect(perfil).toMatchObject({
      buyerName: 'Maria Aparecida Souza',
      email: 'maria@exemplo.com.br',
      phone: '(11) 90000-0000',
      userName: 'João',
      relation: 'conjuge',
      condition: 'ela',
      os: 'windows',
      wantsCaregiverApp: false,
      howFound: 'Indicação',
      newsletter: false,
    })
  })

  it('rascunho de outro e-mail não é usado', async () => {
    salvarRascunhoBeta('outra@exemplo.com.br', { userName: 'Pedro', relation: 'filho', os: 'linux' })
    montar()

    await screen.findByText('maria@exemplo.com.br')
    expect(screen.queryByText(/Recuperamos o que ficou salvo/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByLabelText('Nome da pessoa que vai usar')).toHaveValue('')
  })

  it('com falha de rede ao ler a conta, não afirma que a inscrição ficou pela metade', () => {
    sessao.sessionError = 'Failed to fetch'
    montar()

    expect(screen.getByText(/Não foi possível carregar os dados da sua conta/)).toBeInTheDocument()
    expect(screen.queryByText(/ficou pela metade/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
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

    const windows = screen.getByRole('link', { name: /Baixar para Windows/ })
    expect(windows).toHaveAttribute(
      'href',
      'https://github.com/dono/repo/releases/latest/download/IrisFlow-Setup.exe',
    )
    fireEvent.click(windows)
    expect(apiFake.markBetaDownload).toHaveBeenCalledWith('windows')

    // sistema sem instalador publicado: botão desabilitado e legível, "Em breve"
    expect(screen.getByRole('button', { name: /macOS — Em breve/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: /Todas as versões/ })).toHaveAttribute(
      'href',
      'https://github.com/dono/repo/releases',
    )
  })
})

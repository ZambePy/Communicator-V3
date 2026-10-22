import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render as renderBase, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DownloadPanel } from './DownloadPanel'
import { __resetLatestReleaseForTests } from '@/lib/latestRelease'

/** O painel tem links internos (o teste do computador, o contato): precisa do roteador. */
function render(ui: ReactElement) {
  return renderBase(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>,
  )
}

// O APK do app do cuidador: o teste decide se o site o oferece
// (VITE_APP_CUIDADOR_URL). Por padrão, não — os testes dos instaladores
// continuam olhando só para o computador.
const { lojas, aparelho } = vi.hoisted(() => ({
  lojas: { googlePlay: null as string | null, appStore: null as string | null, apk: null as string | null },
  aparelho: { celular: false },
}))
vi.mock('@/lib/lojas', () => ({ LOJAS: lojas, SELOS_OFICIAIS: false, PACOTE_ANDROID: 'br.com.irisflow.cuidador' }))
vi.mock('@/lib/aparelho', () => ({
  ehIOS: () => false,
  ehAndroid: () => aparelho.celular,
  ehCelular: () => aparelho.celular,
}))

/* ============================================================
   Painel de downloads com a disponibilidade vinda do último release do
   GitHub (fetch interceptado). Nos testes VITE_RELEASES_REPO e
   VITE_RELEASES_AVAILABLE estão vazias: repositório padrão e só o Windows
   liberado — o painel nunca mostra botão de sistema que o resto do site
   chama de "em preparação", mesmo que o release tenha o arquivo.
   ============================================================ */

const API = 'https://api.github.com/repos/ZambePy/Communicator-V3/releases/latest'
const DL = 'https://github.com/ZambePy/Communicator-V3/releases/download/v1.0.0-beta.3'

const asset = (name: string) => ({ name, state: 'uploaded', browser_download_url: `${DL}/${name}` })

const RELEASE_COMPLETO = {
  tag_name: 'v1.0.0-beta.3',
  assets: [
    'IrisFlow-Setup.exe',
    'IrisFlow-Setup.exe.blockmap',
    'IrisFlow-mac-arm64.dmg',
    'IrisFlow-mac-x64.dmg',
    'IrisFlow-linux-x86_64.AppImage',
    'IrisFlow-linux-amd64.deb',
    'latest.yml',
  ].map(asset),
}

const SO_WINDOWS = { tag_name: 'v1.0.0-beta.3', assets: ['IrisFlow-Setup.exe', 'latest.yml'].map(asset) }

function responder(status: number, corpo: unknown) {
  const fetchFake = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  }))
  vi.stubGlobal('fetch', fetchFake)
  return fetchFake
}

beforeEach(() => {
  window.sessionStorage.clear()
  __resetLatestReleaseForTests()
  lojas.apk = null
  aparelho.celular = false
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<DownloadPanel /> com o último release do GitHub', () => {
  it('release com .exe, .dmg, .AppImage e .deb, mas só o Windows liberado (padrão): só ele ganha botão', async () => {
    const fetchFake = responder(200, RELEASE_COMPLETO)
    render(<DownloadPanel />)

    // o link do Windows passa a ser o do release (a resposta chegou)
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Baixar para Windows/ })).toHaveAttribute(
        'href',
        `${DL}/IrisFlow-Setup.exe`,
      ),
    )
    expect(screen.getByRole('button', { name: /macOS: em breve/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Linux: em breve/ })).toBeDisabled()
    expect(screen.queryByRole('link', { name: /Mac/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Linux|\.deb/ })).not.toBeInTheDocument()
    // mesma palavra das frases de plataforma do site
    expect(screen.getByText(/Versão para macOS em preparação/)).toBeInTheDocument()
    expect(screen.getByText(/Versão para Linux em preparação/)).toBeInTheDocument()
    expect(fetchFake).toHaveBeenCalledWith(API, expect.objectContaining({ credentials: 'omit' }))
  })

  it('com os três sistemas em VITE_RELEASES_AVAILABLE, o release completo libera os três, com os links do release', async () => {
    vi.stubEnv('VITE_RELEASES_AVAILABLE', 'windows,macos,linux')
    vi.resetModules()
    try {
      const { DownloadPanel: Painel } = await import('./DownloadPanel')
      responder(200, RELEASE_COMPLETO)
      render(<Painel />)

      const mac = await screen.findByRole('link', { name: /Baixar para Mac \(Apple Silicon\)/ })
      expect(mac).toHaveAttribute('href', `${DL}/IrisFlow-mac-arm64.dmg`)
      expect(screen.getByRole('link', { name: /Mac com processador Intel/ })).toHaveAttribute(
        'href',
        `${DL}/IrisFlow-mac-x64.dmg`,
      )
      expect(screen.getByRole('link', { name: /Baixar para Windows/ })).toHaveAttribute(
        'href',
        `${DL}/IrisFlow-Setup.exe`,
      )
      expect(screen.getByRole('link', { name: /Baixar para Linux/ })).toHaveAttribute(
        'href',
        `${DL}/IrisFlow-linux-x86_64.AppImage`,
      )
      expect(screen.getByRole('link', { name: /Pacote \.deb/ })).toHaveAttribute(
        'href',
        `${DL}/IrisFlow-linux-amd64.deb`,
      )
      expect(screen.queryByText('Em breve')).not.toBeInTheDocument()
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('liberado mas sem arquivo no release: continua "Em breve" (liberar não inventa instalador)', async () => {
    vi.stubEnv('VITE_RELEASES_AVAILABLE', 'windows,macos')
    vi.resetModules()
    try {
      const { DownloadPanel: Painel } = await import('./DownloadPanel')
      responder(200, SO_WINDOWS)
      render(<Painel />)

      await waitFor(() => expect(document.querySelector('.dl')).not.toHaveAttribute('aria-busy'))
      expect(screen.getByRole('button', { name: /macOS: em breve/ })).toBeDisabled()
      expect(screen.getByRole('link', { name: /Baixar para Windows/ })).toHaveAttribute(
        'href',
        `${DL}/IrisFlow-Setup.exe`,
      )
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })

  it('release só com .exe: macOS e Linux aparecem "Em breve", com botão desabilitado', async () => {
    responder(200, SO_WINDOWS)
    render(<DownloadPanel />)

    expect(await screen.findByRole('button', { name: /macOS: em breve/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Linux: em breve/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: /Baixar para Windows/ })).toHaveAttribute(
      'href',
      `${DL}/IrisFlow-Setup.exe`,
    )
  })

  it('API fora ou limite estourado: vale a configuração do build e o link "Todas as versões"', async () => {
    const fetchFake = responder(403, { message: 'API rate limit exceeded' })
    render(<DownloadPanel />)

    await waitFor(() => expect(fetchFake).toHaveBeenCalled())
    await waitFor(() => expect(document.querySelector('.dl')).not.toHaveAttribute('aria-busy'))
    expect(screen.getByRole('link', { name: /Baixar para Windows/ })).toHaveAttribute(
      'href',
      'https://github.com/ZambePy/Communicator-V3/releases/latest/download/IrisFlow-Setup.exe',
    )
    expect(screen.getByRole('button', { name: /macOS: em breve/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: /Todas as versões/ })).toHaveAttribute(
      'href',
      'https://github.com/ZambePy/Communicator-V3/releases',
    )
  })

  it('enquanto a consulta não volta, o painel fica aria-busy e mostra o estático', async () => {
    let soltar: (v: unknown) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((ok) => (soltar = ok))),
    )
    render(<DownloadPanel />)

    expect(document.querySelector('.dl')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: /macOS: em breve/ })).toBeDisabled()

    soltar({ ok: true, status: 200, json: async () => RELEASE_COMPLETO })
    await waitFor(() => expect(document.querySelector('.dl')).not.toHaveAttribute('aria-busy'))
    expect(screen.getByRole('link', { name: /Baixar para Windows/ })).toHaveAttribute(
      'href',
      `${DL}/IrisFlow-Setup.exe`,
    )
    // o release tem .dmg, mas o macOS não está liberado: continua "Em breve"
    expect(screen.getByRole('button', { name: /macOS: em breve/ })).toBeDisabled()
  })

  it('segunda montagem na mesma aba usa o cache, sem nova consulta', async () => {
    const fetchFake = responder(200, SO_WINDOWS)
    const { unmount } = render(<DownloadPanel />)
    await screen.findByRole('button', { name: /Linux: em breve/ })
    unmount()

    render(<DownloadPanel />)
    // sem estado de espera: a resposta guardada já vale no primeiro quadro
    expect(document.querySelector('.dl')).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('button', { name: /Linux: em breve/ })).toBeDisabled()
    expect(fetchFake).toHaveBeenCalledTimes(1)
  })
})

/* ---------------- lançamento da beta e vitrine ---------------- */

describe('<DownloadPanel liberaEm vitrine />', () => {
  const FUTURO = '2099-11-10T03:00:00Z'
  const PASSADO = '2020-11-10T03:00:00Z'

  it('antes do lançamento: o Windows fica travado com a etiqueta do dia, sem link de arquivo nem "Todas as versões"', async () => {
    responder(200, SO_WINDOWS)
    render(<DownloadPanel liberaEm={FUTURO} />)

    const travado = await screen.findByRole('button', { name: /Disponível em 10\/11/ })
    expect(travado).toBeDisabled()
    expect(screen.getByText(/O download abre no lançamento, em 10 de novembro/)).toBeInTheDocument()
    expect(document.querySelector('.dl__card.is-locked .etiqueta-lancamento')).not.toBeNull()
    expect(screen.queryByRole('link', { name: /Baixar para Windows/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Todas as versões')).not.toBeInTheDocument()
    // macOS e Linux continuam "Em breve", como antes
    expect(screen.getByRole('button', { name: 'macOS: em breve' })).toBeDisabled()
  })

  it('depois do lançamento: volta a ser o painel de sempre', async () => {
    responder(200, SO_WINDOWS)
    render(<DownloadPanel liberaEm={PASSADO} />)
    expect(await screen.findByRole('link', { name: /Baixar para Windows/ })).toBeInTheDocument()
    expect(screen.getByText('Todas as versões')).toBeInTheDocument()
    expect(document.querySelector('.dl__card.is-locked')).toBeNull()
  })

  it('vitrine (páginas públicas): nenhum link de arquivo, mesmo depois do lançamento', async () => {
    responder(200, SO_WINDOWS)
    render(<DownloadPanel vitrine liberaEm={PASSADO} />)
    expect(await screen.findByText(/Disponível para quem se inscreve na beta/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Baixar para Windows/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Todas as versões')).not.toBeInTheDocument()
  })

  it('libera sozinho na virada do lançamento, sem recarregar a página', async () => {
    responder(200, SO_WINDOWS)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const daqui = new Date(Date.now() + 5_000).toISOString()
      render(<DownloadPanel liberaEm={daqui} />)
      expect(screen.getByRole('button', { name: /Disponível em/ })).toBeDisabled()
      await vi.advanceTimersByTimeAsync(6_000)
      await waitFor(() => expect(screen.getByRole('link', { name: /Baixar para Windows/ })).toBeInTheDocument())
    } finally {
      vi.useRealTimers()
    }
  })
})

/* ---------------- o app do cuidador (APK) e o teste do computador ---------------- */

describe('<DownloadPanel /> e o .apk do release (relato de 19/10/2026)', () => {
  const APK_FIXO = 'https://github.com/ZambePy/Communicator-V3/releases/latest/download/IrisFlow-Cuidador.apk'
  const COM_APK = {
    tag_name: 'v1.0.0-beta.3',
    assets: ['IrisFlow-Setup.exe', 'latest.yml', 'IrisFlow-Cuidador.apk'].map(asset),
  }

  it('release com o .apk: o painel oferece o app do cuidador, com o arquivo do release', async () => {
    lojas.apk = APK_FIXO
    responder(200, COM_APK)
    render(<DownloadPanel liberaEm="2020-11-10T03:00:00Z" />)

    const bloco = await screen.findByRole('region', { name: 'IrisFlow Cuidador para Android' })
    await waitFor(() =>
      expect(within(bloco).getByRole('link', { name: /Baixar para Android/ })).toHaveAttribute(
        'href',
        `${DL}/IrisFlow-Cuidador.apk`,
      ),
    )
    // Mesma aba: o arquivo vem como anexo e o navegador baixa sem sair da página.
    expect(within(bloco).getByRole('link', { name: /Baixar para Android/ })).not.toHaveAttribute('target')
    // No computador, o código QR leva o celular de quem cuida até o arquivo.
    expect(within(bloco).getByRole('img', { name: /Código QR/ })).toBeInTheDocument()
    // E o .apk não vira um quarto "sistema" do computador: os três cartões
    // continuam os mesmos (na ordem do sistema de quem visita), e o app do
    // cuidador vem depois deles, à parte.
    const sistemas = Array.from(document.querySelectorAll('.dl__card .dl__name')).map((h) => h.textContent)
    expect([...sistemas].sort()).toEqual(['Linux', 'Windows', 'macOS'])
    const titulos = screen.getAllByRole('heading', { level: 3 })
    expect(titulos[titulos.length - 1]).toHaveTextContent('IrisFlow Cuidador para Android')
  })

  it('release publicado SEM o .apk: o aviso no lugar de um link que daria 404', async () => {
    lojas.apk = APK_FIXO
    responder(200, SO_WINDOWS)
    render(<DownloadPanel liberaEm="2020-11-10T03:00:00Z" />)

    expect(await screen.findByText(/O app para Android não está na versão publicada agora/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Baixar para Android/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'contato' })).toHaveAttribute('href', '/contato')
  })

  it('API fora do ar: vale o link configurado, como nos instaladores', async () => {
    lojas.apk = APK_FIXO
    const fetchFake = responder(503, {})
    render(<DownloadPanel liberaEm="2020-11-10T03:00:00Z" />)
    await waitFor(() => expect(fetchFake).toHaveBeenCalled())
    await waitFor(() => expect(document.querySelector('.dl')).not.toHaveAttribute('aria-busy'))
    expect(screen.getByRole('link', { name: /Baixar para Android/ })).toHaveAttribute('href', APK_FIXO)
  })

  it('antes do lançamento: o dia, e nenhum arquivo', async () => {
    lojas.apk = APK_FIXO
    responder(200, COM_APK)
    render(<DownloadPanel liberaEm="2099-11-10T03:00:00Z" />)
    expect(await screen.findByText(/O app para Android sai no dia do lançamento, 10\/11/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Baixar para Android/ })).not.toBeInTheDocument()
  })

  it('site sem APK configurado, vitrine ou apk={false}: o bloco não aparece', async () => {
    responder(200, COM_APK)
    const { unmount } = render(<DownloadPanel liberaEm="2020-11-10T03:00:00Z" />)
    await waitFor(() => expect(document.querySelector('.dl')).not.toHaveAttribute('aria-busy'))
    expect(screen.queryByText('IrisFlow Cuidador para Android')).not.toBeInTheDocument()
    unmount()

    lojas.apk = APK_FIXO
    const vitrine = render(<DownloadPanel vitrine liberaEm="2020-11-10T03:00:00Z" />)
    expect(screen.queryByText('IrisFlow Cuidador para Android')).not.toBeInTheDocument()
    vitrine.unmount()

    render(<DownloadPanel apk={false} liberaEm="2020-11-10T03:00:00Z" />)
    expect(screen.queryByText('IrisFlow Cuidador para Android')).not.toBeInTheDocument()
  })

  it('os botões de download levam ao teste "Meu computador funciona?"', async () => {
    responder(200, SO_WINDOWS)
    const { unmount } = render(<DownloadPanel liberaEm="2020-11-10T03:00:00Z" />)
    expect(await screen.findByRole('link', { name: 'veja se o seu computador funciona' })).toHaveAttribute(
      'href',
      '/meu-computador',
    )
    unmount()
    // A própria página do teste desliga o link.
    render(<DownloadPanel teste={false} liberaEm="2020-11-10T03:00:00Z" />)
    expect(screen.queryByRole('link', { name: 'veja se o seu computador funciona' })).not.toBeInTheDocument()
  })
})

/* Revisão final (22/10/2026): o aviso do Windows (SmartScreen) é a frase que quem
   instala precisa achar; fica num parágrafo só dele, com o texto do relatório B. Os
   cartões de sistema não usam teal (só confirmação), âmbar nem vermelho (emergência). */
describe('<DownloadPanel /> aviso do Windows e cores dos cartões', () => {
  it('diz o que o Windows mostra, por que (sem assinatura digital) e o que clicar', async () => {
    responder(200, SO_WINDOWS)
    render(<DownloadPanel liberaEm="2020-11-10T03:00:00Z" />)
    const aviso = await waitFor(() => {
      const el = document.querySelector('.dl__smartscreen')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    expect(aviso.textContent).toBe(
      'Na hora de instalar, o Windows pode mostrar “O Windows protegeu o computador”, porque o instalador ainda não tem assinatura digital. Clique em Mais informações e depois em Executar assim mesmo.',
    )
    expect(within(aviso).getByText('Mais informações').tagName).toBe('STRONG')
    expect(within(aviso).getByText('Executar assim mesmo').tagName).toBe('STRONG')
  })

  it('no painel compacto (/conta) a nota não aparece', async () => {
    responder(200, SO_WINDOWS)
    render(<DownloadPanel compact liberaEm="2020-11-10T03:00:00Z" />)
    await waitFor(() => expect(document.querySelector('.dl')).not.toHaveAttribute('aria-busy'))
    expect(document.querySelector('.dl__smartscreen')).toBeNull()
  })

  it('"Seu sistema", "Em breve" e o cartão travado não usam teal, âmbar nem vermelho', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'download-panel.css'), 'utf8')
    const regra = (seletor: string) => {
      const i = css.indexOf(`${seletor} {`)
      expect(i, `regra ${seletor}`).toBeGreaterThanOrEqual(0)
      return css.slice(i, css.indexOf('}', i))
    }
    for (const seletor of ['.dl__card.is-mine', '.dl__badge', '.dl__badge--soon', '.dl__card.is-locked']) {
      expect(regra(seletor)).not.toMatch(/teal|--ok|--warn|--danger|214,\s*41,\s*58/)
    }
  })
})

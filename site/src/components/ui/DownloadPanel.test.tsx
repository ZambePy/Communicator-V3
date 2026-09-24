import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { DownloadPanel } from './DownloadPanel'
import { __resetLatestReleaseForTests } from '@/lib/latestRelease'

/* ============================================================
   Painel de downloads com a disponibilidade vinda do último release do
   GitHub (fetch interceptado). Nos testes VITE_RELEASES_REPO e
   VITE_RELEASES_AVAILABLE estão vazias: repositório padrão e só o Windows
   liberado — o painel nunca mostra botão de sistema que o resto do site
   chama de "em preparação", mesmo que o release tenha o arquivo.
   ============================================================ */

const API = 'https://api.github.com/repos/ZambePy/Communicator-v2/releases/latest'
const DL = 'https://github.com/ZambePy/Communicator-v2/releases/download/v1.0.0-beta.3'

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
    expect(screen.getByRole('button', { name: /macOS — Em breve/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Linux — Em breve/ })).toBeDisabled()
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
      expect(screen.getByRole('button', { name: /macOS — Em breve/ })).toBeDisabled()
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

    expect(await screen.findByRole('button', { name: /macOS — Em breve/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Linux — Em breve/ })).toBeDisabled()
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
      'https://github.com/ZambePy/Communicator-v2/releases/latest/download/IrisFlow-Setup.exe',
    )
    expect(screen.getByRole('button', { name: /macOS — Em breve/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: /Todas as versões/ })).toHaveAttribute(
      'href',
      'https://github.com/ZambePy/Communicator-v2/releases',
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
    expect(screen.getByRole('button', { name: /macOS — Em breve/ })).toBeDisabled()

    soltar({ ok: true, status: 200, json: async () => RELEASE_COMPLETO })
    await waitFor(() => expect(document.querySelector('.dl')).not.toHaveAttribute('aria-busy'))
    expect(screen.getByRole('link', { name: /Baixar para Windows/ })).toHaveAttribute(
      'href',
      `${DL}/IrisFlow-Setup.exe`,
    )
    // o release tem .dmg, mas o macOS não está liberado: continua "Em breve"
    expect(screen.getByRole('button', { name: /macOS — Em breve/ })).toBeDisabled()
  })

  it('segunda montagem na mesma aba usa o cache, sem nova consulta', async () => {
    const fetchFake = responder(200, SO_WINDOWS)
    const { unmount } = render(<DownloadPanel />)
    await screen.findByRole('button', { name: /Linux — Em breve/ })
    unmount()

    render(<DownloadPanel />)
    // sem estado de espera: a resposta guardada já vale no primeiro quadro
    expect(document.querySelector('.dl')).not.toHaveAttribute('aria-busy')
    expect(screen.getByRole('button', { name: /Linux — Em breve/ })).toBeDisabled()
    expect(fetchFake).toHaveBeenCalledTimes(1)
  })
})

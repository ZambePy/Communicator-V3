import { describe, expect, it } from 'vitest'
import {
  ALL_OS,
  DEFAULT_AVAILABLE,
  DEFAULT_RELEASES_REPO,
  NO_RELEASE,
  availableOS,
  buildDownloads,
  buildDownloadsFromRelease,
  detectOS,
  isReleaseSnapshot,
  latestReleaseApiUrl,
  mapReleaseFiles,
  normalizeRepo,
  parseAvailable,
  parseLatestRelease,
  platformsText,
  releaseAssetUrl,
  releasesPageUrl,
  type ReleaseFile,
} from './releases'

/** Arquivo de release como o GitHub descreve, com link de download da tag. */
const arquivo = (name: string): ReleaseFile => ({
  name,
  url: `https://github.com/dono/repo/releases/download/v1.0.0-beta.3/${name}`,
})

/** O que o empacotamento publica hoje (package.json "build" e electron/package-app.mjs). */
const RELEASE_COMPLETO = [
  'IrisFlow-Setup.exe',
  'IrisFlow-Setup.exe.blockmap',
  'latest.yml',
  'IrisFlow-mac-arm64.dmg',
  'IrisFlow-mac-x64.dmg',
  'IrisFlow-mac-arm64.zip',
  'IrisFlow-mac-x64.zip',
  'latest-mac.yml',
  'IrisFlow-linux-x86_64.AppImage',
  'IrisFlow-linux-amd64.deb',
  'IrisFlow-linux-x86_64.rpm',
  'latest-linux.yml',
].map(arquivo)

describe('URLs dos instaladores (GitHub Releases)', () => {
  it('monta o link do último release com o nome estável do arquivo', () => {
    expect(releaseAssetUrl('dono/repo', 'IrisFlow-Setup.exe')).toBe(
      'https://github.com/dono/repo/releases/latest/download/IrisFlow-Setup.exe',
    )
    expect(releasesPageUrl('dono/repo')).toBe('https://github.com/dono/repo/releases')
  })

  it('usa exatamente os nomes publicados pelo electron-builder', () => {
    const files = buildDownloads('dono/repo', ['windows', 'macos', 'linux']).flatMap((p) =>
      p.assets.map((a) => a.url.split('/').pop()),
    )
    expect(files).toEqual([
      'IrisFlow-Setup.exe',
      'IrisFlow-mac-arm64.dmg',
      'IrisFlow-mac-x64.dmg',
      'IrisFlow-linux-x86_64.AppImage',
      'IrisFlow-linux-amd64.deb',
    ])
  })

  it('marca como indisponível o sistema fora da lista', () => {
    const [win, mac, linux] = buildDownloads('dono/repo', ['windows'])
    expect(win.available).toBe(true)
    expect(mac.available).toBe(false)
    expect(linux.available).toBe(false)
  })

  it('aceita o repositório como URL do GitHub e cai no padrão se inválido', () => {
    expect(normalizeRepo('https://github.com/dono/repo.git')).toBe('dono/repo')
    expect(normalizeRepo(' dono/repo/ ')).toBe('dono/repo')
    expect(normalizeRepo('')).toBe(DEFAULT_RELEASES_REPO)
    expect(normalizeRepo('não é repo')).toBe(DEFAULT_RELEASES_REPO)
  })

  it('lê VITE_RELEASES_AVAILABLE com apelidos e sem repetir', () => {
    expect(parseAvailable('')).toEqual(DEFAULT_AVAILABLE)
    expect(parseAvailable('Linux, mac ,windows,win')).toEqual(['windows', 'macos', 'linux'])
    expect(parseAvailable('nada')).toEqual([])
  })

  it('o texto de plataformas acompanha o que está publicado', () => {
    expect(platformsText(['windows']).long).toBe('Windows 10/11 (macOS e Linux em preparação)')
    expect(platformsText(['windows', 'macos', 'linux']).long).toBe('Windows 10/11, macOS e Linux')
  })
})

describe('último release pela API do GitHub: arquivos mapeados pela extensão', () => {
  it('monta o endpoint público do último release', () => {
    expect(latestReleaseApiUrl('dono/repo')).toBe('https://api.github.com/repos/dono/repo/releases/latest')
    expect(latestReleaseApiUrl('https://github.com/dono/repo.git')).toBe(
      'https://api.github.com/repos/dono/repo/releases/latest',
    )
  })

  it('release completo: .exe no Windows; .dmg Apple Silicon e Intel; .AppImage e .deb no Linux', () => {
    const { windows, macos, linux } = mapReleaseFiles(RELEASE_COMPLETO)

    expect(windows.map((a) => a.file)).toEqual(['IrisFlow-Setup.exe'])
    expect(macos.map((a) => a.file)).toEqual(['IrisFlow-mac-arm64.dmg', 'IrisFlow-mac-x64.dmg'])
    expect(macos[0].label).toBe('Baixar para Mac (Apple Silicon)')
    expect(macos[1].label).toBe('Mac com processador Intel')
    expect(linux.map((a) => a.file)).toEqual(['IrisFlow-linux-x86_64.AppImage', 'IrisFlow-linux-amd64.deb'])
    // .blockmap, .yml, .zip e .rpm nunca viram botão
    const todos = [...windows, ...macos, ...linux].map((a) => a.file)
    expect(todos.some((f) => /\.(blockmap|yml|zip|rpm)$/.test(f))).toBe(false)
    // o link é o do próprio release, não um palpite de nome
    expect(windows[0].url).toBe(
      'https://github.com/dono/repo/releases/download/v1.0.0-beta.3/IrisFlow-Setup.exe',
    )
  })

  it('não depende dos nomes: extensão em maiúsculas ou com versão no nome também serve', () => {
    const { windows, macos, linux } = mapReleaseFiles(
      ['IrisFlow Communicator Setup 1.2.0.EXE', 'IrisFlow-1.2.0-arm64.DMG', 'irisflow_1.2.0.appimage'].map(arquivo),
    )
    expect(windows).toHaveLength(1)
    expect(macos.map((a) => a.label)).toEqual(['Baixar para Mac (Apple Silicon)'])
    expect(linux.map((a) => a.label)).toEqual(['Baixar para Linux'])
  })

  it('um .dmg só de Intel, ou sem arquitetura no nome, ganha o rótulo certo', () => {
    expect(mapReleaseFiles([arquivo('IrisFlow-mac-x64.dmg')]).macos.map((a) => a.label)).toEqual([
      'Baixar para Mac (Intel)',
    ])
    expect(mapReleaseFiles([arquivo('IrisFlow.dmg')]).macos.map((a) => a.label)).toEqual([
      'Baixar para Mac',
    ])
  })

  it('Linux só com .deb vira botão principal; pacote ARM fica de fora (o site anuncia x86_64)', () => {
    const { linux } = mapReleaseFiles(
      ['IrisFlow-linux-arm64.AppImage', 'IrisFlow-linux-amd64.deb'].map(arquivo),
    )
    expect(linux.map((a) => [a.file, a.label])).toEqual([
      ['IrisFlow-linux-amd64.deb', 'Baixar para Linux (.deb)'],
    ])
  })

  it('com mais de um .exe, prefere o instalador ("Setup")', () => {
    const { windows } = mapReleaseFiles(['Desinstalar.exe', 'IrisFlow-Setup.exe'].map(arquivo))
    expect(windows.map((a) => a.file)).toEqual(['IrisFlow-Setup.exe'])
  })

  it('"Em breve" só para o sistema sem instalador no último release (todos liberados)', () => {
    const soWindows = buildDownloadsFromRelease({ tag: 'v1', files: [arquivo('IrisFlow-Setup.exe')] }, ALL_OS)
    expect(soWindows.map((p) => [p.os, p.available])).toEqual([
      ['windows', true],
      ['macos', false],
      ['linux', false],
    ])
    expect(availableOS(soWindows)).toEqual(['windows'])

    const completo = buildDownloadsFromRelease({ tag: 'v1', files: RELEASE_COMPLETO }, ALL_OS)
    expect(availableOS(completo)).toEqual(['windows', 'macos', 'linux'])
    expect(completo[1].requirement).toBe('Apple Silicon (M1 ou mais novo) ou Intel')

    const soArm = buildDownloadsFromRelease({ tag: 'v1', files: [arquivo('IrisFlow-mac-arm64.dmg')] }, ALL_OS)
    expect(soArm[1].requirement).toBe('Apple Silicon (M1 ou mais novo)')

    // nenhum release publicado (404): tudo "Em breve"
    expect(availableOS(buildDownloadsFromRelease(NO_RELEASE, ALL_OS))).toEqual([])
  })

  it('só ganha botão o sistema liberado em VITE_RELEASES_AVAILABLE, mesmo com arquivo no release', () => {
    // O padrão (só Windows) com um release que já traz .dmg e AppImage: o
    // resto do site diz "macOS e Linux em preparação", e o painel concorda.
    const padrao = buildDownloadsFromRelease({ tag: 'v1', files: RELEASE_COMPLETO }, DEFAULT_AVAILABLE)
    expect(padrao.map((p) => [p.os, p.available])).toEqual([
      ['windows', true],
      ['macos', false],
      ['linux', false],
    ])
    expect(availableOS(padrao)).toEqual(['windows'])
    expect(platformsText(availableOS(padrao))).toEqual(platformsText(DEFAULT_AVAILABLE))

    // Liberar não inventa instalador: sistema liberado sem arquivo segue "Em breve".
    const soWindowsNoRelease = buildDownloadsFromRelease(
      { tag: 'v1', files: [arquivo('IrisFlow-Setup.exe')] },
      parseAvailable('windows,macos'),
    )
    expect(availableOS(soWindowsNoRelease)).toEqual(['windows'])
  })

  it('lê a resposta da API: ignora arquivo ainda subindo e link que não é de download do GitHub', () => {
    const snap = parseLatestRelease(
      {
        tag_name: 'v1.0.0-beta.3',
        draft: false,
        prerelease: false,
        assets: [
          {
            name: 'IrisFlow-Setup.exe',
            state: 'uploaded',
            browser_download_url:
              'https://github.com/dono/repo/releases/download/v1.0.0-beta.3/IrisFlow-Setup.exe',
          },
          { name: 'IrisFlow-mac-arm64.dmg', state: 'new', browser_download_url: 'https://github.com/x' },
          { name: 'IrisFlow-linux-x86_64.AppImage', state: 'uploaded', browser_download_url: 'javascript:alert(1)' },
          { nome: 'sem name' },
          null,
        ],
      },
      'dono/repo',
    )

    expect(snap).toEqual({
      tag: 'v1.0.0-beta.3',
      files: [
        {
          name: 'IrisFlow-Setup.exe',
          url: 'https://github.com/dono/repo/releases/download/v1.0.0-beta.3/IrisFlow-Setup.exe',
        },
        {
          name: 'IrisFlow-linux-x86_64.AppImage',
          url: 'https://github.com/dono/repo/releases/latest/download/IrisFlow-linux-x86_64.AppImage',
        },
      ],
    })
    expect(isReleaseSnapshot(snap)).toBe(true)
  })

  it('resposta sem a lista de arquivos não é um release', () => {
    expect(parseLatestRelease({ message: 'API rate limit exceeded' }, 'dono/repo')).toBeNull()
    expect(parseLatestRelease(null, 'dono/repo')).toBeNull()
    expect(parseLatestRelease('texto', 'dono/repo')).toBeNull()
    expect(isReleaseSnapshot({ tag: 'v1', files: [{ name: 'a.exe', url: 'https://evil.example/a.exe' }] })).toBe(false)
  })
})

describe('detecção do sistema', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', '', 'windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', 'MacIntel', 'macos'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64', 'linux'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel) Mobile', 'Linux armv8l', null],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', null],
  ])('%s → %s', (ua, platform, os) => {
    expect(detectOS(ua, platform)).toBe(os)
  })
})

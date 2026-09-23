/* ============================================================
   Instaladores do IrisFlow Communicator — links do GitHub Releases.

   UMA constante manda em tudo: VITE_RELEASES_REPO ("dono/repo").

   Em tempo de execução (src/lib/latestRelease.ts) o site pergunta à API
   pública do GitHub qual é o último release e o que ele contém, e mapeia
   os arquivos PELA EXTENSÃO — os nomes podem mudar no empacotamento sem
   quebrar o site:

     Windows  .exe
     macOS    .dmg (Apple Silicon e Intel, pelo "arm64"/"x64" no nome)
     Linux    .AppImage (principal) e .deb

   Sistema sem arquivo no último release aparece como "Em breve", com
   botão desabilitado e legível — nunca um link que dá 404. E só ganha
   botão o sistema que VITE_RELEASES_AVAILABLE libera: um .dmg ou um
   AppImage que o empacotamento publique antes da hora não vira botão ao
   lado de um texto dizendo que aquele sistema está "em preparação".

   Se a API falhar ou estourar o limite, vale o comportamento estático:
   VITE_RELEASES_AVAILABLE diz quais sistemas têm instalador (lista
   separada por vírgula) e os links seguem o formato de "último release",

     https://github.com/<repo>/releases/latest/download/<arquivo>

   com os nomes que o empacotamento publica hoje (RELEASE_FILES). A mesma
   variável continua sendo a base das frases de plataforma espalhadas pelo
   site (platformsText), fora dos painéis de download.
   ============================================================ */

export type OS = 'windows' | 'macos' | 'linux'

export const ALL_OS: OS[] = ['windows', 'macos', 'linux']

/** Repositório usado quando VITE_RELEASES_REPO não está definida. */
export const DEFAULT_RELEASES_REPO = 'ZambePy/Blinkv1'

/** Sistemas com instalador publicado quando VITE_RELEASES_AVAILABLE não está definida. */
export const DEFAULT_AVAILABLE: OS[] = ['windows']

/** Nomes que o empacotamento publica hoje. Só usados quando a API do GitHub
    não responde: aí os links seguem o formato /releases/latest/download/. */
export const RELEASE_FILES = {
  windows: 'IrisFlow-Setup.exe',
  macArm: 'IrisFlow-mac-arm64.dmg',
  macIntel: 'IrisFlow-mac-x64.dmg',
  appImage: 'IrisFlow-linux-x86_64.AppImage',
  deb: 'IrisFlow-linux-amd64.deb',
} as const

export type Asset = {
  /** Rótulo do botão. */
  label: string
  /** Detalhe curto abaixo do rótulo (arquitetura, formato). */
  detail: string
  file: string
  url: string
}

export type PlatformDownload = {
  os: OS
  name: string
  /** Requisito mínimo, uma linha. */
  requirement: string
  available: boolean
  /** O primeiro é o principal. */
  assets: Asset[]
}

/** Aceita "dono/repo", "https://github.com/dono/repo(.git)" ou vazio. */
export function normalizeRepo(raw?: string | null): string {
  const value = (raw ?? '').trim()
  if (!value) return DEFAULT_RELEASES_REPO
  const m = value.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i)
  return m ? `${m[1]}/${m[2]}` : DEFAULT_RELEASES_REPO
}

/** Lê "windows,macos" (maiúsculas, espaços e "mac" aceitos). Vazio = padrão. */
export function parseAvailable(raw?: string | null): OS[] {
  const value = (raw ?? '').trim()
  if (!value) return DEFAULT_AVAILABLE
  const set = new Set<OS>()
  for (const part of value.toLowerCase().split(/[\s,;]+/)) {
    if (part === 'windows' || part === 'win') set.add('windows')
    else if (part === 'macos' || part === 'mac' || part === 'osx') set.add('macos')
    else if (part === 'linux') set.add('linux')
  }
  return ALL_OS.filter((os) => set.has(os))
}

/** URL do arquivo no último release publicado do repositório. */
export function releaseAssetUrl(repo: string, file: string): string {
  return `https://github.com/${normalizeRepo(repo)}/releases/latest/download/${encodeURIComponent(file)}`
}

/** Página com todas as versões (inclusive as anteriores). */
export function releasesPageUrl(repo: string): string {
  return `https://github.com/${normalizeRepo(repo)}/releases`
}

/**
 * Monta os três sistemas, na ordem Windows, macOS, Linux, a partir da
 * configuração do build — o comportamento estático, usado enquanto a API
 * do GitHub não responde ou quando ela falha.
 */
export function buildDownloads(repo: string, available: OS[]): PlatformDownload[] {
  const url = (file: string) => releaseAssetUrl(repo, file)
  const on = (os: OS) => available.includes(os)
  return [
    {
      os: 'windows',
      name: 'Windows',
      requirement: 'Windows 10 ou 11, 64 bits',
      available: on('windows'),
      assets: [
        { label: 'Baixar para Windows', detail: 'Instalador .exe', file: RELEASE_FILES.windows, url: url(RELEASE_FILES.windows) },
      ],
    },
    {
      os: 'macos',
      name: 'macOS',
      requirement: 'Apple Silicon (M1 ou mais novo) ou Intel',
      available: on('macos'),
      assets: [
        { label: 'Baixar para Mac (Apple Silicon)', detail: 'M1, M2, M3 ou mais novo · .dmg', file: RELEASE_FILES.macArm, url: url(RELEASE_FILES.macArm) },
        { label: 'Mac com processador Intel', detail: '.dmg', file: RELEASE_FILES.macIntel, url: url(RELEASE_FILES.macIntel) },
      ],
    },
    {
      os: 'linux',
      name: 'Linux',
      requirement: 'x86_64 (64 bits)',
      available: on('linux'),
      assets: [
        { label: 'Baixar para Linux', detail: 'AppImage, roda na maioria das distribuições', file: RELEASE_FILES.appImage, url: url(RELEASE_FILES.appImage) },
        { label: 'Pacote .deb', detail: 'Ubuntu, Debian e derivados', file: RELEASE_FILES.deb, url: url(RELEASE_FILES.deb) },
      ],
    },
  ]
}

/* ---------- último release, pela API pública do GitHub ---------- */

/** Endpoint sem token (60 pedidos por hora por IP). */
export function latestReleaseApiUrl(repo: string): string {
  return `https://api.github.com/repos/${normalizeRepo(repo)}/releases/latest`
}

/** Um arquivo do release: o nome e o link direto de download. */
export type ReleaseFile = { name: string; url: string }

/** O último release. `tag` null com `files` vazio = nenhum release publicado. */
export type ReleaseSnapshot = { tag: string | null; files: ReleaseFile[] }

export const NO_RELEASE: ReleaseSnapshot = Object.freeze({ tag: null, files: [] }) as ReleaseSnapshot

/** Link de download de release do próprio GitHub (o único aceito): o de uma
    tag ou o formato estável de "último release". */
const GITHUB_DOWNLOAD =
  /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/(?:latest\/)?download\/[^\s"'<>]+$/

export function isReleaseSnapshot(value: unknown): value is ReleaseSnapshot {
  if (!value || typeof value !== 'object') return false
  const v = value as { tag?: unknown; files?: unknown }
  return (
    (v.tag === null || typeof v.tag === 'string') &&
    Array.isArray(v.files) &&
    v.files.every(
      (f) =>
        !!f &&
        typeof (f as ReleaseFile).name === 'string' &&
        typeof (f as ReleaseFile).url === 'string' &&
        GITHUB_DOWNLOAD.test((f as ReleaseFile).url),
    )
  )
}

/**
 * Lê a resposta de GET /repos/{repo}/releases/latest. Devolve null quando o
 * formato não é o esperado — quem chamou cai no comportamento estático.
 * Arquivos ainda subindo (state ≠ "uploaded") ficam de fora; link que não
 * seja de download do GitHub é trocado pelo formato estável de "último
 * release" com o mesmo nome.
 */
export function parseLatestRelease(json: unknown, repo: string): ReleaseSnapshot | null {
  if (!json || typeof json !== 'object') return null
  const r = json as { tag_name?: unknown; assets?: unknown }
  if (!Array.isArray(r.assets)) return null

  const files: ReleaseFile[] = []
  for (const a of r.assets) {
    if (!a || typeof a !== 'object') continue
    const { name, browser_download_url: url, state } = a as {
      name?: unknown
      browser_download_url?: unknown
      state?: unknown
    }
    if (typeof name !== 'string' || !name.trim()) continue
    if (state !== undefined && state !== 'uploaded') continue
    files.push({
      name,
      url: typeof url === 'string' && GITHUB_DOWNLOAD.test(url) ? url : releaseAssetUrl(repo, name),
    })
  }
  return { tag: typeof r.tag_name === 'string' ? r.tag_name : null, files }
}

const ext = (name: string, e: string) => name.toLowerCase().endsWith(e)

type MacArch = 'arm' | 'intel' | 'any'

function macArch(name: string): MacArch {
  const n = name.toLowerCase()
  if (/arm64|aarch64|apple[-_ ]?silicon/.test(n)) return 'arm'
  if (/x64|x86[-_]?64|amd64|intel/.test(n)) return 'intel'
  return 'any'
}

/** Arquitetura ARM no nome: fora do Linux x86_64 que o site anuncia. */
const isArm = (name: string) => /arm64|aarch64|armv7|armhf/i.test(name)

/**
 * Separa os arquivos do release por sistema, pela extensão. `.blockmap`,
 * `.yml`, `.zip` e `.rpm` ficam de fora; o primeiro de cada lista é o
 * botão principal.
 */
export function mapReleaseFiles(files: ReleaseFile[]): Record<OS, Asset[]> {
  const asset = (f: ReleaseFile, label: string, detail: string): Asset => ({
    label,
    detail,
    file: f.name,
    url: f.url,
  })

  // Windows: o instalador ("Setup" no nome, se houver mais de um .exe)
  const exes = files.filter((f) => ext(f.name, '.exe'))
  const exe = exes.find((f) => /setup/i.test(f.name)) ?? exes[0]
  const windows = exe ? [asset(exe, 'Baixar para Windows', 'Instalador .exe')] : []

  // macOS: Apple Silicon primeiro, depois Intel; um .dmg sem arquitetura no
  // nome vale para os dois
  const dmgs = files.filter((f) => ext(f.name, '.dmg'))
  const arm = dmgs.find((f) => macArch(f.name) === 'arm')
  const intel = dmgs.find((f) => macArch(f.name) === 'intel')
  const any = dmgs.find((f) => macArch(f.name) === 'any')
  const macos: Asset[] = []
  if (arm) macos.push(asset(arm, 'Baixar para Mac (Apple Silicon)', 'M1, M2, M3 ou mais novo · .dmg'))
  if (intel) {
    macos.push(
      arm
        ? asset(intel, 'Mac com processador Intel', '.dmg')
        : asset(intel, 'Baixar para Mac (Intel)', 'Mac com processador Intel · .dmg'),
    )
  }
  if (any && !(arm && intel)) {
    macos.push(
      macos.length
        ? asset(any, 'Outros Macs', '.dmg')
        : asset(any, 'Baixar para Mac', 'Apple Silicon ou Intel · .dmg'),
    )
  }

  // Linux: AppImage (roda em quase tudo) e .deb, só x86_64
  const pick = (e: string) => {
    const all = files.filter((f) => ext(f.name, e) && !isArm(f.name))
    return all[0]
  }
  const appImage = pick('.appimage')
  const deb = pick('.deb')
  const linux: Asset[] = []
  if (appImage) linux.push(asset(appImage, 'Baixar para Linux', 'AppImage, roda na maioria das distribuições'))
  if (deb) {
    linux.push(
      appImage
        ? asset(deb, 'Pacote .deb', 'Ubuntu, Debian e derivados')
        : asset(deb, 'Baixar para Linux (.deb)', 'Ubuntu, Debian e derivados'),
    )
  }

  return { windows, macos, linux }
}

/**
 * Mesma forma de buildDownloads, montada a partir do último release. Um
 * sistema só fica disponível se tiver arquivo no release E estiver em
 * `liberados` (VITE_RELEASES_AVAILABLE, a mesma lista das frases de
 * plataforma do site): o botão nunca contradiz o texto.
 */
export function buildDownloadsFromRelease(
  snapshot: ReleaseSnapshot,
  liberados: OS[],
): PlatformDownload[] {
  const byOs = mapReleaseFiles(snapshot.files)
  const disponivel = (os: OS) => liberados.includes(os) && byOs[os].length > 0
  const macArchs = new Set(byOs.macos.map((a) => macArch(a.file)))
  const macRequirement =
    macArchs.has('any') || (macArchs.has('arm') && macArchs.has('intel')) || macArchs.size === 0
      ? 'Apple Silicon (M1 ou mais novo) ou Intel'
      : macArchs.has('arm')
        ? 'Apple Silicon (M1 ou mais novo)'
        : 'Mac com processador Intel'

  return [
    {
      os: 'windows',
      name: 'Windows',
      requirement: 'Windows 10 ou 11, 64 bits',
      available: disponivel('windows'),
      assets: byOs.windows,
    },
    {
      os: 'macos',
      name: 'macOS',
      requirement: macRequirement,
      available: disponivel('macos'),
      assets: byOs.macos,
    },
    {
      os: 'linux',
      name: 'Linux',
      requirement: 'x86_64 (64 bits)',
      available: disponivel('linux'),
      assets: byOs.linux,
    },
  ]
}

/** Sistemas com instalador, na ordem Windows, macOS, Linux. */
export function availableOS(platforms: PlatformDownload[]): OS[] {
  return ALL_OS.filter((os) => platforms.some((p) => p.os === os && p.available))
}

/**
 * Sistema do visitante, pelo navegador. Celular e tablet devolvem null: o
 * instalador é para computador, então nada é destacado.
 */
export function detectOS(userAgent: string, platform = ''): OS | null {
  const ua = userAgent.toLowerCase()
  const pf = platform.toLowerCase()
  if (/android|iphone|ipad|ipod|mobile/.test(ua)) return null
  if (pf.startsWith('win') || ua.includes('windows')) return 'windows'
  if (pf.startsWith('mac') || ua.includes('mac os x') || ua.includes('macintosh')) return 'macos'
  if (ua.includes('cros')) return null
  if (pf.includes('linux') || ua.includes('linux') || ua.includes('x11')) return 'linux'
  return null
}

/* ---------- valores do build ---------- */

export const RELEASES_REPO = normalizeRepo(import.meta.env.VITE_RELEASES_REPO)
export const RELEASES_AVAILABLE = parseAvailable(import.meta.env.VITE_RELEASES_AVAILABLE)
export const RELEASES_PAGE = releasesPageUrl(RELEASES_REPO)

const OS_NAMES: Record<OS, string> = { windows: 'Windows 10/11', macos: 'macOS', linux: 'Linux' }

function joinPt(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

/**
 * Frases de plataforma usadas no site inteiro, derivadas de quais sistemas
 * têm instalador — o texto não promete o que o botão não entrega.
 */
export function platformsText(available: OS[]) {
  const on = ALL_OS.filter((os) => available.includes(os)).map((os) => OS_NAMES[os])
  const off = ALL_OS.filter((os) => !available.includes(os)).map((os) => OS_NAMES[os])
  if (!on.length) {
    const all = joinPt(off)
    return { short: all, long: `${all} (em preparação)`, list: `${all} · em preparação` }
  }
  const short = joinPt(on)
  const pending = off.length ? `${joinPt(off)} em preparação` : ''
  return {
    short,
    long: pending ? `${short} (${pending})` : short,
    list: pending ? `${short} · ${pending}` : short,
  }
}

/** "macOS" ou "macOS (em preparação)", para listas de escolha. */
export function osOptionLabel(os: OS, available: OS[] = RELEASES_AVAILABLE): string {
  return available.includes(os) ? OS_NAMES[os] : `${OS_NAMES[os]} (em preparação)`
}

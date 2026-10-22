/* ---------------- "Meu computador funciona?" ----------------
   O teste que roda no navegador antes do download (pedido do dono, 19/10/2026):
   sistema, câmera (com a imagem e a taxa de quadros REAIS), placa de vídeo
   (WebGPU), processador e memória, com um veredito em linguagem simples.

   Os requisitos são os da tabela preliminar do README ("Hardware do
   paciente"): Windows 10 de 64 bits; webcam de 1280×720 a 30 quadros por
   segundo; quatro núcleos; 8 GB de memória; WebGPU recomendado (a rede do
   olhar cai para o processador sem ele). 24 quadros por segundo é o piso que
   o próprio app aceita antes de trocar resolução por cadência
   (FPS_MINIMO_ACEITAVEL, frontend/src/context/GazeContext.tsx).

   O que o navegador consegue medir daqui é pouco e precisa ser dito como é:
   - `deviceMemory` só existe no Chromium e é arredondada e limitada em 8 GB
     pela especificação: 16 GB é indistinguível de 8 GB por esta via;
   - a versão do Windows só vem pelas client hints do Chromium
     (`getHighEntropyValues(['platformVersion'])`); sem elas, o 10 e o 11 se
     dizem "Windows NT 10.0" e não dá para saber qual é;
   - um navegador sem WebGPU (Firefox antigo, por exemplo) não diz nada sobre
     a placa: o IrisFlow roda no motor do Chrome.
   O que não deu para medir aparece como "não deu para saber", nunca estimado
   — e nunca vira reprovação.

   Nada daqui sai do navegador: nenhuma leitura é enviada a servidor nenhum,
   e a imagem da câmera só existe na pré-visualização desta página.
   ---------------------------------------------------------------- */

import { RELEASES_AVAILABLE, type OS } from '@/lib/releases'

export const MIN_NUCLEOS = 4
export const REC_NUCLEOS = 8
export const MIN_MEMORIA = 8
/** Teto que a Device Memory API reporta, por especificação. */
export const TETO_REPORTADO = 8
/** Resolução mínima da webcam (README, "Hardware do paciente"). */
export const CAMERA_MINIMA = { largura: 1280, altura: 720 }
/** Abaixo disto o app troca resolução por cadência: o olhar fica com menos medidas por segundo. */
export const FPS_MINIMO = 24
export const FPS_IDEAL = 30

/* ---------------- leituras ---------------- */

export type VersaoDoWindows = '11' | '10' | 'antigo' | 'desconhecida'

export type LeituraDoSistema =
  | {
      tipo: 'windows'
      versao: VersaoDoWindows
      /** 64 ou 32 bits; null quando o navegador não informa. */
      bits: 64 | 32 | null
    }
  | { tipo: 'macos' | 'linux' | 'chromeos' | 'celular' | 'desconhecido' }

export type LeituraDaPlaca = {
  webgpu:
    | {
        estado: 'disponivel'
        fabricante: string
        arquitetura: string
        descricao: string
        /** Adaptador de reserva: o navegador emula a placa no processador. */
        reserva: boolean
      }
    /** O navegador tem a API, mas não encontrou placa compatível (driver bloqueado, placa antiga). */
    | { estado: 'sem-adaptador' }
    /** Este navegador não tem WebGPU: não diz nada sobre o computador. */
    | { estado: 'sem-suporte-no-navegador' }
    | { estado: 'erro' }
  /** WebGL é o que o detector de rosto usa na placa; sem ele, vai para o processador. */
  webgl: 'ok' | 'software' | 'ausente'
}

export type LeituraDaCamera =
  | { estado: 'nao-testada' }
  | { estado: 'testando' }
  | {
      estado: 'ok'
      largura: number
      altura: number
      /** Quadros por segundo contados na pré-visualização. Null se não deu para contar. */
      fps: number | null
      /** O que a câmera DIZ entregar (getSettings), para quando não dá para contar. */
      fpsInformado: number | null
      nome: string
    }
  | { estado: 'negada' }
  | { estado: 'nao-encontrada' }
  | { estado: 'ocupada' }
  | { estado: 'endereco-inseguro' }
  | { estado: 'sem-suporte' }
  | {
      estado: 'erro'
      /** O que deu errado, técnico (vai para o console). */
      mensagem: string
      /** A frase da tela, quando a gente sabe o que houve; sem ela, "A câmera não abriu". */
      naTela?: string
    }

export type Leituras = {
  sistema: LeituraDoSistema
  /** Núcleos lógicos (hardwareConcurrency); null quando o navegador não informa. */
  nucleos: number | null
  /** GB, arredondado e limitado em 8 pela especificação; null quando não informa. */
  memoria: number | null
  /** Null enquanto a leitura assíncrona não voltou. */
  placa: LeituraDaPlaca | null
  camera: LeituraDaCamera
  /** Sistemas com instalador hoje (VITE_RELEASES_AVAILABLE). */
  disponiveis?: OS[]
}

/**
 * Versão do Windows a partir do `platformVersion` das client hints. A regra é
 * a da Microsoft: maior ≥ 13 é Windows 11; de 1 a 10, Windows 10 (11 e 12
 * nunca foram usados, e ficam do lado do 10); 0 é Windows 7, 8 ou 8.1.
 */
export function versaoDoWindows(platformVersion: string | null | undefined): VersaoDoWindows {
  const maior = Number.parseInt(String(platformVersion ?? '').split('.')[0] ?? '', 10)
  if (!Number.isFinite(maior) || maior < 0) return 'desconhecida'
  if (maior >= 13) return '11'
  if (maior >= 1) return '10'
  return 'antigo'
}

type NavegadorComHints = Navigator & {
  deviceMemory?: number
  userAgentData?: {
    platform?: string
    mobile?: boolean
    getHighEntropyValues?: (hints: string[]) => Promise<{ platformVersion?: string; bitness?: string }>
  }
}

/** Leitura síncrona do sistema, só pelo texto do navegador (sem a versão exata do Windows). */
export function sistemaPeloUserAgent(ua: string, plataforma = ''): LeituraDoSistema {
  const u = ua.toLowerCase()
  const p = plataforma.toLowerCase()
  if (/android|iphone|ipad|ipod|mobile/.test(u)) return { tipo: 'celular' }
  if (p.startsWith('win') || u.includes('windows')) {
    // "Windows NT 10.0" é o 10 E o 11; 6.1/6.2/6.3 são o 7, o 8 e o 8.1.
    const nt = u.match(/windows nt (\d+)\.(\d+)/)
    const versao: VersaoDoWindows = nt ? (Number(nt[1]) >= 10 ? 'desconhecida' : 'antigo') : 'desconhecida'
    const bits = /win64|x64|wow64|amd64/.test(u) ? 64 : null
    return { tipo: 'windows', versao, bits }
  }
  if (u.includes('cros')) return { tipo: 'chromeos' }
  if (p.startsWith('mac') || u.includes('mac os x') || u.includes('macintosh')) return { tipo: 'macos' }
  if (p.includes('linux') || u.includes('linux') || u.includes('x11')) return { tipo: 'linux' }
  return { tipo: 'desconhecido' }
}

/** Espera uma promessa por no máximo `ms`; no tempo esgotado, devolve `reserva`. */
function comPrazo<T>(p: Promise<T>, ms: number, reserva: T): Promise<T> {
  return new Promise((resolve) => {
    const relogio = setTimeout(() => resolve(reserva), ms)
    p.then(
      (v) => {
        clearTimeout(relogio)
        resolve(v)
      },
      () => {
        clearTimeout(relogio)
        resolve(reserva)
      },
    )
  })
}

/**
 * O sistema, com a versão exata do Windows quando o navegador tem client
 * hints (Chrome e Edge). Sem elas, fica a leitura do texto do navegador.
 */
export async function lerSistema(nav: NavegadorComHints = navigator): Promise<LeituraDoSistema> {
  const uad = nav.userAgentData
  const base = sistemaPeloUserAgent(nav.userAgent ?? '', uad?.platform ?? nav.platform ?? '')
  if (uad?.mobile) return { tipo: 'celular' }
  if (base.tipo !== 'windows' || typeof uad?.getHighEntropyValues !== 'function') return base
  const hints = await comPrazo(
    uad.getHighEntropyValues(['platformVersion', 'bitness']),
    2000,
    {} as { platformVersion?: string; bitness?: string },
  )
  const versao = hints.platformVersion ? versaoDoWindows(hints.platformVersion) : base.versao
  const bits = hints.bitness === '64' ? 64 : hints.bitness === '32' ? 32 : base.bits
  return { tipo: 'windows', versao, bits }
}

export function lerProcessadorEMemoria(nav: NavegadorComHints = navigator): {
  nucleos: number | null
  memoria: number | null
} {
  const nucleos =
    typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : null
  const memoria = typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 ? nav.deviceMemory : null
  return { nucleos, memoria }
}

type AdaptadorWebGPU = {
  info?: { vendor?: string; architecture?: string; description?: string; isFallbackAdapter?: boolean }
  isFallbackAdapter?: boolean
  requestAdapterInfo?: () => Promise<{ vendor?: string; architecture?: string; description?: string }>
}

/** O renderizador do WebGL é a emulação no processador? */
export function webglEmSoftware(renderizador: string): boolean {
  return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(renderizador)
}

function lerWebgl(doc: Document): LeituraDaPlaca['webgl'] {
  try {
    const canvas = doc.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return 'ausente'
    const ext = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null
    const renderizador = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
    // O contexto é só para a leitura: devolvido na hora, para não segurar a GPU.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return webglEmSoftware(renderizador) ? 'software' : 'ok'
  } catch {
    return 'ausente'
  }
}

/**
 * A placa de vídeo pelo que o navegador diz: `navigator.gpu.requestAdapter()`
 * — a mesma pergunta que o app faz antes de escolher onde roda a rede do
 * olhar (src/l2cs/l2cs.worker.ts) — e o WebGL do detector de rosto.
 */
export async function lerPlacaDeVideo(
  nav: Navigator = navigator,
  doc: Document = document,
): Promise<LeituraDaPlaca> {
  const webgl = lerWebgl(doc)
  const gpu = (nav as Navigator & { gpu?: { requestAdapter: () => Promise<AdaptadorWebGPU | null> } }).gpu
  if (!gpu || typeof gpu.requestAdapter !== 'function') {
    return { webgpu: { estado: 'sem-suporte-no-navegador' }, webgl }
  }
  const ERRO = Symbol('erro')
  const adaptador = await comPrazo<AdaptadorWebGPU | null | typeof ERRO>(gpu.requestAdapter(), 4000, ERRO)
  if (adaptador === ERRO) {
    // Na tela, a linha da placa diz "O navegador não respondeu"; aqui, um
    // aviso por leitura (uma por visita à página), para quem for investigar.
    console.warn('[IrisFlow] teste do computador: o WebGPU não respondeu (requestAdapter falhou ou passou de 4 s).')
    return { webgpu: { estado: 'erro' }, webgl }
  }
  if (!adaptador) return { webgpu: { estado: 'sem-adaptador' }, webgl }
  // `adapter.info` nos navegadores atuais; `requestAdapterInfo()` nos anteriores.
  const info =
    adaptador.info ??
    (typeof adaptador.requestAdapterInfo === 'function'
      ? await comPrazo(adaptador.requestAdapterInfo(), 1500, {})
      : {})
  return {
    webgpu: {
      estado: 'disponivel',
      fabricante: (info.vendor ?? '').trim(),
      arquitetura: (info.architecture ?? '').trim(),
      descricao: (info.description ?? '').trim(),
      reserva: Boolean(adaptador.info?.isFallbackAdapter ?? adaptador.isFallbackAdapter),
    },
    webgl,
  }
}

/**
 * O erro do getUserMedia, traduzido. Permissão negada e câmera ocupada NÃO
 * são veredito sobre o computador: só dizem que o teste não pôde ser feito.
 */
export function classificarErroDeCamera(e: unknown): LeituraDaCamera {
  const nome = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : ''
  switch (nome) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return { estado: 'negada' }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return { estado: 'nao-encontrada' }
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return { estado: 'ocupada' }
    default:
      return { estado: 'erro', mensagem: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Quadros por segundo a partir dos instantes (ms) em que cada quadro novo
 * chegou. A mediana dos intervalos, e não a média: um engasgo da aba (troca de
 * janela, coletor de lixo) não pode derrubar a medida de uma câmera boa.
 */
export function fpsDosInstantes(instantes: number[]): number | null {
  if (instantes.length < 6) return null
  const intervalos: number[] = []
  for (let i = 1; i < instantes.length; i++) {
    const d = instantes[i] - instantes[i - 1]
    if (d > 0) intervalos.push(d)
  }
  if (intervalos.length < 5) return null
  intervalos.sort((a, b) => a - b)
  const meio = intervalos.length >> 1
  const mediana = intervalos.length % 2 ? intervalos[meio] : (intervalos[meio - 1] + intervalos[meio]) / 2
  return mediana > 0 ? Math.round((1000 / mediana) * 10) / 10 : null
}

type MetadadosDoQuadro = { mediaTime?: number; captureTime?: number }
type VideoComQuadros = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (agora: number, meta: MetadadosDoQuadro) => void) => number
  cancelVideoFrameCallback?: (id: number) => void
}

/**
 * Conta, por `duracaoMs`, os quadros que a câmera entrega DE VERDADE na
 * pré-visualização — o que a câmera promete (getSettings) não serve: no
 * escuro, muitas webcams dizem 30 e entregam 10. `requestVideoFrameCallback`
 * avisa a cada quadro novo, com o instante em que ele foi capturado; sem ele,
 * vale o contador de quadros do elemento (getVideoPlaybackQuality). Resolve
 * null quando não dá para contar. Nunca rejeita.
 */
export function medirQuadros(video: HTMLVideoElement, duracaoMs = 2500): Promise<number | null> {
  const v = video as VideoComQuadros
  return new Promise((resolve) => {
    if (typeof v.requestVideoFrameCallback === 'function') {
      const instantes: number[] = []
      let id = 0
      let encerrada = false
      let inicio: number | null = null
      const encerrar = () => {
        if (encerrada) return
        encerrada = true
        v.cancelVideoFrameCallback?.(id)
        resolve(fpsDosInstantes(instantes))
      }
      const aoQuadro = (agora: number, meta: MetadadosDoQuadro) => {
        if (encerrada) return
        if (inicio === null) inicio = agora
        // O instante da captura, quando o navegador dá; senão, o da mídia;
        // em último caso, o do aviso.
        instantes.push(
          typeof meta?.captureTime === 'number'
            ? meta.captureTime
            : typeof meta?.mediaTime === 'number' && meta.mediaTime > 0
              ? meta.mediaTime * 1000
              : agora,
        )
        if (agora - inicio >= duracaoMs) return encerrar()
        id = v.requestVideoFrameCallback!(aoQuadro)
      }
      id = v.requestVideoFrameCallback(aoQuadro)
      // Câmera que trava não chama mais o aviso: o prazo encerra a medida assim mesmo.
      setTimeout(encerrar, duracaoMs + 1500)
      return
    }
    const contar = () =>
      typeof v.getVideoPlaybackQuality === 'function' ? v.getVideoPlaybackQuality().totalVideoFrames : null
    const antes = contar()
    if (antes === null) return resolve(null)
    const t0 = performance.now()
    setTimeout(() => {
      const depois = contar()
      const segundos = (performance.now() - t0) / 1000
      resolve(depois !== null && segundos > 0 && depois > antes ? Math.round(((depois - antes) / segundos) * 10) / 10 : null)
    }, duracaoMs)
  })
}

/* ---------------- o veredito ---------------- */

export type EstadoDaLinha = 'ok' | 'atencao' | 'problema' | 'desconhecido' | 'pendente'

export type LinhaDoTeste = {
  id: 'sistema' | 'camera' | 'placa' | 'processador' | 'memoria'
  rotulo: string
  estado: EstadoDaLinha
  /** O que foi encontrado, em uma linha. */
  valor: string
  /** Por que isso importa, ou o que fazer, quando há o que dizer. */
  detalhe?: string
}

export type NivelDoVeredito = 'funciona' | 'lento' | 'nao-funciona' | 'falta-camera' | 'no-celular'

export type Veredito = {
  nivel: NivelDoVeredito
  titulo: string
  /** "Não vai funcionar porque…" (os impedimentos) ou o que pode deixar lento. */
  motivos: string[]
  oQueFazer: string[]
  /** O que não deu para medir daqui, dito como é. */
  ressalvas: string[]
  linhas: LinhaDoTeste[]
}

const NOME_DO_SISTEMA: Record<Exclude<LeituraDoSistema['tipo'], 'windows'>, string> = {
  macos: 'macOS',
  linux: 'Linux',
  chromeos: 'ChromeOS',
  celular: 'celular ou tablet',
  desconhecido: 'não reconhecido',
}

const BR = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

function linhaDoSistema(s: LeituraDoSistema, disponiveis: OS[]): {
  linha: LinhaDoTeste
  impede?: string
  fazer?: string
  ressalva?: string
} {
  const rotulo = 'Sistema'
  if (s.tipo === 'celular') {
    // Neutro: quem abriu no celular não fez nada de errado (auditoria de
    // 21/10/2026, P2-9). O teste só vale para o computador.
    return {
      linha: { id: 'sistema', rotulo, estado: 'pendente', valor: 'Celular ou tablet' },
      fazer: 'Abra esta página no computador onde o IrisFlow vai ser usado e faça o teste lá.',
    }
  }
  if (s.tipo !== 'windows') {
    const disponivel = (s.tipo === 'macos' && disponiveis.includes('macos')) || (s.tipo === 'linux' && disponiveis.includes('linux'))
    if (disponivel) return { linha: { id: 'sistema', rotulo, estado: 'ok', valor: NOME_DO_SISTEMA[s.tipo] } }
    if (s.tipo === 'desconhecido') {
      return {
        linha: { id: 'sistema', rotulo, estado: 'desconhecido', valor: 'Não deu para saber' },
        ressalva: 'O navegador não disse qual é o sistema. O IrisFlow precisa do Windows 10 ou 11, de 64 bits.',
      }
    }
    const nome = NOME_DO_SISTEMA[s.tipo]
    return {
      linha: {
        id: 'sistema',
        rotulo,
        estado: 'problema',
        valor: nome,
        detalhe: s.tipo === 'macos' || s.tipo === 'linux' ? `A versão para ${nome} está em preparação.` : undefined,
      },
      impede:
        s.tipo === 'macos' || s.tipo === 'linux'
          ? `a versão para ${nome} ainda está em preparação; hoje o IrisFlow roda no Windows 10 e no Windows 11.`
          : `o IrisFlow roda no Windows 10 e no Windows 11, e este computador usa ${nome}.`,
      fazer: 'Use um computador com Windows 10 ou 11, de 64 bits.',
    }
  }
  if (s.bits === 32) {
    return {
      linha: { id: 'sistema', rotulo, estado: 'problema', valor: 'Windows de 32 bits' },
      impede: 'este Windows é de 32 bits, e o IrisFlow precisa do Windows de 64 bits.',
      fazer: 'Use um computador com o Windows 10 ou 11 de 64 bits.',
    }
  }
  if (s.versao === 'antigo') {
    return {
      linha: { id: 'sistema', rotulo, estado: 'problema', valor: 'Windows 7, 8 ou 8.1' },
      impede: 'este Windows é anterior ao 10, e o IrisFlow precisa do Windows 10 ou 11.',
      fazer: 'Atualize para o Windows 10 ou 11, ou use outro computador.',
    }
  }
  if (s.versao === 'desconhecida') {
    return {
      linha: {
        id: 'sistema',
        rotulo,
        estado: 'ok',
        valor: 'Windows (não deu para saber se é o 10 ou o 11)',
        detalhe: 'Este navegador não informa a versão. Os dois servem.',
      },
    }
  }
  return {
    linha: {
      id: 'sistema',
      rotulo,
      estado: 'ok',
      valor: `Windows ${s.versao}${s.bits === 64 ? ', 64 bits' : ''}`,
    },
  }
}

function linhaDaCamera(c: LeituraDaCamera): {
  linha: LinhaDoTeste
  impede?: string
  lento?: string
  fazer?: string
  verificada: boolean
} {
  const rotulo = 'Câmera'
  switch (c.estado) {
    case 'nao-testada':
      return { linha: { id: 'camera', rotulo, estado: 'pendente', valor: 'Ainda não testada' }, verificada: false }
    case 'testando':
      return { linha: { id: 'camera', rotulo, estado: 'pendente', valor: 'Testando…' }, verificada: false }
    case 'negada':
      return {
        linha: {
          id: 'camera',
          rotulo,
          estado: 'desconhecido',
          valor: 'Sem permissão para testar',
          detalhe: 'Clique no ícone da câmera na barra de endereço, permita e teste de novo.',
        },
        verificada: false,
      }
    case 'ocupada':
      return {
        linha: {
          id: 'camera',
          rotulo,
          estado: 'desconhecido',
          valor: 'Ocupada por outro programa',
          detalhe: 'Feche o que estiver usando a câmera (chamada de vídeo, o próprio IrisFlow) e teste de novo.',
        },
        verificada: false,
      }
    case 'endereco-inseguro':
      return {
        linha: {
          id: 'camera',
          rotulo,
          estado: 'desconhecido',
          valor: 'Não deu para testar neste endereço',
          detalhe:
            'Esta página foi aberta por um endereço sem https, e aí o navegador esconde a câmera de qualquer site. Isso não diz nada sobre o computador: abra o site pelo endereço com https.',
        },
        verificada: false,
      }
    case 'sem-suporte':
      return {
        linha: {
          id: 'camera',
          rotulo,
          estado: 'desconhecido',
          valor: 'Este navegador não dá acesso à câmera',
          detalhe: 'Teste no Chrome ou no Edge atualizados.',
        },
        verificada: false,
      }
    case 'nao-encontrada':
      return {
        linha: { id: 'camera', rotulo, estado: 'problema', valor: 'Nenhuma câmera encontrada' },
        impede: 'não encontramos nenhuma câmera neste computador.',
        fazer: 'Conecte uma webcam (de 1280×720 ou mais) e teste de novo.',
        verificada: true,
      }
    case 'erro':
      return {
        linha: {
          id: 'camera',
          rotulo,
          estado: 'desconhecido',
          // "A câmera não abriu" era dito também quando ela abria e não mandava
          // imagem, ou parava no meio (revisão de 19/10/2026).
          valor: c.naTela ?? 'A câmera não abriu',
          detalhe: 'Desconecte e conecte a câmera de novo, ou reinicie o navegador, e teste outra vez.',
        },
        verificada: false,
      }
    case 'ok': {
      const fps = c.fps ?? c.fpsInformado
      const resolucao = `${c.largura}×${c.altura}`
      const quadros = fps === null ? '' : `, ${BR(fps)} quadros por segundo${c.fps === null ? ' (informado pela câmera)' : ''}`
      const pequena = c.largura * c.altura < CAMERA_MINIMA.largura * CAMERA_MINIMA.altura
      const devagar = fps !== null && fps < FPS_MINIMO
      if (pequena || devagar) {
        const partes: string[] = []
        if (pequena) partes.push(`a câmera entrega ${resolucao}, abaixo de 1280×720: o olho aparece com menos detalhe e a precisão cai`)
        if (devagar) partes.push(`a câmera entregou ${BR(fps!)} quadros por segundo, e o ideal é ${FPS_IDEAL}: o cursor responde mais devagar`)
        return {
          linha: { id: 'camera', rotulo, estado: 'atencao', valor: `${resolucao}${quadros}` },
          lento: partes.join('; '),
          fazer: devagar
            ? 'Acenda uma luz de frente para o rosto: no escuro, muitas webcams baixam a taxa de quadros. Se não melhorar, uma webcam de 1280×720 a 30 quadros resolve.'
            : 'Uma webcam de 1280×720 (ou mais) a 30 quadros por segundo resolve.',
          verificada: true,
        }
      }
      return { linha: { id: 'camera', rotulo, estado: 'ok', valor: `${resolucao}${quadros}` }, verificada: true }
    }
  }
}

function linhaDaPlaca(p: LeituraDaPlaca | null): { linha: LinhaDoTeste; lento?: string; fazer?: string; ressalva?: string } {
  const rotulo = 'Placa de vídeo'
  if (!p) return { linha: { id: 'placa', rotulo, estado: 'pendente', valor: 'Verificando…' } }
  const g = p.webgpu
  if (g.estado === 'disponivel' && !g.reserva) {
    const nome = [g.descricao || g.fabricante, g.descricao ? '' : g.arquitetura].filter(Boolean).join(', ')
    return {
      linha: {
        id: 'placa',
        rotulo,
        estado: 'ok',
        valor: nome ? `WebGPU disponível (${nome})` : 'WebGPU disponível',
        detalhe: 'A rede que calcula o olhar roda na placa de vídeo, e não no processador.',
      },
    }
  }
  if (g.estado === 'sem-suporte-no-navegador' || g.estado === 'erro') {
    return {
      linha: {
        id: 'placa',
        rotulo,
        estado: 'desconhecido',
        valor: g.estado === 'erro' ? 'O navegador não respondeu' : 'Este navegador não tem WebGPU',
        detalhe: 'Isso não diz nada sobre o computador: o IrisFlow usa o motor do Chrome. Abra esta página no Chrome ou no Edge para conferir.',
      },
      ressalva: 'A placa de vídeo não foi verificada neste navegador.',
    }
  }
  // Sem adaptador, ou só a emulação no processador: roda, mais devagar.
  return {
    linha: {
      id: 'placa',
      rotulo,
      estado: 'atencao',
      valor: g.estado === 'disponivel' ? 'Sem aceleração de vídeo (WebGPU emulado)' : 'WebGPU não encontrou uma placa compatível',
      detalhe: 'Sem ela, a rede que calcula o olhar roda no processador, mais devagar.',
    },
    lento: 'sem WebGPU, a rede que calcula o olhar roda no processador e cada leitura demora mais',
    fazer: 'Atualize o navegador e o driver da placa de vídeo. Em notebook, deixe o carregador ligado.',
  }
}

function linhaDoProcessador(nucleos: number | null): { linha: LinhaDoTeste; lento?: string; fazer?: string; ressalva?: string } {
  const rotulo = 'Processador'
  if (nucleos === null) {
    return {
      linha: { id: 'processador', rotulo, estado: 'desconhecido', valor: 'O navegador não informou' },
      ressalva: 'O número de núcleos não foi informado pelo navegador.',
    }
  }
  const valor = `${nucleos} ${nucleos === 1 ? 'núcleo' : 'núcleos'}`
  if (nucleos < MIN_NUCLEOS) {
    // Não reprova: `hardwareConcurrency` conta processadores lógicos e alguns
    // navegadores informam menos (ou um número fixo) para proteger a privacidade.
    // Julgar o computador por ele dava "Não vai funcionar" antes mesmo do teste
    // da câmera (auditoria de 21/10/2026, P2-9). Fica como aviso de lentidão.
    return {
      linha: {
        id: 'processador',
        rotulo,
        estado: 'atencao',
        valor,
        detalhe: `O IrisFlow pede ${MIN_NUCLEOS} ou mais. O navegador conta processadores lógicos, e alguns navegadores informam menos do que o computador tem.`,
      },
      lento: `com ${valor}, o rastreamento pode ficar lento`,
      fazer: 'Feche os outros programas pesados. Se o computador tem mais processadores do que o teste mostrou, abra esta página no Chrome ou no Edge.',
    }
  }
  if (nucleos < REC_NUCLEOS) {
    return {
      linha: { id: 'processador', rotulo, estado: 'atencao', valor, detalhe: `Atende ao mínimo (${MIN_NUCLEOS}); o recomendado é ${REC_NUCLEOS}.` },
      lento: `com ${valor}, o processador fica no limite em sessões longas`,
      fazer: 'Feche os outros programas pesados enquanto o IrisFlow estiver aberto.',
    }
  }
  return { linha: { id: 'processador', rotulo, estado: 'ok', valor } }
}

function linhaDaMemoria(memoria: number | null): { linha: LinhaDoTeste; impede?: string; fazer?: string; ressalva?: string } {
  const rotulo = 'Memória'
  if (memoria === null) {
    return {
      linha: { id: 'memoria', rotulo, estado: 'desconhecido', valor: 'Este navegador não informa' },
      ressalva: `Este navegador não informa a memória. O mínimo é ${MIN_MEMORIA} GB.`,
    }
  }
  if (memoria >= TETO_REPORTADO) {
    return {
      linha: {
        id: 'memoria',
        rotulo,
        estado: 'ok',
        valor: `${TETO_REPORTADO} GB ou mais`,
        detalhe: `O navegador não informa acima de ${TETO_REPORTADO} GB.`,
      },
    }
  }
  return {
    linha: { id: 'memoria', rotulo, estado: 'problema', valor: `Cerca de ${BR(memoria)} GB`, detalhe: `O mínimo é ${MIN_MEMORIA} GB.` },
    impede: `este computador tem cerca de ${BR(memoria)} GB de memória, e o IrisFlow precisa de pelo menos ${MIN_MEMORIA} GB.`,
    fazer: `Use um computador com ${MIN_MEMORIA} GB de memória ou mais.`,
  }
}

const TITULOS: Record<NivelDoVeredito, string> = {
  funciona: 'Funciona',
  lento: 'Funciona, mas pode ficar lento',
  'nao-funciona': 'Não vai funcionar',
  'falta-camera': 'Falta testar a câmera',
  'no-celular': 'Abra esta página no computador',
}

/**
 * O veredito, a partir do que foi lido. Puro: as leituras entram, a frase sai.
 *
 * - um impedimento (sistema, câmera ausente ou memória abaixo do mínimo) →
 *   "Não vai funcionar", com os motivos. O número de processadores que o
 *   navegador conta não é impedimento: só avisa que pode ficar lento;
 * - no celular: "Abra esta página no computador", sem julgar nada;
 * - sem impedimento, mas a câmera ainda não foi verificada → "Falta testar a
 *   câmera" (o resto da avaliação aparece nas linhas);
 * - câmera abaixo do ideal, sem WebGPU ou processador no limite → "Funciona,
 *   mas pode ficar lento";
 * - o resto → "Funciona".
 * O que não deu para saber vai para as ressalvas e nunca reprova.
 */
export function avaliar(l: Leituras): Veredito {
  const disponiveis = l.disponiveis ?? RELEASES_AVAILABLE
  const sistema = linhaDoSistema(l.sistema, disponiveis)
  if (l.sistema.tipo === 'celular') {
    // No celular, os núcleos, a memória e a placa que o navegador informa são
    // os do celular, e não dizem nada do computador onde o IrisFlow vai rodar:
    // julgá-los dava motivos falsos, como "este computador tem 2 núcleos"
    // (revisão das capturas, 19/10/2026). Fica só a linha do sistema.
    return {
      nivel: 'no-celular',
      titulo: TITULOS['no-celular'],
      motivos: [],
      oQueFazer: sistema.fazer ? [sistema.fazer] : [],
      ressalvas: [],
      linhas: [sistema.linha],
    }
  }
  const camera = linhaDaCamera(l.camera)
  const placa = linhaDaPlaca(l.placa)
  const processador = linhaDoProcessador(l.nucleos)
  const memoria = linhaDaMemoria(l.memoria)

  const partes = [sistema, camera, placa, processador, memoria] as {
    impede?: string
    lento?: string
    fazer?: string
    ressalva?: string
  }[]
  const impedimentos = partes.map((p) => p.impede).filter((x): x is string => Boolean(x))
  const lentidao = partes.map((p) => p.lento).filter((x): x is string => Boolean(x))
  const ressalvas = partes.map((p) => p.ressalva).filter((x): x is string => Boolean(x))
  const linhas = [sistema.linha, camera.linha, placa.linha, processador.linha, memoria.linha]

  let nivel: NivelDoVeredito
  let motivos: string[]
  let oQueFazer: string[]
  if (impedimentos.length) {
    nivel = 'nao-funciona'
    motivos = impedimentos
    oQueFazer = partes.filter((p) => p.impede && p.fazer).map((p) => p.fazer!)
  } else if (!camera.verificada) {
    nivel = 'falta-camera'
    motivos = lentidao
    oQueFazer = [
      l.camera.estado === 'nao-testada' || l.camera.estado === 'testando'
        ? 'Teste a câmera: o navegador vai pedir permissão, e a imagem fica só nesta página.'
        : (camera.linha.detalhe ?? 'Teste a câmera de novo.'),
    ]
  } else if (lentidao.length) {
    nivel = 'lento'
    motivos = lentidao
    oQueFazer = partes.filter((p) => p.lento && p.fazer).map((p) => p.fazer!)
  } else {
    nivel = 'funciona'
    motivos = []
    oQueFazer = ['Baixe o IrisFlow e faça a calibração com a pessoa sentada onde vai usar.']
  }

  return { nivel, titulo: TITULOS[nivel], motivos, oQueFazer, ressalvas, linhas }
}

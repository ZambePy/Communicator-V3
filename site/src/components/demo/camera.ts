/* ============================================================
   Câmera e reconhecimento do rosto do "Teste com o seu olhar".

   - A câmera só abre no clique, e a imagem nunca sai do navegador: ela vai
     para o <video> da própria página e para o Face Landmarker, que roda aqui
     (WebAssembly + WebGL). Nenhum quadro é enviado, nenhum é gravado.
   - O MediaPipe chega por import() dinâmico: o pacote (126 kB, 38 kB
     comprimido), o wasm (11 MB) e o modelo (3,7 MB) só descem depois do
     clique. Nada disso entra no JavaScript inicial do site.
   - Os arquivos vêm do próprio site, em public/demo/mediapipe-<versão>/: a
     CSP não libera CDN nenhum, e a versão no caminho deixa o cache ser longo
     sem nunca juntar o JavaScript de uma versão com o wasm de outra (o teste
     confere que os arquivos servidos são os do pacote instalado).
   ============================================================ */

// Só o tipo (apagado no build): o pacote em si continua chegando por import() dinâmico, no clique.
import type { FaceLandmarker as FaceLandmarkerDoMediaPipe } from '@mediapipe/tasks-vision'
import type { Ponto } from './olharLateral'

/** Mesma versão do desktop (frontend/), fixada no package.json do site. */
export const VERSAO_DO_MEDIAPIPE = '0.10.35'
export const BASE_DO_MEDIAPIPE = `/demo/mediapipe-${VERSAO_DO_MEDIAPIPE}`

/**
 * 1280 × 720 é o que quase toda webcam de notebook entrega de fábrica (pedir
 * menos faz algumas cortarem a imagem). O rosto não precisa de mais: o
 * modelo recorta e reduz o rosto antes de procurar a íris.
 */
export const PEDIDO_DA_CAMERA: MediaStreamConstraints = {
  audio: false,
  video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' },
}

/** Por que o teste não pôde seguir. Cada motivo tem a sua mensagem na tela. */
export type MotivoDaFalha =
  | 'endereco-inseguro'
  | 'sem-suporte'
  /** Sem WebGL ou WebAssembly: o reconhecimento do rosto não roda neste navegador. */
  | 'navegador'
  | 'negada'
  | 'nao-encontrada'
  | 'ocupada'
  /** Outro erro ao abrir a câmera. */
  | 'camera'
  /** A câmera abriu, mas não mandou imagem. */
  | 'sem-imagem'
  /** A câmera parou no meio do teste (desconectada, levada por outro programa). */
  | 'camera-parou'
  /** O reconhecimento do rosto não carregou. */
  | 'reconhecimento'
  /** O reconhecimento do rosto parou de responder no meio do teste. */
  | 'reconhecimento-parou'

/** O contexto de teste é devolvido na hora: o navegador limita quantos podem existir. */
function webglDisponivel(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** Renderizadores de WebGL feitos pelo processador, sem placa de vídeo de verdade. */
const WEBGL_POR_SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render/i

/**
 * O WebGL deste navegador é desenhado pelo processador? Acontece com placa
 * de vídeo na lista negra do Chrome, máquina virtual ou driver ausente. Aí,
 * rodar o modelo "na placa" é rodar no processador do pior jeito: medido em
 * 21/10/2026 num Chromium assim (SwiftShader), 0,8 a 1,5 s por quadro na
 * "placa" contra 0,2 a 0,26 s direto no processador. Na dúvida, false.
 */
function webglPorSoftware(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return false
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const nome = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return WEBGL_POR_SOFTWARE.test(nome)
  } catch {
    return false
  }
}

/**
 * O que dá para saber ANTES de pedir a câmera: sem isto, a pessoa daria a
 * permissão para depois ouvir que não ia funcionar. `null` é tudo certo.
 */
export function verificarNavegador(): MotivoDaFalha | null {
  if (!window.isSecureContext) return 'endereco-inseguro'
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return 'sem-suporte'
  if (typeof WebAssembly !== 'object' || !webglDisponivel()) return 'navegador'
  return null
}

/**
 * O mesmo critério de `classificarErroDeCamera` (utils/compat.ts), repetido
 * aqui para o pedaço do teste não carregar as 750 linhas do teste do
 * computador.
 */
function motivoDoErro(e: unknown): MotivoDaFalha {
  const nome = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : ''
  switch (nome) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'negada'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'nao-encontrada'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'ocupada'
    default:
      return 'camera'
  }
}

export type AberturaDaCamera =
  | { ok: true; stream: MediaStream }
  | { ok: false; motivo: MotivoDaFalha; erro: unknown }

export async function abrirCamera(): Promise<AberturaDaCamera> {
  try {
    return { ok: true, stream: await navigator.mediaDevices.getUserMedia(PEDIDO_DA_CAMERA) }
  } catch (erro) {
    return { ok: false, motivo: motivoDoErro(erro), erro }
  }
}

/** Apaga a luz da câmera: para todas as trilhas. */
export function pararCamera(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((trilha) => {
    try {
      trilha.stop()
    } catch {
      /* já parada */
    }
  })
}

/** Um quadro com rosto: os 478 pontos e a matriz da cabeça (4 × 4, coluna-maior), se veio. */
export type LeituraDoRosto = { pontos: readonly Ponto[]; matriz: ArrayLike<number> | null }

export type Detector = {
  /** `null` quando não há rosto no quadro. Pode lançar (contexto WebGL perdido, por exemplo). */
  detectar(video: HTMLVideoElement, instanteMs: number): LeituraDoRosto | null
  /** Solta o wasm e o contexto da placa de vídeo. */
  fechar(): void
}

/** A linha que o wasm do MediaPipe escreve quando o modelo sobe no processador. */
const LINHA_INFORMATIVA_DO_MEDIAPIPE = /^INFO: Created TensorFlow Lite XNNPACK delegate/

let filtroDoConsole: { original: Console['error']; filtro: Console['error']; usos: number } | null = null

/**
 * O wasm do MediaPipe escreve "INFO: Created TensorFlow Lite XNNPACK delegate
 * for CPU." com console.error, e o console mostra isso como ERRO vermelho no
 * meio de um teste que deu certo (revisão final de 21/10/2026). O emscripten
 * guarda o `console.error` vigente quando cria o módulo — dentro do
 * createFromOptions —, então basta o filtro valer durante o carregamento: a
 * referência que o wasm guardou segue filtrando depois. SÓ essa linha
 * conhecida muda de lugar: vai para console.debug (visível no `npm run dev`;
 * o build do site tira console.debug — vite.config.ts —, então no ar ela some
 * e o console fica sem erro falso); qualquer outro erro passa como estava. Devolve a função que
 * tira o filtro; com dois carregamentos ao mesmo tempo, o console só volta ao
 * que era quando o último termina.
 */
function filtrarLinhaInformativaDoMediaPipe(): () => void {
  if (!filtroDoConsole) {
    const original = console.error
    const filtro: Console['error'] = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && LINHA_INFORMATIVA_DO_MEDIAPIPE.test(args[0])) console.debug(...args)
      else original.apply(console, args)
    }
    console.error = filtro
    filtroDoConsole = { original, filtro, usos: 0 }
  }
  const atual = filtroDoConsole
  atual.usos++
  return () => {
    if (--atual.usos > 0) return
    // Se outro código trocou o console.error nesse meio tempo, não mexe: o dele chama o nosso.
    if (console.error === atual.filtro) console.error = atual.original
    if (filtroDoConsole === atual) filtroDoConsole = null
  }
}

/**
 * Carrega o Face Landmarker do próprio site. Começa na placa de vídeo
 * (WebGL) — ou direto no processador, quando o WebGL é feito por software;
 * se a placa falha, tenta o processador, que não depende dela (o mesmo
 * caminho do app, em src/tracker/engine.ts). Se não sobe, a falha chega a
 * quem chamou, para a tela dizer.
 */
export async function carregarDetector(base: string = BASE_DO_MEDIAPIPE): Promise<Detector> {
  const soltarFiltro = filtrarLinhaInformativaDoMediaPipe()
  let landmarker: FaceLandmarkerDoMediaPipe
  try {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const arquivos = await FilesetResolver.forVisionTasks(`${base}/wasm`)
    const criar = (delegate: 'GPU' | 'CPU') =>
      FaceLandmarker.createFromOptions(arquivos, {
        baseOptions: { modelAssetPath: `${base}/face_landmarker.task`, delegate },
        // Em modo vídeo o MediaPipe acompanha o rosto de um quadro para o outro
        // e suaviza os pontos, como no app.
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      })
    const primeiro = webglPorSoftware() ? 'CPU' : 'GPU'
    try {
      landmarker = await criar(primeiro)
    } catch (e) {
      if (primeiro === 'CPU') throw e
      console.warn('[IrisFlow] teste ao vivo: o reconhecimento do rosto não subiu na placa de vídeo; tentando no processador.', e)
      landmarker = await criar('CPU')
    }
  } finally {
    soltarFiltro()
  }

  let ultimoInstante = Number.NEGATIVE_INFINITY
  return {
    detectar(video, instanteMs) {
      // O modo vídeo recusa instante repetido ou para trás.
      const instante = Math.max(instanteMs, ultimoInstante + 1)
      ultimoInstante = instante
      const resultado = landmarker.detectForVideo(video, instante)
      const pontos = resultado.faceLandmarks?.[0]
      if (!pontos || pontos.length === 0) return null
      return { pontos, matriz: resultado.facialTransformationMatrixes?.[0]?.data ?? null }
    },
    fechar() {
      try {
        landmarker.close()
      } catch {
        /* já fechado */
      }
    },
  }
}

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* ============================================================
   A câmera e o reconhecimento do rosto do "Teste com o seu olhar": o
   MediaPipe só entra no clique, vem do próprio site (os arquivos servidos
   são os da versão instalada), cai da placa de vídeo para o processador
   quando precisa, e cada falha da câmera tem nome.
   ============================================================ */

const mp = vi.hoisted(() => ({
  importado: false,
  forVisionTasks: vi.fn(),
  createFromOptions: vi.fn(),
}))

vi.mock('@mediapipe/tasks-vision', () => {
  mp.importado = true
  return {
    FilesetResolver: { forVisionTasks: mp.forVisionTasks },
    FaceLandmarker: { createFromOptions: mp.createFromOptions },
  }
})

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

type ResultadoFalso = {
  faceLandmarks: { x: number; y: number; z: number; visibility: number }[][]
  faceBlendshapes: unknown[]
  facialTransformationMatrixes: { rows: number; columns: number; data: number[] }[]
}

const SEM_ROSTO: ResultadoFalso = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] }

function comRosto(): ResultadoFalso {
  const pontos = Array.from({ length: 478 }, (_, i) => ({ x: i / 1000, y: 0.5, z: 0, visibility: 0 }))
  const matriz = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -40, 1]
  return { faceLandmarks: [pontos], faceBlendshapes: [], facialTransformationMatrixes: [{ rows: 4, columns: 4, data: matriz }] }
}

function landmarkerFalso(resultado: () => ResultadoFalso = () => SEM_ROSTO) {
  return {
    detectForVideo: vi.fn((_video: unknown, _instante: number) => resultado()),
    close: vi.fn(),
  }
}

const originais = {
  isSecureContext: Object.getOwnPropertyDescriptor(window, 'isSecureContext'),
  mediaDevices: Object.getOwnPropertyDescriptor(navigator, 'mediaDevices'),
  getContext: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext'),
}

function restaurar(alvo: object, nome: string, descritor?: PropertyDescriptor) {
  if (descritor) Object.defineProperty(alvo, nome, descritor)
  else delete (alvo as Record<string, unknown>)[nome]
}

function comWebGL(disponivel: boolean) {
  const perder = vi.fn()
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn((tipo: string) =>
      disponivel && (tipo === 'webgl2' || tipo === 'webgl') ? { getExtension: () => ({ loseContext: perder }) } : null,
    ),
  })
  return perder
}

/** O WebGL do navegador, com o nome do renderizador que ele informa. */
function comRenderer(nome: string) {
  const UNMASKED_RENDERER_WEBGL = 0x9246
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: vi.fn(() => ({
      getExtension: (ext: string) =>
        ext === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL } : ext === 'WEBGL_lose_context' ? { loseContext: () => {} } : null,
      getParameter: (p: number) => (p === UNMASKED_RENDERER_WEBGL ? nome : 'WebKit WebGL'),
    })),
  })
}

beforeEach(() => {
  // Uma placa de vídeo comum, a menos que o teste diga outra coisa.
  comRenderer('ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)')
  mp.forVisionTasks.mockReset()
  mp.createFromOptions.mockReset()
  mp.forVisionTasks.mockImplementation(async (base: string) => ({
    wasmLoaderPath: `${base}/vision_wasm_internal.js`,
    wasmBinaryPath: `${base}/vision_wasm_internal.wasm`,
  }))
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
})

afterEach(() => {
  restaurar(window, 'isSecureContext', originais.isSecureContext)
  restaurar(navigator, 'mediaDevices', originais.mediaDevices)
  restaurar(HTMLCanvasElement.prototype, 'getContext', originais.getContext)
  vi.restoreAllMocks()
})

describe('carregarDetector', () => {
  it('o pacote do MediaPipe só é carregado quando o detector é pedido (o clique), não com a página', async () => {
    vi.resetModules()
    mp.importado = false
    mp.createFromOptions.mockResolvedValue(landmarkerFalso())
    const camera = await import('./camera')
    expect(mp.importado).toBe(false)
    await camera.carregarDetector()
    expect(mp.importado).toBe(true)
  })

  it('usa os arquivos do próprio site, em modo vídeo, um rosto, com a matriz da cabeça, na placa de vídeo', async () => {
    const { carregarDetector, BASE_DO_MEDIAPIPE } = await import('./camera')
    mp.createFromOptions.mockResolvedValue(landmarkerFalso())
    await carregarDetector()
    expect(mp.forVisionTasks).toHaveBeenCalledWith(`${BASE_DO_MEDIAPIPE}/wasm`)
    expect(mp.createFromOptions).toHaveBeenCalledTimes(1)
    const [arquivos, opcoes] = mp.createFromOptions.mock.calls[0]
    expect(arquivos).toEqual({
      wasmLoaderPath: `${BASE_DO_MEDIAPIPE}/wasm/vision_wasm_internal.js`,
      wasmBinaryPath: `${BASE_DO_MEDIAPIPE}/wasm/vision_wasm_internal.wasm`,
    })
    expect(opcoes).toMatchObject({
      baseOptions: { modelAssetPath: `${BASE_DO_MEDIAPIPE}/face_landmarker.task`, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
      outputFaceBlendshapes: false,
    })
  })

  it('WebGL por software (SwiftShader, sem placa de vídeo de verdade): começa direto no processador', async () => {
    // Medido em 21/10/2026 num Chromium assim: 0,8 a 1,5 s por quadro na "placa", 0,2 a 0,26 s no processador.
    comRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')
    const { carregarDetector } = await import('./camera')
    mp.createFromOptions.mockResolvedValue(landmarkerFalso())
    await carregarDetector()
    expect(mp.createFromOptions.mock.calls.map((c) => c[1].baseOptions.delegate)).toEqual(['CPU'])
  })

  it('com placa de vídeo de verdade, começa nela', async () => {
    comRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)')
    const { carregarDetector } = await import('./camera')
    mp.createFromOptions.mockResolvedValue(landmarkerFalso())
    await carregarDetector()
    expect(mp.createFromOptions.mock.calls.map((c) => c[1].baseOptions.delegate)).toEqual(['GPU'])
  })

  it('a placa de vídeo falhou: tenta no processador, com um aviso no console', async () => {
    const { carregarDetector } = await import('./camera')
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cpu = landmarkerFalso(comRosto)
    mp.createFromOptions.mockRejectedValueOnce(new Error('WebGL indisponível')).mockResolvedValueOnce(cpu)
    const detector = await carregarDetector()
    expect(mp.createFromOptions.mock.calls.map((c) => c[1].baseOptions.delegate)).toEqual(['GPU', 'CPU'])
    expect(aviso).toHaveBeenCalledTimes(1)
    expect(detector.detectar(document.createElement('video'), 10)).not.toBeNull()
  })

  it('nem a placa nem o processador: a falha chega a quem pediu', async () => {
    const { carregarDetector } = await import('./camera')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mp.createFromOptions.mockRejectedValue(new Error('sem wasm'))
    await expect(carregarDetector()).rejects.toThrow('sem wasm')
  })

  it('detectar: sem rosto é null; com rosto, os 478 pontos e a matriz; o instante nunca repete nem volta', async () => {
    const { carregarDetector } = await import('./camera')
    let atual = SEM_ROSTO
    const lm = landmarkerFalso(() => atual)
    mp.createFromOptions.mockResolvedValue(lm)
    const detector = await carregarDetector()
    const video = document.createElement('video')
    expect(detector.detectar(video, 100)).toBeNull()
    atual = comRosto()
    const leitura = detector.detectar(video, 100)
    expect(leitura?.pontos).toHaveLength(478)
    expect(leitura?.pontos[10]).toMatchObject({ x: 0.01, y: 0.5 })
    expect(Array.from(leitura?.matriz ?? [])).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -40, 1])
    detector.detectar(video, 50)
    // O modo vídeo do MediaPipe recusa instante repetido ou para trás.
    expect(lm.detectForVideo.mock.calls.map((c) => c[1])).toEqual([100, 101, 102])
  })

  it('fechar libera o detector, e fechar de novo não quebra', async () => {
    const { carregarDetector } = await import('./camera')
    const lm = landmarkerFalso()
    lm.close.mockImplementationOnce(() => {}).mockImplementationOnce(() => {
      throw new Error('já fechado')
    })
    mp.createFromOptions.mockResolvedValue(lm)
    const detector = await carregarDetector()
    detector.fechar()
    expect(() => detector.fechar()).not.toThrow()
    expect(lm.close).toHaveBeenCalledTimes(2)
  })
})

/* Revisão final de 21/10/2026: o wasm do MediaPipe escreve, com console.error,
   "INFO: Created TensorFlow Lite XNNPACK delegate for CPU." — uma linha
   informativa que o console mostra como ERRO vermelho, no meio de um teste
   que deu certo. O wasm guarda `console.error` quando é criado (dentro de
   createFromOptions), então o filtro entra só durante o carregamento e o
   que ele guardou continua filtrando depois. Só essa linha conhecida é
   filtrada (vai para console.debug); qualquer outro erro passa. */
describe('a linha informativa do MediaPipe não aparece como erro', () => {
  const INFO = 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.'

  it('a linha do XNNPACK vai para console.debug, qualquer outro erro passa, e o console volta ao que era', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { carregarDetector } = await import('./camera')
    let guardado: (...args: unknown[]) => void = () => {}
    mp.createFromOptions.mockImplementation(async () => {
      // O que o emscripten faz ao criar o módulo: guarda o console.error vigente.
      guardado = console.error.bind(console)
      console.error(INFO)
      console.error('E0000 um erro de verdade')
      return landmarkerFalso()
    })
    await carregarDetector()
    expect(erro.mock.calls.map((c) => c[0])).toEqual(['E0000 um erro de verdade'])
    expect(debug.mock.calls.map((c) => c[0])).toEqual([INFO])
    expect(console.error).toBe(erro)
    // O wasm continua escrevendo depois do carregamento, pela referência que guardou.
    guardado(INFO)
    guardado('E0001 outro erro de verdade')
    expect(erro.mock.calls.map((c) => c[0])).toEqual(['E0000 um erro de verdade', 'E0001 outro erro de verdade'])
    expect(debug.mock.calls.map((c) => c[0])).toEqual([INFO, INFO])
  })

  it('só essa linha é filtrada: um erro que apenas começa parecido, ou que não é texto, passa', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { carregarDetector } = await import('./camera')
    const objeto = new Error('INFO: Created TensorFlow Lite XNNPACK delegate')
    mp.createFromOptions.mockImplementation(async () => {
      console.error('ERROR: Created TensorFlow Lite XNNPACK delegate for CPU.')
      console.error(objeto)
      return landmarkerFalso()
    })
    await carregarDetector()
    expect(erro.mock.calls.map((c) => c[0])).toEqual(['ERROR: Created TensorFlow Lite XNNPACK delegate for CPU.', objeto])
  })

  it('se o carregamento falha, o console.error também volta ao que era', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { carregarDetector } = await import('./camera')
    mp.createFromOptions.mockRejectedValue(new Error('sem wasm'))
    await expect(carregarDetector()).rejects.toThrow('sem wasm')
    expect(console.error).toBe(erro)
  })

  it('dois carregamentos ao mesmo tempo: o console só volta ao que era quando o último termina', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { carregarDetector } = await import('./camera')
    const liberar: (() => void)[] = []
    mp.createFromOptions.mockImplementation(() => new Promise((ok) => liberar.push(() => ok(landmarkerFalso()))))
    const a = carregarDetector()
    await vi.waitFor(() => expect(liberar).toHaveLength(1))
    // O segundo começa com o primeiro ainda no meio do caminho.
    const b = carregarDetector()
    await vi.waitFor(() => expect(liberar).toHaveLength(2))
    expect(console.error).not.toBe(erro)
    liberar[0]()
    await a
    expect(console.error).not.toBe(erro)
    liberar[1]()
    await b
    expect(console.error).toBe(erro)
  })
})

describe('os arquivos do MediaPipe servidos pelo site', () => {
  it('são os da versão instalada (o JavaScript do pacote e o wasm precisam ser da mesma versão)', async () => {
    const { BASE_DO_MEDIAPIPE } = await import('./camera')
    const pacote = JSON.parse(readFileSync(resolve(SITE, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    const versao = pacote.dependencies['@mediapipe/tasks-vision']
    expect(versao).toMatch(/^\d+\.\d+\.\d+$/)
    // A versão vai no caminho: o cache longo de /demo/mediapipe-* nunca serve um wasm de outra versão.
    expect(BASE_DO_MEDIAPIPE).toBe(`/demo/mediapipe-${versao}`)
    // O .js compara sem o fim de linha: no Windows o git entrega a cópia de public/ com CRLF,
    // e a do pacote (npm) vem com LF — o conteúdo é o mesmo. O .wasm é binário: byte a byte.
    const semCR = (b: Buffer) => Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
    const hash = (f: string) => createHash('sha256').update(f.endsWith('.js') ? semCR(readFileSync(f)) : readFileSync(f)).digest('hex')
    for (const arquivo of [
      'vision_wasm_internal.js',
      'vision_wasm_internal.wasm',
      'vision_wasm_nosimd_internal.js',
      'vision_wasm_nosimd_internal.wasm',
    ]) {
      const servido = resolve(SITE, `public${BASE_DO_MEDIAPIPE}/wasm/${arquivo}`)
      expect(existsSync(servido), arquivo).toBe(true)
      expect(hash(servido), arquivo).toBe(hash(resolve(SITE, `node_modules/@mediapipe/tasks-vision/wasm/${arquivo}`)))
    }
  })

  // Revisão final de 21/10/2026: o wasm e o modelo (Apache-2.0) são servidos a qualquer visitante,
  // e a licença exige o texto dela junto de quem redistribui.
  it('o texto da licença Apache-2.0 do MediaPipe vai junto, na mesma pasta', async () => {
    const { BASE_DO_MEDIAPIPE } = await import('./camera')
    const caminho = resolve(SITE, `public${BASE_DO_MEDIAPIPE}/LICENSE`)
    expect(existsSync(caminho)).toBe(true)
    const texto = readFileSync(caminho, 'utf8')
    expect(texto).toContain('Apache License')
    expect(texto).toContain('Version 2.0, January 2004')
    expect(texto).toContain('TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION')
    expect(texto).toContain('limitations under the License.')
    expect(texto).toContain('@mediapipe/tasks-vision')
  })

  it('o modelo do rosto está lá e é um pacote .task de verdade (zip com a rede dos pontos), não uma página de erro', async () => {
    const { BASE_DO_MEDIAPIPE } = await import('./camera')
    const modelo = resolve(SITE, `public${BASE_DO_MEDIAPIPE}/face_landmarker.task`)
    expect(existsSync(modelo)).toBe(true)
    expect(statSync(modelo).size).toBeGreaterThan(1_000_000)
    const bytes = readFileSync(modelo)
    // O .task do MediaPipe é um zip (o primeiro registro começa 2 bytes depois do início).
    expect(bytes.subarray(0, 64).includes(Buffer.from('PK\x03\x04', 'latin1'))).toBe(true)
    expect(bytes.includes(Buffer.from('face_landmarks_detector.tflite'))).toBe(true)
  })
})

describe('abrirCamera', () => {
  function getUserMedia(resultado: () => Promise<MediaStream>) {
    const fn = vi.fn((_pedido?: MediaStreamConstraints) => resultado())
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: fn }, configurable: true })
    return fn
  }
  const erro = (name: string) => Object.assign(new Error(name), { name })

  it('pede só o vídeo da câmera da frente', async () => {
    const { abrirCamera } = await import('./camera')
    const stream = { getTracks: () => [] } as unknown as MediaStream
    const fn = getUserMedia(async () => stream)
    expect(await abrirCamera()).toEqual({ ok: true, stream })
    const pedido = fn.mock.calls[0][0] as MediaStreamConstraints
    expect(pedido.audio).toBe(false)
    expect(pedido.video).toMatchObject({ facingMode: 'user' })
  })

  it.each([
    ['NotAllowedError', 'negada'],
    ['SecurityError', 'negada'],
    ['NotFoundError', 'nao-encontrada'],
    ['OverconstrainedError', 'nao-encontrada'],
    ['NotReadableError', 'ocupada'],
    ['AbortError', 'ocupada'],
    ['TypeError', 'camera'],
  ])('%s vira "%s"', async (nome, motivo) => {
    const { abrirCamera } = await import('./camera')
    getUserMedia(async () => {
      throw erro(nome)
    })
    const r = await abrirCamera()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe(motivo)
  })
})

describe('verificarNavegador (antes de pedir a câmera)', () => {
  const comMediaDevices = () =>
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })

  it('tudo certo: nada a dizer, e o contexto de teste do WebGL é devolvido', async () => {
    const { verificarNavegador } = await import('./camera')
    comMediaDevices()
    const perder = comWebGL(true)
    expect(verificarNavegador()).toBeNull()
    expect(perder).toHaveBeenCalled()
  })

  it('endereço sem https', async () => {
    const { verificarNavegador } = await import('./camera')
    comMediaDevices()
    comWebGL(true)
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    expect(verificarNavegador()).toBe('endereco-inseguro')
  })

  it('navegador sem acesso à câmera', async () => {
    const { verificarNavegador } = await import('./camera')
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    comWebGL(true)
    expect(verificarNavegador()).toBe('sem-suporte')
  })

  it('sem WebGL (aceleração gráfica desligada): o reconhecimento não roda', async () => {
    const { verificarNavegador } = await import('./camera')
    comMediaDevices()
    comWebGL(false)
    expect(verificarNavegador()).toBe('navegador')
  })
})

describe('pararCamera', () => {
  it('para todas as trilhas, e aceita "nenhuma câmera"', async () => {
    const { pararCamera } = await import('./camera')
    const trilhas = [{ stop: vi.fn() }, { stop: vi.fn() }]
    pararCamera({ getTracks: () => trilhas } as unknown as MediaStream)
    expect(trilhas.every((t) => t.stop.mock.calls.length === 1)).toBe(true)
    expect(() => pararCamera(null)).not.toThrow()
  })
})

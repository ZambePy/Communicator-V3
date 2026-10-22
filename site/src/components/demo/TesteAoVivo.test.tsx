import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import TesteAoVivo from './TesteAoVivo'

/* ============================================================
   "Teste com o seu olhar" na tela, com a câmera e o MediaPipe simulados:
   a câmera só liga no clique (depois do aviso de privacidade), o teste
   mede o meio, responde pela fixação e fala; cada falha tem uma mensagem
   calma e o vídeo como alternativa; e a câmera apaga ao sair — também
   quando o navegador só entrega a câmera depois que a pessoa saiu.
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

/* ---------- um rosto de frente numa imagem 1280 × 720 ---------- */

type Resultado = {
  faceLandmarks: { x: number; y: number; z: number; visibility: number }[][]
  faceBlendshapes: unknown[]
  facialTransformationMatrixes: { rows: number; columns: number; data: number[] }[]
}

const SEM_ROSTO: Resultado = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] }

/** O rosto olhando `graus` para a direita da tela (íris 1/150 de olho por grau, cabeça reta). */
function rostoOlhando(graus: number): Resultado {
  const deslocamento = -graus / 150
  const pontos = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0 }))
  const p = (x: number, y: number) => ({ x: x / 1280, y: y / 720, z: 0, visibility: 0 })
  const olho = (esq: number, dir: number, sup: number, inf: number, iris: number, x0: number) => {
    pontos[esq] = p(x0, 330)
    pontos[dir] = p(x0 + 60, 330)
    pontos[sup] = p(x0 + 30, 320)
    pontos[inf] = p(x0 + 30, 340)
    pontos[iris] = p(x0 + 30 + deslocamento * 60, 330)
  }
  olho(33, 133, 159, 145, 468, 540)
  olho(362, 263, 386, 374, 473, 680)
  const reta = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -40, 1]
  return { faceLandmarks: [pontos], faceBlendshapes: [], facialTransformationMatrixes: [{ rows: 4, columns: 4, data: reta }] }
}

/** O rosto à vista, mas com os olhos fechados (sem leitura da íris). */
function rostoDeOlhosFechados(): Resultado {
  const r = rostoOlhando(0)
  const pontos = r.faceLandmarks[0]
  for (const [sup, inf] of [
    [159, 145],
    [386, 374],
  ])
    pontos[sup] = { ...pontos[inf] }
  return r
}

/* ---------- o que o navegador entrega ---------- */

const visto = { resultado: SEM_ROSTO }
let landmarkers: { detectForVideo: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[]

function novoLandmarker() {
  const lm = { detectForVideo: vi.fn(() => visto.resultado), close: vi.fn() }
  landmarkers.push(lm)
  return lm
}

/** Uma câmera de mentira: o teste decide quando (e se) o navegador a entrega. */
function camera() {
  let aoTerminar: (() => void) | null = null
  const trilha = {
    readyState: 'live' as 'live' | 'ended',
    stop: vi.fn(() => {
      trilha.readyState = 'ended'
    }),
    addEventListener: vi.fn((tipo: string, fn: () => void) => {
      if (tipo === 'ended') aoTerminar = fn
    }),
    removeEventListener: vi.fn(),
  }
  const stream = { getTracks: () => [trilha], getVideoTracks: () => [trilha] } as unknown as MediaStream
  let entregar: (s: MediaStream) => void = () => {}
  let recusar: (e: unknown) => void = () => {}
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((ok, falha) => {
        entregar = ok
        recusar = falha
      }),
  )
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  return {
    trilha,
    getUserMedia,
    entregar: () => act(async () => entregar(stream)),
    recusar: (nome: string) => act(async () => recusar(Object.assign(new Error(nome), { name: nome }))),
    desconectar: () => act(() => aoTerminar?.()),
  }
}

/** Os quadros da câmera: cada chamada entrega o próximo, no instante dado. */
let fila: ((agora: number, meta: object) => void)[]

async function quadro(agora: number, resultado: Resultado) {
  visto.resultado = resultado
  const cb = fila.shift()
  if (!cb) throw new Error('o teste não pediu quadro nenhum')
  await act(async () => cb(agora, {}))
}

/** Quadros a cada 40 ms, de `de` até antes de `ate`, olhando `graus` (null: sem rosto). */
async function quadros(de: number, ate: number, graus: number | null) {
  for (let t = de; t < ate; t += 40) await quadro(t, graus === null ? SEM_ROSTO : rostoOlhando(graus))
}

const aparelho = { computador: true, webgl: true }
const fala = { speak: vi.fn(), cancel: vi.fn() }

class Utterance {
  text: string
  lang = ''
  rate = 1
  constructor(texto: string) {
    this.text = texto
  }
}

const originais = {
  matchMedia: window.matchMedia,
  isSecureContext: Object.getOwnPropertyDescriptor(window, 'isSecureContext'),
  speechSynthesis: Object.getOwnPropertyDescriptor(window, 'speechSynthesis'),
  mediaDevices: Object.getOwnPropertyDescriptor(navigator, 'mediaDevices'),
  getContext: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext'),
  readyState: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState'),
  videoWidth: Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoWidth'),
  videoHeight: Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoHeight'),
  rvfc: Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'requestVideoFrameCallback'),
  cvfc: Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'cancelVideoFrameCallback'),
}

function restaurar(alvo: object, nome: string, descritor?: PropertyDescriptor) {
  if (descritor) Object.defineProperty(alvo, nome, descritor)
  else delete (alvo as Record<string, unknown>)[nome]
}

beforeEach(() => {
  aparelho.computador = true
  aparelho.webgl = true
  visto.resultado = SEM_ROSTO
  landmarkers = []
  fila = []
  mp.importado = false
  mp.forVisionTasks.mockReset()
  mp.forVisionTasks.mockResolvedValue({ wasmLoaderPath: 'a.js', wasmBinaryPath: 'a.wasm' })
  mp.createFromOptions.mockReset()
  mp.createFromOptions.mockImplementation(async () => novoLandmarker())
  fala.speak.mockReset()
  fala.cancel.mockReset()

  window.matchMedia = vi.fn((q: string) => ({
    matches: q.includes('min-width: 900px') && q.includes('pointer: fine') ? aparelho.computador : false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(window, 'speechSynthesis', { value: fala, configurable: true })
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => (aparelho.webgl ? { getExtension: () => ({ loseContext: () => {} }) } : null),
  })
  // O vídeo "já tem quadro" assim que recebe a câmera, em 1280 × 720.
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => 1280, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => 720, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
    configurable: true,
    value: vi.fn((cb: (agora: number, meta: object) => void) => {
      fila.push(cb)
      return fila.length
    }),
  })
  Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', { configurable: true, value: vi.fn() })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

/** Tudo o que o teste mandou ao console, de qualquer nível. */
const noConsole = () => [
  ...vi.mocked(console.warn).mock.calls,
  ...vi.mocked(console.error).mock.calls,
  ...vi.mocked(console.info).mock.calls,
  ...vi.mocked(console.log).mock.calls,
]

/** A aba some (ou volta): `document.hidden` e o evento que o navegador dispara. */
function esconderAAba(escondida: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => escondida })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (escondida ? 'hidden' : 'visible') })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

afterEach(() => {
  // Volta ao getter do próprio navegador (o jsdom).
  delete (document as unknown as Record<string, unknown>).hidden
  delete (document as unknown as Record<string, unknown>).visibilityState
  window.matchMedia = originais.matchMedia
  restaurar(window, 'isSecureContext', originais.isSecureContext)
  restaurar(window, 'speechSynthesis', originais.speechSynthesis)
  restaurar(navigator, 'mediaDevices', originais.mediaDevices)
  restaurar(HTMLCanvasElement.prototype, 'getContext', originais.getContext)
  restaurar(HTMLMediaElement.prototype, 'readyState', originais.readyState)
  restaurar(HTMLVideoElement.prototype, 'videoWidth', originais.videoWidth)
  restaurar(HTMLVideoElement.prototype, 'videoHeight', originais.videoHeight)
  restaurar(HTMLVideoElement.prototype, 'requestVideoFrameCallback', originais.rvfc)
  restaurar(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', originais.cvfc)
  document.documentElement.style.overflow = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const botaoComecar = () => screen.getByRole('button', { name: 'Ligar a câmera e começar' })
/** O que está na sala do teste (o convite continua por baixo dela). */
const sala = () => within(screen.getByRole('dialog'))

/** Clica, o navegador entrega a câmera, o reconhecimento sobe: o ponto do meio aparece. */
async function comecar(cam: ReturnType<typeof camera>) {
  fireEvent.click(botaoComecar())
  await cam.entregar()
  await waitFor(() => expect(sala().getByText(/olhe para o ponto no meio/i)).toBeInTheDocument())
}

/** Os 2 s do meio (quadros de 0 a 2000 ms). O teste começa em 2040. */
async function medirOMeio() {
  await quadros(0, 2040, 0)
  expect(sala().getByText(/olhe para o sim ou para o não/i)).toBeInTheDocument()
}

describe('<TesteAoVivo /> — antes do clique', () => {
  it('no celular (ou janela estreita, sem mouse): só a frase de que o teste é no computador', () => {
    aparelho.computador = false
    const cam = camera()
    render(<TesteAoVivo />)
    expect(screen.getByText(/o teste com o olhar é feito no computador/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(cam.getUserMedia).not.toHaveBeenCalled()
  })

  it('no computador: o aviso de privacidade vem antes, e nem a câmera nem o MediaPipe são carregados', () => {
    const cam = camera()
    render(<TesteAoVivo />)
    expect(screen.getByText(/a imagem e os pontos do rosto não saem do seu computador/i)).toBeInTheDocument()
    expect(botaoComecar()).toBeInTheDocument()
    expect(cam.getUserMedia).not.toHaveBeenCalled()
    expect(mp.importado).toBe(false)
  })

  // Revisão final de 21/10/2026 (M4): a voz do navegador pode ser online, então "nada é enviado"
  // prometia mais do que o código garante. O que a tela garante é a imagem e os pontos do rosto.
  it('a frase de privacidade promete só o que o código garante (a imagem e os pontos do rosto)', () => {
    camera()
    render(<TesteAoVivo />)
    const aviso = document.querySelector('.ao-vivo__privacidade')!
    expect(aviso).toHaveTextContent('A imagem e os pontos do rosto não saem do seu computador.')
    expect(aviso.textContent).not.toMatch(/nada é gravado nem enviado/i)
    expect(aviso).toHaveTextContent(/a câmera desliga quando você sai do teste/i)
  })

  // M5: quem testa e acha impreciso não deve concluir que o produto é assim.
  it('o convite diz, em uma linha, que é uma versão simples do que o aplicativo faz (calibração de 13 pontos)', () => {
    camera()
    render(<TesteAoVivo />)
    const linha = document.querySelector('.ao-vivo__versao-simples')!
    expect(linha).toHaveTextContent(/versão simples do que o aplicativo faz/i)
    expect(linha).toHaveTextContent(/13 pontos/)
  })
})

describe('<TesteAoVivo /> — o teste', () => {
  it('ciclo completo: a câmera no clique, 2 s no meio, 1,5 s olhando para a direita responde "Sim" e fala', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    expect(cam.getUserMedia).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('dialog', { name: 'Teste com o seu olhar' })).toBeInTheDocument()
    await cam.entregar()
    await waitFor(() => expect(sala().getByText(/olhe para o ponto no meio/i)).toBeInTheDocument())
    expect(mp.importado).toBe(true)

    await medirOMeio()
    await quadros(2040, 2040 + 1400, 8)
    expect(fala.speak).not.toHaveBeenCalled()
    await quadros(2040 + 1400, 2040 + 1700, 8)
    expect(screen.getByText('Você respondeu Sim.')).toBeInTheDocument()
    expect(fala.speak).toHaveBeenCalledTimes(1)
    const dito = fala.speak.mock.calls[0][0] as Utterance
    expect(dito.text).toBe('Sim')
    expect(dito.lang).toBe('pt-BR')

    // Continuar olhando não repete; voltar ao meio e olhar para a esquerda responde "Não".
    await quadros(3740, 5240, 8)
    expect(fala.speak).toHaveBeenCalledTimes(1)
    await quadros(5240, 5840, 0)
    await quadros(5840, 7600, -8)
    expect(screen.getByText('Você respondeu Não.')).toBeInTheDocument()
    expect((fala.speak.mock.calls[1][0] as Utterance).text).toBe('Não')
  })

  it('sem voz no navegador, a resposta aparece escrita mesmo assim (e a tela diz que não houve voz)', async () => {
    restaurar(window, 'speechSynthesis', undefined)
    vi.unstubAllGlobals()
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    await medirOMeio()
    await quadros(2040, 3740, 8)
    expect(screen.getByText('Você respondeu Sim.')).toBeInTheDocument()
    expect(screen.getByText(/este navegador não tem voz/i)).toBeInTheDocument()
  })

  it('rosto fora da câmera: o aviso calmo aparece depois de um instante e some quando o rosto volta', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    await medirOMeio()
    await quadros(2040, 2440, null)
    expect(screen.queryByText(/não estou vendo seu rosto/i)).not.toBeInTheDocument()
    await quadros(2440, 3040, null)
    expect(screen.getByText(/não estou vendo seu rosto, tentando de novo/i)).toBeInTheDocument()
    await quadros(3040, 3200, 0)
    expect(screen.queryByText(/não estou vendo seu rosto/i)).not.toBeInTheDocument()
  })

  it('rosto fora por muito tempo: oferece o vídeo; escolher o vídeo desliga a câmera', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    await medirOMeio()
    await quadros(2040, 8440, null)
    fireEvent.click(screen.getByRole('button', { name: 'Ver o vídeo em vez disso' }))
    expect(cam.trilha.stop).toHaveBeenCalled()
    expect(landmarkers[0].close).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.querySelector('video source[src="/media/demo-communicator.mp4"]')).not.toBeNull()
  })

  it('rosto à vista, mas sem ver os olhos (óculos escuros, reflexo): a tela pede para mostrar os olhos', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    for (let t = 0; t < 3000; t += 40) await quadro(t, rostoDeOlhosFechados())
    expect(sala().getByText(/não estou conseguindo ver seus olhos/i)).toBeInTheDocument()
  })

  it('computador lento (menos de 2 quadros por segundo): a tela avisa que as respostas vão demorar', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    for (let t = 0; t < 670 * 6; t += 670) await quadro(t, rostoOlhando(0))
    expect(sala().getByText(/está demorando para reconhecer o rosto/i)).toBeInTheDocument()
  })

  it('"Refazer o ponto do meio" volta para os 2 s do centro', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    await medirOMeio()
    fireEvent.click(screen.getByRole('button', { name: 'Refazer o ponto do meio' }))
    await quadros(2040, 2120, 0)
    expect(sala().getByText(/olhe para o ponto no meio/i)).toBeInTheDocument()
  })
})

describe('<TesteAoVivo /> — a câmera apaga ao sair', () => {
  it('desmontar no meio do teste: para a câmera, o reconhecimento, os quadros e a voz', async () => {
    const cam = camera()
    const { unmount } = render(<TesteAoVivo />)
    await comecar(cam)
    await medirOMeio()
    unmount()
    expect(cam.trilha.stop).toHaveBeenCalled()
    expect(landmarkers[0].close).toHaveBeenCalled()
    expect(HTMLVideoElement.prototype.cancelVideoFrameCallback).toHaveBeenCalled()
    expect(fala.cancel).toHaveBeenCalled()
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('saiu enquanto o navegador abria a câmera: a câmera que chega depois é fechada na hora', async () => {
    const cam = camera()
    const { unmount } = render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    unmount()
    await cam.entregar()
    expect(cam.trilha.stop).toHaveBeenCalled()
    // E o reconhecimento, que só desce depois da câmera, nem foi pedido.
    expect(mp.importado).toBe(false)
    expect(landmarkers).toHaveLength(0)
  })

  it('saiu com a câmera ligada e o reconhecimento ainda descendo: o reconhecimento que chega depois é fechado', async () => {
    let entregarDetector: (lm: ReturnType<typeof novoLandmarker>) => void = () => {}
    mp.createFromOptions.mockImplementation(() => new Promise((ok) => (entregarDetector = ok)))
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.entregar()
    expect(sala().getByText(/ligando o reconhecimento do rosto/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sair do teste' }))
    expect(cam.trilha.stop).toHaveBeenCalled()
    const atrasado = novoLandmarker()
    await act(async () => entregarDetector(atrasado))
    expect(atrasado.close).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('"Sair do teste" apaga a câmera e volta ao convite, com o foco no botão de começar', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    fireEvent.click(screen.getByRole('button', { name: 'Sair do teste' }))
    expect(cam.trilha.stop).toHaveBeenCalled()
    expect(landmarkers[0].close).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(botaoComecar()).toHaveFocus())
  })

  it('Esc também sai', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(cam.trilha.stop).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('fechar a aba ou ir para outro site (pagehide) apaga a câmera', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(cam.trilha.stop).toHaveBeenCalled()
    expect(landmarkers[0].close).toHaveBeenCalled()
  })
})

describe('<TesteAoVivo /> — falhas: mensagem calma e o vídeo como alternativa', () => {
  const temOVideo = () => expect(document.querySelector('video source[src="/media/demo-communicator.mp4"]')).not.toBeNull()

  it('câmera negada: diz como liberar, mostra o vídeo e não deixa nada ligado', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.recusar('NotAllowedError')
    expect(screen.getByRole('alert')).toHaveTextContent(/a câmera não foi liberada/i)
    temOVideo()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    // Sem câmera, o reconhecimento (uns 15 MB) nem começou a descer.
    expect(mp.importado).toBe(false)
    expect(mp.createFromOptions).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sem câmera no computador', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.recusar('NotFoundError')
    expect(screen.getByRole('alert')).toHaveTextContent(/não encontramos uma câmera/i)
    temOVideo()
  })

  it('sem WebGL: avisa antes de pedir a câmera', () => {
    aparelho.webgl = false
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    expect(cam.getUserMedia).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/não consegue rodar o reconhecimento do rosto/i)
    temOVideo()
  })

  it('o reconhecimento do rosto não carregou (wasm): a câmera apaga e o vídeo aparece', async () => {
    mp.createFromOptions.mockRejectedValue(new Error('wasm indisponível'))
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.entregar()
    expect(await screen.findByRole('alert')).toHaveTextContent(/não deu para ligar o reconhecimento do rosto/i)
    expect(cam.trilha.stop).toHaveBeenCalled()
    temOVideo()
  })

  it('a câmera desconectou no meio do teste', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    await cam.desconectar()
    expect(screen.getByRole('alert')).toHaveTextContent(/a câmera parou de mandar imagem/i)
    expect(landmarkers[0].close).toHaveBeenCalled()
    temOVideo()
  })

  it('o reconhecimento quebrou em todos os quadros: para, com um aviso só no console', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    landmarkers[0].detectForVideo.mockImplementation(() => {
      throw new Error('contexto WebGL perdido')
    })
    for (let t = 0; t < 2000 && fila.length; t += 40) await quadro(t, SEM_ROSTO)
    expect(screen.getByRole('alert')).toHaveTextContent(/o reconhecimento do rosto parou/i)
    expect(cam.trilha.stop).toHaveBeenCalled()
    // Um aviso pelo primeiro quadro que falhou e um pela parada — nunca um por quadro.
    expect(vi.mocked(console.warn).mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('"Tentar de novo" recomeça do clique', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.recusar('NotAllowedError')
    const outra = camera()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(outra.getUserMedia).toHaveBeenCalledTimes(1)
    await outra.entregar()
    await waitFor(() => expect(sala().getByText(/olhe para o ponto no meio/i)).toBeInTheDocument())
  })
})

/* ---------- revisão final de 21/10/2026 ---------- */

describe('<TesteAoVivo /> — a câmera apaga com a aba escondida (I3)', () => {
  const frase = /a câmera desligou porque você saiu desta aba/i

  it('aba escondida com a sala aberta: nenhuma trilha fica ligada, o reconhecimento fecha e volta o convite com a frase', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    await medirOMeio()
    expect(cam.trilha.readyState).toBe('live')
    esconderAAba(true)
    expect(cam.trilha.readyState).toBe('ended')
    expect(landmarkers[0].close).toHaveBeenCalled()
    expect(HTMLVideoElement.prototype.cancelVideoFrameCallback).toHaveBeenCalled()
    expect(fala.cancel).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(botaoComecar()).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(frase)
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('a pessoa voltar para a aba não liga a câmera de novo sozinha; só o botão liga', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    esconderAAba(true)
    esconderAAba(false)
    expect(cam.getUserMedia).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(frase)
    // Ligar de novo pede a câmera outra vez, e a frase some.
    const outra = camera()
    fireEvent.click(botaoComecar())
    expect(outra.getUserMedia).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(frase)).not.toBeInTheDocument()
  })

  it('aba escondida enquanto o navegador ainda abre a câmera: a câmera que chega depois é fechada na hora', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    esconderAAba(true)
    await cam.entregar()
    expect(cam.trilha.readyState).toBe('ended')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mp.importado).toBe(false)
  })

  it('aba escondida com o reconhecimento ainda descendo: o que chega depois é fechado e nada fica ligado', async () => {
    let entregarDetector: (lm: ReturnType<typeof novoLandmarker>) => void = () => {}
    mp.createFromOptions.mockImplementation(() => new Promise((ok) => (entregarDetector = ok)))
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.entregar()
    await waitFor(() => expect(mp.createFromOptions).toHaveBeenCalled())
    esconderAAba(true)
    expect(cam.trilha.readyState).toBe('ended')
    const atrasado = novoLandmarker()
    await act(async () => entregarDetector(atrasado))
    expect(atrasado.close).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('com o convite fechado (nada ligado), esconder a aba não faz nada e não escreve frase nenhuma', () => {
    const cam = camera()
    render(<TesteAoVivo />)
    esconderAAba(true)
    expect(cam.getUserMedia).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(botaoComecar()).toBeInTheDocument()
  })

  it('o foco volta ao botão de começar (a sala que o tinha sumiu)', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    await comecar(cam)
    esconderAAba(true)
    await waitFor(() => expect(botaoComecar()).toHaveFocus())
  })
})

describe('<TesteAoVivo /> — o reconhecimento só desce depois que a câmera abriu (M2)', () => {
  it('antes da resposta do navegador, nem o pacote do MediaPipe nem o wasm são pedidos', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    expect(cam.getUserMedia).toHaveBeenCalledTimes(1)
    // O navegador ainda pergunta da câmera: dá tempo de sobra para um import() pendente andar.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40))
    })
    expect(mp.importado).toBe(false)
    expect(mp.forVisionTasks).not.toHaveBeenCalled()
    await cam.entregar()
    await waitFor(() => expect(mp.createFromOptions).toHaveBeenCalledTimes(1))
    expect(mp.forVisionTasks).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['NotAllowedError', /a câmera não foi liberada/i],
    ['NotFoundError', /não encontramos uma câmera/i],
    ['NotReadableError', /sendo usada por outro programa/i],
  ])('câmera recusada (%s): mensagem na tela, nada baixado e nada no console', async (nome, mensagem) => {
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.recusar(nome)
    expect(screen.getByRole('alert')).toHaveTextContent(mensagem)
    expect(mp.importado).toBe(false)
    expect(mp.forVisionTasks).not.toHaveBeenCalled()
    expect(noConsole()).toEqual([])
  })

  it('navegador sem acesso à câmera: mensagem na tela e nada no console', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    expect(screen.getByRole('alert')).toHaveTextContent(/este navegador não dá acesso à câmera/i)
    expect(mp.importado).toBe(false)
    expect(noConsole()).toEqual([])
  })

  it('sem WebGL e página sem https (desfechos esperados): mensagem na tela e nada no console', () => {
    aparelho.webgl = false
    camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    expect(screen.getByRole('alert')).toHaveTextContent(/aceleração gráfica/i)
    expect(noConsole()).toEqual([])
  })

  it('falha inesperada ao ligar a câmera: vai ao console uma vez', async () => {
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.recusar('TypeError')
    expect(screen.getByRole('alert')).toHaveTextContent(/não deu para ligar a câmera/i)
    expect(vi.mocked(console.warn).mock.calls).toHaveLength(1)
  })

  it('o reconhecimento que não carrega (inesperado) continua indo ao console, sem repetir', async () => {
    mp.createFromOptions.mockRejectedValue(new Error('wasm indisponível'))
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.entregar()
    expect(await screen.findByRole('alert')).toHaveTextContent(/não deu para ligar o reconhecimento do rosto/i)
    // Um aviso da placa de vídeo (camera.ts, antes de tentar o processador) e um da falha final.
    const avisos = vi.mocked(console.warn).mock.calls
    expect(avisos.length).toBeGreaterThanOrEqual(1)
    expect(avisos.length).toBeLessThanOrEqual(2)
    expect(avisos.some((a) => String(a[0]).includes('teste ao vivo:') && a[1] === 'reconhecimento')).toBe(true)
  })
})

describe('<TesteAoVivo /> — depois de uma falha, o foco vai para onde dá para agir (M3)', () => {
  it.each(['NotAllowedError', 'NotFoundError'])('%s: o foco vai para "Tentar de novo"', async (nome) => {
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.recusar(nome)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveFocus())
  })

  it('o reconhecimento que não carregou (a sala estava aberta): o foco também vai para "Tentar de novo"', async () => {
    mp.createFromOptions.mockRejectedValue(new Error('wasm indisponível'))
    const cam = camera()
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    await cam.entregar()
    await screen.findByRole('alert')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveFocus())
  })

  it('falha em que tentar de novo não adianta (sem acesso à câmera): não há botão, e o foco vai para o alerta', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    render(<TesteAoVivo />)
    fireEvent.click(botaoComecar())
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveFocus()
  })
})

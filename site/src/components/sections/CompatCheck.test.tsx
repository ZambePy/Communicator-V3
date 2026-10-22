import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CompatCheck } from './CompatCheck'

/* ============================================================
   "Meu computador funciona?" na tela: a câmera só liga quando a pessoa
   pede, mostra a imagem e a taxa de quadros contada, desliga no botão e ao
   sair da página — também quando o navegador só entrega a câmera depois que
   a pessoa já saiu. E nada vai para servidor nenhum.
   ============================================================ */

const { aparelho, medida } = vi.hoisted(() => ({
  aparelho: { celular: false },
  medida: { fps: 30 as number | null },
}))

vi.mock('@/lib/aparelho', () => ({
  ehIOS: () => false,
  ehAndroid: () => aparelho.celular,
  ehCelular: () => aparelho.celular,
}))

// A contagem real depende do vídeo tocando (requestVideoFrameCallback), que o
// jsdom não tem: o teste decide quantos quadros a câmera "entregou".
vi.mock('@/utils/compat', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/utils/compat')>()
  return { ...real, medirQuadros: vi.fn(async () => medida.fps) }
})

const originais = {
  isSecureContext: Object.getOwnPropertyDescriptor(window, 'isSecureContext'),
  mediaDevices: Object.getOwnPropertyDescriptor(navigator, 'mediaDevices'),
  hardwareConcurrency: Object.getOwnPropertyDescriptor(navigator, 'hardwareConcurrency'),
  deviceMemory: Object.getOwnPropertyDescriptor(navigator, 'deviceMemory'),
  userAgent: Object.getOwnPropertyDescriptor(navigator, 'userAgent'),
  gpu: Object.getOwnPropertyDescriptor(navigator, 'gpu'),
  userAgentData: Object.getOwnPropertyDescriptor(navigator, 'userAgentData'),
  readyState: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState'),
  videoWidth: Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoWidth'),
  videoHeight: Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, 'videoHeight'),
}

function restaurar(alvo: object, nome: string, descritor?: PropertyDescriptor) {
  if (descritor) Object.defineProperty(alvo, nome, descritor)
  else delete (alvo as Record<string, unknown>)[nome]
}

type Trilha = { stop: ReturnType<typeof vi.fn>; getSettings: () => MediaTrackSettings; label: string; addEventListener: () => void }

/** Uma câmera de mentira: o teste decide quando o navegador a entrega. */
function camera({ largura = 1280, altura = 720 } = {}) {
  const trilha: Trilha = {
    stop: vi.fn(),
    getSettings: () => ({ width: largura, height: altura, frameRate: 30 }),
    label: 'Webcam HD',
    addEventListener: () => {},
  }
  const stream = {
    getTracks: () => [trilha],
    getVideoTracks: () => [trilha],
  } as unknown as MediaStream
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
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { get: () => largura, configurable: true })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { get: () => altura, configurable: true })
  return {
    trilha,
    getUserMedia,
    entregar: () => act(async () => entregar(stream)),
    recusar: (nome: string) => act(async () => recusar(Object.assign(new Error(nome), { name: nome }))),
  }
}

function montar(aoMudarVeredito?: (nivel: string) => void) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CompatCheck titulo={null} aoMudarVeredito={aoMudarVeredito} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  aparelho.celular = false
  medida.fps = 30
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true })
  Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true })
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    configurable: true,
  })
  Object.defineProperty(navigator, 'userAgentData', {
    value: { platform: 'Windows', mobile: false, getHighEntropyValues: async () => ({ platformVersion: '15.0.0', bitness: '64' }) },
    configurable: true,
  })
  Object.defineProperty(navigator, 'gpu', {
    value: { requestAdapter: async () => ({ info: { vendor: 'nvidia', architecture: 'ampere', description: '' } }) },
    configurable: true,
  })
  // O vídeo "já tem quadro" assim que recebe a câmera.
  Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get: () => 4, configurable: true })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  for (const nome of ['isSecureContext'] as const) restaurar(window, nome, originais[nome])
  for (const nome of ['mediaDevices', 'hardwareConcurrency', 'deviceMemory', 'userAgent', 'gpu', 'userAgentData'] as const)
    restaurar(navigator, nome, originais[nome])
  restaurar(HTMLMediaElement.prototype, 'readyState', originais.readyState)
  restaurar(HTMLVideoElement.prototype, 'videoWidth', originais.videoWidth)
  restaurar(HTMLVideoElement.prototype, 'videoHeight', originais.videoHeight)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('<CompatCheck /> — "Meu computador funciona?"', () => {
  it('antes do teste: lê o Windows 11 e a placa, e pede a câmera em vez de dar o veredito', async () => {
    const cam = camera()
    montar()
    expect(await screen.findByText('Windows 11, 64 bits')).toBeInTheDocument()
    expect(await screen.findByText('WebGPU disponível (nvidia, ampere)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Falta testar a câmera')
    // A câmera não liga sozinha.
    expect(cam.getUserMedia).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Testar a câmera' })).toBeInTheDocument()
  })

  it('testa a câmera: pede 1080p a 30 quadros, conta os quadros e dá o veredito "Funciona"', async () => {
    const cam = camera()
    montar()
    await screen.findByText('Windows 11, 64 bits')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    expect(cam.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }),
      }),
    )
    await cam.entregar()
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Funciona'), { timeout: 3000 })
    expect(screen.getAllByText('1280×720, 30 quadros por segundo').length).toBeGreaterThan(0)
    // A imagem fica na pré-visualização, e a câmera continua ligada até a pessoa desligar.
    expect(document.querySelector('video')!.srcObject).not.toBeNull()
    expect(cam.trilha.stop).not.toHaveBeenCalled()
  })

  it('câmera escura (12 quadros): funciona, mas pode ficar lento — e diz o que fazer', async () => {
    medida.fps = 12
    const cam = camera()
    montar()
    await screen.findByText('Windows 11, 64 bits')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    await cam.entregar()
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Funciona, mas pode ficar lento'),
      { timeout: 3000 },
    )
    expect(screen.getByText(/Acenda uma luz de frente para o rosto/)).toBeInTheDocument()
  })

  it('"Desligar a câmera" apaga a câmera e solta a pré-visualização', async () => {
    const cam = camera()
    montar()
    await screen.findByText('Windows 11, 64 bits')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    await cam.entregar()
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Funciona'), { timeout: 3000 })
    fireEvent.click(screen.getByRole('button', { name: 'Desligar a câmera' }))
    expect(cam.trilha.stop).toHaveBeenCalled()
    expect(document.querySelector('video')!.srcObject).toBeNull()
  })

  it('sair da página apaga a câmera', async () => {
    const cam = camera()
    const { unmount } = montar()
    await screen.findByText('Windows 11, 64 bits')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    await cam.entregar()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desligar a câmera' })).toBeInTheDocument())
    unmount()
    expect(cam.trilha.stop).toHaveBeenCalled()
  })

  it('a câmera que o navegador só entrega DEPOIS da saída é apagada na hora', async () => {
    const cam = camera()
    const { unmount } = montar()
    await screen.findByText('Windows 11, 64 bits')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    unmount()
    await cam.entregar()
    expect(cam.trilha.stop).toHaveBeenCalled()
  })

  it('fechar a aba (pagehide) também apaga a câmera', async () => {
    const cam = camera()
    montar()
    await screen.findByText('Windows 11, 64 bits')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    await cam.entregar()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desligar a câmera' })).toBeInTheDocument())
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(cam.trilha.stop).toHaveBeenCalled()
  })

  it('permissão negada: diz que não deu para testar e como permitir, sem reprovar', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cam = camera()
    montar()
    await screen.findByText('Windows 11, 64 bits')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    await cam.recusar('NotAllowedError')
    expect(await screen.findByText('Sem permissão para testar')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveTextContent('Não vai funcionar')
    // Um aviso no console por teste, não por quadro.
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('câmera que abre sem mandar imagem: diz na tela e deixa um aviso no console', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cam = camera({ largura: 0, altura: 0 })
    montar()
    await screen.findByText('Windows 11, 64 bits')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    await cam.entregar()
    expect(await screen.findByText('A câmera abriu, mas não mandou imagem', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveTextContent('Funciona')
    // A câmera não fica acesa com o erro na tela.
    expect(cam.trilha.stop).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Desligar a câmera' })).not.toBeInTheDocument()
    // Sem falha muda: além da tela, um aviso no console (relato de 19/10/2026).
    expect(aviso).toHaveBeenCalledTimes(1)
  })

  it('página sem https: não abre a câmera e não culpa o computador', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    const cam = camera()
    montar()
    await screen.findByText('Windows 11, 64 bits')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    expect(await screen.findByText('Não deu para testar neste endereço')).toBeInTheDocument()
    expect(cam.getUserMedia).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveTextContent('Não vai funcionar')
  })

  it('nada é enviado: o teste inteiro não faz nenhum pedido de rede', async () => {
    const cam = camera()
    montar()
    await screen.findByText('Windows 11, 64 bits')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    await cam.entregar()
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Funciona'), { timeout: 3000 })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('no celular: não oferece a câmera e manda o link do teste para o computador', async () => {
    aparelho.celular = true
    Object.defineProperty(navigator, 'userAgentData', {
      value: { platform: 'Android', mobile: true, getHighEntropyValues: async () => ({}) },
      configurable: true,
    })
    montar()
    expect(screen.queryByRole('button', { name: 'Testar a câmera' })).not.toBeInTheDocument()
    expect(screen.getByText(/irisflow\.ia\.br\/meu-computador|\/meu-computador/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Abra esta página no computador'))
    expect(screen.getByText(/instalado no computador da pessoa, e não no celular/)).toBeInTheDocument()
    // Só a linha do sistema: os núcleos e a memória do celular não contam.
    const linhas = screen.getByRole('list', { name: 'O que foi medido' })
    expect(within(linhas).getAllByRole('listitem')).toHaveLength(1)
    expect(within(linhas).getByText('Celular ou tablet')).toBeInTheDocument()
    expect(screen.queryByText(/núcleos/)).not.toBeInTheDocument()
  })

  it('conta à página o nível do veredito (a /meu-computador escolhe o fecho por ele)', async () => {
    const niveis: string[] = []
    const cam = camera()
    montar((n) => niveis.push(n))
    await screen.findByText('Windows 11, 64 bits')
    // Antes do teste da câmera: nada de "Funciona" nem de "Não vai funcionar".
    expect(niveis.at(-1)).toBe('falta-camera')
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    await cam.entregar()
    await waitFor(() => expect(niveis.at(-1)).toBe('funciona'), { timeout: 3000 })
  })

  it('computador com 2 núcleos, antes do teste da câmera: o painel não diz "Não vai funcionar"', async () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true })
    montar()
    await screen.findByText('Windows 11, 64 bits')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Falta testar a câmera')
    expect(screen.queryByText(/Não vai funcionar/)).toBeNull()
    expect(screen.getByText(/alguns navegadores informam menos/)).toBeInTheDocument()
  })

  it('cada linha diz o estado por extenso para o leitor de tela (nada só por cor)', async () => {
    camera()
    montar()
    await screen.findByText('Windows 11, 64 bits')
    const linhas = screen.getByRole('list', { name: 'O que foi medido' })
    // sistema, placa, processador e memória atendem; a câmera ainda não foi verificada
    expect(within(linhas).getAllByText('(atende)', { exact: false })).toHaveLength(4)
    expect(within(linhas).getByText('(ainda não verificado)', { exact: false })).toBeInTheDocument()
  })
})

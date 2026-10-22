import { describe, expect, it, vi } from 'vitest'
import {
  avaliar,
  classificarErroDeCamera,
  fpsDosInstantes,
  lerPlacaDeVideo,
  lerProcessadorEMemoria,
  lerSistema,
  medirQuadros,
  sistemaPeloUserAgent,
  versaoDoWindows,
  webglEmSoftware,
  type LeituraDaCamera,
  type LeituraDaPlaca,
  type Leituras,
} from './compat'

/* ============================================================
   "Meu computador funciona?" — as leituras e o veredito.

   O ponto sensível continua o mesmo da verificação antiga (que estas
   regras substituem): o que não deu para medir daqui — câmera num endereço
   sem https, memória num navegador que não a informa, WebGPU num navegador
   que não a tem — é dito como é e NUNCA vira reprovação do computador.
   ============================================================ */

const UA_CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'

const PLACA_BOA: LeituraDaPlaca = {
  webgpu: { estado: 'disponivel', fabricante: 'nvidia', arquitetura: 'ampere', descricao: '', reserva: false },
  webgl: 'ok',
}

const CAMERA_BOA: LeituraDaCamera = {
  estado: 'ok',
  largura: 1280,
  altura: 720,
  fps: 30,
  fpsInformado: 30,
  nome: 'Webcam HD',
}

/** Um computador que atende a tudo; cada teste troca o que quer examinar. */
function leituras(mudar: Partial<Leituras> = {}): Leituras {
  return {
    sistema: { tipo: 'windows', versao: '11', bits: 64 },
    nucleos: 8,
    memoria: 8,
    placa: PLACA_BOA,
    camera: CAMERA_BOA,
    disponiveis: ['windows'],
    ...mudar,
  }
}

const linha = (l: Leituras, id: string) => avaliar(l).linhas.find((x) => x.id === id)!

describe('versão do Windows pelas client hints', () => {
  it('maior ≥ 13 é Windows 11; de 1 a 10, Windows 10; 0 é anterior ao 10', () => {
    expect(versaoDoWindows('15.0.0')).toBe('11')
    expect(versaoDoWindows('13.0.0')).toBe('11')
    expect(versaoDoWindows('10.0.0')).toBe('10')
    expect(versaoDoWindows('1.0.0')).toBe('10')
    expect(versaoDoWindows('0.3.0')).toBe('antigo')
  })

  it('valor vazio ou estranho: não dá para saber', () => {
    expect(versaoDoWindows('')).toBe('desconhecida')
    expect(versaoDoWindows(undefined)).toBe('desconhecida')
    expect(versaoDoWindows('abc')).toBe('desconhecida')
  })
})

describe('sistema pelo texto do navegador', () => {
  it('"Windows NT 10.0" é o 10 E o 11: a versão fica desconhecida', () => {
    expect(sistemaPeloUserAgent(UA_CHROME_WINDOWS)).toEqual({ tipo: 'windows', versao: 'desconhecida', bits: 64 })
  })

  it('Windows 7, 8 e 8.1 se dizem NT 6.x', () => {
    expect(sistemaPeloUserAgent('Mozilla/5.0 (Windows NT 6.1; WOW64)')).toMatchObject({ tipo: 'windows', versao: 'antigo' })
  })

  it('celular, Mac e Linux', () => {
    expect(sistemaPeloUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129 Mobile').tipo).toBe('celular')
    expect(sistemaPeloUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)').tipo).toBe('macos')
    expect(sistemaPeloUserAgent('Mozilla/5.0 (X11; Linux x86_64)').tipo).toBe('linux')
  })
})

describe('lerSistema', () => {
  it('com client hints (Chrome, Edge): a versão exata e os bits', async () => {
    const getHighEntropyValues = vi.fn(async () => ({ platformVersion: '15.0.0', bitness: '64' }))
    const nav = { userAgent: UA_CHROME_WINDOWS, platform: 'Win32', userAgentData: { platform: 'Windows', mobile: false, getHighEntropyValues } }
    expect(await lerSistema(nav as unknown as Navigator)).toEqual({ tipo: 'windows', versao: '11', bits: 64 })
    expect(getHighEntropyValues).toHaveBeenCalledWith(['platformVersion', 'bitness'])
  })

  it('Windows de 32 bits aparece', async () => {
    const nav = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/129',
      platform: 'Win32',
      userAgentData: { platform: 'Windows', mobile: false, getHighEntropyValues: async () => ({ platformVersion: '10.0.0', bitness: '32' }) },
    }
    expect(await lerSistema(nav as unknown as Navigator)).toEqual({ tipo: 'windows', versao: '10', bits: 32 })
  })

  it('sem a API (Firefox, Safari): fica o texto do navegador, com a versão desconhecida', async () => {
    const nav = { userAgent: UA_CHROME_WINDOWS.replace('Chrome', 'Firefox'), platform: 'Win32' }
    expect(await lerSistema(nav as unknown as Navigator)).toMatchObject({ tipo: 'windows', versao: 'desconhecida' })
  })

  it('client hints que falham não derrubam a leitura', async () => {
    const nav = {
      userAgent: UA_CHROME_WINDOWS,
      platform: 'Win32',
      userAgentData: { platform: 'Windows', mobile: false, getHighEntropyValues: () => Promise.reject(new Error('negado')) },
    }
    expect(await lerSistema(nav as unknown as Navigator)).toMatchObject({ tipo: 'windows', versao: 'desconhecida' })
  })
})

describe('processador e memória', () => {
  it('lê o que o navegador informa; o que falta vira null', () => {
    expect(lerProcessadorEMemoria({ hardwareConcurrency: 8, deviceMemory: 8 } as unknown as Navigator)).toEqual({ nucleos: 8, memoria: 8 })
    expect(lerProcessadorEMemoria({ hardwareConcurrency: 0 } as unknown as Navigator)).toEqual({ nucleos: null, memoria: null })
  })
})

describe('placa de vídeo: navigator.gpu.requestAdapter()', () => {
  const doc = document

  it('navegador sem WebGPU: não diz nada sobre o computador', async () => {
    const p = await lerPlacaDeVideo({} as Navigator, doc)
    expect(p.webgpu).toEqual({ estado: 'sem-suporte-no-navegador' })
  })

  it('o navegador tem a API, mas não acha placa: sem adaptador', async () => {
    const p = await lerPlacaDeVideo({ gpu: { requestAdapter: async () => null } } as unknown as Navigator, doc)
    expect(p.webgpu).toEqual({ estado: 'sem-adaptador' })
  })

  it('adaptador com informação: fabricante e arquitetura', async () => {
    const p = await lerPlacaDeVideo(
      { gpu: { requestAdapter: async () => ({ info: { vendor: 'nvidia', architecture: 'ampere', description: '' } }) } } as unknown as Navigator,
      doc,
    )
    expect(p.webgpu).toEqual({ estado: 'disponivel', fabricante: 'nvidia', arquitetura: 'ampere', descricao: '', reserva: false })
  })

  it('o adaptador de reserva (emulado) é marcado', async () => {
    const p = await lerPlacaDeVideo(
      { gpu: { requestAdapter: async () => ({ info: { vendor: 'google', isFallbackAdapter: true } }) } } as unknown as Navigator,
      doc,
    )
    expect(p.webgpu).toMatchObject({ estado: 'disponivel', reserva: true })
  })

  it('navegadores anteriores: requestAdapterInfo()', async () => {
    const p = await lerPlacaDeVideo(
      { gpu: { requestAdapter: async () => ({ requestAdapterInfo: async () => ({ vendor: 'intel', architecture: 'gen-12lp' }) }) } } as unknown as Navigator,
      doc,
    )
    expect(p.webgpu).toMatchObject({ estado: 'disponivel', fabricante: 'intel', arquitetura: 'gen-12lp' })
  })

  it('pedido que falha vira "erro", sem rejeitar', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = await lerPlacaDeVideo({ gpu: { requestAdapter: () => Promise.reject(new Error('x')) } } as unknown as Navigator, doc)
    expect(p.webgpu).toEqual({ estado: 'erro' })
    // Sem falha muda: um aviso no console, além da linha na tela.
    expect(aviso).toHaveBeenCalledTimes(1)
    aviso.mockRestore()
  })

  it('reconhece o WebGL emulado no processador', () => {
    expect(webglEmSoftware('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))')).toBe(true)
    expect(webglEmSoftware('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true)
    expect(webglEmSoftware('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)')).toBe(false)
  })
})

describe('erros da câmera', () => {
  it('permissão negada e câmera ocupada não são veredito sobre o computador', () => {
    expect(classificarErroDeCamera({ name: 'NotAllowedError' })).toEqual({ estado: 'negada' })
    expect(classificarErroDeCamera({ name: 'NotReadableError' })).toEqual({ estado: 'ocupada' })
    expect(classificarErroDeCamera({ name: 'NotFoundError' })).toEqual({ estado: 'nao-encontrada' })
    expect(classificarErroDeCamera(new Error('estranho'))).toMatchObject({ estado: 'erro', mensagem: 'estranho' })
  })
})

describe('quadros por segundo reais', () => {
  it('30 quadros por segundo', () => {
    const t = Array.from({ length: 31 }, (_, i) => i * (1000 / 30))
    expect(fpsDosInstantes(t)).toBeCloseTo(30, 0)
  })

  it('um engasgo da aba não derruba a medida (mediana, não média)', () => {
    const t = Array.from({ length: 31 }, (_, i) => i * (1000 / 30))
    t.splice(15, 0, t[14] + 400) // uma pausa de 400 ms no meio
    for (let i = 16; i < t.length; i++) t[i] += 400
    expect(fpsDosInstantes(t)).toBeCloseTo(30, 0)
  })

  it('no escuro a câmera entrega menos: a medida mostra', () => {
    const t = Array.from({ length: 21 }, (_, i) => i * 100)
    expect(fpsDosInstantes(t)).toBe(10)
  })

  it('com poucos quadros não há medida', () => {
    expect(fpsDosInstantes([0, 33, 66])).toBeNull()
  })

  it('medirQuadros conta os avisos do requestVideoFrameCallback pelo instante de captura', async () => {
    vi.useFakeTimers()
    try {
      let t = 0
      const video = {
        requestVideoFrameCallback: (cb: (agora: number, meta: { mediaTime: number }) => void) => {
          t += 1000 / 24
          setTimeout(() => cb(t, { mediaTime: t / 1000 }), 1000 / 24)
          return 1
        },
        cancelVideoFrameCallback: vi.fn(),
      } as unknown as HTMLVideoElement
      const medida = medirQuadros(video, 1000)
      await vi.advanceTimersByTimeAsync(2600)
      expect(await medida).toBeCloseTo(24, 0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sem nenhuma das duas APIs, resolve null em vez de inventar', async () => {
    expect(await medirQuadros({} as HTMLVideoElement, 10)).toBeNull()
  })
})

describe('o veredito', () => {
  it('Windows 11, 8 núcleos, 8 GB, WebGPU e câmera de 720p a 30: "Funciona"', () => {
    const v = avaliar(leituras())
    expect(v.nivel).toBe('funciona')
    expect(v.titulo).toBe('Funciona')
    expect(v.motivos).toEqual([])
  })

  it('16 GB e 8 GB são iguais para o navegador: "8 GB ou mais", sem rebaixar', () => {
    const l = leituras({ memoria: 8 })
    expect(linha(l, 'memoria').valor).toBe('8 GB ou mais')
    expect(avaliar(l).nivel).toBe('funciona')
  })

  it('câmera ainda não testada: "Falta testar a câmera", nunca "Funciona"', () => {
    const v = avaliar(leituras({ camera: { estado: 'nao-testada' } }))
    expect(v.nivel).toBe('falta-camera')
    expect(v.titulo).toBe('Falta testar a câmera')
  })

  it('endereço sem https: diz que não deu para testar, e não reprova o computador', () => {
    const l = leituras({ camera: { estado: 'endereco-inseguro' } })
    const v = avaliar(l)
    expect(v.nivel).not.toBe('nao-funciona')
    expect(linha(l, 'camera').estado).toBe('desconhecido')
    expect(linha(l, 'camera').detalhe).toMatch(/endereço sem https/)
    expect(linha(l, 'camera').detalhe).toMatch(/não diz nada sobre o computador/)
  })

  it('permissão negada também não reprova: pede para permitir', () => {
    const v = avaliar(leituras({ camera: { estado: 'negada' } }))
    expect(v.nivel).toBe('falta-camera')
    expect(v.oQueFazer.join(' ')).toMatch(/permita/)
  })

  it('nenhuma câmera encontrada é um veredito sobre o computador', () => {
    const v = avaliar(leituras({ camera: { estado: 'nao-encontrada' } }))
    expect(v.nivel).toBe('nao-funciona')
    expect(v.titulo).toBe('Não vai funcionar')
    expect(v.motivos[0]).toMatch(/não encontramos nenhuma câmera/)
    expect(v.oQueFazer[0]).toMatch(/Conecte uma webcam/)
  })

  it('2 núcleos: pode ficar lento, mas não reprova (o navegador conta processadores lógicos e alguns informam menos)', () => {
    // Auditoria de 21/10/2026 (P2-9): antes da câmera ser testada, o painel já dizia
    // "Não vai funcionar" em vermelho por causa dessa contagem.
    const v = avaliar(leituras({ nucleos: 2 }))
    expect(v.nivel).toBe('lento')
    expect(v.titulo).toBe('Funciona, mas pode ficar lento')
    expect(v.motivos).toEqual(['com 2 núcleos, o rastreamento pode ficar lento'])
    const l = leituras({ nucleos: 2 })
    expect(linha(l, 'processador').estado).toBe('atencao')
    expect(linha(l, 'processador').detalhe).toMatch(/processadores lógicos/)
    expect(linha(l, 'processador').detalhe).toMatch(/alguns navegadores informam menos/)
  })

  it('2 núcleos e a câmera ainda não testada: "Falta testar a câmera", nunca "Não vai funcionar"', () => {
    const v = avaliar(leituras({ nucleos: 2, camera: { estado: 'nao-testada' } }))
    expect(v.nivel).toBe('falta-camera')
    expect(v.titulo).toBe('Falta testar a câmera')
  })

  it('cerca de 4 GB de memória: não vai funcionar, porque o mínimo é 8 GB', () => {
    const v = avaliar(leituras({ memoria: 4 }))
    expect(v.nivel).toBe('nao-funciona')
    expect(v.motivos[0]).toMatch(/cerca de 4 GB/)
  })

  it('4 núcleos (o mínimo) e o resto bom: funciona, mas pode ficar lento', () => {
    const v = avaliar(leituras({ nucleos: 4 }))
    expect(v.nivel).toBe('lento')
    expect(v.titulo).toBe('Funciona, mas pode ficar lento')
  })

  it('navegador que não informa a memória: a ressalva diz, e o veredito não cai', () => {
    const v = avaliar(leituras({ memoria: null }))
    expect(v.nivel).toBe('funciona')
    expect(v.ressalvas.join(' ')).toMatch(/não informa a memória/)
  })

  it('sem placa compatível para o WebGPU: lento, com o porquê', () => {
    const v = avaliar(leituras({ placa: { webgpu: { estado: 'sem-adaptador' }, webgl: 'ok' } }))
    expect(v.nivel).toBe('lento')
    expect(v.motivos[0]).toMatch(/sem WebGPU/)
    expect(v.oQueFazer.join(' ')).toMatch(/driver da placa de vídeo/)
  })

  it('navegador sem WebGPU (não o computador): ressalva, sem rebaixar', () => {
    const l = leituras({ placa: { webgpu: { estado: 'sem-suporte-no-navegador' }, webgl: 'ok' } })
    expect(avaliar(l).nivel).toBe('funciona')
    expect(linha(l, 'placa').detalhe).toMatch(/Chrome ou no Edge/)
  })

  it('câmera de 640×480 ou devagar: lento, com o que fazer', () => {
    const pequena = avaliar(leituras({ camera: { ...CAMERA_BOA, largura: 640, altura: 480 } as LeituraDaCamera }))
    expect(pequena.nivel).toBe('lento')
    expect(pequena.motivos[0]).toMatch(/640×480/)
    const escura = avaliar(leituras({ camera: { ...CAMERA_BOA, fps: 12 } as LeituraDaCamera }))
    expect(escura.nivel).toBe('lento')
    expect(escura.oQueFazer.join(' ')).toMatch(/luz de frente para o rosto/)
  })

  it('sem a contagem, vale o que a câmera informa — e a linha diz que é informado', () => {
    const l = leituras({ camera: { ...CAMERA_BOA, fps: null, fpsInformado: 30 } as LeituraDaCamera })
    expect(linha(l, 'camera').valor).toMatch(/30 quadros por segundo \(informado pela câmera\)/)
  })

  it('Mac e Linux: a versão está em preparação (enquanto não houver instalador)', () => {
    const mac = avaliar(leituras({ sistema: { tipo: 'macos' } }))
    expect(mac.nivel).toBe('nao-funciona')
    expect(mac.motivos[0]).toMatch(/macOS ainda está em preparação/)
    expect(avaliar(leituras({ sistema: { tipo: 'macos' }, disponiveis: ['windows', 'macos'] })).nivel).toBe('funciona')
  })

  it('Windows anterior ao 10 e Windows de 32 bits não funcionam', () => {
    expect(avaliar(leituras({ sistema: { tipo: 'windows', versao: 'antigo', bits: 64 } })).nivel).toBe('nao-funciona')
    expect(avaliar(leituras({ sistema: { tipo: 'windows', versao: '10', bits: 32 } })).motivos[0]).toMatch(/32 bits/)
  })

  it('versão do Windows desconhecida: os dois servem, e a linha diz que não deu para saber', () => {
    const l = leituras({ sistema: { tipo: 'windows', versao: 'desconhecida', bits: null } })
    expect(avaliar(l).nivel).toBe('funciona')
    expect(linha(l, 'sistema').valor).toMatch(/não deu para saber se é o 10 ou o 11/)
  })

  it('celular: o teste é para o computador, em tom neutro (a página não diz que "não vai funcionar")', () => {
    const v = avaliar(leituras({ sistema: { tipo: 'celular' } }))
    expect(v.nivel).toBe('no-celular')
    expect(v.titulo).toBe('Abra esta página no computador')
    expect(v.titulo).not.toMatch(/não vai funcionar/i)
    expect(v.oQueFazer[0]).toMatch(/computador onde o IrisFlow vai ser usado/)
    expect(v.linhas[0].estado).toBe('pendente')
  })

  it('celular: o hardware do celular não vira motivo (os núcleos e a memória são dele, não do computador)', () => {
    const v = avaliar(leituras({ sistema: { tipo: 'celular' }, nucleos: 2, memoria: 2 }))
    expect(v.motivos).toEqual([])
    expect(v.linhas).toHaveLength(1)
    expect(v.oQueFazer).toHaveLength(1)
    expect(v.linhas.map((l) => l.id)).toEqual(['sistema'])
  })
})

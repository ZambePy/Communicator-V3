import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  avaliar,
  classificarErroDeCamera,
  lerPlacaDeVideo,
  lerProcessadorEMemoria,
  lerSistema,
  medirQuadros,
  sistemaPeloUserAgent,
  type LeituraDaCamera,
  type LeituraDaPlaca,
  type LeituraDoSistema,
  type Veredito,
} from '@/utils/compat'

/**
 * O primeiro pedido que o próprio app faz à câmera (GazeContext): 1080p a 30
 * quadros, a câmera da frente. Assim o teste mede o que o app vai receber.
 */
export const PEDIDO_DA_CAMERA: MediaStreamConstraints = {
  audio: false,
  video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, facingMode: 'user' },
}

/** Nos primeiros instantes a câmera ainda acerta a exposição: só depois a contagem vale. */
const AQUECIMENTO_MS = 500
/** Quanto tempo de quadros entra na medida. */
export const MEDICAO_MS = 2500
/** Câmera que abriu mas não manda o primeiro quadro em tanto tempo conta como falha. */
const ESPERA_DO_PRIMEIRO_QUADRO_MS = 5000

export type TesteDoComputador = {
  veredito: Veredito
  camera: LeituraDaCamera
  /** A câmera está acesa (a pré-visualização na tela). */
  cameraLigada: boolean
  /** Vai no <video> da pré-visualização; ele precisa existir antes do teste. */
  videoRef: RefObject<HTMLVideoElement>
  testarCamera: () => Promise<void>
  desligarCamera: () => void
}

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Resolve quando o vídeo tem um quadro para mostrar (ou o prazo acaba: false). */
function primeiroQuadro(v: HTMLVideoElement): Promise<boolean> {
  if (v.readyState >= 2) return Promise.resolve(true)
  return new Promise((resolve) => {
    const pronto = () => {
      clearTimeout(relogio)
      v.removeEventListener('loadeddata', pronto)
      resolve(true)
    }
    const relogio = setTimeout(() => {
      v.removeEventListener('loadeddata', pronto)
      resolve(false)
    }, ESPERA_DO_PRIMEIRO_QUADRO_MS)
    v.addEventListener('loadeddata', pronto)
  })
}

/** Toda falha do teste da câmera aparece na tela e deixa um aviso no console
 *  — um por teste (é a pessoa quem dispara o teste), nunca por quadro. */
function avisarFalha(motivo: string, detalhe?: unknown) {
  console.warn('[IrisFlow] teste da câmera:', motivo, detalhe ?? '')
}

/**
 * O teste "Meu computador funciona?": as leituras passivas (sistema, placa,
 * processador, memória) na montagem e a câmera quando a pessoa pede — com a
 * permissão do navegador, a pré-visualização e a contagem dos quadros reais.
 *
 * A câmera desliga sozinha ao sair da página (desmontagem ou `pagehide`). Um
 * `getUserMedia` que só resolve depois disso é fechado na hora: sem a geração,
 * a luz da webcam ficaria acesa sem ninguém na página — o mesmo cuidado do
 * preparo do app (frontend/src/pages/setup/SetupWizard.tsx).
 *
 * Nada é enviado: nenhuma leitura nem quadro sai deste navegador.
 */
export function useTesteDoComputador(): TesteDoComputador {
  const [sistema, setSistema] = useState<LeituraDoSistema>(() =>
    sistemaPeloUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent, typeof navigator === 'undefined' ? '' : navigator.platform),
  )
  const [{ nucleos, memoria }] = useState(lerProcessadorEMemoria)
  const [placa, setPlaca] = useState<LeituraDaPlaca | null>(null)
  const [camera, setCamera] = useState<LeituraDaCamera>({ estado: 'nao-testada' })
  const [cameraLigada, setCameraLigada] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const geracao = useRef(0)

  useEffect(() => {
    let vivo = true
    void lerSistema().then((s) => {
      if (vivo) setSistema(s)
    })
    void lerPlacaDeVideo().then((p) => {
      if (vivo) setPlaca(p)
    })
    return () => {
      vivo = false
    }
  }, [])

  /** Apaga a câmera e solta a pré-visualização. Não mexe no resultado já medido. */
  const apagar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    const v = videoRef.current
    if (v) v.srcObject = null
  }, [])

  const desligarCamera = useCallback(() => {
    // Invalida a abertura ou a medida que ainda estiver em andamento.
    geracao.current++
    apagar()
    setCameraLigada(false)
    setCamera((c) => (c.estado === 'testando' ? { estado: 'nao-testada' } : c))
  }, [apagar])

  const testarCamera = useCallback(async () => {
    const minha = ++geracao.current
    const valendo = () => geracao.current === minha
    apagar()
    setCameraLigada(false)

    if (!window.isSecureContext) {
      setCamera({ estado: 'endereco-inseguro' })
      return
    }
    const md = navigator.mediaDevices
    if (!md || typeof md.getUserMedia !== 'function') {
      setCamera({ estado: 'sem-suporte' })
      return
    }

    setCamera({ estado: 'testando' })
    let stream: MediaStream
    try {
      stream = await md.getUserMedia(PEDIDO_DA_CAMERA)
    } catch (e) {
      if (!valendo()) return
      const leitura = classificarErroDeCamera(e)
      avisarFalha(leitura.estado, e)
      setCamera(leitura)
      return
    }
    if (!valendo()) {
      // Saiu da página (ou desligou) enquanto o navegador abria a câmera.
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    streamRef.current = stream
    setCameraLigada(true)

    const trilha = stream.getVideoTracks()[0]
    // Câmera desconectada no meio do caminho: a pré-visualização some, e a
    // tela diz que ela parou, em vez de ficar congelada no último quadro.
    trilha?.addEventListener('ended', () => {
      if (streamRef.current !== stream) return
      geracao.current++
      apagar()
      setCameraLigada(false)
      avisarFalha('a câmera parou no meio do teste')
      setCamera({ estado: 'erro', mensagem: 'track ended', naTela: 'A câmera parou de mandar imagem' })
    })

    const v = videoRef.current
    if (!v) {
      avisarFalha('sem o elemento de vídeo')
      apagar()
      setCameraLigada(false)
      setCamera({ estado: 'erro', mensagem: 'sem <video>', naTela: 'A pré-visualização não abriu nesta página' })
      return
    }
    v.muted = true
    v.srcObject = stream
    void v.play?.()?.catch?.(() => {
      /* sem autoplay: o primeiro quadro chega mesmo assim */
    })

    const temImagem = await primeiroQuadro(v)
    if (!valendo()) return
    if (!temImagem) {
      apagar()
      setCameraLigada(false)
      avisarFalha('a câmera abriu sem mandar quadros')
      setCamera({ estado: 'erro', mensagem: 'sem quadros', naTela: 'A câmera abriu, mas não mandou imagem' })
      return
    }
    await esperar(AQUECIMENTO_MS)
    if (!valendo()) return
    const fps = await medirQuadros(v, MEDICAO_MS)
    if (!valendo()) return

    const ajustes = trilha?.getSettings?.() ?? {}
    const largura = v.videoWidth || ajustes.width || 0
    const altura = v.videoHeight || ajustes.height || 0
    if (!largura || !altura) {
      // Apaga também aqui: antes, a câmera ficava acesa com o erro na tela.
      avisarFalha('a câmera não informou o tamanho da imagem')
      apagar()
      setCameraLigada(false)
      setCamera({ estado: 'erro', mensagem: 'imagem sem tamanho', naTela: 'A câmera abriu, mas não mandou imagem' })
      return
    }
    setCamera({
      estado: 'ok',
      largura,
      altura,
      fps,
      fpsInformado: typeof ajustes.frameRate === 'number' ? Math.round(ajustes.frameRate * 10) / 10 : null,
      nome: trilha?.label ?? '',
    })
  }, [apagar])

  // Saiu da página: a câmera apaga. `pagehide` cobre fechar a aba e ir para
  // outro site; a desmontagem cobre ir para outra rota do próprio site.
  useEffect(() => {
    const aoSair = () => {
      geracao.current++
      apagar()
    }
    window.addEventListener('pagehide', aoSair)
    return () => {
      window.removeEventListener('pagehide', aoSair)
      aoSair()
    }
  }, [apagar])

  const veredito = useMemo(
    () => avaliar({ sistema, nucleos, memoria, placa, camera }),
    [sistema, nucleos, memoria, placa, camera],
  )

  return { veredito, camera, cameraLigada, videoRef, testarCamera, desligarCamera }
}

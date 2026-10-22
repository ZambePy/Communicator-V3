import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as EventoDeTecla, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { DEMO_COMMUNICATOR } from '@/data/home'
import { abrirCamera, carregarDetector, pararCamera, verificarNavegador, type Detector, type MotivoDaFalha } from './camera'
import {
  estadoInicial,
  olharHorizontal,
  passoDoTeste,
  resumoDoTeste,
  type EstadoDoTeste,
  type LadoEscolhido,
  type ResumoDoTeste,
} from './olharLateral'
import './teste-ao-vivo.css'

/* ============================================================
   "Teste com o seu olhar" (pedido de 21/10/2026): o site prova que funciona
   com a câmera de quem visita. Duas metades enormes, Não à esquerda e Sim à
   direita (como a tela Sim · Não do app); 2 s olhando o ponto do meio
   ensinam o "reto" da pessoa; 1,5 s olhando uma metade fecha o anel, e o
   computador fala a resposta.

   - Só no computador (tela larga e mouse ou touchpad): no celular, uma
     frase. A câmera só abre no clique, depois do aviso de privacidade, e o
     MediaPipe só desce depois dele (camera.ts).
   - A imagem e os pontos do rosto não saem do navegador: nada disso é
     enviado nem gravado. (A palavra falada, "Sim" ou "Não", sai pela voz do
     navegador, que em alguns é online: por isso o aviso não diz "nada é
     enviado".)
   - Toda falha (câmera negada ou ausente, navegador sem WebGL/wasm,
     reconhecimento que não sobe ou para) aparece com uma mensagem calma e o
     vídeo do app em uso como alternativa, e o foco vai para o "Tentar de
     novo". Só as inesperadas vão ao console, uma vez (revisão final de
     21/10/2026): negada, sem câmera, câmera ocupada e navegador sem suporte
     são o dia a dia de quem visita, a tela já diz, e o console fica limpo.
   - O reconhecimento do rosto (uns 15 MB) só começa a descer depois que a
     câmera abriu: quem nega a câmera não baixa nada.
   - A câmera apaga ao sair do teste, ao desmontar, no `pagehide` e quando a
     aba fica escondida (`visibilitychange`: uma webcam acesa em segundo plano
     contradiria o aviso); uma câmera que o navegador só entrega depois disso
     é fechada na hora (a "geração" invalida o que ainda estava a caminho),
     como no teste "Meu computador funciona?".

   O pedaço é carregado por React.lazy atrás de um botão da home; o default
   export é o contrato com ela.
   ============================================================ */

/** Computador: tela larga e ponteiro fino (mouse ou touchpad). */
const COMPUTADOR = '(min-width: 900px) and (pointer: fine)'
/** Quadros seguidos com o reconhecimento quebrando até desistir (1 s a 30 quadros por segundo). */
const ERROS_ATE_DESISTIR = 30
/** Câmera que abriu mas não manda o primeiro quadro em tanto tempo conta como falha. */
const ESPERA_DO_PRIMEIRO_QUADRO_MS = 5000
/** Quanto tempo a metade escolhida fica acesa depois da resposta. */
const DESTAQUE_DA_RESPOSTA_MS = 1200
/** A régua vai de 15° à esquerda a 15° à direita do meio. */
const ALCANCE_DA_REGUA = 15

/** Sim à direita e Não à esquerda, como na tela Sim · Não do app. */
const PALAVRA: Record<LadoEscolhido, 'Sim' | 'Não'> = { direita: 'Sim', esquerda: 'Não' }

/** O que dizer em cada falha: o que aconteceu e o que fazer, sem jargão. */
const MENSAGENS: Record<MotivoDaFalha, string> = {
  'endereco-inseguro': 'A câmera só liga quando a página é aberta pelo endereço seguro (com https).',
  'sem-suporte': 'Este navegador não dá acesso à câmera. Tente pelo Chrome ou pelo Edge atualizados.',
  navegador:
    'Este navegador não consegue rodar o reconhecimento do rosto: ele precisa da aceleração gráfica, que parece desligada. Tente pelo Chrome ou pelo Edge atualizados.',
  negada:
    'A câmera não foi liberada. Para testar, clique no ícone da câmera na barra de endereço, escolha Permitir e tente de novo.',
  'nao-encontrada': 'Não encontramos uma câmera neste computador. Se ela for externa, confira o cabo e tente de novo.',
  ocupada: 'A câmera está sendo usada por outro programa, como uma chamada de vídeo. Feche esse programa e tente de novo.',
  camera: 'Não deu para ligar a câmera. Tente de novo; se continuar, feche e abra o navegador.',
  'sem-imagem': 'A câmera ligou, mas não mandou imagem. Confira se a tampa dela está aberta e tente de novo.',
  'camera-parou': 'A câmera parou de mandar imagem. Confira se ela continua conectada e tente de novo.',
  reconhecimento:
    'Não deu para ligar o reconhecimento do rosto. Confira a internet e tente de novo; se continuar, tente pelo Chrome ou pelo Edge atualizados.',
  'reconhecimento-parou': 'O reconhecimento do rosto parou de responder. Tente de novo.',
}

/**
 * Desfechos esperados: a tela já explica e a pessoa resolve sozinha, então
 * não são erro do site e não vão ao console. As outras falhas (câmera que não
 * liga por razão desconhecida, sem imagem, que parou, reconhecimento que não
 * sobe) dizem que algo está errado e vão uma vez ao console.
 */
const FALHAS_ESPERADAS: ReadonlySet<MotivoDaFalha> = new Set([
  'endereco-inseguro',
  'sem-suporte',
  'navegador',
  'negada',
  'nao-encontrada',
  'ocupada',
])

/** Falhas em que tentar de novo não muda nada: é o navegador que não dá. */
const SEM_NOVA_TENTATIVA: ReadonlySet<MotivoDaFalha> = new Set(['endereco-inseguro', 'sem-suporte', 'navegador'])

type Etapa =
  | { nome: 'convite' }
  | { nome: 'abrindo'; passo: 'permissao' | 'carregando' }
  | { nome: 'ativo' }
  /** O vídeo do app em uso: por uma falha (com o motivo) ou porque a pessoa escolheu. */
  | { nome: 'video'; motivo: MotivoDaFalha | null }

type VideoComQuadros = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (agora: number, meta: unknown) => void) => number
  cancelVideoFrameCallback?: (id: number) => void
}

function useEhComputador(): boolean {
  const [sim, setSim] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(COMPUTADOR).matches)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(COMPUTADOR)
    const aoMudar = () => setSim(mq.matches)
    mq.addEventListener?.('change', aoMudar)
    return () => mq.removeEventListener?.('change', aoMudar)
  }, [])
  return sim
}

/** Resolve quando o vídeo tem um quadro para mostrar (ou o prazo acaba: false). */
function primeiroQuadro(v: HTMLVideoElement): Promise<boolean> {
  if (v.readyState >= 2) return Promise.resolve(true)
  return new Promise((resolve) => {
    const pronto = () => {
      window.clearTimeout(relogio)
      v.removeEventListener('loadeddata', pronto)
      resolve(true)
    }
    const relogio = window.setTimeout(() => {
      v.removeEventListener('loadeddata', pronto)
      resolve(false)
    }, ESPERA_DO_PRIMEIRO_QUADRO_MS)
    v.addEventListener('loadeddata', pronto)
  })
}

/** O Tab não sai da sala enquanto ela está aberta. */
function prenderFoco(e: EventoDeTecla<HTMLDivElement>) {
  const focaveis = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'),
  )
  if (focaveis.length === 0) return
  const primeiro = focaveis[0]
  const ultimo = focaveis[focaveis.length - 1]
  const ativo = document.activeElement
  if (e.shiftKey && (ativo === primeiro || ativo === e.currentTarget)) {
    e.preventDefault()
    ultimo.focus()
  } else if (!e.shiftKey && (ativo === ultimo || ativo === e.currentTarget)) {
    e.preventDefault()
    primeiro.focus()
  }
}

export default function TesteAoVivo(): JSX.Element {
  const computador = useEhComputador()
  const idTitulo = useId()
  const [etapa, setEtapa] = useState<Etapa>({ nome: 'convite' })
  const [resumo, setResumo] = useState<ResumoDoTeste | null>(null)
  const [resposta, setResposta] = useState<LadoEscolhido | null>(null)
  const [acesa, setAcesa] = useState<LadoEscolhido | null>(null)
  const [semVoz, setSemVoz] = useState(false)
  /** A câmera desligou porque a aba ficou escondida: o convite diz por quê. */
  const [desligouPelaAba, setDesligouPelaAba] = useState(false)

  /** Cada começo e cada saída trocam a geração: o que estava a caminho de uma geração velha é descartado. */
  const geracao = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<Detector | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const estadoRef = useRef<EstadoDoTeste>(estadoInicial())
  const cancelarQuadro = useRef<(() => void) | null>(null)
  const errosSeguidos = useRef(0)
  const ultimoTempoDoVideo = useRef(-1)
  /** A fala em curso, guardada: o Chromium pode recolher uma fala sem referência antes de ela sair. */
  const falaRef = useRef<SpeechSynthesisUtterance | null>(null)
  const relogioDoDestaque = useRef<number | undefined>(undefined)
  const salaRef = useRef<HTMLDivElement>(null)
  const conviteRef = useRef<HTMLDivElement>(null)
  const voltarFocoAoConvite = useRef(false)

  /** Desliga tudo: quadros, câmera, reconhecimento, voz. */
  const encerrar = useCallback(() => {
    geracao.current++
    cancelarQuadro.current?.()
    cancelarQuadro.current = null
    pararCamera(streamRef.current)
    streamRef.current = null
    const v = videoRef.current
    if (v) v.srcObject = null
    detectorRef.current?.fechar()
    detectorRef.current = null
    window.clearTimeout(relogioDoDestaque.current)
    try {
      window.speechSynthesis?.cancel()
    } catch {
      /* sem voz neste navegador */
    }
    falaRef.current = null
  }, [])

  /** Toda falha encerra o teste e aparece na tela; as inesperadas vão ao console uma vez — nunca um aviso por quadro. */
  const falhar = useCallback(
    (motivo: MotivoDaFalha, detalhe?: unknown) => {
      if (!FALHAS_ESPERADAS.has(motivo)) console.warn('[IrisFlow] teste ao vivo:', motivo, detalhe ?? '')
      encerrar()
      setEtapa({ nome: 'video', motivo })
    },
    [encerrar],
  )

  /** Fala a resposta. Sem voz no navegador, ela continua escrita na tela (e a tela diz por quê). */
  const falar = useCallback((texto: string) => {
    const voz = window.speechSynthesis
    if (!voz || typeof SpeechSynthesisUtterance === 'undefined') {
      setSemVoz(true)
      return
    }
    try {
      voz.cancel()
      const fala = new SpeechSynthesisUtterance(texto)
      fala.lang = 'pt-BR'
      fala.rate = 0.95
      falaRef.current = fala
      voz.speak(fala)
    } catch (e) {
      console.warn('[IrisFlow] teste ao vivo: a voz do navegador falhou.', e)
      setSemVoz(true)
    }
  }, [])

  const responder = useCallback(
    (lado: LadoEscolhido) => {
      setResposta(lado)
      setAcesa(lado)
      window.clearTimeout(relogioDoDestaque.current)
      relogioDoDestaque.current = window.setTimeout(() => setAcesa(null), DESTAQUE_DA_RESPOSTA_MS)
      falar(PALAVRA[lado])
    },
    [falar],
  )

  /* ---------- os quadros da câmera ---------- */

  const aCadaQuadroRef = useRef<(minha: number, agora: number) => void>(() => {})

  /** Pede o próximo quadro: um por quadro da câmera (requestVideoFrameCallback) ou, sem ele, um por quadro da tela. */
  const agendar = useCallback((minha: number) => {
    const v = videoRef.current as VideoComQuadros | null
    if (!v || geracao.current !== minha) return
    if (typeof v.requestVideoFrameCallback === 'function') {
      const id = v.requestVideoFrameCallback((agora) => aCadaQuadroRef.current(minha, agora))
      cancelarQuadro.current = () => v.cancelVideoFrameCallback?.(id)
    } else {
      const id = window.requestAnimationFrame((agora) => aCadaQuadroRef.current(minha, agora))
      cancelarQuadro.current = () => window.cancelAnimationFrame(id)
    }
  }, [])

  aCadaQuadroRef.current = (minha, agora) => {
    if (geracao.current !== minha) return
    const v = videoRef.current as VideoComQuadros | null
    const detector = detectorRef.current
    if (!v || !detector) return
    // Sem requestVideoFrameCallback, o quadro da tela pode repetir o da câmera.
    if (typeof v.requestVideoFrameCallback !== 'function') {
      if (v.currentTime === ultimoTempoDoVideo.current) {
        agendar(minha)
        return
      }
      ultimoTempoDoVideo.current = v.currentTime
    }
    let leitura: ReturnType<Detector['detectar']>
    try {
      leitura = detector.detectar(v, agora)
      errosSeguidos.current = 0
    } catch (e) {
      errosSeguidos.current++
      if (errosSeguidos.current === 1) console.warn('[IrisFlow] teste ao vivo: o reconhecimento do rosto falhou num quadro.', e)
      if (errosSeguidos.current >= ERROS_ATE_DESISTIR) {
        falhar('reconhecimento-parou', e)
        return
      }
      agendar(minha)
      return
    }
    const olhar = leitura ? olharHorizontal(leitura.pontos, leitura.matriz, v.videoWidth || 1, v.videoHeight || 1) : null
    const passo = passoDoTeste(estadoRef.current, { agoraMs: agora, temRosto: leitura !== null, olhar })
    estadoRef.current = passo.estado
    if (passo.resposta) responder(passo.resposta)
    setResumo(resumoDoTeste(passo.estado, agora))
    agendar(minha)
  }

  /* ---------- começar, sair ---------- */

  const comecar = useCallback(async () => {
    encerrar()
    const minha = geracao.current
    const valendo = () => geracao.current === minha
    setResumo(null)
    setResposta(null)
    setAcesa(null)
    setSemVoz(false)
    setDesligouPelaAba(false)

    const impedimento = verificarNavegador()
    if (impedimento) {
      falhar(impedimento)
      return
    }
    setEtapa({ nome: 'abrindo', passo: 'permissao' })

    // O reconhecimento (uns 15 MB) só começa a descer depois que a câmera
    // abriu (revisão final de 21/10/2026): quem nega a câmera, não tem câmera
    // ou tem ela ocupada não baixa nada à toa.
    const cam = await abrirCamera()
    if (!valendo()) {
      // Saiu enquanto o navegador abria a câmera: sem isto, a luz da webcam
      // ficaria acesa sem ninguém no teste.
      if (cam.ok) pararCamera(cam.stream)
      return
    }
    if (!cam.ok) {
      falhar(cam.motivo, cam.erro)
      return
    }
    streamRef.current = cam.stream
    // Câmera desconectada no meio: a tela diz, em vez de congelar no último quadro.
    cam.stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (streamRef.current === cam.stream) falhar('camera-parou')
    })
    const v = videoRef.current
    if (!v) {
      falhar('camera', 'sem o <video> da pré-visualização')
      return
    }
    v.muted = true
    v.srcObject = cam.stream
    void v.play?.()?.catch?.(() => {
      /* sem autoplay: o primeiro quadro chega mesmo assim */
    })
    setEtapa({ nome: 'abrindo', passo: 'carregando' })

    const pedido = await carregarDetector().then(
      (detector) => ({ ok: true as const, detector }),
      (erro: unknown) => ({ ok: false as const, erro }),
    )
    if (!valendo()) {
      if (pedido.ok) pedido.detector.fechar()
      return
    }
    if (!pedido.ok) {
      falhar('reconhecimento', pedido.erro)
      return
    }
    detectorRef.current = pedido.detector

    const temImagem = await primeiroQuadro(v)
    if (!valendo()) return
    if (!temImagem) {
      falhar('sem-imagem')
      return
    }
    estadoRef.current = estadoInicial()
    errosSeguidos.current = 0
    ultimoTempoDoVideo.current = -1
    setEtapa({ nome: 'ativo' })
    agendar(minha)
  }, [agendar, encerrar, falhar])

  const sair = useCallback(() => {
    encerrar()
    voltarFocoAoConvite.current = true
    setEtapa({ nome: 'convite' })
  }, [encerrar])

  const verVideo = useCallback(() => {
    encerrar()
    setEtapa({ nome: 'video', motivo: null })
  }, [encerrar])

  const refazerOMeio = useCallback(() => {
    estadoRef.current = estadoInicial()
    setResumo(null)
    setResposta(null)
  }, [])

  const aberto = etapa.nome === 'abrindo' || etapa.nome === 'ativo'
  /** Para o ouvinte da aba (abaixo) saber se há câmera ligada sem se refazer a cada etapa. */
  const abertoRef = useRef(false)
  abertoRef.current = aberto

  // Saiu da página (desmontagem: outra rota; pagehide: fechar a aba, outro site): a câmera apaga.
  // Aba escondida (visibilitychange, revisão final de 21/10/2026): também. Os quadros param, mas
  // a luz da webcam não — quem abre o teste e vai ler outra aba deixaria a câmera acesa, e o
  // convite promete que ela desliga. Volta ao convite com uma frase; a câmera nunca religa sozinha.
  useEffect(() => {
    const aoSairDaPagina = () => {
      encerrar()
      setEtapa({ nome: 'convite' })
    }
    const aoEsconderAAba = () => {
      if (!document.hidden || !abertoRef.current) return
      encerrar()
      voltarFocoAoConvite.current = true
      setDesligouPelaAba(true)
      setEtapa({ nome: 'convite' })
    }
    window.addEventListener('pagehide', aoSairDaPagina)
    document.addEventListener('visibilitychange', aoEsconderAAba)
    return () => {
      window.removeEventListener('pagehide', aoSairDaPagina)
      document.removeEventListener('visibilitychange', aoEsconderAAba)
      encerrar()
    }
  }, [encerrar])

  // A sala cobre a página: sem rolagem por baixo, e o foco vai para ela.
  useEffect(() => {
    if (!aberto) return
    const raiz = document.documentElement
    const antes = raiz.style.overflow
    raiz.style.overflow = 'hidden'
    salaRef.current?.focus()
    return () => {
      raiz.style.overflow = antes
    }
  }, [aberto])

  // Saiu pela sala: o foco volta ao botão que abriu o teste.
  useEffect(() => {
    if (etapa.nome !== 'convite' || !voltarFocoAoConvite.current) return
    voltarFocoAoConvite.current = false
    conviteRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [etapa])

  const aoTeclar = (e: EventoDeTecla<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      sair()
    } else if (e.key === 'Tab') prenderFoco(e)
  }

  const sala = aberto
    ? createPortal(
        <div
          ref={salaRef}
          className="ao-vivo-sala"
          role="dialog"
          aria-modal="true"
          aria-labelledby={idTitulo}
          tabIndex={-1}
          onKeyDown={aoTeclar}
        >
          <div className="ao-vivo-sala__topo">
            <h2 id={idTitulo} className="ao-vivo-sala__titulo">
              Teste com o seu olhar
            </h2>
            <p className="ao-vivo-sala__privacidade">
              <Icon name="cadeado" size={16} />
              <span>A imagem e os pontos do rosto não saem do seu computador.</span>
            </p>
            <Button variant="secondary" onClick={sair}>
              Sair do teste
            </Button>
          </div>
          <div className={`ao-vivo-sala__palco${resumo?.fase === 'teste' ? ' is-no-teste' : ''}`}>
            <Metade lado="esquerda" resumo={resumo} acesa={acesa === 'esquerda'} />
            <div className="ao-vivo-sala__meio">
              {/* Espelhada, como um espelho de verdade. A imagem fica só aqui. */}
              <video
                ref={videoRef}
                className="ao-vivo-sala__camera"
                muted
                playsInline
                aria-label="A imagem da sua câmera, só nesta página"
              />
              <Meio
                etapa={etapa}
                resumo={resumo}
                resposta={resposta}
                semVoz={semVoz}
                aoRefazer={refazerOMeio}
                aoVerVideo={verVideo}
              />
            </div>
            <Metade lado="direita" resumo={resumo} acesa={acesa === 'direita'} />
          </div>
        </div>,
        document.body,
      )
    : null

  let conteudo: JSX.Element
  if (etapa.nome === 'video') conteudo = <Alternativa motivo={etapa.motivo} aoTentar={() => void comecar()} />
  else if (!computador && !aberto)
    conteudo = (
      <p className="ao-vivo__so-no-computador">
        O teste com o olhar é feito no computador, com a webcam: abra esta página num notebook ou computador de mesa.
      </p>
    )
  else conteudo = <Convite refDoConvite={conviteRef} aoComecar={() => void comecar()} desligouPelaAba={desligouPelaAba} />

  return (
    <div className="ao-vivo">
      {conteudo}
      {sala}
    </div>
  )
}

/* ---------- partes ---------- */

type PropsDoConvite = { refDoConvite: RefObject<HTMLDivElement>; aoComecar: () => void; desligouPelaAba: boolean }

function Convite({ refDoConvite, aoComecar, desligouPelaAba }: PropsDoConvite) {
  return (
    <div ref={refDoConvite} className="ao-vivo__convite">
      <h3 className="ao-vivo__titulo">Responda Sim ou Não só com o olhar</h3>
      <ol className="ao-vivo__passos">
        <li>Olhe para o ponto no meio da tela por 2 segundos.</li>
        <li>Olhe para o Sim, à direita, ou para o Não, à esquerda.</li>
        <li>Espere o círculo fechar: o computador fala a resposta.</li>
      </ol>
      {/* Quem acha o teste impreciso não deve concluir que o produto é assim (revisão final de 21/10/2026). */}
      <p className="ao-vivo__versao-simples">
        É uma versão simples do que o aplicativo faz: lá, o seu olhar é calibrado em 13 pontos, e há teclado, frases e
        mais.
      </p>
      <p className="ao-vivo__privacidade">
        <Icon name="cadeado" size={18} />
        <span>
          A imagem e os pontos do rosto não saem do seu computador. Tudo acontece neste navegador, nada é gravado, e a
          câmera desliga quando você sai do teste ou troca de aba.
        </span>
      </p>
      {desligouPelaAba && (
        <p className="ao-vivo__aviso-da-aba" role="status">
          A câmera desligou porque você saiu desta aba. Para recomeçar, clique em “Ligar a câmera e começar”.
        </p>
      )}
      <Button size="lg" onClick={aoComecar}>
        Ligar a câmera e começar
      </Button>
      <p className="ao-vivo__dica">
        Funciona melhor com o rosto bem iluminado, de frente para a tela, a mais ou menos um braço de distância.
      </p>
    </div>
  )
}

function Alternativa({ motivo, aoTentar }: { motivo: MotivoDaFalha | null; aoTentar: () => void }) {
  const idDescricao = useId()
  const raiz = useRef<HTMLDivElement>(null)
  const alerta = useRef<HTMLParagraphElement>(null)

  // Aparece sempre depois de um toque na sala ou no convite, que somem junto: sem isto o foco cai
  // no <body> e quem usa o teclado recomeça do alto da página (revisão final de 21/10/2026).
  // Vai para o "Tentar de novo"; nas falhas em que tentar de novo não adianta, para o alerta.
  useEffect(() => {
    const botao = raiz.current?.querySelector<HTMLButtonElement>('button')
    ;(botao ?? alerta.current)?.focus()
  }, [])

  return (
    <div ref={raiz} className="ao-vivo__alternativa">
      {motivo && (
        <p ref={alerta} className="ao-vivo__falha" role="alert" tabIndex={-1}>
          {MENSAGENS[motivo]}
        </p>
      )}
      <p className="ao-vivo__legenda">
        {motivo ? 'Enquanto isso, veja o IrisFlow em uso, com o cursor do olhar:' : 'O IrisFlow em uso, com o cursor do olhar:'}
      </p>
      <video
        className="ao-vivo__video"
        controls
        playsInline
        preload="metadata"
        poster={DEMO_COMMUNICATOR.poster}
        aria-describedby={idDescricao}
      >
        {DEMO_COMMUNICATOR.webm && <source src={DEMO_COMMUNICATOR.webm} type="video/webm" />}
        <source src={DEMO_COMMUNICATOR.mp4} type="video/mp4" />
      </video>
      <p id={idDescricao} className="sr-only">
        {DEMO_COMMUNICATOR.descricao}
      </p>
      {(!motivo || !SEM_NOVA_TENTATIVA.has(motivo)) && (
        <Button variant="secondary" onClick={aoTentar}>
          {motivo ? 'Tentar de novo' : 'Fazer o teste de novo'}
        </Button>
      )}
    </div>
  )
}

const R_DO_ANEL = 54
const VOLTA_DO_ANEL = 2 * Math.PI * R_DO_ANEL

/** Uma metade da tela: a palavra, o símbolo e o anel que fecha com o olhar. Só para os olhos — o texto do meio diz o mesmo ao leitor de tela. */
function Metade({ lado, resumo, acesa }: { lado: LadoEscolhido; resumo: ResumoDoTeste | null; acesa: boolean }) {
  const noTeste = resumo?.fase === 'teste'
  const olhando = noTeste && resumo.lado === lado
  const progresso = noTeste && resumo.fixacao?.lado === lado ? resumo.fixacao.progresso : 0
  const classes = ['ao-vivo-metade', `ao-vivo-metade--${lado}`, olhando ? 'is-olhando' : '', acesa ? 'is-respondida' : '']
  return (
    <div className={classes.filter(Boolean).join(' ')} aria-hidden="true">
      <div className="ao-vivo-metade__alvo">
        <svg className="ao-vivo-metade__anel" viewBox="0 0 120 120">
          <circle className="ao-vivo-metade__trilho" cx="60" cy="60" r={R_DO_ANEL} />
          <circle
            className="ao-vivo-metade__progresso"
            cx="60"
            cy="60"
            r={R_DO_ANEL}
            strokeDasharray={VOLTA_DO_ANEL}
            strokeDashoffset={VOLTA_DO_ANEL * (1 - progresso)}
            // Vazio, o traço de ponta redonda ainda desenharia uma bolinha.
            strokeOpacity={progresso > 0 ? 1 : 0}
          />
        </svg>
        <span className="ao-vivo-metade__conteudo">
          <svg className="ao-vivo-metade__simbolo" viewBox="0 0 24 24" focusable="false">
            {lado === 'direita' ? <path d="M4.5 12.5 9.5 17.5 19.5 6.5" /> : <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />}
          </svg>
          <span className="ao-vivo-metade__palavra">{PALAVRA[lado]}</span>
        </span>
      </div>
    </div>
  )
}

const R_DO_ALVO = 30
const VOLTA_DO_ALVO = 2 * Math.PI * R_DO_ALVO

type PropsDoMeio = {
  etapa: Etapa
  resumo: ResumoDoTeste | null
  resposta: LadoEscolhido | null
  semVoz: boolean
  aoRefazer: () => void
  aoVerVideo: () => void
}

/** A coluna do meio: o ponto dos 2 s, depois a régua do olhar, as instruções e a resposta. */
function Meio({ etapa, resumo, resposta, semVoz, aoRefazer, aoVerVideo }: PropsDoMeio) {
  if (etapa.nome === 'abrindo') {
    return (
      <p className="ao-vivo-sala__instrucao">
        {etapa.passo === 'permissao'
          ? 'O navegador vai perguntar se pode usar a câmera. Escolha Permitir.'
          : 'Ligando o reconhecimento do rosto… Na primeira vez, leva alguns segundos.'}
      </p>
    )
  }
  const noTeste = resumo?.fase === 'teste'
  const pos = (graus: number) => 50 + (Math.max(-ALCANCE_DA_REGUA, Math.min(ALCANCE_DA_REGUA, graus)) / ALCANCE_DA_REGUA) * 50
  return (
    <>
      {noTeste ? (
        <div className="ao-vivo-regua" aria-hidden="true">
          <span className="ao-vivo-regua__lado">Não</span>
          <span className="ao-vivo-regua__trilho">
            <span
              className="ao-vivo-regua__meio"
              style={{ left: `${pos(-resumo.limiares.entrada)}%`, right: `${100 - pos(resumo.limiares.entrada)}%` }}
            />
            {resumo.x !== null && <span className="ao-vivo-regua__ponto" style={{ left: `${pos(resumo.x)}%` }} />}
          </span>
          <span className="ao-vivo-regua__lado">Sim</span>
        </div>
      ) : (
        <svg className="ao-vivo-alvo" viewBox="0 0 80 80" aria-hidden="true" focusable="false">
          <circle className="ao-vivo-alvo__trilho" cx="40" cy="40" r={R_DO_ALVO} />
          <circle
            className="ao-vivo-alvo__progresso"
            cx="40"
            cy="40"
            r={R_DO_ALVO}
            strokeDasharray={VOLTA_DO_ALVO}
            strokeDashoffset={VOLTA_DO_ALVO * (1 - (resumo?.progressoDoCentro ?? 0))}
            strokeOpacity={(resumo?.progressoDoCentro ?? 0) > 0 ? 1 : 0}
          />
          <circle className="ao-vivo-alvo__ponto" cx="40" cy="40" r="7" />
        </svg>
      )}

      <p className="ao-vivo-sala__instrucao">
        {!noTeste
          ? 'Olhe para o ponto no meio por 2 segundos.'
          : resposta
            ? 'Para responder de novo, volte o olhar para o meio e depois para a resposta.'
            : 'Olhe para o Sim ou para o Não e espere o círculo fechar.'}
      </p>

      {resumo?.aviso === 'sem-olhos' ? (
        <div className="ao-vivo-sala__aviso" role="status">
          <p>
            Não estou conseguindo ver seus olhos. Se estiver de óculos escuros, tire; e deixe o rosto bem iluminado,
            de frente para a tela.
          </p>
        </div>
      ) : (
        resumo?.aviso && (
          <div className="ao-vivo-sala__aviso" role="status">
            <p>Não estou vendo seu rosto, tentando de novo… Fique de frente para a câmera, com o rosto iluminado.</p>
            {resumo.aviso === 'sem-rosto-ha-tempo' && (
              <Button variant="secondary" onClick={aoVerVideo}>
                Ver o vídeo em vez disso
              </Button>
            )}
          </div>
        )
      )}
      {resumo?.lento && (
        <p className="ao-vivo-sala__nota">
          Este computador está demorando para reconhecer o rosto: as respostas vão sair mais devagar.
        </p>
      )}

      <p className="ao-vivo-sala__resposta" aria-live="polite">
        {resposta ? `Você respondeu ${PALAVRA[resposta]}.` : ''}
      </p>
      {semVoz && resposta && <p className="ao-vivo-sala__nota">Este navegador não tem voz; a resposta fica escrita aqui.</p>}

      {noTeste && (
        <Button variant="ghost" onClick={aoRefazer}>
          Refazer o ponto do meio
        </Button>
      )}
    </>
  )
}

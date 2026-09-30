import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import {
  CAPITULOS,
  COMO_FUNCIONA_EM_UMA_FRASE,
  DEMO_COMMUNICATOR,
  DURACAO_DA_DEMO_COMMUNICATOR,
} from '@/data/home'
import { useInclinacaoAoRolar, useVideoNaTela } from '@/hooks/useDemo'
import { useInView } from '@/hooks/useInView'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { capituloNoTempo, legendaNoTempo, progressoNoCapitulo } from './capitulosDoVideo'
import './aparelhos.css'
import './capitulos.css'

/**
 * O produto em três capítulos, contados pela gravação real do Communicator.
 *
 * O vídeo toca por inteiro — teclado, menu, tutorial — e é ele quem manda: o
 * passo aceso à esquerda, a barra que enche no trilho e a legenda sobre a tela
 * saem do tempo do vídeo (`capitulosDoVideo.ts`), então a imagem e o texto
 * nunca se desencontram. E o vídeo também segue quem lê: clicar num passo, ou
 * rolar até ele no computador, leva a gravação ao começo daquele trecho.
 *
 * No computador a tela fica parada ao lado dos passos enquanto eles rolam
 * (sticky) e em perspectiva: entra mais inclinada, se assenta com a rolagem
 * (`useInclinacaoAoRolar`) e se endireita sob o ponteiro, para quem quer ler a
 * interface. No celular ela fica reta, entre o título e os passos.
 *
 * Com movimento reduzido nada toca sozinho: cada passo mostra um quadro parado
 * do seu trecho (o pôster), e o botão de reproduzir continua lá.
 */
export function Capitulos() {
  const reduzido = useReducedMotion()
  const { videoRef, tocando, alternar } = useVideoNaTela()
  const [ativo, setAtivo] = useState(0)
  const [legenda, setLegenda] = useState(0)
  const ativoRef = useRef(0)
  const legendaRef = useRef(0)
  const trilhos = useRef<(HTMLSpanElement | null)[]>([])
  const passos = useRef<(HTMLLIElement | null)[]>([])
  const cena = useRef<HTMLDivElement>(null)
  useInclinacaoAoRolar(cena, { graus: 12, escalaInicial: 0.95 })
  // O brilho da borda só gira com a tela à vista, como na abertura.
  const { ref: refDaMoldura, inView: molduraNaTela } = useInView<HTMLDivElement>({
    once: false,
    threshold: 0.1,
    rootMargin: '0px',
  })
  const idBase = useId().replace(/:/g, '')

  const mostrar = useCallback((capitulo: number, indiceDaLegenda: number) => {
    if (capitulo !== ativoRef.current) {
      ativoRef.current = capitulo
      setAtivo(capitulo)
    }
    if (indiceDaLegenda !== legendaRef.current) {
      legendaRef.current = indiceDaLegenda
      setLegenda(indiceDaLegenda)
    }
  }, [])

  // Passo, legenda e trilhos acompanham o vídeo: a cada quadro enquanto ele
  // toca, e uma vez a cada salto (clique num passo, volta do laço).
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    let quadro = 0
    const sincronizar = () => {
      const t = v.currentTime
      const duracao = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : DURACAO_DA_DEMO_COMMUNICATOR
      const i = capituloNoTempo(t, CAPITULOS)
      mostrar(i, legendaNoTempo(t, CAPITULOS[i].legendas))
      // Escrito direto no estilo: re-renderizar a seção 60 vezes por segundo
      // para mover três barras seria desperdício.
      trilhos.current.forEach((el, j) => {
        if (!el) return
        const p = j < i ? 1 : j > i ? 0 : progressoNoCapitulo(t, i, CAPITULOS, duracao)
        el.style.setProperty('--progresso', p.toFixed(4))
      })
    }
    const laco = () => {
      sincronizar()
      quadro = window.requestAnimationFrame(laco)
    }
    const aoTocar = () => {
      if (!quadro) quadro = window.requestAnimationFrame(laco)
    }
    const aoParar = () => {
      if (quadro) window.cancelAnimationFrame(quadro)
      quadro = 0
      sincronizar()
    }
    v.addEventListener('playing', aoTocar)
    v.addEventListener('pause', aoParar)
    v.addEventListener('seeked', sincronizar)
    v.addEventListener('timeupdate', sincronizar)
    return () => {
      v.removeEventListener('playing', aoTocar)
      v.removeEventListener('pause', aoParar)
      v.removeEventListener('seeked', sincronizar)
      v.removeEventListener('timeupdate', sincronizar)
      if (quadro) window.cancelAnimationFrame(quadro)
    }
  }, [videoRef, mostrar])

  const irPara = useCallback(
    (i: number) => {
      mostrar(i, 0)
      trilhos.current.forEach((el, j) => el?.style.setProperty('--progresso', j < i ? '1' : '0'))
      const v = videoRef.current
      if (!v) return
      // Um pouco depois do início, para o arredondamento do quadro não cair
      // ainda no capítulo anterior. Parado, o vídeo mostra o quadro do salto;
      // ainda sem carregar, começa dali quando tocar.
      v.currentTime = CAPITULOS[i].inicio + 0.05
    },
    [videoRef, mostrar],
  )

  // No computador, rolar até um passo (ele cruza a faixa do meio da janela)
  // leva o vídeo até ele. No celular, não: lá o vídeo fica acima dos passos e
  // já saiu da tela quando eles chegam ao meio.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || typeof window.matchMedia !== 'function') return
    const computador = window.matchMedia('(min-width: 961px)')
    let io: IntersectionObserver | null = null
    const ligar = () => {
      io?.disconnect()
      io = null
      if (!computador.matches) return
      io = new IntersectionObserver(
        (entradas) => {
          const chegou = entradas.filter((e) => e.isIntersecting).pop()
          if (!chegou) return
          const i = Number((chegou.target as HTMLElement).dataset.indice)
          const v = videoRef.current
          const noVideo = v ? capituloNoTempo(v.currentTime, CAPITULOS) : ativoRef.current
          if (Number.isInteger(i) && i !== noVideo) irPara(i)
        },
        { rootMargin: '-42% 0px -48% 0px' },
      )
      passos.current.forEach((el) => el && io!.observe(el))
    }
    ligar()
    computador.addEventListener('change', ligar)
    return () => {
      computador.removeEventListener('change', ligar)
      io?.disconnect()
    }
  }, [videoRef, irPara])

  const capitulo = CAPITULOS[ativo]
  const textoDaLegenda = (capitulo.legendas[legenda] ?? capitulo.legendas[0]).texto

  return (
    <section className="capitulos on-raised com-fundo" id="produto" aria-labelledby="capitulos-titulo">
      <AmbientBackground variante="particulas" />
      <div className="container capitulos__grade">
        <header className="capitulos__cabeca">
          <span className="eyebrow">IrisFlow Communicator</span>
          <h2 id="capitulos-titulo" className="titulo-capitulo">
            Feito para ser usado só com os olhos.
          </h2>
          <p className="capitulos__lead">{COMO_FUNCIONA_EM_UMA_FRASE}</p>
        </header>

        <div className="capitulos__palco">
          <div ref={cena} className="capitulos__cena">
            <div className="capitulos__corpo">
              <span className="capitulos__halo" aria-hidden="true" />
              <div ref={refDaMoldura} className={`video-moldura capitulos__moldura${molduraNaTela ? ' is-rodando' : ''}`}>
                <span className="video-moldura__brilho" aria-hidden="true" />
                <div className="video-moldura__tela">
                  <video
                    ref={videoRef}
                    className="video-moldura__video"
                    muted
                    loop
                    playsInline
                    preload="none"
                    poster={reduzido ? capitulo.quadro : DEMO_COMMUNICATOR.poster}
                    aria-describedby={`${idBase}-descricao`}
                  >
                    {DEMO_COMMUNICATOR.webm && <source src={DEMO_COMMUNICATOR.webm} type="video/webm" />}
                    <source src={DEMO_COMMUNICATOR.mp4} type="video/mp4" />
                  </video>
                  <span className="capitulos__reflexo" aria-hidden="true" />
                  <button
                    type="button"
                    className="demo-pausa"
                    onClick={alternar}
                    aria-label={tocando ? 'Pausar a demonstração' : 'Reproduzir a demonstração'}
                  >
                    {tocando ? (
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
                        <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.3-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              {/* A legenda repete o que a gravação mostra (a descrição do vídeo
                  já está para o leitor de tela): fica fora dele. A chave nova
                  a cada troca refaz a entrada. */}
              <p key={`${ativo}-${legenda}`} className="capitulos__legenda" aria-hidden="true">
                <span className="capitulos__legenda-rotulo">{capitulo.rotulo}</span>
                {textoDaLegenda}
              </p>
            </div>
          </div>
          <span id={`${idBase}-descricao`} className="sr-only">
            {DEMO_COMMUNICATOR.descricao}
          </span>
        </div>

        <ol className="capitulos__passos">
          {CAPITULOS.map((c, i) => (
            <li
              key={c.id}
              ref={(el) => {
                passos.current[i] = el
              }}
              data-indice={i}
              className={`capitulos__passo${i === ativo ? ' is-ativo' : ''}`}
            >
              <span className="capitulos__marca" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span
                className="capitulos__trilho"
                aria-hidden="true"
                ref={(el) => {
                  trilhos.current[i] = el
                }}
              />
              <h3 className="capitulos__titulo">
                <button
                  type="button"
                  className="capitulos__botao"
                  aria-current={i === ativo ? 'step' : undefined}
                  aria-describedby={`${idBase}-${c.id}`}
                  onClick={() => irPara(i)}
                >
                  {c.titulo}
                  <span className="sr-only"> (mostrar no vídeo)</span>
                </button>
              </h3>
              <p id={`${idBase}-${c.id}`} className="capitulos__texto">
                {c.texto}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

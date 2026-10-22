import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import {
  CAPITULOS,
  COMO_FUNCIONA_EM_UMA_FRASE,
  DEMO_COMMUNICATOR,
  DURACAO_DA_DEMO_COMMUNICATOR,
} from '@/data/home'
import { useVideoNaTela } from '@/hooks/useDemo'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { capituloNoTempo, legendaNoTempo, progressoNoCapitulo } from './capitulosDoVideo'
import { TesteComOOlhar } from './TesteComOOlhar'
import './aparelhos.css'
import './capitulos.css'

/**
 * O produto em três capítulos, contados pela gravação real do Communicator.
 *
 * Rodada 3 (21/10/2026): esta é a seção logo abaixo da abertura — a prova de
 * que funciona, que o dono sentiu falta no topo. A gravação volta para dentro
 * de um monitor e logo abaixo dos capítulos fica "Testar com o meu olhar"
 * (TesteComOOlhar), que só baixa o teste ao vivo no clique.
 *
 * Desde 21/10/2026 (pedido do dono: sem efeito, o produto de verdade é a
 * estrela) o monitor é o visual da abertura: a seção começa logo depois do
 * título, sem o respiro das outras, e o topo do monitor já aparece na primeira
 * tela. É o único movimento da página ao carregar: o monitor sobe uma vez
 * para o lugar (capitulos.css; com movimento reduzido, nada se mexe).
 *
 * O vídeo toca por inteiro — teclado, menu, tutorial — e é ele quem manda: o
 * passo aceso à esquerda, a barra que enche no trilho e a legenda sobre a tela
 * saem do tempo do vídeo (`capitulosDoVideo.ts`), então a imagem e o texto
 * nunca se desencontram. E o vídeo também segue quem lê: clicar num passo, ou
 * rolar até ele no computador, leva a gravação ao começo daquele trecho.
 *
 * No computador a tela fica parada ao lado dos passos enquanto eles rolam
 * (sticky). Reta: a perspectiva que inclinava a gravação saiu no redesenho de
 * 19/10/2026 — ela atrapalhava justamente quem queria ler a interface. No
 * celular a tela fica entre o título e os passos.
 *
 * Cada passo tem um aro, como o alvo de fixação do app, que fecha enquanto a
 * gravação passa por aquele trecho: o mesmo `--progresso` que antes enchia o
 * trilho.
 *
 * Com movimento reduzido nada toca sozinho: cada passo mostra um quadro parado
 * do seu trecho (o pôster), e o botão de reproduzir continua lá.
 *
 * Animação a mais (pedido do dono, 21/10/2026): quando o círculo de um passo
 * entra na tela, ele enche uma vez, como o alvo de fixação do app — um aro
 * teal que fecha e solta, em sequência (1, 2, 3) quando entram juntos. São
 * passos de verdade, então o número faz sentido. O aro que acompanha o vídeo
 * não muda; este é um a mais, por cima, e só existe uma vez por passo. Com
 * movimento reduzido ninguém observa os círculos e nada enche.
 */
/** Entre o aro de um passo e o do seguinte, quando entram juntos: o primeiro está a meio caminho de fechar. */
const ATRASO_ENTRE_PASSOS_MS = 520

export function Capitulos() {
  const reduzido = useReducedMotion()
  const { videoRef, tocando, alternar } = useVideoNaTela()
  const [ativo, setAtivo] = useState(0)
  const [legenda, setLegenda] = useState(0)
  const ativoRef = useRef(0)
  const legendaRef = useRef(0)
  const trilhos = useRef<(HTMLSpanElement | null)[]>([])
  const passos = useRef<(HTMLLIElement | null)[]>([])
  const marcas = useRef<(HTMLSpanElement | null)[]>([])
  // Passos cujo círculo já encheu (índice → atraso em ms): uma vez só.
  const [entrou, setEntrou] = useState<Record<number, number>>({})
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

  // O círculo de cada passo enche quando entra na tela, uma vez, em sequência.
  useEffect(() => {
    if (reduzido || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entradas) => {
        const novos = entradas
          .filter((e) => e.isIntersecting)
          .map((e) => marcas.current.indexOf(e.target as HTMLSpanElement))
          .filter((i) => i >= 0)
          .sort((a, b) => a - b)
        if (!novos.length) return
        novos.forEach((i) => io.unobserve(marcas.current[i]!))
        setEntrou((antes) => {
          const depois = { ...antes }
          novos.forEach((i, k) => {
            if (!(i in depois)) depois[i] = k * ATRASO_ENTRE_PASSOS_MS
          })
          return depois
        })
      },
      { threshold: 0.8, rootMargin: '0px 0px -10% 0px' },
    )
    marcas.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [reduzido])

  const capitulo = CAPITULOS[ativo]
  const textoDaLegenda = (capitulo.legendas[legenda] ?? capitulo.legendas[0]).texto

  return (
    <section className="capitulos on-raised" id="produto" aria-labelledby="capitulos-titulo">
      <div className="container capitulos__grade">
        <header className="capitulos__cabeca">
          <p className="eyebrow">IrisFlow Communicator</p>
          <h2 id="capitulos-titulo" className="titulo-capitulo">
            Feito para ser usado só com os olhos.
          </h2>
          <p className="capitulos__lead">{COMO_FUNCIONA_EM_UMA_FRASE}</p>
        </header>

        <div className="capitulos__palco">
          <div className="capitulos__cena">
            <div className="capitulos__corpo">
              <div className="monitor capitulos__monitor">
                <div className="monitor__corpo">
                  <div className="monitor__moldura">
                    <div className="monitor__tela">
                      <video
                        ref={videoRef}
                        className="capitulos__video"
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
                  <span className="monitor__pescoco" aria-hidden="true" />
                  <span className="monitor__base" aria-hidden="true" />
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
          {/* A dica de cada botão de passo, fora do título (auditoria P3-13). */}
          <span id={`${idBase}-mostrar`} className="sr-only">
            Mostrar no vídeo
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
              className={`capitulos__passo${i === ativo ? ' is-ativo' : ''}${i in entrou ? ' is-entrou' : ''}`}
              style={i in entrou ? ({ '--atraso': `${entrou[i]}ms` } as CSSProperties) : undefined}
            >
              <span
                className="capitulos__marca"
                aria-hidden="true"
                ref={(el) => {
                  marcas.current[i] = el
                }}
              >
                {i + 1}
              </span>
              {/* O aro de fixação que fecha quando o passo entra na tela
                  (capitulos.css): o traço do círculo, a mesma faixa do trilho. */}
              <svg className="capitulos__fixa" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
                <circle cx="22" cy="22" r="20.5" pathLength={1} />
              </svg>
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
                  aria-describedby={`${idBase}-${c.id} ${idBase}-mostrar`}
                  onClick={() => irPara(i)}
                >
                  {c.titulo}
                </button>
              </h3>
              <p id={`${idBase}-${c.id}`} className="capitulos__texto">
                {c.texto}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {/* Fora da grade de propósito: a tela presa (sticky) acompanha a rolagem
          até o fim da grade, e dentro dela passaria por cima do teste. */}
      <div className="container">
        <div className="capitulos__teste">
          <TesteComOOlhar />
        </div>
      </div>
    </section>
  )
}

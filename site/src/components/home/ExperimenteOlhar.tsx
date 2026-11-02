import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Reveal } from '@/components/effects/Reveal'
import { PICTOGRAMS } from '@/components/sections/DwellDemo'
import { EXPERIMENTE as E } from '@/data/home'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import './experimente.css'

const FRASES = PICTOGRAMS.slice(0, E.quantas)
/** A pausa depois de cada escolha, como no app (0,8 s): o olhar ainda parado não escolhe de novo. */
const PAUSA_MS = 800

function vozEmPortugues(): SpeechSynthesisVoice | undefined {
  const vozes = window.speechSynthesis?.getVoices() ?? []
  return vozes.find((v) => v.lang === 'pt-BR') ?? vozes.find((v) => v.lang.toLowerCase().startsWith('pt'))
}

/**
 * O aro em volta de um alvo. O tamanho do retângulo vai nos atributos, medido
 * do botão: o Safari não aplica width/height de CSS a um <rect>, e o aro
 * sumia lá.
 */
function AroDoAlvo({ aoFechar }: { aoFechar: () => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const rect = useRef<SVGRectElement>(null)
  useLayoutEffect(() => {
    const el = svg.current
    const r = rect.current
    if (!el || !r) return
    const medir = () => {
      const { width, height } = el.getBoundingClientRect()
      if (!width || !height) return
      r.setAttribute('width', String(width - 6))
      r.setAttribute('height', String(height - 6))
    }
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <svg ref={svg} className="experimente__aro" aria-hidden="true" focusable="false">
      <rect ref={rect} className="experimente__aro-traco" x="3" y="3" rx="18" pathLength={1} onAnimationEnd={aoFechar} />
    </svg>
  )
}

function usaToque(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

/**
 * A peça viva da home (redesenho de 01/11/2026): "Segure o olhar". Quatro
 * frases da prancha do app; parar o ponteiro numa delas fecha o aro no tempo
 * escolhido e a frase sai em voz alta (a voz do navegador, em português) e
 * chega como recado no celular de quem cuida. Desviar antes desiste, como no
 * app. Dentro da prancha, o ponteiro vira o cursor do olhar do app: um aro
 * que acompanha com suavização.
 *
 * Nada espera o aro para funcionar: clique, toque e Enter escolhem na hora.
 * No foco do teclado o aro não corre sozinho (andar de Tab não pode falar
 * frases). No toque, segurar o dedo faz o papel do olhar parado. Com
 * movimento reduzido, o cursor do olhar não aparece e o aro ainda conta o
 * tempo (é informação, não enfeite), mas sem o cartão que desliza.
 */
export function ExperimenteOlhar() {
  const reduzido = useReducedMotion()
  const idBase = useId()
  const [tempo, setTempo] = useState(E.tempoPadrao)
  const [comVoz, setComVoz] = useState(true)
  const [fixando, setFixando] = useState<number | null>(null)
  const [falada, setFalada] = useState<{ frase: string; vez: number } | null>(null)
  const [falando, setFalando] = useState(false)
  const [semVoz, setSemVoz] = useState(false)
  const [toque, setToque] = useState(usaToque)
  const pausaAte = useRef(0)
  const disparouNaPressao = useRef(false)
  /** Um dedo ou botão está apertado agora: só aí o clique que vem depois do aro é o mesmo gesto. */
  const pressionando = useRef(false)

  const prancha = useRef<HTMLDivElement>(null)
  const cursor = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(pointer: coarse)')
    const mudou = () => setToque(mq.matches)
    mq.addEventListener('change', mudou)
    return () => mq.removeEventListener('change', mudou)
  }, [])

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  /* O cursor do olhar: segue o ponteiro com suavização, como o rastreamento do app. */
  useEffect(() => {
    const area = prancha.current
    const ponto = cursor.current
    if (!area || !ponto || reduzido || toque) return
    let alvoX = 0
    let alvoY = 0
    let x = 0
    let y = 0
    let quadro = 0
    let dentro = false
    const passo = () => {
      x += (alvoX - x) * 0.22
      y += (alvoY - y) * 0.22
      ponto.style.transform = `translate3d(${x}px, ${y}px, 0)`
      quadro = Math.abs(alvoX - x) + Math.abs(alvoY - y) > 0.3 ? requestAnimationFrame(passo) : 0
    }
    const mover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      const r = area.getBoundingClientRect()
      alvoX = e.clientX - r.left
      alvoY = e.clientY - r.top
      if (!dentro) {
        dentro = true
        x = alvoX
        y = alvoY
        area.classList.add('tem-cursor')
      }
      if (!quadro) quadro = requestAnimationFrame(passo)
    }
    const sair = () => {
      dentro = false
      area.classList.remove('tem-cursor')
    }
    area.addEventListener('pointermove', mover)
    area.addEventListener('pointerleave', sair)
    return () => {
      cancelAnimationFrame(quadro)
      area.removeEventListener('pointermove', mover)
      area.removeEventListener('pointerleave', sair)
    }
  }, [reduzido, toque])

  function comecar(i: number) {
    if (performance.now() < pausaAte.current) return
    setFixando(i)
  }

  function desistir(i: number) {
    setFixando((atual) => (atual === i ? null : atual))
  }

  function escolher(i: number) {
    const frase = FRASES[i].phrase
    setFixando(null)
    pausaAte.current = performance.now() + PAUSA_MS
    setFalada((antes) => ({ frase, vez: (antes?.vez ?? 0) + 1 }))
    const sintese = window.speechSynthesis
    if (!comVoz || !sintese || typeof SpeechSynthesisUtterance === 'undefined') return
    const fala = new SpeechSynthesisUtterance(frase)
    fala.lang = 'pt-BR'
    const voz = vozEmPortugues()
    if (voz) fala.voice = voz
    setSemVoz(!voz && sintese.getVoices().length > 0)
    fala.onstart = () => setFalando(true)
    fala.onend = () => setFalando(false)
    fala.onerror = () => setFalando(false)
    // No Chromium, speak() logo depois de cancel() às vezes perde a fala nova:
    // só cancela se há algo falando, e fala no quadro seguinte.
    if (sintese.speaking || sintese.pending) {
      sintese.cancel()
      window.setTimeout(() => sintese.speak(fala), 60)
    } else {
      sintese.speak(fala)
    }
  }

  function aoEntrar(i: number, e: ReactPointerEvent) {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') comecar(i)
  }

  function aoPressionar(i: number, e: ReactPointerEvent) {
    disparouNaPressao.current = false
    pressionando.current = true
    if (e.pointerType === 'touch') comecar(i)
  }

  function aoSoltar(i: number, e: ReactPointerEvent) {
    pressionando.current = false
    if (e.pointerType === 'touch') desistir(i)
  }

  function aoFecharOAro(i: number) {
    if (fixando !== i) return
    // Só marca quando o aro fechou com o dedo (ou o botão) ainda apertado: aí o
    // clique que chega ao soltar é o mesmo gesto. Fechado só com o ponteiro
    // parado em cima, o próximo Enter do teclado não pode ser engolido.
    disparouNaPressao.current = pressionando.current
    escolher(i)
  }

  function aoClicar(i: number) {
    // O aro já escolheu nesta mesma pressão: o clique que vem atrás não repete a frase.
    if (disparouNaPressao.current) {
      disparouNaPressao.current = false
      return
    }
    escolher(i)
  }

  return (
    <section className="experimente home-faixa" aria-labelledby={`${idBase}-titulo`}>
      <div className="container experimente__grade">
        <div className="experimente__texto">
          <Reveal as="h2" anim="up" className="home-titulo experimente__titulo">
            <span id={`${idBase}-titulo`}>{E.titulo}</span>
          </Reveal>
          <Reveal as="p" anim="up" delay={80} className="home-sub">
            {toque ? E.textoToque : E.texto}
          </Reveal>

          <Reveal anim="up" delay={160} className="experimente__ajustes">
            <fieldset className="experimente__tempos">
              <legend>{E.rotuloTempo}</legend>
              <div className="experimente__segmentos">
                {E.tempos.map((t) => (
                  <label key={t} className={`experimente__segmento${t === tempo ? ' is-ativo' : ''}`}>
                    <input
                      type="radio"
                      name={`${idBase}-tempo`}
                      value={t}
                      checked={t === tempo}
                      onChange={() => setTempo(t)}
                    />
                    <span>{t.toLocaleString('pt-BR')} s</span>
                  </label>
                ))}
              </div>
              <p className="experimente__nota">{E.notaTempo}</p>
            </fieldset>
            <button
              type="button"
              className={`experimente__voz${comVoz ? ' is-ligada' : ''}`}
              aria-pressed={comVoz}
              onClick={() => {
                if (comVoz) window.speechSynthesis?.cancel()
                setComVoz(!comVoz)
              }}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M3 8v4h3l4 3.5v-11L6 8H3Z" fill="currentColor" />
                {comVoz ? (
                  <path d="M13 7.2a4 4 0 0 1 0 5.6M15.4 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                ) : (
                  <path d="m13 7.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                )}
              </svg>
              {E.som}
            </button>
          </Reveal>
        </div>

        <div className="experimente__palco">
          <div
            ref={prancha}
            className="experimente__prancha"
            data-ui
            style={{ '--tempo': `${tempo}s` } as CSSProperties}
          >
            {FRASES.map((p, i) => (
              <button
                key={p.word}
                type="button"
                className={`experimente__alvo${fixando === i ? ' is-fixando' : ''}${falada?.frase === p.phrase ? ' is-escolhido' : ''}`}
                aria-label={p.phrase}
                onPointerEnter={(e) => aoEntrar(i, e)}
                onPointerLeave={() => desistir(i)}
                onPointerDown={(e) => aoPressionar(i, e)}
                onPointerUp={(e) => aoSoltar(i, e)}
                onPointerCancel={() => {
                  pressionando.current = false
                  desistir(i)
                }}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => aoClicar(i)}
              >
                <svg className="experimente__glifo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  {p.glyph}
                </svg>
                <span className="experimente__palavra">{p.word}</span>
                <AroDoAlvo aoFechar={() => aoFecharOAro(i)} />
              </button>
            ))}
            <span ref={cursor} className="experimente__cursor" aria-hidden="true" />
          </div>

          <div className="experimente__saida" aria-live="polite">
            {falada ? (
              <p key={falada.vez} className="experimente__falou">
                <span className="experimente__falou-rotulo">{E.falou}</span>
                <strong>{falada.frase}</strong>
                <span className={`experimente__ondas${falando ? ' is-falando' : ''}`} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </p>
            ) : (
              <p className="experimente__falou experimente__falou--vazio">{E.aguardando}</p>
            )}
            {semVoz && <p className="experimente__nota">{E.semVoz}</p>}
            {falada && (
              <div key={`c${falada.vez}`} className="experimente__recado" aria-hidden="true">
                <span className="experimente__avatar">{E.chegou.iniciais}</span>
                <span>
                  <span className="experimente__recado-rotulo">{E.chegou.nome} escreveu, agora</span>
                  <span className="experimente__recado-frase">{falada.frase}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

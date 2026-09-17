import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatedHeadline } from '@/components/effects/AnimatedHeadline'
import { Reveal } from '@/components/effects/Reveal'
import './dwell-demo.css'

/* ------------------------------------------------------------------
   Pictogramas da prancha de comunicação.

   Os glifos são desenhados aqui, e não no conjunto Icon, porque são
   vocabulário de comunicação e não iconografia de interface: mudam
   com o repertório do usuário, não com o design system. O traço
   segue o mesmo padrão do Icon (viewBox 24, contorno de 1.6).
   ------------------------------------------------------------------ */

type Pictogram = {
  /** Palavra que aparece embaixo do desenho, como na prancha real. */
  word: string
  /** Frase completa vocalizada — uma fixação produz a frase inteira. */
  phrase: string
  glyph: ReactNode
}

const PICTOGRAMS: Pictogram[] = [
  {
    word: 'sede',
    phrase: 'Estou com sede.',
    glyph: (
      <>
        <path d="M6 4h12l-1.3 15.3A2 2 0 0 1 14.7 21H9.3a2 2 0 0 1-2-1.7Z" />
        <path d="M6.7 10.5h10.6" />
      </>
    ),
  },
  {
    word: 'fome',
    phrase: 'Estou com fome.',
    glyph: (
      <>
        <path d="M5 3v6a2.5 2.5 0 0 0 5 0V3" />
        <path d="M7.5 11v10" />
        <path d="M18 3c-1.6 0-2.8 2.2-2.8 5s1.2 4 2.8 4" />
        <path d="M18 3v18" />
      </>
    ),
  },
  {
    word: 'dor',
    phrase: 'Estou sentindo dor.',
    glyph: (
      <>
        <path d="M13 2.5 5 13.5h6l-1 8 8-11.5h-6z" />
      </>
    ),
  },
  {
    word: 'frio',
    phrase: 'Estou com frio.',
    glyph: (
      <>
        <path d="M12 2.5v19M4 7l16 10M20 7 4 17" />
        <path d="M9.5 4.5 12 6.8l2.5-2.3M9.5 19.5 12 17.2l2.5 2.3" />
      </>
    ),
  },
  {
    word: 'calor',
    phrase: 'Estou com calor.',
    glyph: (
      <>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22" />
        <path d="m5 5 1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" />
      </>
    ),
  },
  {
    word: 'posição',
    phrase: 'Quero mudar de posição.',
    glyph: (
      <>
        <path d="M2.5 19v-7.5h12a4.5 4.5 0 0 1 4.5 4.5V19" />
        <path d="M2.5 19h19" />
        <circle cx="6.8" cy="8" r="2.3" />
      </>
    ),
  },
  {
    word: 'banheiro',
    phrase: 'Preciso ir ao banheiro.',
    glyph: (
      <>
        <rect x="5" y="2.5" width="14" height="19" rx="2" />
        <path d="M15 12h.01" />
      </>
    ),
  },
  {
    word: 'chamar',
    phrase: 'Chama alguém para mim, por favor.',
    glyph: (
      <>
        <circle cx="8.5" cy="7.5" r="3.2" />
        <path d="M3 20a5.5 5.5 0 0 1 11 0" />
        <path d="M17.5 8.5a4.2 4.2 0 0 1 0 7" />
        <path d="M20.2 5.8a8 8 0 0 1 0 12.4" />
      </>
    ),
  },
  {
    word: 'televisão',
    phrase: 'Quero assistir televisão.',
    glyph: (
      <>
        <rect x="2.5" y="6.5" width="19" height="13" rx="2" />
        <path d="M8 2.5 12 6.5l4-4" />
      </>
    ),
  },
  {
    word: 'estou bem',
    phrase: 'Hoje eu estou bem.',
    glyph: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.4 14.2a4.4 4.4 0 0 0 7.2 0" />
        <path d="M9 9.4h.01M15 9.4h.01" />
      </>
    ),
  },
]

/** Respostas de uma fixação só, as mais pedidas pelo cuidador. */
const QUICK = ['Sim', 'Não', 'Obrigado', 'Espera um pouco']

const DWELL_OPTIONS = [800, 1500, 2500] as const

export function DwellDemo() {
  const [phrase, setPhrase] = useState('')
  const [dwellMs, setDwellMs] = useState<number>(1500)
  const [holding, setHolding] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [spoken, setSpoken] = useState(false)
  const timer = useRef<number>()
  const cool = useRef<number>()

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      window.clearTimeout(cool.current)
    },
    [],
  )

  const commit = (value: string) => {
    // Diferente do teclado, aqui cada alvo entrega uma frase pronta:
    // a seleção substitui o que estava no campo, não acrescenta.
    setPhrase(value)
    setSpoken(false)
    // período refratário de 800 ms, igual ao do produto
    setLocked(true)
    cool.current = window.setTimeout(() => setLocked(false), 800)
  }

  const begin = (id: string, value: string) => {
    if (locked) return
    setHolding(id)
    timer.current = window.setTimeout(() => {
      setHolding(null)
      commit(value)
    }, dwellMs)
  }

  const cancel = () => {
    window.clearTimeout(timer.current)
    setHolding(null)
  }

  const speak = () => {
    setSpoken(true)
    // Síntese de voz do próprio navegador. No produto é uma voz
    // em português brasileiro embarcada, que funciona offline.
    if ('speechSynthesis' in window && phrase.trim()) {
      const u = new SpeechSynthesisUtterance(phrase)
      u.lang = 'pt-BR'
      u.rate = 0.95
      window.speechSynthesis.speak(u)
    }
    window.setTimeout(() => setSpoken(false), 2200)
  }

  const targetProps = (id: string, value: string) => ({
    onMouseEnter: () => begin(id, value),
    onMouseLeave: cancel,
    onFocus: () => begin(id, value),
    onBlur: cancel,
    onClick: () => {
      cancel()
      commit(value)
    },
  })

  return (
    <section className="section demo" id="demo">
      <div className="container">
        <Reveal anim="fade">
          <span className="eyebrow">Experimente</span>
        </Reveal>

        <AnimatedHeadline
          text="Uma fixação do olhar, uma frase inteira."
          as="h2"
          highlight={['frase', 'inteira.']}
          className="demo__title"
        />

        <Reveal anim="up" delay={140}>
          <p className="lead demo__lead">
            Escrever letra a letra custa caro para quem se move só com os olhos. Por isso a prancha
            de pictogramas existe: um alvo, uma frase pronta, dita em voz alta. Na IrisFlow o
            gatilho é o olhar estimado pela webcam; aqui, para você experimentar sem instalar nada,
            é o cursor ou a tecla Tab. O resto é idêntico: contorno de destaque ao entrar no alvo,
            mudança de cor durante a seleção, preenchimento até a confirmação e um período
            refratário de 800 ms para impedir o disparo duplo.
          </p>
        </Reveal>

        <Reveal anim="zoom" delay={220}>
          <div className="demo__frame panel">
            {/* barra de estado, como na tela real de comunicação */}
            <div className="demo__status">
              <span className="demo__chip demo__chip--ok">câmera ativa</span>
              <span className="demo__chip demo__chip--ok">rastreamento estável</span>
              <span className="demo__chip">calibração 9/9</span>
              <span className="demo__spacer" />
              <span className="demo__chip demo__chip--sos">emergência</span>
            </div>

            {/* frase composta */}
            <div className="demo__screen">
              <p className="demo__output" aria-live="polite">
                {phrase || (
                  <span className="demo__placeholder">
                    passe o cursor sobre um pictograma e segure…
                  </span>
                )}
              </p>
              <button
                type="button"
                className={`demo__speak${spoken ? ' is-speaking' : ''}`}
                onClick={speak}
                disabled={!phrase.trim()}
              >
                {spoken ? 'falando…' : 'falar'}
              </button>
            </div>

            {/* prancha de pictogramas */}
            <div className="demo__board" role="group" aria-label="Prancha de pictogramas">
              {PICTOGRAMS.map((p) => (
                <DemoTarget
                  key={p.word}
                  active={holding === p.word}
                  dwellMs={dwellMs}
                  ariaLabel={p.phrase}
                  {...targetProps(p.word, p.phrase)}
                >
                  <svg
                    className="demo__glyph"
                    viewBox="0 0 24 24"
                    width="34"
                    height="34"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    {p.glyph}
                  </svg>
                  <span className="demo__word">{p.word}</span>
                </DemoTarget>
              ))}
            </div>

            {/* frases rápidas */}
            <div className="demo__quick" role="group" aria-label="Frases rápidas">
              {QUICK.map((q) => (
                <DemoTarget
                  key={q}
                  quick
                  active={holding === q}
                  dwellMs={dwellMs}
                  ariaLabel={q}
                  {...targetProps(q, q)}
                >
                  <span className="demo__word demo__word--quick">{q}</span>
                </DemoTarget>
              ))}
            </div>

            {/* ajuste do tempo de fixação */}
            <div className="demo__settings">
              <span className="demo__settings-label">tempo de fixação</span>
              {DWELL_OPTIONS.map((ms) => (
                <button
                  key={ms}
                  type="button"
                  className={`demo__opt${dwellMs === ms ? ' is-on' : ''}`}
                  onClick={() => setDwellMs(ms)}
                  aria-pressed={dwellMs === ms}
                >
                  {ms} ms
                </button>
              ))}
              <button
                type="button"
                className="demo__opt demo__opt--clear"
                onClick={() => setPhrase('')}
              >
                limpar
              </button>
            </div>
          </div>
        </Reveal>

        <Reveal anim="fade" delay={320}>
          <p className="demo__note">
            A prancha não substitui o teclado: ela resolve o que se repete todo dia, e o teclado
            ordenado pela frequência das letras do português continua ali para o que não cabe em
            um pictograma. No produto, a fixação já vocaliza a frase sozinha — aqui o botão existe
            porque ninguém gosta de um site que começa a falar sem avisar. O repertório de
            pictogramas é editado pelo cuidador, com as palavras que aquela casa usa.
          </p>
        </Reveal>
      </div>
    </section>
  )
}

type TargetProps = {
  children: ReactNode
  active: boolean
  dwellMs: number
  ariaLabel: string
  quick?: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onFocus: () => void
  onBlur: () => void
  onClick: () => void
}

function DemoTarget({ children, active, dwellMs, ariaLabel, quick, ...handlers }: TargetProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={['demo__key', active ? 'is-active' : '', quick ? 'demo__key--quick' : '']
        .filter(Boolean)
        .join(' ')}
      {...handlers}
    >
      <span className="demo__key-label">{children}</span>
      <span
        className="demo__key-fill"
        style={{ transitionDuration: active ? `${dwellMs}ms` : '180ms' }}
        aria-hidden="true"
      />
    </button>
  )
}

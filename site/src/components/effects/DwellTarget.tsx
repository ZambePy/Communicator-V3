import { useEffect, useRef, useState } from 'react'
import './dwell.css'

type Props = {
  label: string
  /** Tempo de fixação em ms. O produto oferece 800, 1500 e 2500. */
  dwellMs?: number
  onSelect?: () => void
  hint?: string
}

/**
 * Alvo com seleção por fixação, reproduzindo no navegador o retorno
 * visual em três estágios descrito no plano:
 *   1. contorno de destaque ao entrar no alvo
 *   2. mudança de cor indicando seleção em progresso
 *   3. aro de progresso até a confirmação
 * Depois vem o período refratário de 800 ms, como no produto.
 *
 * Aqui o gatilho é o cursor ou o foco de teclado. Na IrisFlow real, é o
 * olhar estimado pela webcam.
 */
export function DwellTarget({ label, dwellMs = 1500, onSelect, hint }: Props) {
  const [stage, setStage] = useState<'idle' | 'hover' | 'active' | 'done' | 'cooldown'>('idle')
  const timer = useRef<number>()
  const cooldown = useRef<number>()

  const clearTimers = () => {
    if (timer.current) window.clearTimeout(timer.current)
    if (cooldown.current) window.clearTimeout(cooldown.current)
  }

  useEffect(() => clearTimers, [])

  const begin = () => {
    if (stage === 'cooldown' || stage === 'done') return
    setStage('active')
    timer.current = window.setTimeout(() => {
      setStage('done')
      onSelect?.()
      // período refratário de 800 ms: impede reativação imediata do mesmo alvo
      cooldown.current = window.setTimeout(() => setStage('idle'), 800)
    }, dwellMs)
  }

  const cancel = () => {
    if (stage === 'active') {
      window.clearTimeout(timer.current)
      setStage('idle')
    }
  }

  const R = 42
  const C = 2 * Math.PI * R

  return (
    <button
      type="button"
      className={`dwell dwell--${stage}`}
      onMouseEnter={begin}
      onMouseLeave={cancel}
      onFocus={begin}
      onBlur={cancel}
      onClick={() => {
        clearTimers()
        setStage('done')
        onSelect?.()
        cooldown.current = window.setTimeout(() => setStage('idle'), 800)
      }}
      aria-label={`${label}. Mantenha o cursor ou o foco sobre o alvo por ${dwellMs} milissegundos para selecionar.`}
    >
      <svg className="dwell__ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="dwell__track" cx="50" cy="50" r={R} />
        <circle
          className="dwell__progress"
          cx="50"
          cy="50"
          r={R}
          style={
            {
              '--dash': C,
              strokeDasharray: C,
              strokeDashoffset: stage === 'active' || stage === 'done' ? 0 : C,
              transition:
                stage === 'active'
                  ? `stroke-dashoffset ${dwellMs}ms linear`
                  : 'stroke-dashoffset 200ms var(--ease-out)',
            } as React.CSSProperties
          }
        />
      </svg>

      <span className="dwell__label">
        {stage === 'done' || stage === 'cooldown' ? (
          <svg viewBox="0 0 24 24" className="dwell__check" aria-hidden="true">
            <path
              d="M4 12.5 9.5 18 20 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          label
        )}
      </span>

      {hint && <span className="dwell__hint">{hint}</span>}
    </button>
  )
}

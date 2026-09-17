import './stepper.css'

type Props = {
  steps: string[]
  current: number
}

/**
 * Trilha de contexto: indica permanentemente em que etapa o usuário está.
 * É o quarto princípio de acessibilidade do produto, aplicado ao site.
 */
export function Stepper({ steps, current }: Props) {
  return (
    <nav className="stepper" aria-label="Progresso do cadastro">
      <ol>
        {steps.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          return (
            <li key={label} className={`stepper__item is-${state}`}>
              <span className="stepper__dot" aria-hidden="true">
                {state === 'done' ? (
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M4 12.5 9.5 18 20 6.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              <span className="stepper__label">{label}</span>
              {state === 'current' && <span className="sr-only">(etapa atual)</span>}
            </li>
          )
        })}
      </ol>
      <span
        className="stepper__bar"
        style={{ transform: `scaleX(${steps.length > 1 ? current / (steps.length - 1) : 1})` }}
        aria-hidden="true"
      />
    </nav>
  )
}

import './stepper.css'

type Props = {
  steps: string[]
  current: number
}

/**
 * Trilha de contexto: indica permanentemente em que etapa o usuário está.
 * É o quarto princípio de acessibilidade do produto, aplicado ao site.
 *
 * O traço de progresso é um segmento por etapa, entre o rótulo de uma e o
 * círculo da seguinte — e não uma linha única atrás da trilha inteira, que
 * passava por cima dos rótulos e os deixava com cara de riscados.
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
              {i < steps.length - 1 && (
                <span className="stepper__line" aria-hidden="true">
                  <span className="stepper__fill" />
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

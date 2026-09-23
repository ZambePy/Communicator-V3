import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId } from 'react'
import './field.css'

type Base = {
  label: string
  error?: string
  hint?: string
  icon?: ReactNode
  /** Mostra o ícone de "válido" à direita quando o valor já passou na validação. */
  valid?: boolean
  /** Id de outro elemento que também descreve o campo (ex.: força da senha). */
  describedById?: string
}

function useDescribedBy(id: string, hint?: string, error?: string, extra?: string) {
  return [hint && !error ? `${id}-hint` : null, error ? `${id}-err` : null, extra ?? null]
    .filter(Boolean)
    .join(' ')
}

function Messages({ id, hint, error }: { id: string; hint?: string; error?: string }) {
  return (
    <>
      {hint && !error && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

function ValidMark() {
  return (
    <span className="field__valid" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path
          d="M4 12.5 9.5 18 20 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

type InputProps = Base & InputHTMLAttributes<HTMLInputElement>

/**
 * Campo de texto com rótulo persistente, dica e erro anunciados a leitores
 * de tela. O placeholder nunca é a única dica: o que a pessoa precisa saber
 * vai em `hint`, que fica visível o tempo todo.
 */
export function Field({
  label,
  error,
  hint,
  icon,
  valid,
  describedById,
  className = '',
  ...rest
}: InputProps) {
  const id = useId()
  const describedBy = useDescribedBy(id, hint, error, describedById)

  return (
    <div className={`field ${error ? 'field--error' : ''} ${valid && !error ? 'field--valid' : ''} ${className}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        {icon && <span className="field__icon">{icon}</span>}
        <input
          id={id}
          className="field__input"
          aria-invalid={!!error}
          aria-describedby={describedBy || undefined}
          {...rest}
        />
        {valid && !error && <ValidMark />}
      </div>
      <Messages id={id} hint={hint} error={error} />
    </div>
  )
}

type SelectProps = Base & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }

export function SelectField({
  label,
  error,
  hint,
  valid,
  describedById: _d,
  children,
  className = '',
  ...rest
}: SelectProps) {
  void _d
  const id = useId()
  const describedBy = useDescribedBy(id, hint, error)

  return (
    <div className={`field ${error ? 'field--error' : ''} ${valid && !error ? 'field--valid' : ''} ${className}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        <select
          id={id}
          className="field__input field__select"
          aria-invalid={!!error}
          aria-describedby={describedBy || undefined}
          {...rest}
        >
          {children}
        </select>
      </div>
      <Messages id={id} hint={hint} error={error} />
    </div>
  )
}

type TextareaProps = Base & TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextareaField({
  label,
  error,
  hint,
  valid,
  describedById,
  className = '',
  ...rest
}: TextareaProps) {
  const id = useId()
  const describedBy = useDescribedBy(id, hint, error, describedById)

  return (
    <div className={`field ${error ? 'field--error' : ''} ${valid && !error ? 'field--valid' : ''} ${className}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        <textarea
          id={id}
          className="field__input field__textarea"
          aria-invalid={!!error}
          aria-describedby={describedBy || undefined}
          {...rest}
        />
        {valid && !error && <ValidMark />}
      </div>
      <Messages id={id} hint={hint} error={error} />
    </div>
  )
}

type CheckProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string }

export function CheckField({ label, error, className = '', ...rest }: CheckProps) {
  const id = useId()

  return (
    <div className={`check ${error ? 'check--error' : ''} ${className}`}>
      <input
        id={id}
        type="checkbox"
        className="check__input"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        {...rest}
      />
      <label htmlFor={id} className="check__label">
        <span className="check__box" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path
              d="M4 12.5 9.5 18 20 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span>{label}</span>
      </label>
      {error && (
        <p id={`${id}-err`} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useId } from 'react'
import './field.css'

type Base = {
  label: string
  error?: string
  hint?: string
  icon?: ReactNode
}

type InputProps = Base & InputHTMLAttributes<HTMLInputElement>

/** Campo de texto com rótulo persistente, dica e erro anunciado a leitores de tela. */
export function Field({ label, error, hint, icon, className = '', ...rest }: InputProps) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
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
      </div>
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
    </div>
  )
}

type SelectProps = Base & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }

export function SelectField({ label, error, hint, children, className = '', ...rest }: SelectProps) {
  const id = useId()

  return (
    <div className={`field ${error ? 'field--error' : ''} ${className}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        <select id={id} className="field__input field__select" aria-invalid={!!error} {...rest}>
          {children}
        </select>
      </div>
      {hint && !error && <p className="field__hint">{hint}</p>}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

type CheckProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string }

export function CheckField({ label, error, className = '', ...rest }: CheckProps) {
  const id = useId()

  return (
    <div className={`check ${error ? 'check--error' : ''} ${className}`}>
      <input id={id} type="checkbox" className="check__input" {...rest} />
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
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

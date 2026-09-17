import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Spinner } from './Skeleton'
import './button.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'teal'
type Size = 'md' | 'lg'

type Common = {
  children: ReactNode
  variant?: Variant
  size?: Size
  full?: boolean
  loading?: boolean
  icon?: ReactNode
  className?: string
}

type ButtonProps = Common &
  ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined; href?: undefined }

type LinkProps = Common & { to: string; href?: undefined }
type AnchorProps = Common & {
  href: string
  to?: undefined
  /** Chamado no clique sem impedir a navegação — serve para métricas. */
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}

type Props = ButtonProps | LinkProps | AnchorProps

/**
 * Botão com brilho que acompanha o ponteiro e resposta tátil ao
 * pressionar.
 */
export function Button(props: Props) {
  const {
    children,
    variant = 'primary',
    size = 'md',
    full,
    loading,
    icon,
    className = '',
    ...rest
  } = props as Common & Record<string, unknown>

  const cls = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    full ? 'btn--full' : '',
    loading ? 'is-loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  const inner = (
    <>
      <span className="btn__shine" aria-hidden="true" />
      <span className="btn__content">
        {loading && <Spinner />}
        {!loading && icon}
        {children}
      </span>
    </>
  )

  if ('to' in props && props.to) {
    return (
      <Link to={props.to} className={cls} onMouseMove={onMove}>
        {inner}
      </Link>
    )
  }

  if ('href' in props && props.href) {
    return (
      <a
        href={props.href}
        className={cls}
        onMouseMove={onMove}
        onClick={props.onClick}
        target="_blank"
        rel="noreferrer noopener"
      >
        {inner}
      </a>
    )
  }

  const { to: _to, href: _href, ...buttonRest } = rest as Record<string, unknown>
  void _to
  void _href

  return (
    <button
      {...(buttonRest as ButtonHTMLAttributes<HTMLButtonElement>)}
      className={cls}
      onMouseMove={onMove}
      disabled={loading || (buttonRest as { disabled?: boolean }).disabled}
    >
      {inner}
    </button>
  )
}

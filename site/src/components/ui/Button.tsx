import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
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
  /**
   * Chamada principal da página (baixar, entrar na beta): ganha o aro de
   * fixação — o retorno do clique pelo olhar, mostrado no gesto de quem visita
   * (button.css). Só nos botões de chamada, não em todo botão principal.
   */
  chamada?: boolean
  /**
   * Por que o botão está desabilitado, em uma frase ("Falta marcar que você leu
   * os termos."). Só vale em `<button>` com `disabled`: o botão continua no Tab
   * (`aria-disabled` no lugar de `disabled`), não dispara o clique, e o motivo
   * aparece logo abaixo e descreve o botão para o leitor de tela. Um botão
   * apagado que não diz por quê deixa a pessoa sem saber o que fazer.
   */
  motivo?: string
}

type ButtonProps = Common &
  ButtonHTMLAttributes<HTMLButtonElement> & { to?: undefined; href?: undefined }

type LinkProps = Common & {
  to: string
  href?: undefined
  /** Chamado no clique sem impedir a navegação (ex.: fechar a gaveta). */
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
}
type AnchorProps = Common & {
  href: string
  to?: undefined
  /** Chamado no clique sem impedir a navegação — serve para métricas. */
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
  /** Abre em outra aba. Padrão: só endereço absoluto (http/https) — uma
   *  âncora da própria página (#downloads) rola na mesma aba. */
  externo?: boolean
}

type Props = ButtonProps | LinkProps | AnchorProps

/**
 * Botão do site. As chamadas principais (`chamada`) têm o retorno do próprio
 * produto: com o ponteiro parado em cima, ou com o foco do teclado, um aro de
 * fixação fecha em volta delas, e fecha de vez no clique — é o "clique pelo
 * olhar" mostrado no gesto de quem visita. O clique funciona na hora, sem
 * esperar o aro (button.css).
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
    chamada,
    motivo,
    ...rest
  } = props as Common & Record<string, unknown>
  const idDoMotivo = useId()

  const cls = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    full ? 'btn--full' : '',
    chamada ? 'btn--chamada' : '',
    loading ? 'is-loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const inner = (
    <span className="btn__content">
      {loading && <Spinner />}
      {!loading && icon}
      {children}
    </span>
  )

  if ('to' in props && props.to) {
    return (
      <Link to={props.to} className={cls} onClick={props.onClick}>
        {inner}
      </Link>
    )
  }

  if ('href' in props && props.href) {
    const externo = props.externo ?? /^https?:\/\//i.test(props.href)
    return (
      <a
        href={props.href}
        className={cls}
        onClick={props.onClick}
        {...(externo ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      >
        {inner}
      </a>
    )
  }

  const { to: _to, href: _href, externo: _externo, ...buttonRest } = rest as Record<string, unknown>
  void _externo
  void _to
  void _href

  const desabilitado = (buttonRest as { disabled?: boolean }).disabled

  // Desabilitado COM motivo: o botão fica focável (aria-disabled) e o motivo
  // está na tela e na descrição. `loading` não entra aqui: carregando é outro estado.
  if (motivo && desabilitado && !loading) {
    const { disabled: _disabled, onClick: _onClick, ...semOClique } = buttonRest as Record<string, unknown>
    void _disabled
    void _onClick
    return (
      <span className={`btn-com-motivo${full ? ' btn-com-motivo--full' : ''}`}>
        <button
          {...(semOClique as ButtonHTMLAttributes<HTMLButtonElement>)}
          className={cls}
          aria-disabled="true"
          aria-describedby={idDoMotivo}
          onClick={(e) => e.preventDefault()}
        >
          {inner}
        </button>
        <span id={idDoMotivo} className="btn__motivo">
          {motivo}
        </span>
      </span>
    )
  }

  return (
    <button
      {...(buttonRest as ButtonHTMLAttributes<HTMLButtonElement>)}
      className={cls}
      disabled={loading || desabilitado}
      aria-busy={loading ? true : undefined}
    >
      {inner}
    </button>
  )
}

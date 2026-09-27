import { Link } from 'react-router-dom'
import './logo.css'

type Props = {
  /** `full` traz símbolo e assinatura; `symbol` traz só a íris. */
  variant?: 'full' | 'symbol'
  /** `negativo` é a versão para fundo escuro, com a assinatura em branco. */
  tone?: 'positivo' | 'negativo'
  /** Altura da marca. */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Quando falso, renderiza sem link (útil dentro de um cabeçalho já linkado). */
  link?: boolean
  /** Enfeite ao lado de um título que já diz tudo: alt vazio e aria-hidden. */
  decorative?: boolean
  className?: string
}

const FILES = {
  full: {
    positivo: '/brand/irisflow-logo.png',
    negativo: '/brand/irisflow-logo-negativo.png',
  },
  symbol: {
    positivo: '/brand/irisflow-symbol.png',
    negativo: '/brand/irisflow-symbol-negativo.png',
  },
} as const

/**
 * Marca da IrisFlow, a partir dos arquivos oficiais.
 * A versão em negativo foi derivada da original para uso sobre fundo
 * escuro: a assinatura em azul-marinho desapareceria ali.
 */
export function Logo({
  variant = 'full',
  tone = 'positivo',
  size = 'md',
  link = true,
  decorative = false,
  className = '',
}: Props) {
  const img = (
    <img
      src={FILES[variant][tone]}
      // Dentro do link, o nome acessível vem do aria-label do <Link>.
      alt={decorative || link ? '' : 'IrisFlow'}
      aria-hidden={decorative || undefined}
      className={`logo__img logo__img--${variant}`}
      width={variant === 'full' ? 1200 : 512}
      height={variant === 'full' ? 287 : 512}
    />
  )

  const cls = ['logo', `logo--${size}`, `logo--${variant}`, className].filter(Boolean).join(' ')

  if (!link) {
    return <span className={cls}>{img}</span>
  }

  return (
    <Link to="/" className={cls} aria-label="IrisFlow, página inicial">
      {img}
    </Link>
  )
}

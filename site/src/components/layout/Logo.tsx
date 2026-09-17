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
  className = '',
}: Props) {
  const img = (
    <img
      src={FILES[variant][tone]}
      alt="IrisFlow"
      className={`logo__img logo__img--${variant}`}
      width={variant === 'full' ? 1841 : 437}
      height={variant === 'full' ? 480 : 440}
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

/**
 * O símbolo da íris como elemento gráfico: recebe um halo que pulsa e
 * anéis concêntricos que se expandem, sem nada desenhado por cima da
 * marca. Serve de âncora visual onde antes havia uma ilustração.
 */
export function IrisMark({
  size = 200,
  tone = 'negativo',
  spin = true,
}: {
  size?: number
  tone?: 'positivo' | 'negativo'
  spin?: boolean
}) {
  return (
    <span className="irismark" style={{ width: `min(100%, ${size}px)` }} aria-hidden="true">
      <span className="irismark__halo" />
      <span className="irismark__ring" />
      <span className="irismark__ring irismark__ring--2" />
      <img
        src={FILES.symbol[tone]}
        alt=""
        className={`irismark__img${spin ? ' is-spinning' : ''}`}
        width={640}
        height={640}
      />
    </span>
  )
}

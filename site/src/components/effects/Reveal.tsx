import type { CSSProperties, ElementType, ReactNode } from 'react'

type Anim = 'up' | 'fade' | 'zoom' | 'left' | 'right'

type Props = {
  children: ReactNode
  /** Como o bloco entra: subindo (padrão), só aparecendo, crescendo ou de lado. */
  anim?: Anim
  /** Atraso da entrada, em ms (para cascatas). */
  delay?: number
  /** Aceito por compatibilidade. */
  duration?: number
  as?: ElementType
  className?: string
  style?: CSSProperties
  /** Deixa o invólucro servir de alvo de âncora (ex.: /contato#validacao). */
  id?: string
}

/**
 * Bloco que entra em cena ao chegar na tela. Quem observa a rolagem é um
 * observador só, para o site inteiro (RevelarAoRolar, no Layout). Sem
 * JavaScript, sem IntersectionObserver ou com movimento reduzido, o bloco já
 * está lá desde o começo.
 */
export function Reveal({ children, anim = 'up', delay = 0, as: Tag = 'div', className = '', style, id }: Props) {
  const estilo = delay ? ({ ...style, '--reveal-atraso': `${delay}ms` } as CSSProperties) : style
  return (
    <Tag id={id} className={`reveal${className ? ` ${className}` : ''}`} data-reveal={anim} style={estilo}>
      {children}
    </Tag>
  )
}

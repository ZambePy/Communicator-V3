import type { ReactNode } from 'react'
import './card.css'

type Props = {
  children: ReactNode
  className?: string
  /** Mantido por compatibilidade: a superfície já se adapta ao fundo. */
  glass?: boolean
  /** Mantido por compatibilidade: desde o redesenho de 19/10/2026 nenhum
   *  cartão sobe ou brilha sob o ponteiro — cartão não é botão. */
  interactive?: boolean
  as?: 'div' | 'article' | 'li' | 'section'
}

/**
 * Cartão base do site: a superfície da faixa em que está, com borda. Usado só
 * para o que é um objeto (um plano, um canal de contato), não para cada item
 * de lista — essas ficam separadas por fios (components/pagina/Blocos).
 */
export function Card({ children, className = '', as: Tag = 'div' }: Props) {
  return <Tag className={['card', 'panel', className].filter(Boolean).join(' ')}>{children}</Tag>
}

export function CardIcon({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'teal' }) {
  return <span className={`card__icon card__icon--${tone}`}>{children}</span>
}

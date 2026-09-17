import type { CSSProperties, ElementType, ReactNode } from 'react'
import { useInView } from '@/hooks/useInView'

type Anim = 'up' | 'fade' | 'zoom' | 'left' | 'right'

const KEYFRAMES: Record<Anim, string> = {
  up: 'fade-up',
  fade: 'fade-in',
  zoom: 'zoom-in',
  left: 'slide-left',
  right: 'slide-right',
}

type Props = {
  children: ReactNode
  /** Direção da entrada. */
  anim?: Anim
  /** Atraso em ms, usado para escalonar os itens de uma lista. */
  delay?: number
  duration?: number
  as?: ElementType
  className?: string
  style?: CSSProperties
  /** Deixa o invólucro servir de alvo de âncora (ex.: /contato#validacao). */
  id?: string
}

/**
 * O conteúdo entra em cena quando cruza a viewport, uma vez só.
 */
export function Reveal({
  children,
  anim = 'up',
  delay = 0,
  duration = 760,
  as: Tag = 'div',
  className = '',
  style,
  id,
}: Props) {
  const { ref, inView } = useInView<HTMLDivElement>()

  return (
    <Tag
      ref={ref}
      id={id}
      className={className}
      style={{
        ...style,
        opacity: inView ? undefined : 0,
        animation: inView
          ? `${KEYFRAMES[anim]} ${duration}ms var(--ease-out) ${delay}ms both`
          : undefined,
      }}
    >
      {children}
    </Tag>
  )
}

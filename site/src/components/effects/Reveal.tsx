import type { CSSProperties, ElementType, ReactNode } from 'react'

type Anim = 'up' | 'fade' | 'zoom' | 'left' | 'right'

type Props = {
  children: ReactNode
  /** Aceito por compatibilidade; não anima mais (ver abaixo). */
  anim?: Anim
  /** Aceito por compatibilidade; não anima mais. */
  delay?: number
  /** Aceito por compatibilidade; não anima mais. */
  duration?: number
  as?: ElementType
  className?: string
  style?: CSSProperties
  /** Deixa o invólucro servir de alvo de âncora (ex.: /contato#validacao). */
  id?: string
}

/**
 * Invólucro dos blocos de conteúdo.
 *
 * Até o redesenho de 19/10/2026, cada bloco entrava em cena ao cruzar a
 * janela (subindo e esmaecendo). Saiu: entrada em todo bloco é o padrão das
 * páginas geradas em série, cansa quem lê devagar e já deixou conteúdo
 * invisível com zoom alto (ver useInView). O conteúdo agora está na página
 * quando ela chega. O componente fica como invólucro — o elemento, a classe e
 * o id continuam — para as páginas não precisarem mudar todas de uma vez.
 */
export function Reveal({ children, as: Tag = 'div', className = '', style, id }: Props) {
  return (
    <Tag id={id} className={`reveal${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </Tag>
  )
}

import type { ReactNode } from 'react'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { AnimatedHeadline } from '@/components/effects/AnimatedHeadline'

type Props = {
  /** Rótulo curto acima do título (o nome da página). */
  eyebrow?: string
  title: string
  highlight?: string[]
  lead?: string
  /** Botões ou links logo abaixo do texto. */
  children?: ReactNode
  /** A imagem da página (tela do produto, foto): entra abaixo do texto, larga. */
  visual?: ReactNode
  /** Texto centralizado, para as aberturas que têm um visual grande embaixo. */
  centro?: boolean
}

/**
 * Abertura das páginas de dentro: faixa escura, como o hero da home, para o
 * cabeçalho fixo se comportar igual no topo de qualquer rota. Pouco texto —
 * título, uma frase e, quando existe, a imagem do produto logo abaixo.
 */
export function PageHead({ eyebrow, title, highlight = [], lead, children, visual, centro = false }: Props) {
  // Título da aba e meta description vêm de src/seo/pages.ts (RouteMeta).
  return (
    <header
      className={`page-head on-dark${centro ? ' page-head--centro' : ''}${visual ? ' page-head--com-visual' : ''}`}
    >
      <AmbientBackground />
      <div className="container">
        <div className="page-head__inner">
          {eyebrow && <p className="page-head__rotulo anim-entrada">{eyebrow}</p>}
          <AnimatedHeadline text={title} as="h1" highlight={highlight} delay={60} className="page-head__titulo" />
          {lead && <p className="page-head__lead anim-entrada anim-entrada--3">{lead}</p>}
          {children && <div className="page-head__extra anim-entrada anim-entrada--4">{children}</div>}
        </div>
        {visual && <div className="page-head__visual">{visual}</div>}
      </div>
    </header>
  )
}

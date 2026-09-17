import type { ReactNode } from 'react'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { AnimatedHeadline } from '@/components/effects/AnimatedHeadline'
import { Logo } from './Logo'

type Props = {
  eyebrow: string
  title: string
  highlight?: string[]
  lead?: string
  children?: ReactNode
}

/**
 * Cabeçalho das páginas internas. É uma faixa escura, como o hero, para
 * que o cabeçalho fixo tenha sempre o mesmo comportamento no topo de
 * qualquer rota, e para que a marca apareça em negativo ali.
 */
export function PageHead({ eyebrow, title, highlight = [], lead, children }: Props) {
  return (
    <header className="page-head on-dark">
      <AmbientBackground particles={14} scan={false} />
      <div className="container">
        <div className="page-head__inner">
          <Reveal anim="fade">
            <Logo variant="symbol" tone="negativo" size="sm" link={false} />
          </Reveal>
          <Reveal anim="fade" delay={100}>
            <span className="eyebrow">{eyebrow}</span>
          </Reveal>
          <AnimatedHeadline text={title} as="h1" highlight={highlight} delay={140} />
          {lead && (
            <Reveal anim="up" delay={280}>
              <p className="lead">{lead}</p>
            </Reveal>
          )}
          {children}
        </div>
      </div>
    </header>
  )
}

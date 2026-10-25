import type { ReactNode } from 'react'
import { Atmosfera } from '@/components/fundo/Atmosfera'
import { useDeclararAbertura, useFundoDaPagina } from './FundoDaPagina'

type Props = {
  /** Rótulo curto acima do título (o nome da página). */
  eyebrow?: string
  title: string
  /**
   * Palavras que antes saíam em outra cor. Aceito por compatibilidade: desde o
   * redesenho de 19/10/2026 o título é de uma cor só (o destaque de uma
   * palavra é o vício mais reconhecível das páginas geradas em série).
   */
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
 * Abertura das páginas de dentro: título, uma frase e, quando existe, a imagem
 * do produto logo abaixo. Quando a página pede `<FundoDaPagina />`, a faixa
 * ganha o fundo vivo da marca (Atmosfera) atrás do texto.
 */
export function PageHead({ eyebrow, title, lead, children, visual, centro = false }: Props) {
  // Título da aba e meta description vêm de src/seo/pages.ts (RouteMeta).
  const fundo = useFundoDaPagina()
  useDeclararAbertura(fundo !== null)
  return (
    <header
      className={`page-head on-dark${centro ? ' page-head--centro' : ''}${visual ? ' page-head--com-visual' : ''}`}
    >
      {fundo && <Atmosfera variante={fundo === 'calmo' ? 'calmo' : 'topo'} />}
      <div className="container page-head__conteudo">
        <div className="page-head__topo">
          <div className="page-head__inner">
            {eyebrow && <p className="page-head__rotulo">{eyebrow}</p>}
            <h1 className="page-head__titulo">{title}</h1>
            {lead && <p className="page-head__lead">{lead}</p>}
            {children && <div className="page-head__extra">{children}</div>}
          </div>
        </div>
        {visual && <div className="page-head__visual">{visual}</div>}
      </div>
    </header>
  )
}

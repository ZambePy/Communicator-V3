import type { ReactNode } from 'react'
import { Reveal } from '@/components/effects/Reveal'
import { Icon, type IconName } from '@/components/ui/Icon'
import './blocos.css'

/* Peças das páginas de dentro. A regra delas é a das páginas de produto de
   verdade: título curto, uma frase, e o resto em listas enxutas — sem caixa
   em volta de cada item, sem parágrafo onde cabe uma linha. */

export type Recurso = { icone?: IconName; titulo: string; texto: string }

/** Itens lado a lado, separados por uma linha fina em cima: ícone, título e uma frase. */
export function Recursos({
  itens,
  colunas = 3,
  numerar = false,
}: {
  itens: Recurso[]
  colunas?: 2 | 3 | 4
  /** Mostra 01, 02… no lugar do ícone (passos em ordem). */
  numerar?: boolean
}) {
  return (
    <ul className={`recursos recursos--${colunas}`}>
      {itens.map((r, i) => (
        <Reveal key={r.titulo} as="li" anim="up" delay={60 * i} className="recursos__item">
          {numerar ? (
            <span className="recursos__numero" aria-hidden="true">
              {String(i + 1).padStart(2, '0')}
            </span>
          ) : (
            r.icone && (
              <span className="recursos__icone">
                <Icon name={r.icone} size={22} />
              </span>
            )
          )}
          <h3 className="recursos__titulo">{r.titulo}</h3>
          <p className="recursos__texto">{r.texto}</p>
        </Reveal>
      ))}
    </ul>
  )
}

export type Numero = { valor: string; rotulo: string }

/** Números grandes, poucos e verificáveis, cada um com a sua legenda. */
export function Numeros({ itens }: { itens: Numero[] }) {
  return (
    <dl className="numeros">
      {itens.map((n, i) => (
        <Reveal key={n.rotulo} anim="up" delay={80 * i} className="numeros__item">
          <dt className="numeros__valor">{n.valor}</dt>
          <dd className="numeros__rotulo">{n.rotulo}</dd>
        </Reveal>
      ))}
    </dl>
  )
}

/** O detalhe que só alguns querem ler: fechado por padrão, abre no lugar. */
export function Detalhe({ resumo, children }: { resumo: string; children: ReactNode }) {
  return (
    <details className="detalhe">
      <summary className="detalhe__resumo">
        <span>{resumo}</span>
        <span className="detalhe__icone" aria-hidden="true" />
      </summary>
      <div className="detalhe__corpo">{children}</div>
    </details>
  )
}

/** Cabeçalho de seção: título grande e, se houver, uma frase. */
export function Capitulo({
  id,
  titulo,
  texto,
  centro = false,
}: {
  id?: string
  titulo: ReactNode
  texto?: ReactNode
  centro?: boolean
}) {
  return (
    <Reveal anim="up" className={`capitulo${centro ? ' capitulo--centro' : ''}`}>
      <h2 id={id} className="titulo-capitulo">
        {titulo}
      </h2>
      {texto && <p className="texto-capitulo">{texto}</p>}
    </Reveal>
  )
}

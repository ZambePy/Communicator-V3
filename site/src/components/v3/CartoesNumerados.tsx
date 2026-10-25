import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import type { RecursoDoOlhar } from '@/data/home'
import '@/components/home/aparelhos.css'
import './cartoes.css'

type Props = {
  itens: RecursoDoOlhar[]
  titulo: string
  texto: string
}

/** Os cartões largos da grade (no computador ocupam duas colunas). */
const LARGOS = new Set([0, 3, 4])

/**
 * "O que um olhar faz": seis cartões numerados numa grade, cada um com a tela
 * real do app (as imagens de public/media). Nada fica preso na rolagem: os
 * cartões entram ao rolar e respondem ao passar o mouse ou ao foco.
 */
export function CartoesNumerados({ itens, titulo, texto }: Props) {
  const idDoTitulo = useId()
  return (
    <section className="v3-recursos" aria-labelledby={idDoTitulo}>
      <div className="container">
        <Reveal as="header" className="v3-recursos__cabeca">
          <h2 id={idDoTitulo} className="v3-recursos__titulo">
            {titulo}
          </h2>
          <p className="v3-recursos__texto">{texto}</p>
        </Reveal>
        <ol className="v3-cartoes">
          {itens.map((item, i) => (
            <Cartao key={item.id} item={item} indice={i} largo={LARGOS.has(i)} />
          ))}
        </ol>
      </div>
    </section>
  )
}

function Seta() {
  return (
    <svg className="v3-cartao__seta" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  )
}

function Cartao({ item, indice, largo }: { item: RecursoDoOlhar; indice: number; largo: boolean }) {
  const numero = String(indice + 1).padStart(2, '0')
  const { tela } = item
  return (
    <Reveal
      as="li"
      delay={(indice % 3) * 90}
      className={`v3-cartao${largo ? ' v3-cartao--largo' : ''}${tela ? '' : ' v3-cartao--sem-tela'}`}
    >
      {tela && (
        <div className={`v3-cartao__tela${tela.celular ? ' v3-cartao__tela--celular' : ''}`}>
          <img src={tela.src} alt={tela.alt} width={tela.largura} height={tela.altura} loading="lazy" decoding="async" />
        </div>
      )}
      <div className="v3-cartao__conteudo">
        <div className="v3-cartao__topo">
          <span className="v3-cartao__numero" aria-hidden="true">
            {numero}
          </span>
          {item.link && <Seta />}
        </div>
        <h3 className="v3-cartao__titulo">{item.link ? <Link to={item.link.to}>{item.titulo}</Link> : item.titulo}</h3>
        <p className="v3-cartao__texto">{item.texto}</p>
        <ul className="v3-cartao__pontos">
          {item.pontos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {item.nota && <p className="v3-cartao__nota">{item.nota}</p>}
      </div>
    </Reveal>
  )
}

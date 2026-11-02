import { useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { CONDICOES_NA_HOME, PARA_QUEM_O_OLHAR } from '@/data/home'
import './condicoes.css'

/**
 * "Para quem" na home (redesenho de 01/11/2026, segunda volta, pedido do dono:
 * a lista não explicava nada; terceira volta: o campo claro saiu, a faixa
 * voltou ao marinho da marca). À esquerda, as seis condições como abas
 * cheias, uma embaixo da outra; à direita, o painel da condição escolhida:
 * o nome grande e a linha do que muda no alto, a tela do app que mais serve a
 * ela em tamanho grande e, ao lado, duas faixas de tom: por que o olhar
 * funciona e o cuidado antes de começar. Uma aba de cada vez, como num
 * guia: dá para comparar sem rolar a página.
 *
 * Abas de verdade (tablist): clique, toque, ou as setas do teclado. Os seis
 * painéis estão no HTML; os de fora ficam `hidden`, então quem chega sem
 * script vê o primeiro e o leitor de tela anuncia as abas.
 *
 * As classes são `para-quem__*`, e não `condicoes__*`: a página Como funciona
 * usa `.condicoes` para a grade dela, e o CSS dela, carregado ao visitar a
 * página, espremia esta faixa em três colunas ao voltar para a home.
 */
export function CondicoesHome() {
  const [ativa, setAtiva] = useState(0)
  const abas = useRef<(HTMLButtonElement | null)[]>([])
  // O título em duas linhas, quebrado depois da vírgula.
  const [linha1, linha2] = PARA_QUEM_O_OLHAR.titulo.split(/(?<=,) /)

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const total = CONDICOES_NA_HOME.length
    const passo = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
    let proxima: number | null = passo ? (ativa + passo + total) % total : null
    if (e.key === 'Home') proxima = 0
    if (e.key === 'End') proxima = total - 1
    if (proxima === null) return
    e.preventDefault()
    setAtiva(proxima)
    abas.current[proxima]?.focus()
  }

  return (
    <section className="para-quem home-faixa" aria-labelledby="para-quem-titulo">
      <div className="container">
        <Reveal as="header" className="para-quem__cabeca">
          <div>
            <h2 id="para-quem-titulo" className="para-quem__titulo">
              <span className="para-quem__titulo-1">{linha1}</span> <span>{linha2}</span>
            </h2>
            <p className="para-quem__sub">{PARA_QUEM_O_OLHAR.texto}</p>
          </div>
          <Button to="/beta" size="lg" className="para-quem__acao">
            Testar grátis na beta
          </Button>
        </Reveal>

        <div className="para-quem__corpo">
          <div className="para-quem__abas" role="tablist" aria-label="Condições" aria-orientation="vertical" onKeyDown={aoTeclar}>
            {CONDICOES_NA_HOME.map((c, i) => (
              <button
                key={c.id}
                ref={(el) => {
                  abas.current[i] = el
                }}
                type="button"
                role="tab"
                id={`para-quem-aba-${c.id}`}
                aria-selected={i === ativa}
                aria-controls={`para-quem-painel-${c.id}`}
                tabIndex={i === ativa ? 0 : -1}
                className="para-quem__aba"
                onClick={() => setAtiva(i)}
              >
                {c.nome}
              </button>
            ))}
          </div>

          {CONDICOES_NA_HOME.map((c, i) => (
            <div
              key={c.id}
              role="tabpanel"
              id={`para-quem-painel-${c.id}`}
              aria-labelledby={`para-quem-aba-${c.id}`}
              hidden={i !== ativa}
              className="para-quem__painel"
            >
              <div className="para-quem__topo">
                <h3 className="para-quem__nome">{c.nome}</h3>
                <p className="para-quem__linha">{c.linha}</p>
              </div>
              <figure className="para-quem__tela">
                <div className="para-quem__monitor">
                  <img src={c.tela.src} alt={c.tela.alt} width={1600} height={900} loading="lazy" decoding="async" />
                </div>
                <figcaption>{c.tela.legenda}</figcaption>
              </figure>
              <div className="para-quem__texto">
                <div className="para-quem__faixas">
                  <div className="para-quem__faixa">
                    <h4>Por que o olhar funciona</h4>
                    <p>{c.porque}</p>
                  </div>
                  <div className="para-quem__faixa">
                    <h4>Antes de começar</h4>
                    <p>{c.cuidado}</p>
                  </div>
                </div>
                <Link to={c.to} className="link-seta para-quem__mais">
                  Ler mais em Como funciona
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

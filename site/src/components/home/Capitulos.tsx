import { useEffect, useRef, useState } from 'react'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { CAPITULOS } from '@/data/home'
import { prefersReducedMotion } from '@/hooks/useReducedMotion'
import './capitulos.css'

/**
 * O produto em capítulos. No computador, o texto rola e a tela ao lado troca
 * junto (a janela fica parada no meio da página); no celular, cada capítulo
 * traz a própria tela logo abaixo do texto.
 */
export function Capitulos() {
  const [ativo, setAtivo] = useState(0)
  const blocos = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    // O capítulo "ativo" é o que cruza a faixa do meio da janela.
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setAtivo(Number((e.target as HTMLElement).dataset.indice))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    blocos.current.forEach((el) => el && io.observe(el))
    return () => io.disconnect()
  }, [])

  const semMovimento = prefersReducedMotion()

  return (
    <section className="capitulos on-raised com-fundo" id="produto" aria-labelledby="capitulos-titulo">
      <AmbientBackground variante="particulas" />
      <div className="container">
        <header className="capitulos__cabeca">
          <span className="eyebrow">IrisFlow Communicator</span>
          <h2 id="capitulos-titulo" className="titulo-capitulo">
            Feito para ser usado só com os olhos.
          </h2>
        </header>

        <div className="capitulos__grade">
          <div className="capitulos__textos">
            {CAPITULOS.map((c, i) => (
              <article
                key={c.id}
                ref={(el) => {
                  blocos.current[i] = el
                }}
                data-indice={i}
                className={`capitulo${i === ativo ? ' is-ativo' : ''}`}
              >
                <span className="capitulo__numero" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="capitulo__titulo">{c.titulo}</h3>
                <p className="capitulo__texto">{c.texto}</p>
                <img
                  className="capitulo__tela-movel"
                  src={c.imagem.src}
                  alt={c.imagem.alt}
                  width={c.imagem.largura}
                  height={c.imagem.altura}
                  loading="lazy"
                  decoding="async"
                />
              </article>
            ))}
          </div>

          <div className="capitulos__palco">
            <div className={`capitulos__janela${semMovimento ? ' sem-movimento' : ''}`}>
              {CAPITULOS.map((c, i) => (
                <img
                  key={c.id}
                  className={`capitulos__tela${i === ativo ? ' is-ativa' : ''}`}
                  src={c.imagem.src}
                  alt={i === ativo ? c.imagem.alt : ''}
                  aria-hidden={i === ativo ? undefined : true}
                  width={c.imagem.largura}
                  height={c.imagem.altura}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

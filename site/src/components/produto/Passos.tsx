import { Reveal } from '@/components/effects/Reveal'
import { Icon } from '@/components/ui/Icon'
import { useInView } from '@/hooks/useInView'
import type { PassoComTela, ESTAGIOS } from '@/data/produto'
import './passos.css'

/**
 * Passos em ordem, cada um com a tela em que acontece. No computador, lado a
 * lado; no celular, uma fileira que desliza com o dedo.
 */
export function PassosComTela({ passos }: { passos: PassoComTela[] }) {
  return (
    // No celular a lista rola na horizontal: focável, para rolar pelo teclado.
    <ol className="passos-tela" tabIndex={0} aria-label="Os passos (no celular, role para o lado)">
      {passos.map((p, i) => (
        <Reveal key={p.titulo} as="li" anim="up" delay={90 * i} className="passos-tela__item">
          <figure className="passos-tela__figura">
            <img
              src={p.tela.src}
              alt={p.tela.alt}
              width={p.tela.largura ?? 1600}
              height={p.tela.altura ?? 900}
              loading="lazy"
              decoding="async"
            />
          </figure>
          <span className="passos-tela__numero" aria-hidden="true">
            {i + 1}
          </span>
          {/* h2: a lista vem logo abaixo do h1 da página; h3 pulava um nível
              para quem navega pelos títulos no leitor de tela. */}
          <h2 className="passos-tela__titulo">{p.titulo}</h2>
          <p className="passos-tela__texto">{p.texto}</p>
        </Reveal>
      ))}
    </ol>
  )
}

/**
 * Do vídeo ao clique: os estágios ligados por uma linha que se desenha quando
 * a faixa entra na tela. Deitada no computador, em pé no celular.
 */
export function Estagios({ itens }: { itens: typeof ESTAGIOS }) {
  const { ref, inView } = useInView<HTMLOListElement>({ threshold: 0.3 })
  return (
    <ol ref={ref} className={`estagios${inView ? ' is-visivel' : ''}`}>
      {itens.map((e, i) => (
        <li key={e.titulo} className="estagios__item" style={{ '--i': i } as React.CSSProperties}>
          <span className="estagios__icone">
            <Icon name={e.icone} size={22} />
          </span>
          <h3 className="estagios__titulo">{e.titulo}</h3>
          <p className="estagios__texto">{e.texto}</p>
        </li>
      ))}
    </ol>
  )
}

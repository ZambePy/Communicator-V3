import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useInView } from '@/hooks/useInView'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { instanteDoItemNaLista, instanteDoItemNoArco } from './desenhoDoArco'
import { anguloNoArco, geometriaDoArco, type GeometriaDoArco } from './geometriaDoArco'
import './arco.css'

export { anguloNoArco }

type Props = {
  condicoes: { nome: string; to: string }[]
  titulo: string
  texto: string
}

const mesmaGeometria = (a: GeometriaDoArco, b: GeometriaDoArco) =>
  a.modo === 'lista' || b.modo === 'lista'
    ? a.modo === b.modo
    : a.raio === b.raio && a.topo === b.topo && a.altura === b.altura

/**
 * "Para quem" (rodada 3, 21/10/2026): as condições numa linha curva, um fio
 * fino sem brilho (o dono recusou o efeito no mesmo dia). No vídeo de
 * referência eram logotipos de clientes num arco; aqui é a borda de uma íris,
 * com as condições em que o olhar costuma ficar quando o resto do corpo não
 * responde. Nada de logotipo nem de cliente inventado.
 *
 * Cada condição é um link para o trecho de "Como funciona" que fala dela.
 *
 * Geometria (revisão de 21/10/2026, I1): o raio, o topo e a altura do arco
 * NÃO são fixos no CSS. Ao montar, ao mudar a largura da caixa e quando as
 * fontes terminam de carregar, o componente mede a caixa e o tamanho real de
 * cada item e pergunta a `geometriaDoArco` (função pura, testada com larguras
 * simuladas) se o arco cabe inteiro. Cabendo, o CSS recebe `--raio`,
 * `--topo` e `--altura`; não cabendo (janela estreita, celular), os nomes
 * viram uma lista de pílulas sob a curva, que nunca corta. Antes da primeira
 * medida (e sem JavaScript) vale a lista: o pior caso é feio, nunca cortado.
 *
 * Animação (pedido do dono, 21/10/2026): quando a seção entra na tela, a linha
 * do arco se traça da esquerda para a direita e cada condição aparece quando a
 * linha passa por ela (desenhoDoArco.ts faz a conta de quando) — uma vez. O
 * componente só esconde as condições (`is-preparado`) quando vai de fato
 * animá-las: com movimento reduzido, ou sem IntersectionObserver, o arco já
 * vem desenhado e nada fica esperando um aviso que não chega.
 */
export function ArcoDeCondicoes({ condicoes, titulo, texto }: Props) {
  const idDoTitulo = useId()
  const reduzido = useReducedMotion()
  const animar = !reduzido && typeof IntersectionObserver !== 'undefined'
  // A mesma caixa serve às duas coisas: medir o arco e saber quando ele entra na tela.
  const { ref: arcoRef, inView: entrou } = useInView<HTMLDivElement>({
    once: true,
    threshold: 0.4,
    rootMargin: '0px 0px -8% 0px',
    ativo: animar,
  })
  const listaRef = useRef<HTMLUListElement>(null)
  const [geometria, setGeometria] = useState<GeometriaDoArco>({ modo: 'lista' })

  useLayoutEffect(() => {
    const arco = arcoRef.current
    const lista = listaRef.current
    if (!arco || !lista) return
    let quadro = 0
    let larguraMedida = -1

    const medir = () => {
      quadro = 0
      // Os itens só têm o tamanho do arco no modo arco (na lista são pílulas):
      // liga o modo por um instante, lê as medidas (a leitura força o layout) e
      // devolve o atributo como o React o deixou — tudo no mesmo instante, sem
      // pintura no meio.
      const atual = arco.getAttribute('data-modo')
      arco.setAttribute('data-modo', 'arco')
      larguraMedida = arco.clientWidth
      const medidas = Array.from(lista.children, (li) => ({
        largura: (li as HTMLElement).offsetWidth,
        altura: (li as HTMLElement).offsetHeight,
      }))
      if (atual === null) arco.removeAttribute('data-modo')
      else arco.setAttribute('data-modo', atual)
      const nova = geometriaDoArco(larguraMedida, medidas)
      setGeometria((anterior) => (mesmaGeometria(anterior, nova) ? anterior : nova))
    }
    // Fora do quadro de animação do observador: mexer na altura do próprio
    // elemento observado, dentro da entrega, dá "ResizeObserver loop".
    const pedir = () => {
      if (!quadro) quadro = window.requestAnimationFrame(medir)
    }
    const aoRedimensionar = () => {
      if (arco.clientWidth !== larguraMedida) pedir()
    }

    medir()

    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(aoRedimensionar) : null
    observador?.observe(arco)
    if (!observador) window.addEventListener('resize', aoRedimensionar)
    // A Sora em negrito troca a fonte de reserva quando chega, e as larguras mudam.
    const fontes = document.fonts
    fontes?.addEventListener?.('loadingdone', pedir)
    void fontes?.ready?.then(pedir)

    return () => {
      if (quadro) window.cancelAnimationFrame(quadro)
      observador?.disconnect()
      window.removeEventListener('resize', aoRedimensionar)
      fontes?.removeEventListener?.('loadingdone', pedir)
    }
  }, [condicoes.length])

  const estilo =
    geometria.modo === 'arco'
      ? ({ '--raio': `${geometria.raio}px`, '--topo': `${geometria.topo}px`, '--altura': `${geometria.altura}px` } as CSSProperties)
      : undefined

  return (
    <section className="v3-para-quem" aria-labelledby={idDoTitulo}>
      <div className="container">
        <header className="v3-para-quem__cabeca">
          <h2 id={idDoTitulo} className="v3-para-quem__titulo">
            {titulo}
          </h2>
          <p className="v3-para-quem__texto">{texto}</p>
        </header>

        <div
          ref={arcoRef}
          className={`v3-arco${animar ? (entrou ? ' is-desenhando' : ' is-preparado') : ''}`}
          data-modo={geometria.modo}
          style={estilo}
        >
          <div className="v3-arco__curva" aria-hidden="true">
            <span className="v3-arco__linha" />
          </div>
          <ul ref={listaRef} className="v3-arco__lista">
            {condicoes.map((c, i) => (
              <li
                key={c.nome}
                className="v3-arco__item"
                style={
                  {
                    '--a': `${anguloNoArco(i, condicoes.length)}deg`,
                    '--entra-arco': `${instanteDoItemNoArco(i, condicoes.length, geometria.modo === 'arco' ? geometria.raio : 900).toFixed(0)}ms`,
                    '--entra-lista': `${instanteDoItemNaLista(i)}ms`,
                  } as CSSProperties
                }
              >
                <Link to={c.to} className="v3-arco__link">
                  {c.nome}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { RecursoDoOlhar } from '@/data/home'
import '@/components/home/aparelhos.css'
import './cartoes.css'

/**
 * Em que cartão a rolagem está: a faixa é dividida em partes iguais, uma por
 * cartão, sem sair das pontas (e 0 para qualquer valor inválido).
 */
export function indiceNaRolagem(progresso: number, n: number): number {
  if (!Number.isFinite(progresso) || n <= 0) return 0
  return Math.min(n - 1, Math.max(0, Math.floor(progresso * n)))
}

type Props = {
  itens: RecursoDoOlhar[]
  titulo: string
  texto: string
}

/**
 * O que o palco mostra: o cartão ativo, o que acabou de sair (fica por baixo
 * até a tela nova carregar, para o palco nunca ficar vazio) e as telas já
 * vistas. Só as vistas entram no DOM: uma tela que ninguém pediu não baixa.
 */
type Palco = { ativo: number; anterior: number | null; vistas: number[] }

function irPara(palco: Palco, i: number): Palco {
  if (i === palco.ativo) return palco
  return { ativo: i, anterior: palco.ativo, vistas: palco.vistas.includes(i) ? palco.vistas : [...palco.vistas, i] }
}

/**
 * "O que um olhar faz": seis cartões numerados numa faixa horizontal. A seção
 * é mais alta que a janela; enquanto a página rola por ela, o palco fica preso
 * na tela, a faixa anda um cartão por vez e o cartão ativo vem preenchido no
 * azul da marca. Ao lado dos cartões fica a TELA REAL do app do cartão ativo
 * (as imagens de public/media): o produto de verdade, não um efeito. A tela só
 * troca quando o cartão ativo muda — um movimento que responde à pessoa.
 *
 * Rodada 3 (21/10/2026): o cartão ativo decidia a forma de um olho de
 * partículas ao lado; o dono recusou o efeito (21/10/2026) e a coluna passou
 * a mostrar a tela. "Mostrar onde dói" ainda não tem captura, e nada é
 * inventado no lugar: um painel quieto com o nome do recurso.
 *
 * Teclado: o foco no link de um cartão leva a página até o passo dele, então
 * o cartão focado nunca fica fora da janela. Clicar num cartão que não está
 * ativo também leva até ele.
 *
 * Com movimento reduzido nada fica preso nem desliza: uma grade parada, cada
 * cartão com a sua tela pequena.
 */
export function CartoesNumerados({ itens, titulo, texto }: Props) {
  const reduzido = useReducedMotion()
  const [palco, setPalco] = useState<Palco>({ ativo: 0, anterior: null, vistas: [0] })
  const ativoRef = useRef(0)
  const trilhoRef = useRef<HTMLDivElement>(null)
  const idDoTitulo = useId()
  const { ativo } = palco

  // O passo do cartão ativo segue a rolagem, medido no máximo uma vez por quadro.
  useEffect(() => {
    if (reduzido) return
    let quadro = 0
    const medir = () => {
      quadro = 0
      const el = trilhoRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const curso = r.height - (window.innerHeight || 0)
      const i = indiceNaRolagem(curso > 0 ? -r.top / curso : 0, itens.length)
      if (i !== ativoRef.current) {
        ativoRef.current = i
        setPalco((p) => irPara(p, i))
      }
    }
    const pedir = () => {
      if (!quadro) quadro = window.requestAnimationFrame(medir)
    }
    medir()
    window.addEventListener('scroll', pedir, { passive: true })
    window.addEventListener('resize', pedir)
    return () => {
      window.removeEventListener('scroll', pedir)
      window.removeEventListener('resize', pedir)
      if (quadro) window.cancelAnimationFrame(quadro)
    }
  }, [reduzido, itens.length])

  /** Rola até o meio do passo do cartão i (foco do teclado, clique num cartão de lado). */
  const rolarPara = useCallback(
    (i: number) => {
      if (reduzido || i === ativoRef.current) return
      const el = trilhoRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const curso = r.height - (window.innerHeight || 0)
      if (!(curso > 0)) return
      const topo = window.scrollY + r.top
      window.scrollTo({ top: topo + curso * ((i + 0.5) / itens.length), behavior: 'instant' as ScrollBehavior })
    },
    [reduzido, itens.length],
  )

  /** A tela do cartão ativo carregou: a anterior pode sair. */
  const aoCarregarATela = useCallback(() => {
    setPalco((p) => (p.anterior === null ? p : { ...p, anterior: null }))
  }, [])

  const cabeca = (
    <header className="v3-recursos__cabeca">
      <h2 id={idDoTitulo} className="v3-recursos__titulo">
        {titulo}
      </h2>
      <p className="v3-recursos__texto">{texto}</p>
    </header>
  )

  if (reduzido) {
    return (
      <section className="v3-recursos is-parado" aria-labelledby={idDoTitulo}>
        <div className="container">
          {cabeca}
          <ol className="v3-cartoes v3-cartoes--grade">
            {itens.map((item, i) => (
              <Cartao key={item.id} item={item} indice={i} ativo={false} parado />
            ))}
          </ol>
        </div>
      </section>
    )
  }

  // data-sticky-hide: enquanto a faixa está presa na tela, a barra fixa de
  // chamada do celular (StickyCta) some — senão cobre o pé do cartão ativo.
  return (
    <section className="v3-recursos" aria-labelledby={idDoTitulo}>
      <div
        ref={trilhoRef}
        className="v3-recursos__trilho"
        data-sticky-hide
        style={{ '--passos': itens.length } as CSSProperties}
      >
        <div className="v3-recursos__palco">
          <div className="container v3-recursos__dentro">
            {cabeca}
            <div className="v3-recursos__tela">
              {palco.vistas.map((i) => (
                <TelaDoRecurso
                  key={itens[i].id}
                  item={itens[i]}
                  estado={i === palco.ativo ? 'ativa' : i === palco.anterior ? 'anterior' : 'guardada'}
                  aoCarregar={aoCarregarATela}
                />
              ))}
            </div>
            <div className="v3-recursos__janela">
              <ol className="v3-cartoes" style={{ '--ativo': ativo } as CSSProperties}>
                {itens.map((item, i) => (
                  <Cartao
                    key={item.id}
                    item={item}
                    indice={i}
                    ativo={i === ativo}
                    passado={i < ativo}
                    aoFocar={() => rolarPara(i)}
                    aoClicar={() => rolarPara(i)}
                  />
                ))}
              </ol>
            </div>
            <p className="v3-recursos__passo" aria-hidden="true">
              <span className="v3-recursos__barra" style={{ '--feito': (ativo + 1) / itens.length } as CSSProperties} />
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * Uma tela do palco. Todas ocupam o mesmo retângulo reservado (o CSS dá o
 * tamanho do palco, não a imagem: sem pulo de layout) e só a ativa aparece,
 * com um esmaecer. Só a ativa fala ao leitor de tela, com o texto alternativo
 * da imagem; as outras, e o painel sem tela (cuja frase já está no cartão),
 * ficam fora dele.
 */
function TelaDoRecurso({
  item,
  estado,
  aoCarregar,
}: {
  item: RecursoDoOlhar
  estado: 'ativa' | 'anterior' | 'guardada'
  aoCarregar: () => void
}) {
  const { tela } = item
  const ativa = estado === 'ativa'
  // Sem imagem, o painel já está pronto; com ela, só depois de carregar (nunca um quadro em branco).
  const [pronta, setPronta] = useState(!tela)
  // Imagem que já veio do cache não dispara onLoad depois de montada.
  const marcarSeJaCarregada = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0) setPronta(true)
  }, [])

  useEffect(() => {
    if (ativa && pronta) aoCarregar()
  }, [ativa, pronta, aoCarregar])

  const classe = [
    'v3-tela',
    tela?.celular ? 'v3-tela--celular' : '',
    tela ? '' : 'v3-tela--painel',
    pronta ? 'is-pronta' : '',
    ativa ? 'is-ativa' : estado === 'anterior' ? 'is-anterior' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const imagem = tela && (
    <img
      ref={marcarSeJaCarregada}
      className="v3-tela__imagem"
      src={tela.src}
      alt={ativa ? tela.alt : ''}
      width={tela.largura}
      height={tela.altura}
      loading="lazy"
      decoding="async"
      onLoad={() => setPronta(true)}
    />
  )

  return (
    <div className={classe} aria-hidden={ativa && tela ? undefined : true}>
      {!tela ? (
        <div className="v3-tela__painel">
          {/* "No aplicativo", não "Em breve": com a beta.12 o recurso existe, só falta a captura
              (revisão final, 22/10/2026). O texto do cartão não se repete aqui (auditoria P2-14). */}
          <p className="v3-tela__painel-rotulo">No aplicativo</p>
          <p className="v3-tela__painel-texto">{item.titulo}</p>
        </div>
      ) : tela.celular ? (
        <div className="celular">
          <div className="celular__moldura">
            <div className="celular__tela">{imagem}</div>
            <span className="celular__camera" aria-hidden="true" />
          </div>
        </div>
      ) : (
        <div className="v3-tela__moldura">{imagem}</div>
      )}
    </div>
  )
}

function Seta() {
  return (
    <svg className="v3-cartao__seta" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  )
}

function Cartao({
  item,
  indice,
  ativo,
  passado = false,
  parado = false,
  aoFocar,
  aoClicar,
}: {
  item: RecursoDoOlhar
  indice: number
  ativo: boolean
  /** Já ficou para trás na faixa: sai de cena pela esquerda. */
  passado?: boolean
  parado?: boolean
  aoFocar?: () => void
  aoClicar?: () => void
}) {
  const numero = String(indice + 1).padStart(2, '0')
  // Clicar fora do link de um cartão à frente traz o cartão para o meio. Um
  // cartão que já passou está invisível: não é alvo de clique (o CSS também
  // tira o ponteiro dele; aqui fica garantido mesmo sem o CSS).
  const clicar = (e: MouseEvent<HTMLLIElement>) => {
    if (!aoClicar || ativo || passado || (e.target as Element).closest('a')) return
    aoClicar()
  }
  return (
    <li
      className={`v3-cartao${ativo ? ' is-ativo' : ''}${passado ? ' is-passado' : ''}${parado ? ' is-parado' : ''}`}
      aria-current={ativo ? 'step' : undefined}
      onClick={clicar}
    >
      <div className="v3-cartao__topo">
        <span className="v3-cartao__numero" aria-hidden="true">
          {numero}
        </span>
        {/* Só o cartão ativo leva a seta (auditoria P3-10): em todos, ela deixava de indicar algo. */}
        {item.link && ativo && <Seta />}
      </div>
      {parado && item.tela && (
        <div className={`v3-cartao__tela${item.tela.celular ? ' v3-cartao__tela--celular' : ''}`}>
          <img
            src={item.tela.src}
            alt={item.tela.alt}
            width={item.tela.largura}
            height={item.tela.altura}
            loading="lazy"
            decoding="async"
          />
        </div>
      )}
      <h3 className="v3-cartao__titulo">
        {item.link ? (
          <Link to={item.link.to} onFocus={aoFocar}>
            {item.titulo}
          </Link>
        ) : (
          item.titulo
        )}
      </h3>
      <div className="v3-cartao__corpo">
        <p className="v3-cartao__texto">{item.texto}</p>
        <ul className="v3-cartao__pontos">
          {item.pontos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {item.nota && <p className="v3-cartao__nota">{item.nota}</p>}
      </div>
    </li>
  )
}

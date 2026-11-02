import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Reveal } from '@/components/effects/Reveal'
import { DO_OLHAR_AO_CLIQUE as D } from '@/data/home'
import { ParticulasQueFormam, type FormaDoPasso } from './ParticulasQueFormam'
import './do-olhar-ao-clique.css'

type IdDoPasso = (typeof D.passos)[number]['id']

/* Os pontos de um rosto, desenhados à mão numa grade simples: contorno, olhos,
   nariz e boca. É só desenho; não são os pontos que o app usa. */
const ROSTO: [number, number][] = [
  ...Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2
    return [200 + Math.cos(a) * 92, 150 + Math.sin(a) * 118] as [number, number]
  }),
  ...[150, 165, 180].map((x) => [x, 128] as [number, number]),
  ...[220, 235, 250].map((x) => [x, 128] as [number, number]),
  [165, 118], [235, 118], [165, 138], [235, 138],
  [200, 140], [200, 158], [192, 172], [208, 172],
  ...[176, 188, 200, 212, 224].map((x, i) => [x, 205 + (i === 0 || i === 4 ? -4 : 0)] as [number, number]),
]

/** Os 13 pontos da calibração: a grade 3 × 3 e os quatro cantos, dentro da tela desenhada. */
const CALIBRACAO: [number, number][] = [
  [110, 80], [200, 80], [290, 80],
  [110, 150], [200, 150], [290, 150],
  [110, 220], [200, 220], [290, 220],
  [80, 58], [320, 58], [80, 242], [320, 242],
]

/** O desenho de cada passo. Decorativo: o texto do passo diz tudo. */
function Ilustracao({ id }: { id: IdDoPasso }) {
  switch (id) {
    case 'webcam':
      return (
        <svg className="oc-ilustra oc-ilustra--webcam" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
          <rect className="oc-cheio-2" x="110" y="70" width="180" height="120" rx="28" />
          <circle className="oc-cheio-3" cx="200" cy="130" r="44" />
          <g className="oc-lente">
            <circle className="oc-cheio-1" cx="200" cy="130" r="30" />
            <path className="oc-azul" d="M200 100a30 30 0 0 1 26 15l-26 15z" />
            <path className="oc-azul" d="M226 145a30 30 0 0 1-26 15v-30z" />
            <path className="oc-azul" d="M174 145a30 30 0 0 1 0-30l26 15z" />
          </g>
          <circle className="oc-papel" cx="200" cy="130" r="9" />
          <circle className="oc-luz" cx="262" cy="90" r="6" />
          <rect className="oc-cheio-2" x="180" y="190" width="40" height="34" />
          <rect className="oc-cheio-3" x="140" y="224" width="120" height="16" rx="8" />
        </svg>
      )
    case 'rosto':
      return (
        <svg className="oc-ilustra oc-ilustra--rosto" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
          {ROSTO.map(([x, y], i) => (
            <circle key={i} className="oc-ponto" cx={x} cy={y} r="4" style={{ '--i': i } as CSSProperties} />
          ))}
        </svg>
      )
    case 'iris':
      return (
        <svg className="oc-ilustra oc-ilustra--iris" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
          <path className="oc-papel" d="M60 150C110 70 290 70 340 150C290 230 110 230 60 150Z" />
          <g className="oc-olho">
            <circle className="oc-azul" cx="200" cy="150" r="56" />
            <circle className="oc-cheio-1" cx="200" cy="150" r="24" />
            <circle className="oc-papel" cx="212" cy="138" r="7" />
          </g>
          <g className="oc-mira">
            <circle className="oc-traco-iris" cx="200" cy="150" r="70" />
          </g>
        </svg>
      )
    case 'tela':
      return (
        <svg className="oc-ilustra oc-ilustra--tela" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
          <rect className="oc-cheio-2" x="50" y="30" width="300" height="240" rx="18" />
          <rect className="oc-cheio-1" x="62" y="42" width="276" height="216" rx="10" />
          {CALIBRACAO.map(([x, y], i) => (
            <circle key={i} className="oc-alvo" cx={x} cy={y} r="7" style={{ '--i': i } as CSSProperties} />
          ))}
          <circle className="oc-cursor" cx="0" cy="0" r="16" />
        </svg>
      )
    case 'clique':
      return (
        <svg className="oc-ilustra oc-ilustra--clique" viewBox="0 0 400 300" aria-hidden="true" focusable="false">
          <rect className="oc-botao" x="100" y="90" width="200" height="120" rx="24" />
          <text className="oc-botao-texto" x="200" y="164" textAnchor="middle">
            Sim
          </text>
          <rect className="oc-aro-trilho" x="88" y="78" width="224" height="144" rx="34" pathLength={1} />
          <rect className="oc-aro" x="88" y="78" width="224" height="144" rx="34" pathLength={1} />
          <circle className="oc-cursor-parado" cx="236" cy="170" r="16" />
        </svg>
      )
  }
}

/**
 * "Do olhar ao clique" (redesenho de 01/11/2026): como o IrisFlow vai do
 * vídeo da webcam ao clique, em cinco passos (a figura 1 do plano de
 * negócios). No computador, uma história presa à rolagem: o visor fica
 * parado à esquerda e, conforme o passo da direita chega ao meio da tela, uma
 * nuvem de partículas se desfaz e se refaz no desenho dele
 * (ParticulasQueFormam). No celular, cada passo leva o próprio desenho.
 *
 * Os desenhos se mexem só enquanto o passo está ativo, por duas voltas (menos
 * de 5 s), e param. Com movimento reduzido, ficam parados.
 */
export function DoOlharAoClique() {
  const [ativo, setAtivo] = useState(0)
  const passos = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setAtivo(Number((e.target as HTMLElement).dataset.indice))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    passos.current.forEach((p) => p && io.observe(p))
    return () => io.disconnect()
  }, [])

  return (
    <section className="olhar-clique home-faixa" aria-labelledby="olhar-clique-titulo">
      <div className="container olhar-clique__grade">
        <div className="olhar-clique__fixo">
          <Reveal as="header" anim="up">
            <h2 id="olhar-clique-titulo" className="home-titulo">
              {D.titulo}
            </h2>
            <p className="home-sub">{D.texto}</p>
          </Reveal>
          {/* No computador, as partículas formam o desenho de cada passo (no celular, cada passo leva o seu, abaixo). */}
          <div className="olhar-clique__visor" aria-hidden="true">
            <ParticulasQueFormam formas={D.passos.map((p) => p.id as FormaDoPasso)} ativa={ativo} />
            <div className="olhar-clique__marcas">
              {D.passos.map((p, i) => (
                <span key={p.id} className={i === ativo ? 'is-ativo' : i < ativo ? 'is-feito' : ''} />
              ))}
            </div>
          </div>
        </div>

        <ol className="olhar-clique__passos">
          {D.passos.map((p, i) => (
            <li
              key={p.id}
              ref={(el) => {
                passos.current[i] = el
              }}
              data-indice={i}
              className={`olhar-clique__passo${i === ativo ? ' is-ativo' : ''}`}
            >
              <div className="olhar-clique__miniatura" aria-hidden="true">
                <Ilustracao id={p.id} />
              </div>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

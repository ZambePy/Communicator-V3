import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  ORDEM_DA_CALIBRACAO,
  PONTOS_DA_CALIBRACAO,
  curvaDaViagem,
  duracaoDaCalibracao,
  quadroDaCalibracao,
} from './calibracao'
import './calibracao-ao-vivo.css'

type Estado = 'espera' | 'tocando' | 'pausado' | 'fim'

/**
 * A calibração, ponto a ponto (Como funciona, pedido de 20/10/2026): o alvo
 * de fixação do app — o "ABC", disco com a cruz recortada e o ponto no meio —
 * percorre os 13 pontos na ordem de verdade, chega maior e encolhe em cada
 * um, e deixa um ponto pequeno no lugar; no fim, o resultado em palavras,
 * como o app mostra ("Ótima").
 *
 * Começa uma vez, quando a tela da calibração entra na janela, e só anda com
 * ela à vista e a aba aberta. Pausar e ver de novo ficam embaixo (são ~8 s de
 * movimento: WCAG 2.2.2). Com movimento reduzido, o quadro final, parado.
 * O desenho é decorativo; o texto ao lado diz o que ele mostra.
 */
export function CalibracaoAoVivo() {
  const reduzido = useReducedMotion()
  const total = ORDEM_DA_CALIBRACAO.length
  const [estado, setEstado] = useState<Estado>(() => (reduzido ? 'fim' : 'espera'))
  const [feitos, setFeitos] = useState(() => (reduzido ? total : 0))
  const [resultado, setResultado] = useState(reduzido)
  const telaRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const alvoRef = useRef<HTMLSpanElement>(null)
  const escalaRef = useRef<HTMLSpanElement>(null)
  const estadoRef = useRef<Estado>(estado)
  const motor = useRef<{ tocar: () => void; parar: () => void; recomecar: () => void } | null>(null)

  const mudar = (e: Estado) => {
    estadoRef.current = e
    setEstado(e)
  }

  useEffect(() => {
    const tela = telaRef.current
    const area = areaRef.current
    if (!tela || !area) return
    if (reduzido) {
      estadoRef.current = 'fim'
      setEstado('fim')
      setFeitos(total)
      setResultado(true)
      return
    }

    let quadro = 0
    let ultimo: number | null = null
    let tempo = 0
    let visivel = typeof IntersectionObserver === 'undefined'
    let aba = document.visibilityState !== 'hidden'
    let feitosAgora = feitos
    let resultadoAgora = resultado
    // As posições valem na área de dentro da tela: o alvo dos pontos da borda
    // (5 %) chega 1,5× maior e não pode sair cortado pela moldura.
    let medida = area.getBoundingClientRect()

    const pintar = (t: number) => {
      const q = quadroDaCalibracao(t)
      if (q.feitos !== feitosAgora) {
        feitosAgora = q.feitos
        setFeitos(q.feitos)
      }
      const comResultado = q.resultado > 0
      if (comResultado !== resultadoAgora) {
        resultadoAgora = comResultado
        setResultado(comResultado)
      }
      const alvo = alvoRef.current
      const escala = escalaRef.current
      if (!alvo || !escala) return q
      if (!q.alvo) {
        alvo.style.opacity = '0'
        return q
      }
      const { de, para, viagem } = q.alvo
      const f = curvaDaViagem(viagem)
      const x = (de ? de.x + (para.x - de.x) * f : para.x) * medida.width
      const y = (de ? de.y + (para.y - de.y) * f : para.y) * medida.height
      alvo.style.opacity = q.alvo.visivel.toFixed(3)
      alvo.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      escala.style.transform = `scale(${q.alvo.escala.toFixed(3)})`
      return q
    }

    function tique(agora: number) {
      quadro = 0
      const dt = ultimo === null ? 16 : Math.min(50, agora - ultimo)
      ultimo = agora
      tempo += dt
      const q = pintar(tempo)
      if (q.fim) {
        mudar('fim')
        ultimo = null
        return
      }
      agendar()
    }

    const agendar = () => {
      if (!quadro && visivel && aba && estadoRef.current === 'tocando') quadro = window.requestAnimationFrame(tique)
    }
    const parar = () => {
      if (quadro) window.cancelAnimationFrame(quadro)
      quadro = 0
      ultimo = null
    }

    const tocar = () => {
      medida = area.getBoundingClientRect()
      mudar('tocando')
      agendar()
    }

    const recomecar = () => {
      parar()
      tempo = 0
      pintar(0)
      tocar()
    }

    motor.current = { tocar, parar, recomecar }

    let io: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entradas) => {
          const e = entradas[entradas.length - 1]
          // Começa quando a tela entra de verdade (metade dela à vista), uma vez.
          visivel = e.isIntersecting
          if (visivel && estadoRef.current === 'espera' && e.intersectionRatio >= 0.5) tocar()
          else if (visivel) agendar()
          else parar()
        },
        { threshold: [0, 0.5] },
      )
      io.observe(tela)
    } else if (estadoRef.current === 'espera') {
      tocar()
    }
    const aoMudarAba = () => {
      aba = document.visibilityState !== 'hidden'
      if (aba) agendar()
      else parar()
    }
    document.addEventListener('visibilitychange', aoMudarAba)
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        medida = area.getBoundingClientRect()
      })
      ro.observe(tela)
    }
    return () => {
      parar()
      io?.disconnect()
      ro?.disconnect()
      document.removeEventListener('visibilitychange', aoMudarAba)
      motor.current = null
    }
    // `feitos` e `resultado` entram só como valor inicial do laço: o efeito
    // não recomeça quando eles mudam (é o próprio laço que os muda).
  }, [reduzido, total])

  const alternar = () => {
    if (estado === 'tocando') {
      mudar('pausado')
      motor.current?.parar()
    } else if (estado === 'pausado') {
      motor.current?.tocar()
    } else if (estado === 'fim') {
      motor.current?.recomecar()
    }
  }

  const feitosNaOrdem = new Set(ORDEM_DA_CALIBRACAO.slice(0, feitos))

  return (
    <figure className="calib">
      <div ref={telaRef} className={`calib__tela${estado === 'fim' || resultado ? ' is-concluida' : ''}`} aria-hidden="true">
        <div ref={areaRef} className="calib__area">
        {PONTOS_DA_CALIBRACAO.map((p, i) => (
          <span
            key={i}
            className={`calib__ponto${feitosNaOrdem.has(i) ? ' is-feito' : ''}`}
            style={{ '--x': `${(p.x * 100).toFixed(2)}%`, '--y': `${(p.y * 100).toFixed(2)}%` } as CSSProperties}
          />
        ))}
        <span ref={alvoRef} className="calib__alvo">
          <span ref={escalaRef} className="calib__abc">
            <span className="calib__disco" />
            <span className="calib__cruz" />
            <span className="calib__centro" />
          </span>
        </span>
        {resultado && (
          <p className="calib__resultado">
            <strong>Ótima</strong>
            <span>O sistema entendeu bem o seu olhar. Pode usar.</span>
          </p>
        )}
        </div>
      </div>
      <figcaption className="calib__legenda">
        <span>Os 13 pontos na ordem em que o app os mostra, numa tela 16:9.</span>
        {!reduzido && estado !== 'espera' && (
          <button
            type="button"
            className="calib__controle"
            onClick={alternar}
            aria-label={
              estado === 'tocando'
                ? 'Pausar a calibração'
                : estado === 'pausado'
                  ? 'Continuar a calibração'
                  : 'Ver de novo a calibração'
            }
          >
            {estado === 'tocando' ? 'Pausar' : estado === 'pausado' ? 'Continuar' : 'Ver de novo'}
          </button>
        )}
      </figcaption>
      <span className="sr-only">
        Animação de cerca de {Math.round(duracaoDaCalibracao() / 1000)} segundos: o alvo da calibração passa
        pelos 13 pontos da tela, do centro aos cantos, numa ordem que não segue as linhas, e no fim aparece o
        resultado: “Ótima”.
      </span>
    </figure>
  )
}

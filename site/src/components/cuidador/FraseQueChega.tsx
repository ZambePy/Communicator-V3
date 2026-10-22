import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import './frase-que-chega.css'

type Estado = 'espera' | 'tocando' | 'final'

/**
 * A frase que chega ao celular de quem cuida (página do Cuidador, pedido de
 * 20/10/2026): a frase escrita com o olhar sai da tela do computador, viaja
 * em curva até o celular, ele vibra duas vezes de leve, e quem cuida responde
 * com a resposta rápida "Já estou indo" — que o app fala na tela do paciente
 * ("falado na tela", embaixo da resposta). É a conversa do app: as respostas
 * rápidas e o "falado na tela" são os da tela de Conversa do IrisFlow
 * Cuidador. Um aviso da resposta também no notebook saiu antes da entrega:
 * repetia o "falado na tela" e, no celular, cobria o teclado.
 *
 * Uma vez, quando a cena entra na janela; "Ver de novo" repete. O voo é feito
 * só com transform, em três camadas (horizontal, vertical e escala), a partir
 * das posições medidas da frase e do balão. Com movimento reduzido: o quadro
 * final, parado. Decorativo: a legenda diz o que a cena mostra.
 */
export function FraseQueChega() {
  const reduzido = useReducedMotion()
  const [estado, setEstado] = useState<Estado>(() => (reduzido ? 'final' : 'espera'))
  const [rodada, setRodada] = useState(0)
  const figuraRef = useRef<HTMLElement>(null)
  const cenaRef = useRef<HTMLDivElement>(null)
  const origemRef = useRef<HTMLSpanElement>(null)
  const destinoRef = useRef<HTMLParagraphElement>(null)

  /**
   * Mede de onde a frase sai e onde ela chega, ANTES de o voo começar, e
   * deixa o caminho em variáveis na figura (que não é montada de novo no
   * "Ver de novo"): o mesmo voo serve para qualquer largura de tela.
   */
  const medirVoo = () => {
    const figura = figuraRef.current
    const cena = cenaRef.current
    const origem = origemRef.current
    const destino = destinoRef.current
    if (!figura || !cena || !origem || !destino) return
    const base = cena.getBoundingClientRect()
    const a = origem.getBoundingClientRect()
    const b = destino.getBoundingClientRect()
    if (!(a.width > 0 && b.width > 0 && a.height > 0)) return
    const dx = b.left + b.width / 2 - (a.left + a.width / 2)
    const dy = b.top + b.height / 2 - (a.top + a.height / 2)
    // O arco sobe acima dos dois pontos: a frase "pula" de um aparelho ao outro.
    const arco = Math.max(36, Math.abs(dx) * 0.26)
    const v = (nome: string, valor: string) => figura.style.setProperty(nome, valor)
    v('--x0', `${(a.left - base.left).toFixed(1)}px`)
    v('--y0', `${(a.top - base.top).toFixed(1)}px`)
    v('--largura', `${a.width.toFixed(1)}px`)
    v('--altura', `${a.height.toFixed(1)}px`)
    v('--dx', `${dx.toFixed(1)}px`)
    v('--dy', `${dy.toFixed(1)}px`)
    v('--pico', `${(Math.min(0, dy) - arco).toFixed(1)}px`)
    // A frase encolhe até o corpo de letra do balão do celular (a altura não
    // serve: no celular estreito o balão quebra em duas linhas).
    const corpo = (el: Element) => parseFloat(getComputedStyle(el).fontSize) || 1
    v('--escala', Math.min(1.2, Math.max(0.5, corpo(destino) / corpo(origem))).toFixed(3))
  }

  useEffect(() => {
    if (reduzido) setEstado('final')
  }, [reduzido])

  // Toca uma vez, quando ao menos metade da cena está à vista.
  useEffect(() => {
    const cena = cenaRef.current
    if (!cena || reduzido || estado !== 'espera') return
    if (typeof IntersectionObserver === 'undefined') {
      medirVoo()
      setEstado('tocando')
      return
    }
    const io = new IntersectionObserver(
      (entradas) => {
        const e = entradas[entradas.length - 1]
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          io.disconnect()
          medirVoo()
          setEstado('tocando')
        }
      },
      { threshold: [0, 0.5] },
    )
    io.observe(cena)
    return () => io.disconnect()
  }, [reduzido, estado, rodada])

  const verDeNovo = () => {
    medirVoo()
    setRodada((r) => r + 1)
    setEstado('tocando')
  }

  return (
    <figure ref={figuraRef} className="chega">
      <div key={rodada} ref={cenaRef} className={`chega__cena is-${estado}`} aria-hidden="true">
        <div className="chega__notebook">
          <div className="chega__tela">
            <div className="chega__linha">
              <span ref={origemRef} className="chega__frase">
                Estou com sede.
              </span>
              <span className="chega__cursor" />
            </div>
            <div className="chega__teclas">
              {['A B C', 'G H I', 'M N O', 'S T U', 'Y Z', 'EU SIM'].map((g) => (
                <span key={g}>{g}</span>
              ))}
            </div>
          </div>
          <span className="chega__base" />
        </div>

        <div className="chega__celular">
          <div className="chega__aparelho">
            <div className="chega__topo">
              <span className="chega__avatar">CS</span>
              <span className="chega__nome">Carlos</span>
            </div>
            <div className="chega__conversa">
              <p ref={destinoRef} className="chega__bolha chega__bolha--dele">
                Estou com sede.
              </p>
              <p className="chega__bolha chega__bolha--sua">Já estou indo</p>
              <p className="chega__status">falado na tela</p>
            </div>
            <div className="chega__respostas">
              <span>Sim</span>
              <span className="chega__escolhida">Já estou indo</span>
            </div>
          </div>
        </div>

        <span className="chega__voo">
          <span className="chega__voo-y">
            <span className="chega__voo-bolha">Estou com sede.</span>
          </span>
        </span>
      </div>
      <figcaption className="chega__legenda">
        <span>O que a pessoa diz no computador chega ao celular de quem cuida. A resposta é falada na tela dela.</span>
        {!reduzido && estado !== 'espera' && (
          <button type="button" className="chega__controle" onClick={verDeNovo} aria-label="Ver de novo a frase chegando ao celular">
            Ver de novo
          </button>
        )}
      </figcaption>
    </figure>
  )
}

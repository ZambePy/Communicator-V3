import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useMidia } from './useMidia'
import './luz-do-olhar.css'

/** Constante de tempo da luz: ela cobre ~63 % do caminho em 240 ms, como um ponto de olhar que acompanha com atraso. */
const TAU_MS = 240
/** Perto disso do alvo, a luz chegou: o laço para de pedir quadros. */
const CHEGOU_PX = 0.4
const SO_MODIFICADORAS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/**
 * A luz do olhar (rodada 3, 21/10/2026): no fundo da página inteira, uma luz
 * suave no azul da marca, grande e de baixa opacidade, segue o ponteiro com
 * atraso — o ponto de olhar que acompanha, devagar, o que a pessoa olha.
 *
 * - Só com ponteiro fino (mouse): no toque, nem existe. Some no toque, no
 *   teclado (Tab, setas…) e ao sair da janela; volta com o mouse.
 * - Com movimento reduzido, nem existe.
 * - Só `transform` e `opacity`. O laço de quadros anda só enquanto a luz está
 *   chegando ao ponteiro e é cancelado com a aba escondida.
 * - Não pega clique. "Atrás de tudo": o CSS a mistura com `lighten`, que só
 *   clareia o que é mais escuro que ela — o fundo recebe a luz, o texto (mais
 *   claro) fica exatamente como estava; ver luz-do-olhar.css.
 * - Mora no <body> (portal), como o anel do ponteiro (CursorDeFixacao).
 */
export function LuzDoOlhar() {
  const fino = useMidia('(hover: hover) and (pointer: fine)')
  const reduzido = useReducedMotion()
  if (!fino || reduzido || typeof document === 'undefined') return null
  return createPortal(<LuzSeguindo />, document.body)
}

function LuzSeguindo() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let x = 0
    let y = 0
    let alvoX = 0
    let alvoY = 0
    let quadro = 0
    let ultimo = 0
    let visivel = false

    const abaEscondida = () => document.visibilityState === 'hidden'

    function laco(agora: number) {
      quadro = 0
      // Passo por tempo, não por quadro: a luz acompanha igual a 60 ou a 144 Hz.
      const dt = ultimo ? Math.min(64, agora - ultimo) : 16
      ultimo = agora
      const k = 1 - Math.exp(-dt / TAU_MS)
      x += (alvoX - x) * k
      y += (alvoY - y) * k
      el!.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      if (Math.abs(alvoX - x) + Math.abs(alvoY - y) > CHEGOU_PX) pedir()
      else ultimo = 0
    }
    function pedir() {
      if (!quadro && visivel && !abaEscondida()) quadro = window.requestAnimationFrame(laco)
    }
    function parar() {
      if (quadro) window.cancelAnimationFrame(quadro)
      quadro = 0
      ultimo = 0
    }
    function esconder() {
      visivel = false
      parar()
      el!.classList.remove('is-visivel')
    }

    const mover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') {
        esconder()
        return
      }
      alvoX = e.clientX
      alvoY = e.clientY
      if (!visivel) {
        // Aparece já no lugar, sem vir deslizando do canto.
        visivel = true
        x = alvoX
        y = alvoY
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        el.classList.add('is-visivel')
      }
      pedir()
    }
    const tocar = (e: PointerEvent) => {
      if (e.pointerType === 'touch') esconder()
    }
    const teclar = (e: KeyboardEvent) => {
      if (!SO_MODIFICADORAS.has(e.key)) esconder()
    }
    const sair = (e: PointerEvent) => {
      if (!e.relatedTarget) esconder()
    }
    const aoMudarAba = () => {
      if (abaEscondida()) parar()
      else pedir()
    }

    document.addEventListener('pointermove', mover, { passive: true })
    document.addEventListener('pointerdown', tocar, { passive: true })
    document.addEventListener('pointerout', sair, { passive: true })
    document.addEventListener('keydown', teclar)
    document.addEventListener('visibilitychange', aoMudarAba)
    return () => {
      document.removeEventListener('pointermove', mover)
      document.removeEventListener('pointerdown', tocar)
      document.removeEventListener('pointerout', sair)
      document.removeEventListener('keydown', teclar)
      document.removeEventListener('visibilitychange', aoMudarAba)
      parar()
    }
  }, [])

  return <div ref={ref} className="v3-luz" aria-hidden="true" />
}

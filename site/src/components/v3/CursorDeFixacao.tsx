import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useMidia } from './useMidia'
import './cursor.css'

/** O que é clicável: o anel enche sobre isso. */
const CLICAVEL =
  'a[href], button:not(:disabled), [role="button"], [role="tab"], [role="link"], summary, label[for], select, input:not([type="hidden"]):not(:disabled), textarea'

/**
 * O anel de fixação que acompanha o ponteiro (rodada 3, 21/10/2026): o
 * cursor do vídeo de referência, trocado pelo gesto do próprio IrisFlow —
 * sobre o que é clicável, o aro enche, como o alvo do app enche com o olhar
 * parado; no clique, fecha de vez.
 *
 * - Só com mouse (ponteiro fino e passar por cima); nunca no toque, e nunca
 *   com movimento reduzido.
 * - A seta do sistema continua lá: o anel anda em volta dela, um pouco
 *   atrasado (como um cursor de olhar). Quem usa um cursor ampliado do
 *   sistema não perde o seu.
 * - Nos botões de chamada, que já têm o próprio aro, o anel só cresce.
 * - Mora no <body> (portal), para ficar por cima do cabeçalho fixo.
 */
export function CursorDeFixacao() {
  const fino = useMidia('(hover: hover) and (pointer: fine)')
  const reduzido = useReducedMotion()
  if (!fino || reduzido || typeof document === 'undefined') return null
  return createPortal(<AnelDoCursor />, document.body)
}

function AnelDoCursor() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let x = 0
    let y = 0
    let alvoX = 0
    let alvoY = 0
    let quadro = 0
    let visivel = false

    const laco = () => {
      quadro = 0
      // O atraso de um cursor de olhar: anda um terço do caminho por quadro.
      x += (alvoX - x) * 0.34
      y += (alvoY - y) * 0.34
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      if (Math.abs(alvoX - x) + Math.abs(alvoY - y) > 0.4) quadro = window.requestAnimationFrame(laco)
    }
    const esconder = () => {
      visivel = false
      el.classList.remove('is-visivel', 'is-sobre', 'is-sobre-chamada', 'is-confirmado')
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
        el.classList.add('is-visivel')
      }
      if (!quadro) quadro = window.requestAnimationFrame(laco)
    }
    const sobre = (e: PointerEvent) => {
      const alvo = e.target instanceof Element ? e.target.closest(CLICAVEL) : null
      const chamada = !!alvo?.closest('.btn--chamada')
      el.classList.toggle('is-sobre', !!alvo && !chamada)
      el.classList.toggle('is-sobre-chamada', chamada)
    }
    const apertar = () => el.classList.add('is-confirmado')
    const soltar = () => el.classList.remove('is-confirmado')
    const sair = (e: PointerEvent) => {
      if (!e.relatedTarget) esconder()
    }

    document.addEventListener('pointermove', mover, { passive: true })
    document.addEventListener('pointerover', sobre, { passive: true })
    document.addEventListener('pointerdown', apertar, { passive: true })
    document.addEventListener('pointerup', soltar, { passive: true })
    document.addEventListener('pointerout', sair, { passive: true })
    return () => {
      document.removeEventListener('pointermove', mover)
      document.removeEventListener('pointerover', sobre)
      document.removeEventListener('pointerdown', apertar)
      document.removeEventListener('pointerup', soltar)
      document.removeEventListener('pointerout', sair)
      if (quadro) window.cancelAnimationFrame(quadro)
    }
  }, [])

  return (
    <div ref={ref} className="v3-cursor" aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <circle className="v3-cursor__trilho" cx="24" cy="24" r="21" />
        <circle className="v3-cursor__aro" cx="24" cy="24" r="21" pathLength={1} />
      </svg>
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import './nav-pilula.css'

export type ItemDaNav = { to: string; label: string; selo?: ReactNode; destaque?: boolean }

/** Folga da pílula além da área do link (que já tem o próprio respiro), em px. */
const FOLGA = 0
/** Mola da borda que vai na frente (chega primeiro) e da que vem atrás. */
const K_FRENTE = 620
const K_ATRAS = 260
const AMORTECIMENTO = 0.8

type Borda = { x: number; v: number; alvo: number }

/**
 * Navegação com uma pílula de vidro que vai até o link sob o mouse (ou com o
 * foco) e descansa no link da página atual. Cada borda da pílula tem a sua
 * mola: a da frente é mais firme e chega antes, então a pílula estica no
 * caminho e se recolhe ao chegar. Por baixo dela o rótulo acende — a camada
 * acesa é recortada exatamente pelas bordas da pílula, quadro a quadro.
 *
 * Com movimento reduzido, a pílula só troca de lugar, sem trajeto.
 */
export function NavPilula({ itens, rotulo }: { itens: ItemDaNav[]; rotulo: string }) {
  const navRef = useRef<HTMLElement>(null)
  const links = useRef<(HTMLAnchorElement | null)[]>([])
  const { pathname } = useLocation()
  const reduzido = useReducedMotion()
  const [sobre, setSobre] = useState<number | null>(null)
  const [medida, setMedida] = useState(0)

  const ativo = itens.findIndex((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))
  const indice = sobre ?? (ativo >= 0 ? ativo : null)

  const esq = useRef<Borda>({ x: 0, v: 0, alvo: 0 })
  const dir = useRef<Borda>({ x: 0, v: 0, alvo: 0 })
  const visivel = useRef(false)
  const quadro = useRef(0)
  const ultimo = useRef(0)

  const pintar = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    nav.style.setProperty('--pilula-esq', `${esq.current.x.toFixed(2)}px`)
    nav.style.setProperty('--pilula-dir', `${dir.current.x.toFixed(2)}px`)
    nav.style.setProperty('--pilula-visivel', visivel.current ? '1' : '0')
  }, [])

  const passo = useCallback(
    (t: number) => {
      const dt = Math.min(0.034, ultimo.current ? (t - ultimo.current) / 1000 : 1 / 60)
      ultimo.current = t
      const indoParaDireita = esq.current.alvo + dir.current.alvo > esq.current.x + dir.current.x
      const molas: [Borda, number][] = [
        [esq.current, indoParaDireita ? K_ATRAS : K_FRENTE],
        [dir.current, indoParaDireita ? K_FRENTE : K_ATRAS],
      ]
      let parado = true
      for (const [b, k] of molas) {
        const a = k * (b.alvo - b.x) - 2 * AMORTECIMENTO * Math.sqrt(k) * b.v
        b.v += a * dt
        b.x += b.v * dt
        if (Math.abs(b.alvo - b.x) > 0.3 || Math.abs(b.v) > 3) parado = false
      }
      if (parado) {
        for (const [b] of molas) {
          b.x = b.alvo
          b.v = 0
        }
      }
      pintar()
      quadro.current = parado ? 0 : window.requestAnimationFrame(passo)
    },
    [pintar],
  )

  useLayoutEffect(() => {
    const nav = navRef.current
    const link = indice === null ? null : links.current[indice]
    if (!nav) return
    if (!link) {
      visivel.current = false
      pintar()
      return
    }
    const rn = nav.getBoundingClientRect()
    const rl = link.getBoundingClientRect()
    const alvoEsq = rl.left - rn.left - FOLGA
    const alvoDir = rl.right - rn.left + FOLGA
    esq.current.alvo = alvoEsq
    dir.current.alvo = alvoDir
    // Aparecendo agora, ou sem movimento: vai direto, sem trajeto.
    if (!visivel.current || reduzido) {
      esq.current = { x: alvoEsq, v: 0, alvo: alvoEsq }
      dir.current = { x: alvoDir, v: 0, alvo: alvoDir }
      visivel.current = true
      pintar()
      return
    }
    if (!quadro.current) {
      ultimo.current = 0
      quadro.current = window.requestAnimationFrame(passo)
    }
  }, [indice, reduzido, medida, pintar, passo])

  // A largura dos links muda com a janela e quando a fonte termina de carregar.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const remedir = () => {
      visivel.current = false
      setMedida((m) => m + 1)
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(remedir) : null
    ro?.observe(nav)
    void document.fonts?.ready?.then(remedir)
    return () => {
      ro?.disconnect()
      window.cancelAnimationFrame(quadro.current)
    }
  }, [])

  return (
    <nav
      ref={navRef}
      className="nav-pilula"
      aria-label={rotulo}
      onMouseLeave={() => setSobre(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null)
      }}
    >
      <span className="nav-pilula__vidro" aria-hidden="true" />
      <div className="nav-pilula__links">
        {itens.map((item, i) => (
          <NavLink
            key={item.to}
            to={item.to}
            ref={(el) => {
              links.current[i] = el
            }}
            className={`nav-pilula__link${item.destaque ? ' nav-pilula__link--destaque' : ''}`}
            onMouseEnter={() => setSobre(i)}
            onFocus={() => setSobre(i)}
          >
            <span className="nav-pilula__texto">{item.label}</span>
            {item.selo}
          </NavLink>
        ))}
      </div>
      {/* A mesma fileira, acesa, recortada pela pílula. Só visual. */}
      <div className="nav-pilula__links nav-pilula__links--aceso" aria-hidden="true">
        {itens.map((item) => (
          <span key={item.to} className={`nav-pilula__link${item.destaque ? ' nav-pilula__link--destaque' : ''}`}>
            <span className="nav-pilula__texto">{item.label}</span>
            {item.selo}
          </span>
        ))}
      </div>
    </nav>
  )
}

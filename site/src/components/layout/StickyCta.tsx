import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { BETA, BETA_CTA } from '@/data/content'
import './sticky-cta.css'

/** Rotas em que a própria página já é o destino da chamada (ou um fluxo). */
const HIDDEN_ON = [
  '/beta',
  '/cadastro',
  '/pagamento',
  '/sucesso',
  '/entrar',
  '/recuperar-senha',
  '/nova-senha',
  '/conta',
]

const DISMISS_KEY = 'irisflow:sticky-cta-fechado'

function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** Algum elemento marcado com data-sticky-hide está na tela? */
function blockerInView(): boolean {
  const vh = window.innerHeight
  for (const el of document.querySelectorAll('[data-sticky-hide]')) {
    const r = el.getBoundingClientRect()
    if (r.bottom > 0 && r.top < vh && r.height > 0) return true
  }
  return false
}

function typing(): boolean {
  const el = document.activeElement
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)
}

/**
 * Barra fixa de chamada no celular (só aparece até 720 px, via CSS).
 *
 * Some sozinha quando não ajuda: enquanto o botão do hero, um formulário
 * ou o rodapé está visível (qualquer elemento com `data-sticky-hide`),
 * com o teclado aberto, nas rotas de fluxo e enquanto o aviso de cookies
 * ocupa a base da tela. Tem botão de fechar, lembrado até o fim da visita.
 * Respeita a área segura inferior (iPhone com barra de gestos).
 */
export function StickyCta() {
  const { pathname } = useLocation()
  const [dismissed, setDismissed] = useState(readDismissed)
  const [blocked, setBlocked] = useState(true)
  const hiddenRoute = HIDDEN_ON.some((r) => pathname.startsWith(r))

  useEffect(() => {
    if (dismissed || hiddenRoute) return
    let frame = 0
    const check = () => {
      frame = 0
      setBlocked(window.scrollY < 80 || blockerInView() || typing())
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check)
    }
    check()
    // As páginas chegam por lazy(): confere de novo quando o conteúdo entra.
    const late = window.setTimeout(check, 600)
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    document.addEventListener('focusin', schedule)
    document.addEventListener('focusout', schedule)
    return () => {
      window.clearTimeout(late)
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('focusin', schedule)
      document.removeEventListener('focusout', schedule)
    }
  }, [dismissed, hiddenRoute, pathname])

  if (dismissed || hiddenRoute) return null

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* sem armazenamento: fecha só agora */
    }
    setDismissed(true)
  }

  return (
    <aside
      className={`sticky-cta${blocked ? '' : ' is-visible'}`}
      aria-label="Atalho para a beta gratuita"
    >
      <div className="sticky-cta__inner">
        {BETA.ativo ? (
          <Button to={BETA_CTA.to} full className="sticky-cta__btn">
            {BETA_CTA.labelLong}
          </Button>
        ) : (
          <Button to="/cadastro" full className="sticky-cta__btn">
            Testar grátis
          </Button>
        )}
        <button
          type="button"
          className="sticky-cta__close"
          onClick={dismiss}
          aria-label="Fechar atalho"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </aside>
  )
}

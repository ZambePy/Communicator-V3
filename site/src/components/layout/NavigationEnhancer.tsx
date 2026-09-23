import { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { isRouteLoaded, preloadRoute } from '@/routes'
import { prefersReducedMotion } from '@/hooks/useReducedMotion'

/* ============================================================
   Duas melhorias de navegação, sem dependência nova:

   1. Pré-carregamento: ao passar o mouse ou focar um link interno, o
      pedaço da rota já começa a baixar. Quando a pessoa clica, quase
      sempre está pronto — e o esqueleto de carregamento nem aparece.

   2. Transição de rota com a View Transitions API, quando o navegador
      tem `document.startViewTransition` e a pessoa não pediu menos
      movimento. O clique é interceptado na fase de captura (antes do
      <Link> do react-router), a navegação roda dentro de flushSync e o
      navegador cruza as duas imagens da página. Onde a API não existe,
      nada é interceptado e vale o fade do `.anim-page` de sempre.

   O BrowserRouter não expõe a API de view transitions (só o data router),
   por isso a interceptação é feita aqui.
   ============================================================ */

type DocWithVT = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => { finished: Promise<void> }
}

function internalHref(target: EventTarget | null): string | null {
  const a = (target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a) return null
  if (a.target && a.target !== '_self') return null
  if (a.hasAttribute('download') || a.getAttribute('rel')?.includes('external')) return null
  const href = a.getAttribute('href') ?? ''
  if (!href.startsWith('/') || href.startsWith('//')) return null
  return href
}

export function NavigationEnhancer() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const vt = (document as DocWithVT).startViewTransition
    if (typeof vt === 'function') document.documentElement.classList.add('vt')

    const onHint = (e: Event) => {
      const href = internalHref(e.target)
      if (href) void preloadRoute(href)
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const href = internalHref(e.target)
      if (!href) return
      const start = (document as DocWithVT).startViewTransition
      if (typeof start !== 'function' || prefersReducedMotion()) return

      const current = location.pathname + location.search + location.hash
      if (href === current) return

      e.preventDefault()
      e.stopPropagation()

      const go = () => {
        start.call(document, () => {
          flushSync(() => navigate(href))
        })
      }

      // Se o pedaço ainda não chegou, espera um pouco por ele (até 350 ms):
      // a transição cruza para a página pronta, não para o esqueleto.
      if (isRouteLoaded(href)) {
        go()
      } else {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          go()
        }
        void preloadRoute(href).then(finish)
        window.setTimeout(finish, 350)
      }
    }

    document.addEventListener('mouseover', onHint, { passive: true })
    document.addEventListener('focusin', onHint, { passive: true })
    document.addEventListener('touchstart', onHint, { passive: true })
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('mouseover', onHint)
      document.removeEventListener('focusin', onHint)
      document.removeEventListener('touchstart', onHint)
      document.removeEventListener('click', onClick, true)
    }
  }, [navigate, location])

  return null
}

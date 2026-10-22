import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isRouteLoaded, preloadRoute } from '@/routes'
import { prefersReducedMotion } from '@/hooks/useReducedMotion'
import { aguardarPaginaNova, depoisDaPintura, interceptarParaPiscar, piscar, type Palpebras } from './piscada'

/* ============================================================
   Duas melhorias de navegação, sem dependência nova:

   1. Pré-carregamento: ao passar o mouse ou focar um link interno, o
      pedaço da rota já começa a baixar. Quando a pessoa clica, quase
      sempre está pronto — e o esqueleto de carregamento nem aparece.

   2. A piscada entre páginas (piscada.ts, 20/10/2026). O clique num link
      para outra página é interceptado na fase de captura (antes do <Link>
      do react-router): as pálpebras fecham sobre a página antiga, o
      roteador troca a rota por baixo delas, a página nova é montada e
      pintada uma vez — e só então elas abrem. Em todos os navegadores: a
      capa é do DOM, sem a View Transitions API (até 20/10/2026 a troca
      usava a API, com o cruzamento das duas imagens da página). Com
      movimento reduzido, nada é interceptado.
   ============================================================ */

function internalHref(target: EventTarget | null): string | null {
  const a = (target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a) return null
  if (a.target && a.target !== '_self') return null
  if (a.hasAttribute('download') || a.getAttribute('rel')?.includes('external')) return null
  const href = a.getAttribute('href') ?? ''
  if (!href.startsWith('/') || href.startsWith('//')) return null
  return href
}

type Piscada = { palpebras: Palpebras; fase: 'fechando' | 'abrindo' }

export function NavigationEnhancer() {
  const navigate = useNavigate()
  const location = useLocation()
  // Lido no clique: o ouvinte não precisa ser trocado a cada rota.
  const onde = useRef(location.pathname)
  onde.current = location.pathname
  // A piscada em curso, se houver.
  const atual = useRef<Piscada | null>(null)

  useEffect(() => {
    const onHint = (e: Event) => {
      const href = internalHref(e.target)
      if (href) void preloadRoute(href)
    }

    const onClick = (e: MouseEvent) => {
      const href = internalHref(e.target)
      const intercepta = interceptarParaPiscar({
        href,
        pathnameAtual: onde.current,
        botao: e.button,
        comModificador: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
        jaTratado: e.defaultPrevented,
        reduzido: prefersReducedMotion(),
      })
      if (!intercepta || !href) return

      // Só o padrão: o <Link> vê `defaultPrevented` e não navega, mas o
      // onClick de quem o usa roda — a gaveta do celular fecha já no toque, e
      // a piscada não acontece escondida atrás dela.
      e.preventDefault()
      // Com as pálpebras fechando, o destino já foi escolhido: o segundo
      // clique não faz nada. Abrindo, a página nova já responde: o clique
      // começa outra piscada.
      if (atual.current?.fase === 'fechando') return
      atual.current?.palpebras.tirar()

      const palpebras = piscar()
      const esta: Piscada = { palpebras, fase: 'fechando' }
      atual.current = esta
      // As pálpebras fecham já no clique; enquanto isso o pedaço da rota
      // termina de chegar (até 350 ms; preloadRoute nunca rejeita).
      const pedaco = isRouteLoaded(href)
        ? Promise.resolve()
        : Promise.race([preloadRoute(href), new Promise<void>((r) => window.setTimeout(r, 350))])

      void Promise.all([palpebras.fechadas, pedaco])
        .then(async () => {
          navigate(href)
          await aguardarPaginaNova(href)
          await depoisDaPintura()
        })
        .catch(() => {
          // Uma falha aqui não pode prender a pessoa na página fechada.
          navigate(href)
        })
        .finally(() => {
          if (atual.current !== esta) return
          esta.fase = 'abrindo'
          void palpebras.abrir().then(() => {
            if (atual.current === esta) atual.current = null
          })
        })
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
  }, [navigate])

  // Desmontado no meio de uma piscada, a capa não fica na tela. (Só ao
  // desmontar: o efeito de cima roda de novo a cada rota, porque o
  // `navigate` do BrowserRouter muda com ela, e a piscada continua.)
  useEffect(
    () => () => {
      atual.current?.palpebras.tirar()
      atual.current = null
    },
    [],
  )

  return null
}

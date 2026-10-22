import { Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { NavigationEnhancer } from './NavigationEnhancer'
import { CookieNotice } from './CookieNotice'
import { StickyCta } from './StickyCta'
import { FundoDaPaginaProvider } from './FundoDaPagina'
import { LuzDoOlhar } from '@/components/v3/LuzDoOlhar'
import { FronteiraDeErro } from './FronteiraDeErro'
import { RouteMeta } from '@/hooks/useDocumentMeta'
import { SkeletonCard } from '@/components/ui/Skeleton'
import './layout.css'

/** Rola para o topo, ou para a âncora, a cada mudança de rota.
 *
 *  As páginas entram por `lazy()`, então no instante em que este efeito roda
 *  o que está montado costuma ser o fallback do `<Suspense>` — o alvo da
 *  âncora ainda não existe no DOM. Por isso a busca é repetida a cada quadro
 *  por uma janela curta, em vez de desistir na primeira tentativa e mandar a
 *  página para o topo (era o que fazia `/contato#validacao` cair no começo
 *  da página em vez de no programa de validação). Passada a janela, aí sim
 *  vai para o topo: a âncora não vai aparecer mais. */
function ScrollManager() {
  const { pathname, hash } = useLocation()

  // Sem âncora, o topo vai ANTES da pintura (layout effect): a página nova
  // nunca aparece um quadro na altura da anterior — e, na piscada entre
  // páginas (piscada.ts), as pálpebras abrem sobre ela já no topo.
  useLayoutEffect(() => {
    if (!hash) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname, hash])

  useEffect(() => {
    if (!hash) return

    let frame = 0
    const deadline = Date.now() + 2500

    const tentar = () => {
      let el: Element | null = null
      try {
        el = document.querySelector(hash)
      } catch {
        el = null // hash que não é seletor CSS válido
      }
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      if (Date.now() < deadline) {
        frame = window.requestAnimationFrame(tentar)
        return
      }
      // Estourou a janela de espera: a âncora não existe nesta rota (link
      // velho, id renomeado, seletor inválido). Desistir sem fazer nada
      // deixava a página nova exibida a partir do scroll da anterior, no meio
      // do conteúdo. O topo é o mesmo destino de uma navegação sem hash.
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    }

    tentar()
    return () => window.cancelAnimationFrame(frame)
  }, [pathname, hash])

  return null
}

/**
 * Exibido enquanto o pedaço da rota ainda está chegando — mas só depois
 * de 200 ms. Numa navegação rápida (pedaço já em cache ou pré-carregado)
 * o esqueleto piscaria por um quadro e chamaria mais atenção do que o
 * espaço vazio. Fica dentro do <main>: cabeçalho e rodapé não somem
 * enquanto a página carrega.
 */
function RouteFallback() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 200)
    return () => window.clearTimeout(t)
  }, [])
  if (!show) return <div className="section route-fallback" aria-busy="true" />
  return (
    <div className="container section route-fallback" aria-busy="true">
      <div className="grid grid--3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}

export function Layout() {
  const { pathname } = useLocation()

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <ScrollManager />
      <RouteMeta />
      <NavigationEnhancer />
      {/* A luz do olhar acompanha o mouse em todas as páginas (rodada 4,
          21/10/2026, pedido do dono: o fundo é o mesmo sistema em todo o site).
          Só com mouse e sem movimento reduzido; mora no <body> (portal). */}
      <LuzDoOlhar />
      <Header />
      {/* A key remonta o <main> a cada rota; `data-rota` diz à piscada
          entre páginas (piscada.ts) que a página nova chegou. Sem
          padding-top: cada rota abre com a própria faixa escura, que corre
          por baixo do cabeçalho transparente. */}
      <main id="conteudo" key={pathname} data-rota={pathname} className="main">
        {/* Uma página que quebra (ou cujo pedaço sumiu num deploy) não leva
            junto o cabeçalho e o rodapé: ver FronteiraDeErro. */}
        <FronteiraDeErro>
          <FundoDaPaginaProvider>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </FundoDaPaginaProvider>
        </FronteiraDeErro>
      </main>
      <Footer />
      <StickyCta />
      <CookieNotice />
    </>
  )
}

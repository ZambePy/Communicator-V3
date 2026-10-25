import { useEffect } from 'react'
import { prefersReducedMotion } from '@/hooks/useReducedMotion'

const SELETOR = '.reveal:not(.is-visto)'

/** O pai rola na horizontal (carrossel no celular)? Aí os vizinhos fora da tela entram juntos. */
function emCarrossel(el: Element): Element | null {
  const pai = el.parentElement
  if (!pai) return null
  const ox = getComputedStyle(pai).overflowX
  return (ox === 'auto' || ox === 'scroll') && pai.scrollWidth > pai.clientWidth ? pai : null
}

/**
 * O observador das entradas ao rolar, um só para o site. Liga a classe
 * `js-reveal` no <html> (é ela que esconde os blocos antes de entrarem) e
 * marca cada `.reveal` com `is-visto` quando ele chega à tela. Blocos que
 * aparecem depois (páginas que carregam sob demanda) entram na observação
 * sozinhos. Num carrossel horizontal, o primeiro que aparece traz os vizinhos,
 * para nada ficar invisível ao deslizar.
 */
export function RevelarAoRolar() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return
    const raiz = document.documentElement
    raiz.classList.add('js-reveal')

    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue
          const carrossel = emCarrossel(e.target)
          const alvos = carrossel ? Array.from(carrossel.querySelectorAll(':scope > .reveal')) : [e.target]
          for (const alvo of alvos) {
            alvo.classList.add('is-visto')
            io.unobserve(alvo)
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px -8% 0px' },
    )
    const observar = (base: ParentNode) => base.querySelectorAll(SELETOR).forEach((el) => io.observe(el))
    observar(document)

    const mo = new MutationObserver((mudancas) => {
      for (const m of mudancas) {
        m.addedNodes.forEach((n) => {
          if (!(n instanceof Element)) return
          if (n.matches(SELETOR)) io.observe(n)
          observar(n)
        })
      }
    })
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      io.disconnect()
      mo.disconnect()
      raiz.classList.remove('js-reveal')
    }
  }, [])

  return null
}

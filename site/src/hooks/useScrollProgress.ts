import { useEffect, useState } from 'react'

/**
 * A página já rolou do topo? Alimenta o fio do cabeçalho.
 *
 * Até 19/10/2026 devolvia também o progresso de leitura (0 a 1), para a barra
 * do cabeçalho; a barra saiu no redesenho e, com ela, o estado que mudava a
 * cada quadro de rolagem e redesenhava o cabeçalho inteiro à toa. Agora o
 * cabeçalho só redesenha quando cruza a linha dos 24 px.
 */
export function useScrollProgress() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let raf = 0

    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setScrolled(window.scrollY > 24))
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      cancelAnimationFrame(raf)
    }
  }, [])

  return { scrolled }
}

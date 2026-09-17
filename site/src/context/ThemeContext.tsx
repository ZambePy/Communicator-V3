import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

/* ============================================================
   Tema claro / escuro.

   O tema padrão do produto é claro (tópico 2.3 do plano). O modo
   escuro é uma preferência do usuário: a escolha manual manda e, na
   ausência dela, seguimos a preferência do sistema operacional.

   A fonte da verdade é o atributo data-theme no <html>, definido
   antes da pintura por um script inline em index.html. Sem isso
   haveria um lampejo de tema claro ao carregar. Aqui apenas
   sincronizamos o estado do React com esse atributo.
   ============================================================ */

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'irisflow:theme'

/** Cor da barra do navegador (meta theme-color) por tema. */
const META_COLOR: Record<Theme, string> = {
  light: '#1b54a8',
  dark: '#061223',
}

type Ctx = {
  theme: Theme
  isDark: boolean
  toggle: () => void
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<Ctx | null>(null)

/** Lê o tema já aplicado no <html> pelo script inline; na dúvida, claro. */
function readInitial(): Theme {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.dataset.theme
    if (attr === 'dark' || attr === 'light') return attr
  }
  return 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitial)

  // Reflete a escolha no DOM, na barra do navegador e no localStorage.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', META_COLOR[theme])
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* modo privado ou cota excedida: ignorado de propósito */
    }
  }, [theme])

  // Enquanto o usuário não escolheu manualmente, acompanha o sistema.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      let chosen = false
      try {
        chosen = window.localStorage.getItem(STORAGE_KEY) != null
      } catch {
        /* idem */
      }
      if (!chosen) setThemeState(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next: Theme) => setThemeState(next), [])
  const toggle = useCallback(
    () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  const value = useMemo<Ctx>(
    () => ({ theme, isDark: theme === 'dark', toggle, setTheme }),
    [theme, toggle, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>')
  return ctx
}

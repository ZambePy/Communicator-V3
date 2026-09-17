import { useTheme } from '@/context/ThemeContext'
import './theme-toggle.css'

/**
 * Alterna entre tema claro e escuro. Herda a cor do cabeçalho
 * (currentColor), então funciona tanto sobre a faixa escura do topo
 * quanto sobre o cabeçalho claro depois da rolagem. Os dois ícones ficam
 * empilhados e trocam por opacidade e rotação, para que a transição
 * acompanhe a mudança de tema sem saltos de layout.
 */
export function ThemeToggle({ full = false }: { full?: boolean }) {
  const { isDark, toggle } = useTheme()

  return (
    <button
      type="button"
      className={`theme-toggle${full ? ' theme-toggle--full' : ''}`}
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      <span className="theme-toggle__icons" aria-hidden="true">
        {/* sol: visível no modo escuro, para oferecer a volta ao claro */}
        <svg
          className="theme-toggle__sun"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        {/* lua: visível no modo claro, para oferecer a ida ao escuro */}
        <svg
          className="theme-toggle__moon"
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      </span>
      {full && (
        <span className="theme-toggle__label">
          {isDark ? 'Modo claro' : 'Modo escuro'}
        </span>
      )}
    </button>
  )
}

import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Logo } from './Logo'
import { Button } from '@/components/ui/Button'
import { useScrollProgress } from '@/hooks/useScrollProgress'
import { useAccount } from '@/context/AccountContext'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { EtiquetaLancamento } from '@/components/ui/EtiquetaLancamento'
import { BETA, BETA_CTA, TRIAL_DAYS } from '@/data/content'
import './header.css'

type NavItem = { to: string; label: string; beta?: boolean }

const NAV: NavItem[] = [
  { to: '/solucao', label: 'A solução' },
  { to: '/como-funciona', label: 'Como funciona' },
  { to: '/acessibilidade', label: 'Acessibilidade' },
  { to: '/planos', label: 'Planos' },
  // Só aparece com a beta ligada. Até o lançamento leva a etiqueta vermelha
  // com o dia ("10/11"); depois dele, o selo "novo".
  ...(BETA.ativo ? [{ to: BETA_CTA.to, label: 'Beta', beta: true }] : []),
  { to: '/sobre', label: 'A empresa' },
  { to: '/contato', label: 'Contato' },
]

/** Rotas de fluxo, sem a faixa de abertura: o cabeçalho já nasce sólido. */
const SOLID_ROUTES = [
  '/beta',
  '/cadastro',
  '/pagamento',
  '/sucesso',
  '/entrar',
  '/recuperar-senha',
  '/nova-senha',
  '/conta',
  '/perfil',
  '/confirmar-email',
]

export function Header() {
  const { scrolled, progress } = useScrollProgress()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  // Logado é ter sessão, mesmo antes da pesquisa (sem `account`): quem acabou
  // de confirmar o e-mail vê "Meu perfil", e não "Entrar" como se estivesse
  // fora da conta.
  const { authenticated, loading } = useAccount()
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const seloDaBeta = lancou ? (
    <span className="header__badge">novo</span>
  ) : (
    <EtiquetaLancamento lancamento={program.launchAt} variante="curta" />
  )
  // A barra de progresso de leitura é movimento contínuo ao rolar: some
  // quando o sistema pede menos movimento.
  const reduced = useReducedMotion()

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // As páginas de conteúdo abrem com a faixa de destaque, sob a qual o
  // cabeçalho fica transparente; nas de fluxo (beta, conta, acesso) e
  // depois de rolar, ele ganha fundo sólido para separar do conteúdo.
  const opensSolid = SOLID_ROUTES.some((r) => pathname.startsWith(r))
  const solid = scrolled || open || opensSolid

  return (
    <header className={`header${solid ? ' is-scrolled' : ''}`}>
      {!reduced && (
        <span
          className="header__progress"
          style={{ transform: `scaleX(${progress})` }}
          aria-hidden="true"
        />
      )}

      <div className="container header__inner">
        <Logo size="sm" tone="negativo" />

        <nav className="header__nav" aria-label="Navegação principal">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={`header__link underline-grow${item.beta ? ' header__link--beta' : ''}`}
            >
              {item.label}
              {item.beta && seloDaBeta}
            </NavLink>
          ))}
        </nav>

        <div className="header__actions">
          {/* Enquanto a sessão carrega não mostramos nem "Entrar" nem "Meu
              perfil": exibir o par errado por um instante e trocar depois
              chama mais atenção do que o espaço vazio. */}
          {loading ? null : authenticated ? (
            <Button to="/perfil" variant="secondary">
              Meu perfil
            </Button>
          ) : (
            <>
              <Button to="/entrar" variant="ghost">
                Entrar
              </Button>
              {BETA.ativo ? (
                <Button to={BETA_CTA.to}>{BETA_CTA.label}</Button>
              ) : (
                <Button to="/cadastro">Testar grátis</Button>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          className={`burger${open ? ' is-open' : ''}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="menu-mobile"
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      <div id="menu-mobile" className={`drawer${open ? ' is-open' : ''}`} hidden={!open}>
        <nav aria-label="Navegação mobile">
          {NAV.map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={`drawer__link${item.beta ? ' drawer__link--beta' : ''}`}
              style={{ animationDelay: `${i * 55}ms` }}
            >
              {item.label}
              {item.beta && seloDaBeta}
            </NavLink>
          ))}
        </nav>
        <div className="drawer__actions">
          {loading ? null : authenticated ? (
            <Button to="/perfil" full variant="secondary">
              Meu perfil
            </Button>
          ) : (
            <>
              <Button to="/entrar" full variant="secondary">
                Entrar
              </Button>
              {BETA.ativo ? (
                <Button to={BETA_CTA.to} full>
                  {BETA_CTA.labelLong}
                </Button>
              ) : (
                <Button to="/cadastro" full>
                  Testar grátis por {TRIAL_DAYS} dias
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  )
}

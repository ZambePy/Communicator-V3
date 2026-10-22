import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { NavPilula, type ItemDaNav } from './NavPilula'
import { Logo } from './Logo'
import { Button } from '@/components/ui/Button'
import { useScrollProgress } from '@/hooks/useScrollProgress'
import { useAccount } from '@/context/AccountContext'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { BETA, BETA_CTA, TRIAL_DAYS } from '@/data/content'
import { naRota } from '@/routes'
import './header.css'

type NavItem = { to: string; label: string }

/** O menu principal: o produto, como funciona, o app de quem cuida e preço.
 *  Empresa, contato e acessibilidade ficam no rodapé (e na gaveta do celular).
 *
 *  A aba "Beta", com o selo vermelho, saiu em 21/10/2026 (auditoria P2-6 e
 *  P2-16): levava a /beta enquanto o botão "Baixar grátis" levava a /baixar, dois
 *  caminhos para a mesma coisa, e o vermelho é da emergência. O caminho é o
 *  botão ao lado; o programa beta segue no rodapé e na página de download. */
const NAV: NavItem[] = [
  { to: '/solucao', label: 'Produto' },
  { to: '/como-funciona', label: 'Como funciona' },
  { to: '/cuidador', label: 'Cuidador' },
  { to: '/planos', label: 'Planos' },
]

/** Na gaveta do celular, depois do menu principal. */
const NAV_SECUNDARIA: NavItem[] = [
  { to: '/baixar', label: 'Baixar' },
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
  '/parear',
]

export function Header() {
  const { scrolled } = useScrollProgress()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const botaoRef = useRef<HTMLButtonElement>(null)
  const gavetaRef = useRef<HTMLDivElement>(null)
  // Logado é ter sessão, mesmo antes da pesquisa (sem `account`): quem acabou
  // de confirmar o e-mail vê "Meu perfil", e não "Entrar" como se estivesse
  // fora da conta.
  const { authenticated, loading } = useAccount()
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  // "Entrar" vai na mesma pílula das abas: o vidro chega até ele como chega
  // em Produto ou Planos (fora dela, o link não respondia do mesmo jeito).
  // Enquanto a sessão carrega, ele não aparece — nem "Meu perfil".
  const itensDaNav: ItemDaNav[] = [
    ...NAV.map((item) => ({ to: item.to, label: item.label })),
    ...(loading || authenticated ? [] : [{ to: '/entrar', label: 'Entrar', acao: true }]),
  ]
  useEffect(() => setOpen(false), [pathname])

  /* Gaveta aberta: a página atrás não rola nem recebe foco (inert em main e
     footer), o foco entra no primeiro item, Esc fecha e devolve o foco ao
     botão do menu. */
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const atras = Array.from(document.querySelectorAll<HTMLElement>('main, footer'))
    atras.forEach((el) => el.setAttribute('inert', ''))
    gavetaRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      botaoRef.current?.focus()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.body.style.overflow = ''
      atras.forEach((el) => el.removeAttribute('inert'))
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [open])

  /* Um toque em qualquer destino da gaveta fecha — também quando o destino é
     a página em que a pessoa já está (aí a rota não muda). */
  const fechar = () => setOpen(false)

  // O cabeçalho é sempre do marinho fundo da abertura. Nas páginas de
  // conteúdo ele se funde com ela no topo; nas de fluxo (beta, conta,
  // acesso) e depois de rolar, ganha o fio de baixo que o separa do
  // conteúdo.
  const opensSolid = naRota(pathname, SOLID_ROUTES)
  const solid = scrolled || open || opensSolid

  return (
    <>
    {/* A barra de progresso de leitura saiu no redesenho de 19/10/2026: era
        movimento contínuo ao rolar, sem informação que a barra de rolagem
        do navegador já não desse. */}
    <header className={`header${solid ? ' is-scrolled' : ''}`}>

      <div className="container header__inner">
        <Logo size="sm" tone="negativo" />

        <div className="header__nav">
          <NavPilula rotulo="Navegação principal" itens={itensDaNav} />
        </div>

        <div className="header__actions">
          {/* Enquanto a sessão carrega não mostramos nem a chamada nem "Meu
              perfil": exibir o par errado por um instante e trocar depois
              chama mais atenção do que o espaço vazio. */}
          {loading ? null : authenticated ? (
            <Button to="/perfil" variant="secondary">
              Meu perfil
            </Button>
          ) : BETA.ativo ? (
            lancou ? (
              <Button to="/baixar" chamada>
                Baixar grátis
              </Button>
            ) : (
              <Button to={BETA_CTA.to} chamada>
                {BETA_CTA.label}
              </Button>
            )
          ) : (
            <Button to="/cadastro" chamada>
              Testar grátis
            </Button>
          )}
        </div>

        <button
          ref={botaoRef}
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
    </header>

    {/* A gaveta fica FORA do <header>: o vidro do cabeçalho (backdrop-filter)
        vira bloco de contenção de filhos position: fixed, e a gaveta
        encolhia para a altura do próprio cabeçalho entre 721 e 1080 px. */}
    <div
      ref={gavetaRef}
      id="menu-mobile"
      className={`drawer${open ? ' is-open' : ''}`}
      hidden={!open}
    >
        <nav aria-label="Navegação mobile">
          {[...NAV, ...NAV_SECUNDARIA].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={fechar}
              className="drawer__link"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="drawer__actions">
          {loading ? null : authenticated ? (
            <Button to="/perfil" full variant="secondary" onClick={fechar}>
              Meu perfil
            </Button>
          ) : (
            <>
              <Button to="/entrar" full variant="secondary" onClick={fechar}>
                Entrar
              </Button>
              {BETA.ativo ? (
                // Depois do lançamento, a mesma chamada do cabeçalho do computador.
                lancou ? (
                  <Button to="/baixar" full onClick={fechar}>
                    Baixar grátis
                  </Button>
                ) : (
                  <Button to={BETA_CTA.to} full onClick={fechar}>
                    {BETA_CTA.labelLong}
                  </Button>
                )
              ) : (
                <Button to="/cadastro" full onClick={fechar}>
                  Testar grátis por {TRIAL_DAYS} dias
                </Button>
              )}
            </>
          )}
        </div>
    </div>
    </>
  )
}

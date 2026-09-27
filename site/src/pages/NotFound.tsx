import { Link, useLocation } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { BETA, BETA_CTA } from '@/data/content'
import './not-found.css'

/** Atalhos para onde a pessoa provavelmente queria ir. */
const SUGESTOES = [
  { to: '/solucao', label: 'O produto' },
  { to: '/como-funciona', label: 'Como funciona' },
  { to: '/cuidador', label: 'IrisFlow Cuidador' },
  ...(BETA.ativo ? [{ to: BETA_CTA.to, label: 'Beta gratuita' }] : []),
  { to: '/baixar', label: 'Baixar' },
  { to: '/planos', label: 'Planos' },
]

/**
 * Página 404 (rota coringa do React Router).
 *
 * Em hospedagem estática (Cloudflare Pages) não existe 404.html de
 * propósito: sem ele, o Pages entra no modo SPA e devolve o index.html
 * para qualquer endereço, e é esta rota que responde. Título e noindex
 * vêm de NOT_FOUND_META (src/seo/pages.ts), via RouteMeta.
 */
export default function NotFound() {
  const { pathname } = useLocation()
  // O caminho vem de quem montou o link: mostra só o começo, decodificado e
  // curto, para uma frase posta no endereço não virar texto do site.
  const caminho = (() => {
    let p = pathname
    try {
      p = decodeURIComponent(pathname)
    } catch {
      /* caminho malformado: mostra como veio */
    }
    return p.length > 48 ? `${p.slice(0, 48)}…` : p
  })()

  return (
    <section className="not-found on-dark">
      <AmbientBackground />

      <div className="container not-found__inner">
        <Reveal anim="up">
          <p className="not-found__code" aria-hidden="true">
            404
          </p>
        </Reveal>

        <Reveal anim="up" delay={60}>
          <h1 className="not-found__title">Esta página não existe.</h1>
        </Reveal>

        <Reveal anim="up" delay={120}>
          <p className="lead not-found__lead">
            O endereço <code className="not-found__path">{caminho}</code> não leva a lugar nenhum
            do site — talvez o link esteja incompleto ou a página tenha mudado de nome.
          </p>
        </Reveal>

        <Reveal anim="up" delay={180}>
          <div className="not-found__actions">
            <Button to="/" size="lg">
              Voltar ao início
            </Button>
            <Button to="/contato" variant="secondary" size="lg">
              Falar com a equipe
            </Button>
          </div>
        </Reveal>

        <Reveal anim="fade" delay={240}>
          <nav className="not-found__links" aria-label="Páginas sugeridas">
            <ul>
              {SUGESTOES.map((s) => (
                <li key={s.to}>
                  <Link to={s.to} className="underline-grow">
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Reveal>
      </div>
    </section>
  )
}

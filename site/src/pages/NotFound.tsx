import { Link, useLocation } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { IrisMark } from '@/components/layout/Logo'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { BETA, BETA_CTA } from '@/data/content'
import './not-found.css'

/** Atalhos para onde a pessoa provavelmente queria ir. */
const SUGESTOES = [
  { to: '/solucao', label: 'O que o IrisFlow faz' },
  { to: '/como-funciona', label: 'Como funciona' },
  ...(BETA.ativo ? [{ to: BETA_CTA.to, label: 'Beta gratuita e download' }] : []),
  { to: '/planos', label: 'Planos' },
  { to: '/contato', label: 'Fale com a equipe' },
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

  return (
    <section className="not-found on-dark">
      <AmbientBackground particles={18} />

      <div className="container not-found__inner">
        <Reveal anim="zoom">
          <IrisMark size={150} />
        </Reveal>

        <Reveal anim="up" delay={160}>
          <p className="not-found__code" aria-hidden="true">
            404
          </p>
        </Reveal>

        <Reveal anim="up" delay={220}>
          <h1 className="not-found__title">Esta página não existe.</h1>
        </Reveal>

        <Reveal anim="up" delay={280}>
          <p className="lead not-found__lead">
            O endereço <code className="not-found__path">{pathname}</code> não leva a lugar nenhum
            do site — talvez o link esteja incompleto ou a página tenha mudado de nome.
          </p>
        </Reveal>

        <Reveal anim="up" delay={360}>
          <div className="not-found__actions">
            <Button to="/" size="lg">
              Voltar ao início
            </Button>
            <Button to="/contato" variant="secondary" size="lg">
              Falar com a equipe
            </Button>
          </div>
        </Reveal>

        <Reveal anim="fade" delay={460}>
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

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CONSENT_EVENT,
  readConsent,
  saveConsent,
  type ConsentChoice,
} from '@/lib/consent'
import { loadAnalytics, unloadAnalytics } from '@/lib/analytics'
import './cookie-notice.css'

/**
 * Aviso de cookies e escolha sobre estatísticas.
 *
 * Aparece enquanto não houver escolha guardada. Não é modal (não prende o
 * foco nem cobre a página): fica encostado embaixo, respeitando a área
 * segura do iPhone, e some ao escolher. O rodapé tem um link que o reabre.
 *
 * Também é quem carrega o Cloudflare Web Analytics: ao montar e a cada
 * mudança de escolha, `loadAnalytics` decide (token + não recusado).
 */
export function CookieNotice() {
  const [choice, setChoice] = useState<ConsentChoice | null>(() => readConsent())
  const open = choice === null

  useEffect(() => {
    const onChange = (e: Event) => setChoice((e as CustomEvent<ConsentChoice | null>).detail)
    window.addEventListener(CONSENT_EVENT, onChange)
    return () => window.removeEventListener(CONSENT_EVENT, onChange)
  }, [])

  useEffect(() => {
    if (choice === 'refused') unloadAnalytics()
    else loadAnalytics(undefined, choice)
  }, [choice])

  // A barra fixa de CTA no celular se esconde enquanto o aviso está aberto
  // (ver sticky-cta.css), para as duas não disputarem a base da tela.
  useEffect(() => {
    const root = document.documentElement
    if (open) root.dataset.cookieNotice = 'open'
    else delete root.dataset.cookieNotice
    return () => {
      delete root.dataset.cookieNotice
    }
  }, [open])

  if (!open) return null

  return (
    <section className="cookie-notice" role="region" aria-labelledby="cookie-notice-title">
      <div className="cookie-notice__inner">
        <div className="cookie-notice__text">
          <h2 id="cookie-notice-title" className="cookie-notice__title">
            Sem cookies de rastreamento
          </h2>
          <p>
            <span className="cookie-notice__long">
              Guardamos no navegador só o necessário para o site funcionar (a sessão da conta e
              esta escolha) e contamos visitas com estatísticas anônimas, sem cookies e sem
              identificar você.
            </span>
            <span className="cookie-notice__short">
              Só o essencial fica no navegador; as visitas são contadas sem cookies e sem
              identificar você.
            </span>{' '}
            <Link to="/privacidade" className="cookie-notice__link">
              Privacidade
            </Link>
          </p>
        </div>
        <div className="cookie-notice__actions">
          <button
            type="button"
            className="btn btn--secondary btn--md cookie-notice__btn"
            onClick={() => saveConsent('refused')}
          >
            <span className="btn__content">Recusar estatísticas</span>
          </button>
          <button
            type="button"
            className="btn btn--primary btn--md cookie-notice__btn"
            onClick={() => saveConsent('accepted')}
          >
            <span className="btn__content">Entendi</span>
          </button>
        </div>
      </div>
    </section>
  )
}

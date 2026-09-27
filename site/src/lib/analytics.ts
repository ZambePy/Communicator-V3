/* ============================================================
   Cloudflare Web Analytics — estatísticas sem cookie.

   O beacon só é carregado quando as duas condições valem:
   1. VITE_CF_ANALYTICS_TOKEN está definido no build;
   2. a pessoa não recusou as estatísticas no aviso (lib/consent.ts).

   IMPORTANTE (Cloudflare Pages): deixe DESLIGADA a opção "Web Analytics"
   automática do projeto no painel. Ela injeta o beacon no HTML por conta
   própria, sem passar por esta checagem de consentimento. Use o token
   de um site criado em Analytics & Logs > Web Analytics (modo manual).
   ============================================================ */

import { analyticsAllowed, readConsent, type ConsentChoice } from './consent'

export const BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js'
const SCRIPT_ID = 'cf-web-analytics'

export function analyticsToken(): string {
  return (import.meta.env.VITE_CF_ANALYTICS_TOKEN ?? '').trim()
}

/**
 * Insere o beacon uma vez. Devolve true se o script está (ou ficou) na
 * página. Sem token ou com recusa, não toca no DOM e devolve false.
 */
export function loadAnalytics(
  token: string = analyticsToken(),
  choice: ConsentChoice | null = readConsent(),
): boolean {
  if (typeof document === 'undefined') return false
  if (!token || !analyticsAllowed(choice)) return false
  if (document.getElementById(SCRIPT_ID)) return true

  const script = document.createElement('script')
  script.id = SCRIPT_ID
  script.defer = true
  script.src = BEACON_SRC
  script.setAttribute('data-cf-beacon', JSON.stringify({ token, spa: true }))
  document.head.appendChild(script)
  return true
}

/**
 * A pessoa recusou as estatísticas. Tirar a tag não basta: o beacon que já
 * rodou continua acompanhando as trocas de rota (spa: true) até a página
 * recarregar. Por isso, se ele chegou a carregar, a página recarrega — a
 * recusa já está guardada e o beacon não volta. Devolve se recarregou.
 */
export function unloadAnalytics(recarregar: () => void = () => window.location.reload()): boolean {
  const script = document.getElementById(SCRIPT_ID)
  if (!script) return false
  script.remove()
  recarregar()
  return true
}

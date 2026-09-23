/* ============================================================
   Escolha sobre estatísticas de uso (aviso de cookies).

   O site não grava cookie nenhum: guarda a sessão do Supabase e esta
   escolha no localStorage (armazenamento essencial) e, se houver token,
   carrega o Cloudflare Web Analytics, que não usa cookie nem identifica
   o visitante. Mesmo assim a pessoa pode recusar as estatísticas — e aí
   o beacon simplesmente não é carregado.

   Todo acesso ao localStorage fica em try/catch: modo privado, cota
   estourada ou armazenamento bloqueado não podem quebrar a página.
   ============================================================ */

export type ConsentChoice = 'accepted' | 'refused'

export const CONSENT_KEY = 'irisflow:consent'

/** Evento disparado no window quando a escolha muda (ou o aviso é reaberto). */
export const CONSENT_EVENT = 'irisflow:consent'

export function readConsent(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY)
    return v === 'accepted' || v === 'refused' ? v : null
  } catch {
    return null
  }
}

export function saveConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice)
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }))
}

/** Apaga a escolha e reabre o aviso (link "Preferências de cookies" no rodapé). */
export function resetConsent(): void {
  try {
    window.localStorage.removeItem(CONSENT_KEY)
  } catch {
    /* idem */
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null }))
}

/** Estatísticas só não rodam se a pessoa recusou explicitamente. */
export function analyticsAllowed(choice: ConsentChoice | null): boolean {
  return choice !== 'refused'
}

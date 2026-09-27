/**
 * Onde o IrisFlow Cuidador é baixado.
 *
 * - Google Play: o endereço sai do pacote Android (app/app.json →
 *   android.package), então passa a funcionar sozinho no dia em que o app for
 *   publicado com esse pacote. `VITE_GOOGLE_PLAY_URL` troca o endereço, se preciso.
 * - App Store: o endereço tem um número que só existe depois do cadastro do app
 *   no App Store Connect. Enquanto `VITE_APP_STORE_URL` estiver vazia, o selo da
 *   Apple aparece como "em breve" e leva à seção de disponibilidade da página do
 *   app, em vez de abrir uma página que não existe.
 * - APK: na beta, o app Android também vai anexado a cada release
 *   (`VITE_APP_CUIDADOR_URL`), para quem testa antes da loja.
 */

export const PACOTE_ANDROID = 'br.com.irisflow.cuidador'

const limpo = (v: string | undefined) => (v ?? '').trim()

export const LOJAS = {
  googlePlay:
    limpo(import.meta.env.VITE_GOOGLE_PLAY_URL) ||
    `https://play.google.com/store/apps/details?id=${PACOTE_ANDROID}`,
  appStore: limpo(import.meta.env.VITE_APP_STORE_URL) || null,
  apk: limpo(import.meta.env.VITE_APP_CUIDADOR_URL) || null,
} as const

/** Os arquivos oficiais dos selos estão em site/public/badges? (vite.config.ts) */
export const SELOS_OFICIAIS: boolean =
  typeof __SELOS_OFICIAIS__ === 'boolean' ? __SELOS_OFICIAIS__ : false

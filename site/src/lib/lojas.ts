/**
 * Onde o IrisFlow Cuidador é baixado.
 *
 * - Google Play: enquanto `VITE_GOOGLE_PLAY_URL` estiver vazia, o app ainda não
 *   está na loja — o selo aparece "em breve" e leva à seção de disponibilidade
 *   da página do app, em vez de abrir a página "não encontrado" da Play (o
 *   endereço montado pelo pacote só existe depois da publicação).
 * - App Store: o mesmo, com `VITE_APP_STORE_URL` (o endereço tem um número que
 *   só existe depois do cadastro do app no App Store Connect).
 * - APK: na beta, o app Android também vai anexado a cada release
 *   (`VITE_APP_CUIDADOR_URL`), para quem testa antes da loja — oferecido a
 *   partir do lançamento, como os instaladores do computador.
 */

export const PACOTE_ANDROID = 'br.com.irisflow.cuidador'

const limpo = (v: string | undefined) => (v ?? '').trim()

export const LOJAS = {
  googlePlay: limpo(import.meta.env.VITE_GOOGLE_PLAY_URL) || null,
  appStore: limpo(import.meta.env.VITE_APP_STORE_URL) || null,
  apk: limpo(import.meta.env.VITE_APP_CUIDADOR_URL) || null,
} as const

/** Os arquivos oficiais dos selos estão em site/public/badges? (vite.config.ts) */
export const SELOS_OFICIAIS: boolean =
  typeof __SELOS_OFICIAIS__ === 'boolean' ? __SELOS_OFICIAIS__ : false

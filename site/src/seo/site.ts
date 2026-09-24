/* ============================================================
   Origem pública do site — a ÚNICA constante de domínio.

   Lida em build de VITE_SITE_URL (ver .env.example). É a base de tudo
   que precisa ser absoluto: canonical, og:url, og:image, sitemap.xml e
   robots.txt. Este arquivo não importa nada do app nem usa `@/`, porque
   o vite.config.ts também o importa (geração do sitemap no build).
   ============================================================ */

/** Usado quando VITE_SITE_URL não está definida. */
export const DEFAULT_SITE_URL = 'https://irisflow-communicator.pages.dev'

/**
 * Normaliza a origem: aceita "irisflow.tech", "https://irisflow.tech/",
 * espaços em volta; devolve sempre "https://host" sem barra final. Um valor
 * inválido cai no padrão em vez de gerar URLs quebradas no HTML.
 */
export function resolveSiteUrl(raw?: string | null): string {
  const value = (raw ?? '').trim()
  if (!value) return DEFAULT_SITE_URL
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    return `${url.protocol}//${url.host}`
  } catch {
    return DEFAULT_SITE_URL
  }
}

/** Junta origem e caminho sem barra dobrada. "/" fica "https://host/". */
export function absoluteUrl(origin: string, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  return origin.replace(/\/+$/, '') + clean
}

/** Imagem de compartilhamento (1200 × 630), em public/. */
export const OG_IMAGE_PATH = '/og-image.png'

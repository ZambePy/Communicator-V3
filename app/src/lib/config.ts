/**
 * Endereços do site da IrisFlow usados pelo app (links "Minha conta", "Baixar no
 * computador", "Esqueci a senha"). Vêm de configuração, não de string fixa —
 * ver `../docs/BETA.md` §3: `EXPO_PUBLIC_SITE_URL` em `app/.env`.
 */
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? 'https://irisflow.com.br').replace(/\/$/, '');

/** Rotas do site que o app abre no navegador. */
export type SiteRoute = '/beta' | '/conta' | '/contato' | '/recuperar-senha';

/** URL completa de uma rota do site, ex.: `siteRoute('/beta')` → `https://irisflow.com.br/beta`. */
export function siteRoute(route: SiteRoute): string {
  return `${SITE_URL}${route}`;
}

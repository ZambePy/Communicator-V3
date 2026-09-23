import Constants from 'expo-constants';

/**
 * Endereços do site da IrisFlow usados pelo app (links "Minha conta", "Baixar no
 * computador", "Esqueci a senha"). Vêm de configuração, não de string fixa —
 * `EXPO_PUBLIC_SITE_URL` em `app/.env` (ver `.env.example`). Sem a variável, o
 * padrão é o endereço público do site, o mesmo de `site/src/seo/site.ts`.
 */
export const DEFAULT_SITE_URL = 'https://irisflow.pages.dev';

export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || DEFAULT_SITE_URL).trim().replace(/\/+$/, '');

/**
 * Conta de teste padrão da beta — uma conta REAL do Supabase (criada por
 * `supabase/seed.sql`), não um modo de demonstração: o login passa pelo
 * Supabase como qualquer outro e a conta nasce sem dados fabricados.
 *
 * Só serve para agilizar o teste em desenvolvimento: com `__DEV__` (Expo Go /
 * dev client) a tela de login já vem preenchida com ela. Em build de produção
 * os campos ficam vazios. Trocou a senha no painel? Troque aqui também.
 */
export const CONTA_DE_TESTE = { email: 'admin@irisflow.com', senha: 'irisflow2026' } as const;

/**
 * Rotas do site usadas pelo app (existem em `site/src/routes.ts`): abertas no
 * navegador ou, como `/nova-senha`, destino do link do e-mail de recuperação.
 */
export type SiteRoute = '/beta' | '/conta' | '/contato' | '/recuperar-senha' | '/nova-senha' | '/privacidade' | '/termos';

/** URL completa de uma rota do site, ex.: `siteRoute('/beta')` → `https://irisflow.pages.dev/beta`. */
export function siteRoute(route: SiteRoute): string {
  return `${SITE_URL}${route}`;
}

type Extra = {
  privacyPolicyUrl?: string;
  termsUrl?: string;
  accountDeletionUrl?: string;
  supportEmail?: string;
};

function extra(): Extra {
  return (Constants.expoConfig?.extra ?? {}) as Extra;
}

function url(v: string | undefined, fallback: string): string {
  return v && /^https:\/\//.test(v) ? v : fallback;
}

/**
 * Links legais. Vêm de `app.json > extra` — a MESMA URL cadastrada no App Store
 * Connect e no Play Console (as lojas conferem que o link do app e o da ficha
 * batem). Só caem no site configurado se o extra estiver vazio.
 */
export const legalLinks = {
  get privacy(): string {
    return url(extra().privacyPolicyUrl, siteRoute('/privacidade'));
  },
  get terms(): string {
    return url(extra().termsUrl, siteRoute('/termos'));
  },
  /** Onde se pede a exclusão da conta e dos dados (Play Console exige uma URL). */
  get accountDeletion(): string {
    return url(extra().accountDeletionUrl, `${siteRoute('/privacidade')}#direitos`);
  },
  get supportEmail(): string {
    return extra().supportEmail || 'irisflowteam@gmail.com';
  },
};

/** "1.0.0" — a versão de loja (app.json > version). */
export function appVersion(): string {
  return Constants.expoConfig?.version ?? '—';
}

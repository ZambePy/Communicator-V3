/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do projeto no Supabase. Ver .env.example. */
  readonly VITE_SUPABASE_URL?: string
  /** Chave anon public do Supabase. É pública: quem protege os dados é a RLS. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Chave pública do gateway, usada para tokenizar o cartão no navegador. */
  readonly VITE_PAYMENT_PUBLIC_KEY?: string
  /** Base de uma API própria, se houver Edge Functions ou back-end à parte. */
  readonly VITE_API_URL?: string
  /** Link do app do cuidador (APK, Expo ou loja). Vazio = chega por e-mail. */
  readonly VITE_APP_CUIDADOR_URL?: string
  /** Origem pública do site (canonical, og:*, sitemap). Padrão em src/seo/site.ts. */
  readonly VITE_SITE_URL?: string
  /** Repositório do GitHub com os releases do desktop, "dono/repo". */
  readonly VITE_RELEASES_REPO?: string
  /** Sistemas com instalador publicado, separados por vírgula (windows,macos,linux). */
  readonly VITE_RELEASES_AVAILABLE?: string
  /** Token do Cloudflare Web Analytics. Vazio = nenhuma estatística é coletada. */
  readonly VITE_CF_ANALYTICS_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

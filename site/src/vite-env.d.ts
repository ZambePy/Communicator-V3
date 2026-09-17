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
  /** Instalador para Windows, usado quando `app_releases` não tem linha. */
  readonly VITE_DOWNLOAD_WINDOWS_URL?: string
  /** Instalador para macOS, usado quando `app_releases` não tem linha. */
  readonly VITE_DOWNLOAD_MACOS_URL?: string
  /** Instalador para Linux, usado quando `app_releases` não tem linha. */
  readonly VITE_DOWNLOAD_LINUX_URL?: string
  /** Link do app do cuidador (APK, Expo ou loja). Vazio = chega por e-mail. */
  readonly VITE_APP_CUIDADOR_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

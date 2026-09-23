/**
 * Relatório de falhas (Sentry) — LIGADO SÓ quando `EXPO_PUBLIC_SENTRY_DSN`
 * existe no build. Sem a variável, `initSentry()` não faz nada e nenhum byte
 * sai do celular.
 *
 * O que vai: tipo e pilha do erro, versão do app/SO/modelo do aparelho,
 * rota da tela. O que NÃO vai, por construção:
 *  - IP, cookies, cabeçalhos (`sendDefaultPii: false`);
 *  - captura de tela e árvore de views (mostrariam a conversa com o paciente);
 *  - texto de mensagens: breadcrumbs de console e de digitação são descartados,
 *    corpos de requisição removidos e a query string das URLs do Supabase
 *    (que leva ids e filtros) cortada;
 *  - e-mail, telefone, JWT e UUID em qualquer texto do evento viram marcadores.
 *
 * Isso importa porque as mensagens e alertas revelam dado de saúde (LGPD
 * art. 5º, II) e a política de privacidade promete "sem conteúdo do paciente".
 */
import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

type SentryEvent = Parameters<NonNullable<Sentry.ReactNativeOptions['beforeSend']>>[0];
type SentryBreadcrumb = Parameters<NonNullable<Sentry.ReactNativeOptions['beforeBreadcrumb']>>[0];

export const SENTRY_DSN = (process.env.EXPO_PUBLIC_SENTRY_DSN ?? '').trim();

/** true quando o build tem DSN válido — o único interruptor do Sentry. */
export const sentryEnabled = /^https:\/\/[^@\s]+@[^\s]+\/\d+$/.test(SENTRY_DSN);

const PADROES: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[jwt]'],
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [token]'],
  [/ExponentPushToken\[[^\]]+\]/g, 'ExponentPushToken[…]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[uuid]'],
  [/\+?\(?\d[\d\s().-]{7,}\d/g, '[telefone]'],
];

/** Troca e-mail, telefone, JWT, token de push e UUID por marcadores. */
export function scrubText(texto: string): string {
  return PADROES.reduce((s, [re, marca]) => s.replace(re, marca), texto);
}

/** Tira a query string (`?select=…&beneficiary_id=eq.…`) de uma URL. */
function semQuery(url: unknown): unknown {
  return typeof url === 'string' ? url.split('?')[0] : url;
}

/** Categorias de breadcrumb que carregam texto digitado ou logado. */
const CATEGORIAS_DESCARTADAS = new Set(['console', 'ui.input', 'ui.click']);

export function scrubBreadcrumb(b: SentryBreadcrumb): SentryBreadcrumb | null {
  if (b.category && CATEGORIAS_DESCARTADAS.has(b.category)) return null;
  const out: SentryBreadcrumb = { ...b };
  if (out.message) out.message = scrubText(out.message);
  if (out.data) {
    const { url, method, status_code } = out.data as Record<string, unknown>;
    // Só o que serve para depurar rede: método, URL sem query e status.
    out.data = { method, url: semQuery(url), status_code };
  }
  return out;
}

export function scrubEvent(e: SentryEvent): SentryEvent {
  const out: SentryEvent = { ...e };
  delete out.user;
  delete out.server_name;
  if (out.request) out.request = { url: semQuery(out.request.url) as string | undefined, method: out.request.method };
  if (out.message) out.message = scrubText(out.message);
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => ({ ...v, value: v.value ? scrubText(v.value) : v.value })),
    };
  }
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb).filter((b): b is SentryBreadcrumb => b !== null);
  // `extra` e `contexts.state` podem ter vindo de um captureException com
  // objeto do app (mensagem, alerta). Não mandamos: o tipo e a pilha bastam.
  delete out.extra;
  return out;
}

let iniciado = false;

export function initSentry(): void {
  if (!sentryEnabled || iniciado) return;
  iniciado = true;
  Sentry.init({
    dsn: SENTRY_DSN,
    // Em desenvolvimento os erros aparecem na tela vermelha; não gastam cota.
    enabled: !__DEV__,
    environment: process.env.EXPO_PUBLIC_APP_ENV || (__DEV__ ? 'development' : 'production'),
    // `release`/`dist` ficam com o padrão do SDK (id do app @ versão + build),
    // o mesmo nome com que o plugin do EAS Build sobe os source maps.
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // Sem rastreamento de desempenho: só falhas (cabe no plano gratuito).
    tracesSampleRate: 0,
    enableAutoSessionTracking: true,
    maxBreadcrumbs: 40,
    beforeBreadcrumb: (b) => scrubBreadcrumb(b),
    beforeSend: (e) => scrubEvent(e),
  });
}

/** Envolve o componente raiz (ErrorBoundary + toque nativo). Sem DSN, devolve o próprio componente. */
export function wrapRoot<P extends Record<string, unknown>>(C: ComponentType<P>): ComponentType<P> {
  return sentryEnabled ? Sentry.wrap(C) : C;
}

/** Registra um erro tratado (ex.: ErrorBoundary da rota). Sem DSN, não faz nada. */
export function reportError(err: unknown): void {
  if (sentryEnabled) Sentry.captureException(err);
}

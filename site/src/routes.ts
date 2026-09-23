import type { ComponentType } from 'react'

type Loader = () => Promise<{ default: ComponentType }>

/**
 * Um carregador por rota. É a mesma tabela que o App usa nos `lazy()` e
 * que o pré-carregamento usa ao passar o mouse (ou o foco) sobre um link:
 * o `import()` dinâmico é memoizado pelo navegador, então chamar duas
 * vezes custa uma única requisição.
 */
export const ROUTE_LOADERS: Record<string, Loader> = {
  '/': () => import('@/pages/Home'),
  '/solucao': () => import('@/pages/Solucao'),
  '/como-funciona': () => import('@/pages/ComoFunciona'),
  '/acessibilidade': () => import('@/pages/Acessibilidade'),
  '/planos': () => import('@/pages/Planos'),
  '/sobre': () => import('@/pages/Sobre'),
  '/contato': () => import('@/pages/Contato'),
  '/beta': () => import('@/pages/Beta'),
  '/cadastro': () => import('@/pages/Cadastro'),
  '/pagamento': () => import('@/pages/Pagamento'),
  '/sucesso': () => import('@/pages/Sucesso'),
  '/entrar': () => import('@/pages/Entrar'),
  '/recuperar-senha': () => import('@/pages/RecuperarSenha'),
  '/nova-senha': () => import('@/pages/NovaSenha'),
  '/conta': () => import('@/pages/Conta'),
  '/privacidade': () =>
    import('@/pages/Legal').then((m) => ({ default: m.Privacidade })),
  '/termos': () => import('@/pages/Legal').then((m) => ({ default: m.Termos })),
}

const loaded = new Set<string>()

/** Normaliza "/planos?x#y" para "/planos". */
export function routeKey(href: string): string {
  const path = href.split(/[?#]/)[0] || '/'
  return path.length > 1 ? path.replace(/\/$/, '') : path
}

/**
 * Pré-carrega o pedaço da rota. Resolve quando o módulo está pronto (ou
 * imediatamente, se a rota não existe na tabela). Nunca rejeita.
 */
export function preloadRoute(href: string): Promise<void> {
  const key = routeKey(href)
  const loader = ROUTE_LOADERS[key]
  if (!loader || loaded.has(key)) return Promise.resolve()
  return loader()
    .then(() => {
      loaded.add(key)
    })
    .catch(() => {
      /* sem rede: a navegação normal tenta de novo */
    })
}

export function isRouteLoaded(href: string): boolean {
  return loaded.has(routeKey(href))
}

/* ============================================================
   Título e descrição de cada rota — fonte única.

   Usado em três lugares, e é por isso que mora aqui e não nas páginas:
   - <RouteMeta /> (Layout) aplica title/description/canonical/og:* ao
     trocar de rota;
   - o plugin do vite.config.ts gera sitemap.xml e robots.txt no build a
     partir das rotas com `index: true` (a lista não descola das rotas);
   - os testes conferem que toda rota do App tem entrada aqui.

   Sem imports do app e sem `@/`: o vite.config.ts importa este arquivo.
   Títulos com até ~60 caracteres antes do sufixo; descrições com até
   ~160. Nada de número ou promessa que não esteja no content.ts.
   ============================================================ */

export type PageMeta = {
  path: string
  /** Título da aba, sem o sufixo " | IrisFlow" (acrescentado por RouteMeta). */
  title: string
  description: string
  /** Entra no sitemap e pode ser indexada. Falso = noindex. */
  index: boolean
  changefreq?: 'weekly' | 'monthly' | 'yearly'
  priority?: number
}

export const TITLE_SUFFIX = ' | IrisFlow'

export const DEFAULT_TITLE = 'Comunicador por olhar para ELA, AVC e tetraplegia'
export const DEFAULT_DESCRIPTION =
  'O IrisFlow Communicator transforma o movimento dos olhos em fala e em controle do computador, com a webcam comum e processamento 100 % local. Beta gratuita.'

export const PAGES: PageMeta[] = [
  {
    path: '/',
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    index: true,
    changefreq: 'weekly',
    priority: 1,
  },
  {
    path: '/solucao',
    title: 'IrisFlow Communicator: o que o aplicativo faz',
    description:
      'Comunicação por olhar, controle do computador, lazer, painel do cuidador e emergência — um aplicativo instalável que roda inteiro no computador da família.',
    index: true,
    changefreq: 'monthly',
    priority: 0.9,
  },
  {
    path: '/como-funciona',
    title: 'Como funciona o rastreamento ocular por webcam',
    description:
      'Da webcam à palavra falada: calibração rápida que aprende o seu olhar, cursor estável e seleção por fixação. Nenhuma imagem sai do computador.',
    index: true,
    changefreq: 'monthly',
    priority: 0.8,
  },
  {
    path: '/acessibilidade',
    title: 'Acessibilidade: interface feita para o olhar',
    description:
      'Os princípios de interface do IrisFlow para quem navega só com os olhos: retorno de fixação em três estágios, alvos grandes e emergência sempre no mesmo lugar.',
    index: true,
    changefreq: 'monthly',
    priority: 0.7,
  },
  {
    path: '/planos',
    title: 'Planos e preços: beta grátis agora, planos pagos em breve',
    description:
      'Durante a beta o IrisFlow Communicator é gratuito, sem cartão. Veja os planos pagos previstos para depois da beta, sem equipamento e sem fidelidade.',
    index: true,
    changefreq: 'monthly',
    priority: 0.8,
  },
  {
    path: '/sobre',
    title: 'Sobre a IrisFlow: quem faz o comunicador por olhar',
    description:
      'Três fundadores construindo, no Brasil, um comunicador por olhar que roda na webcam que a família já tem. Conheça a equipe, a história e os compromissos.',
    index: true,
    changefreq: 'monthly',
    priority: 0.6,
  },
  {
    path: '/contato',
    title: 'Contato: fale com a equipe do IrisFlow',
    description:
      'Familiar, cuidador, profissional de saúde ou clínica: escreva para a equipe do IrisFlow. Respondemos nós mesmos, normalmente em até dois dias úteis.',
    index: true,
    changefreq: 'yearly',
    priority: 0.6,
  },
  {
    path: '/beta',
    title: 'Beta gratuita: baixe o IrisFlow Communicator',
    description:
      'Inscreva-se na beta gratuita do IrisFlow Communicator e baixe o aplicativo: comunicação pelo olhar com a webcam comum. Sem cartão, sem cobrança.',
    index: true,
    changefreq: 'weekly',
    priority: 0.9,
  },
  {
    path: '/privacidade',
    title: 'Política de privacidade',
    description:
      'Como a IrisFlow trata dados pessoais segundo a LGPD: o rastreamento ocular roda no seu computador e nenhuma imagem da câmera sai dele.',
    index: true,
    changefreq: 'yearly',
    priority: 0.3,
  },
  {
    path: '/termos',
    title: 'Termos de uso',
    description:
      'Condições de uso do site e do IrisFlow Communicator durante a beta: o que o produto faz, seus limites e as responsabilidades de cada parte.',
    index: true,
    changefreq: 'yearly',
    priority: 0.3,
  },

  /* --- fluxo de conta: acessíveis, mas fora da busca --- */
  {
    path: '/entrar',
    title: 'Entrar na conta',
    description: 'Acesse sua conta IrisFlow com o e-mail e a senha da inscrição.',
    index: false,
  },
  {
    path: '/recuperar-senha',
    title: 'Recuperar senha',
    description: 'Receba por e-mail um link para criar uma nova senha da sua conta IrisFlow.',
    index: false,
  },
  {
    path: '/nova-senha',
    title: 'Definir nova senha',
    description: 'Crie uma nova senha para a sua conta IrisFlow e volte a entrar no aplicativo.',
    index: false,
  },
  {
    path: '/conta',
    title: 'Minha conta',
    description: 'Painel da sua conta IrisFlow: dados, acesso e downloads do aplicativo.',
    index: false,
  },
  {
    path: '/cadastro',
    title: 'Criar conta',
    description: 'Crie sua conta IrisFlow e comece a avaliação do comunicador por olhar.',
    index: false,
  },
  {
    path: '/pagamento',
    title: 'Pagamento',
    description: 'Pagamento da assinatura do IrisFlow Communicator, depois da avaliação.',
    index: false,
  },
  {
    path: '/sucesso',
    title: 'Conta criada',
    description: 'Sua conta IrisFlow está pronta: baixe o aplicativo e faça a primeira calibração.',
    index: false,
  },
]

/** Metadados da página 404 (rota coringa). */
export const NOT_FOUND_META: PageMeta = {
  path: '/404',
  title: 'Página não encontrada',
  description: 'Esta página não existe ou mudou de endereço. Volte ao início do site da IrisFlow.',
  index: false,
}

/** Normaliza "/planos/?x#y" para "/planos". */
export function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] || '/'
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path
}

/** Metadados da rota; desconhecida = 404. */
export function metaForPath(pathname: string): PageMeta {
  const key = normalizePath(pathname)
  return PAGES.find((p) => p.path === key) ?? NOT_FOUND_META
}

/** "Planos…" → "Planos… | IrisFlow" (sem duplicar o sufixo). */
export function fullTitle(title: string): string {
  return title.endsWith(TITLE_SUFFIX) ? title : title + TITLE_SUFFIX
}

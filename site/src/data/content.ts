/* ============================================================
   Conteúdo do site, extraído do Plano de Negócios IrisFlow 2026.
   Fica centralizado aqui para que texto e números possam ser
   revisados sem abrir nenhum componente. Todos os dados são
   verificáveis no plano.
   ============================================================ */

import type { IconName } from '@/components/ui/Icon'

export const BRAND = {
  /** Nome da EMPRESA. Usado em rodapé, páginas legais, contato e "sobre". */
  company: 'IrisFlow',
  /** Nome do PRODUTO entregue ao usuário — o aplicativo instalável.
      Usado onde o texto fala do software: hero, solução, módulos,
      download e planos. Empresa e produto não são intercambiáveis. */
  product: 'IrisFlow Communicator',
  solution: 'a solução da IrisFlow',
  tagline: 'Seu olhar tem voz.',
  claim: 'Comunicação e controle do computador pelo olhar, com a webcam que você já tem.',
  email: 'irisflowteam@gmail.com',
  instagram: 'https://www.instagram.com/irisflow.ia',
  linkedin: 'https://www.linkedin.com/company/irisflowia/',
  repo: 'https://github.com/ZambePy/Blink',
  /** Rótulo do repositório: desde a virada comercial, o que fica aberto é a
      documentação, o protocolo de medição e os componentes de interface —
      não o núcleo de calibração. Ver CODE_POSITION. */
  repoLabel: 'documentação técnica e protocolo de medição',
}

/** Frases que a máquina de escrever compõe no hero. */
export const HERO_PHRASES = [
  'Estou com sede.',
  'Quero falar com a minha filha.',
  'Pode aumentar o volume?',
  'Hoje eu estou bem.',
  'Chama a enfermeira, por favor.',
]

/* ---------------- quem espera do outro lado ----------------
   Vem do tópico 1.2 do plano ("Por que a empresa existe além do
   resultado financeiro"). É a parte que nenhuma tabela cobre.
   ---------------------------------------------------------------- */

export const HUMAN = {
  title: 'Perder a fala não acontece com uma pessoa só.',
  lines: [
    'O cônjuge que passa o dia adivinhando o que o outro quer.',
    'O filho que soletra o alfabeto em voz alta e espera um piscar de confirmação.',
    'O profissional que não consegue avaliar a dor porque o paciente não tem como descrevê-la.',
  ],
  report:
    'Uma das respondentes da nossa pesquisa é médica e filha de uma paciente. Ela contou que a mãe havia perdido a fala na semana anterior e que estava muito abalada com a dificuldade de se comunicar. Não é um caso raro. É a semana em que essa família estava vivendo quando respondeu o formulário.',
  source: 'Pesquisa de mercado IrisFlow, 2026',
  close:
    'A IrisFlow precisa se pagar para continuar existindo, e levamos essa parte a sério. Mas não é ela a razão de existir. A razão é uma família voltar a conversar.',
}

/* ---------------- o problema ---------------- */

export const PROBLEM = {
  title: 'Quem perde a fala e o movimento continua com tudo a dizer — e com os olhos.',
  lead: 'A IrisFlow é feita para pessoas com esclerose lateral amiotrófica (ELA), tetraplegia alta por lesão medular, sequela grave de AVC, paralisia cerebral severa ou distrofia muscular avançada. São condições diferentes, com uma coisa em comum: a pessoa perde a fala e o movimento das mãos, mas continua lúcida, com opiniões, dor, vontades e afetos — e com o controle dos olhos preservado. É esse movimento que vira palavra.',
  /** As condições que o produto atende, no nível de detalhe que a família reconhece (tópico 1.2 do plano). */
  conditions: [
    {
      name: 'Esclerose lateral amiotrófica (ELA)',
      text: 'Doença neurodegenerativa progressiva: a pessoa perde a fala e os movimentos ao longo de meses ou anos, e o controle dos olhos costuma ser o último canal voluntário a permanecer. É o público prioritário da IrisFlow, porque aqui o olhar não é uma alternativa — é frequentemente a única via.',
    },
    {
      name: 'Tetraplegia alta por lesão medular',
      text: 'Lesão na coluna cervical que interrompe o movimento do pescoço para baixo. O quadro é estável, a cognição e a visão ficam intactas, e o usuário costuma ser mais jovem e familiarizado com tecnologia.',
    },
    {
      name: 'Sequela grave de AVC',
      text: 'Quando o acidente vascular cerebral atinge as áreas da fala e do movimento, mas preserva a compreensão. Exige avaliação caso a caso: a IrisFlow serve quando o controle ocular e a cognição estão preservados.',
    },
    {
      name: 'Paralisia cerebral severa e distrofias musculares avançadas',
      text: 'Condições em que a fala e as mãos não respondem, mas o olhar sim. Entram como extensão natural do produto, com adaptação de interface conforme o caso.',
    },
  ],
  /** Por que a tecnologia não chega: vem DEPOIS da pessoa, não antes. */
  why: 'A tecnologia que transforma o movimento dos olhos em comunicação existe há mais de vinte anos. O que impede que ela chegue à casa dessas famílias no Brasil é o preço do equipamento dedicado — e é essa a lacuna que a IrisFlow existe para fechar.',
  stats: [
    {
      value: 60.5,
      decimals: 1,
      suffix: '%',
      label: 'apontam o preço como a principal limitação das soluções existentes',
    },
    {
      value: 23.7,
      decimals: 1,
      suffix: '%',
      label: 'declararam não ter acesso a nenhuma solução adequada',
    },
    {
      value: 84.2,
      decimals: 1,
      suffix: '%',
      label: 'somados, precisam de uma solução que não existe para eles ou que não conseguem pagar',
    },
  ],
  note: 'Amostra não probabilística, por conveniência, de 38 respondentes, a maioria profissionais de saúde, coletada por formulário eletrônico. Serve como indício de percepção qualificada. Não vale como estimativa estatística da população brasileira.',
  contrast: {
    them: {
      label: 'Sistema de rastreamento ocular dedicado',
      price: 'R$ 15.000 a R$ 80.000',
      detail: 'Hardware proprietário, licença de software à parte, revenda física.',
    },
    us: {
      label: 'IrisFlow Communicator',
      // Sem `price` aqui de propósito: o "a partir de R$ X por mês" é
      // montado no ProblemSection com o menor preço vindo do banco
      // (usePlans), para o número não ficar duplicado neste arquivo.
      detail: 'Sem equipamento, sem fidelidade e com avaliação gratuita antes da primeira cobrança. A família só paga se o paciente conseguir operar.',
    },
  },
}

/* ---------------- módulos da solução (Quadro 7 do plano) ---------------- */

export type ModuleState = 'Implementado' | 'Em realização'

export const MODULES: {
  icon: IconName
  name: string
  description: string
  state: ModuleState
}[] = [
    {
      icon: 'alvo',
      name: 'Onboarding e calibração',
      description:
        'Tela inicial, seleção de perfil, acesso protegido do cuidador, calibração guiada de nove pontos e verificação rápida antes de cada sessão.',
      state: 'Implementado',
    },
    {
      icon: 'teclado',
      name: 'Comunicação',
      description:
        'Teclado virtual ordenado pela frequência das letras do português, campo de texto com síntese de voz, frases rápidas e pictogramas.',
      state: 'Implementado',
    },
    {
      icon: 'monitor',
      name: 'Computador',
      description:
        'Mouse virtual que assume o cursor do sistema operacional, permitindo abrir programas, navegar e clicar em alvos de tamanho razoável.',
      state: 'Implementado',
    },
    {
      icon: 'lazer',
      name: 'Lazer e bem-estar',
      description:
        'Jogos adaptados ao olhar (Estoura Bolhas, Jogo da Memória, Desenho e Siga o Alvo), galeria de imagens e conteúdo de estimulação.',
      state: 'Implementado',
    },
    {
      icon: 'pessoas',
      name: 'Cuidador',
      description:
        'Painel com status da sessão, tela de confirmação rápida de estado e histórico de solicitações de ajuda.',
      state: 'Implementado',
    },
    {
      icon: 'alerta',
      name: 'Emergência',
      description:
        'Célula de pedido de ajuda em posição fixa em todas as telas, com escalonamento automático para contato externo caso não haja resposta.',
      state: 'Implementado',
    },
    {
      icon: 'ajustes',
      name: 'Configurações',
      description:
        'Ajuste de tempo de fixação, sensibilidade, predefinição do filtro de suavização, layout de teclado, voz e idioma.',
      state: 'Implementado',
    },
    {
      icon: 'conversa',
      name: 'Assistente de conversação',
      description:
        'Composição assistida de frases por inteligência artificial, para reduzir o custo motor de escrever letra a letra.',
      state: 'Em realização',
    },
    {
      icon: 'voz',
      name: 'Clonagem de voz',
      description:
        'Reprodução das frases do usuário com a sua própria voz, gerada a partir de amostras de áudio anteriores à perda da fala.',
      state: 'Em realização',
    },
  ]

/* ---------------- como funciona: os seis estágios do pipeline ---------------- */

export const PIPELINE = [
  {
    step: '01',
    title: 'Captura',
    text: 'A webcam comum entrega vídeo contínuo a 1280 por 720 pixels, com taxa-alvo de trinta quadros por segundo. Nenhum equipamento adicional.',
  },
  {
    step: '02',
    title: 'Detecção facial',
    text: 'O MediaPipe, executado localmente em WebAssembly, extrai 478 marcos faciais tridimensionais por quadro, incluindo o contorno da íris de ambos os olhos.',
  },
  {
    step: '03',
    title: 'Engenharia de características',
    text: 'Um vetor compacto de cerca de 37 dimensões por olho reúne deslocamento da íris, abertura palpebral, ângulos da cabeça e termos de interação entre pose e deslocamento.',
  },
  {
    step: '04',
    title: 'Calibração e regressão',
    text: 'A partir da calibração de nove pontos, o sistema treina em tempo real um modelo de regressão Ridge individual. Ele aprende o olho daquela pessoa, naquele computador, naquela posição.',
  },
  {
    step: '05',
    title: 'Filtragem',
    text: 'Um filtro One Euro bidimensional, com três predefinições (estável, balanceada e responsiva), arbitra o compromisso entre ruído e latência conforme o perfil motor do usuário.',
  },
  {
    step: '06',
    title: 'Interação',
    text: 'O cursor de fixação entra na interface, com detecção de alvo, temporizador configurável e período refratário que evita reativação acidental.',
  },
]

/* ---------------- diferenciais ---------------- */

export const DIFFERENTIATORS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'olho',
    title: 'Modelo treinado para cada olho',
    text: 'Regressão Ridge com penalidade anisotrópica derivada da covariância das amostras, regularização escolhida por validação cruzada deixando um alvo inteiro de fora e detecção de pontos de calibração contaminados. É o ativo técnico proprietário da empresa.',
  },
  {
    icon: 'inclinacao',
    title: 'Compensação geométrica de pose',
    text: 'A correção da inclinação da cabeça é aplicada na saída, sem coeficiente ajustável, correta por construção mesmo fora da faixa vista na calibração. Colocar a pose como característica de entrada piorava o resultado, então foi medido e descartado, mesmo já estando pronto.',
  },
  {
    icon: 'webcam',
    title: 'Preparação automática do posto de uso',
    text: 'Antes de calibrar, o sistema mede distância, enquadramento, postura, iluminação, contraste, reflexo em lentes e cintilação da rede, e ajusta a câmera em malha fechada. Quando o driver não permite, informa a providência física em vez de fingir que ajustou.',
  },
  {
    icon: 'teclado',
    title: 'Teclado ordenado pelo português',
    text: 'As teclas seguem a frequência das letras do idioma (A, E, O, S, R, I, N, D, M, U, T, C, L) em vez da ordem QWERTY, o que encurta a distância média que o olho percorre entre teclas consecutivas. Os layouts alfabético e QWERTY seguem disponíveis.',
  },
  {
    icon: 'offline',
    title: 'Funciona sem internet',
    text: 'Núcleo de rastreamento, teclado e frases rápidas operam offline. Foi apontado como essencial por 57,9% dos respondentes da pesquisa, à frente até da síntese de voz — em casas do interior, com conexão instável, depender da internet seria fragilidade.',
  },
  {
    icon: 'cadeado',
    title: 'Privacidade por desenho',
    text: 'A privacidade tem três camadas. O rastreamento ocular é 100% local: imagens da câmera, marcos faciais, calibração e registros brutos de sessão nunca saem do dispositivo. Com conta vinculada, o que sai é apenas o texto que o paciente escolheu enviar, os alertas e os indicadores agregados. E dois módulos só funcionam com autorização expressa por funcionalidade, revogável a qualquer momento: a clonagem de voz, porque o áudio de referência é dado biométrico, e o chatbot integrado. Antes do lançamento comercial, o tráfego de rede da aplicação passa por verificação externa e o resultado é publicado: a promessa fica comprovada por terceiro, e não apenas declarada por nós.',
  },
]

/* ---------------- princípios de acessibilidade ---------------- */

export const A11Y_PRINCIPLES = [
  {
    n: '1',
    title: 'Retorno de fixação em três estágios',
    text: 'Contorno de destaque ao entrar no alvo, mudança de cor indicando seleção em progresso e barra de progresso até a confirmação. O usuário tem uma janela explícita para desistir.',
  },
  {
    n: '2',
    title: 'Posição fixa dos elementos de escape',
    text: 'O botão de retorno e a célula de emergência ocupam sempre o mesmo lugar, em todas as telas, sem exceção.',
  },
  {
    n: '3',
    title: 'Poucos alvos, grandes e bem espaçados',
    text: 'Reduz o erro de seleção causado por tremor ocular ou fadiga ao longo de horas de uso.',
  },
  {
    n: '4',
    title: 'Trilha de contexto permanente',
    text: 'Quem navega por fixação não dispõe da barra do sistema operacional como referência, então a etapa atual fica sempre visível.',
  },
]

/* ---------------- comparativo ---------------- */

export const COMPARISON = {
  columns: ['IrisFlow', 'Eye tracker dedicado', 'Comunicador nacional por assinatura'],
  rows: [
    { feature: 'Custo no primeiro ano', values: ['R$ 2.988 a R$ 7.788 em assinatura', 'R$ 15.000 a R$ 80.000', 'R$ 708 a R$ 1.490'] },
    { feature: 'Compra de equipamento', values: ['não', 'sim', 'parcial'] },
    { feature: 'Apontamento direto pelo olhar', values: ['sim', 'sim', 'não'] },
    { feature: 'Teclado ordenado pela frequência do português', values: ['sim', 'não', 'não'] },
    { feature: 'Controle do sistema operacional', values: ['sim', 'sim', 'não'] },
    { feature: 'Painel do cuidador e emergência', values: ['sim', 'parcial', 'não'] },
    { feature: 'Funciona offline', values: ['sim', 'sim', 'parcial'] },
    { feature: 'Validação clínica publicada', values: ['não', 'sim', 'parcial'] },
    { feature: 'Adoção institucional consolidada', values: ['não', 'sim', 'sim'] },
  ],
  honesty:
    'Duas coisas precisam ser ditas aqui, e nenhuma delas ajuda a vender. A primeira: a IrisFlow não é a solução mais barata do mercado brasileiro de tecnologia assistiva. Existem comunicadores nacionais por assinatura que custam menos, com distribuição consolidada e adoção por grandes centros de reabilitação. A afirmação correta é mais estreita e continua valendo: entre as soluções que apontam direto pelo olhar, categoria em que as alternativas pedem de R$ 6.000 a R$ 80.000 no primeiro ano, a IrisFlow é a mais barata do país, com uma redução de custo de acesso superior a 90%. A segunda: a IrisFlow ainda não tem estudo clínico publicado, e nisso perde para quem tem décadas de vantagem. Essa distância não se fecha com texto de site. Fecha com execução, e o programa de validação de noventa dias é o começo dela.',
}

/* ---------------- planos de assinatura ---------------- */

/**
 * Trial compartilhado por todos os planos. O banco (tabela `plans`) tem
 * `trial_days` por plano, mas hoje o site oferece o mesmo período para
 * as três faixas. Mantido como constante para o header, hero e o
 * componente de garantias exibirem o mesmo número.
 */
export const TRIAL_DAYS = 15

/* ---------------- programa beta ----------------
   A ÚNICA chave que liga e desliga o modo beta no site (docs/BETA.md §5).
   Com `ativo` verdadeiro: /cadastro, /pagamento e /sucesso redirecionam
   para /beta, os CTAs de "Testar grátis" viram "Entrar na beta" e a grade
   de planos aparece como indisponível. Desligar é trocar para false —
   nenhum arquivo é apagado.
   ------------------------------------------------ */

export const BETA = {
  ativo: true,
  /** Versão exibida enquanto `beta_program` não responde. */
  versaoReserva: '1.0.0-beta.1',
  /** Fim do acesso beta enquanto `beta_program` não responde. */
  fimReserva: '2027-03-31T23:59:59-03:00',
}

/** Rótulos de chamada usados no cabeçalho, no hero e nas chamadas finais. */
export const BETA_CTA = {
  label: 'Entrar na beta',
  labelLong: 'Entrar na beta gratuita',
  to: '/beta',
}

export type PlanId = 'essencial' | 'completo' | 'voz' | 'beta'

export type Plan = {
  id: PlanId
  name: string
  /** Valor em reais, sem centavos exibidos porque os três planos são inteiros. */
  price: number
  period: string
  /** Frase curta que aparece no card, abaixo do nome do plano. */
  tagline: string
  /** Quantos dispositivos podem estar ativos ao mesmo tempo. */
  devices: string
  /** Modalidade de suporte incluída no plano. */
  support: string
  /** Bullets que descrevem o que o plano inclui. */
  includes: string[]
  /** Marca o plano recomendado — usado como destaque no card. */
  recommended?: boolean
  /** Ressalva exibida no rodapé do card quando o plano depende de um
      módulo ainda em realização. */
  note?: string
  /**
   * Pode ser contratado pelo fluxo pago? Espelha `public.plans.purchasable`.
   * Ausente = true. Na reserva, `fetchPlans` marca false enquanto `BETA.ativo`.
   */
  purchasable?: boolean
}

/**
 * Catálogo de planos do frontend: texto de venda, bullets, notas.
 *
 * ATENÇÃO — `price` e `name` aqui são RESERVA. O valor de verdade é a
 * tabela `public.plans` no Supabase (`price_brl`, `name`), que é o que a
 * `complete_registration` grava na assinatura e o que a cobrança usa. O
 * site lê a tabela pelo hook `usePlans()` (src/hooks/usePlans.ts) e só
 * mostra o número daqui enquanto a consulta não volta ou se ela falha
 * (sem rede, sem .env.local). Para mudar um preço, mude no banco; depois
 * atualize este arquivo para a reserva não ficar mentindo no modo offline.
 *
 * O id casa com `public.plans.id` e é o que a página de cadastro envia
 * para o RPC `complete_registration`. Os campos `devices` e `support`
 * não têm coluna no banco e continuam sendo definidos só aqui.
 *
 * `purchasable` da reserva segue `BETA.ativo`: com a beta ligada, a grade
 * offline já aparece como indisponível, igual ao que o banco diz.
 */
export const PLANS: Plan[] = ([
  {
    id: 'essencial',
    name: 'Essencial',
    price: 249,
    period: 'por mês',
    tagline: 'Comunicação e controle do computador, para quem precisa do essencial pelo menor preço.',
    devices: '1 dispositivo ativo',
    support: 'Suporte por e-mail e tutoriais',
    includes: [
      'Comunicação por olhar, teclado em português e frases rápidas',
      'Controle do cursor do sistema operacional',
      'Painel do cuidador e acionamento de emergência',
      'Instalador para Windows 10/11 (macOS e Linux em preparação)',
      'Calibração guiada e preparação automática do posto',
      'Funcionamento offline do núcleo de rastreamento',
    ],
  },
  {
    id: 'completo',
    name: 'Completo',
    price: 399,
    period: 'por mês',
    tagline: 'O plano recomendado. Reduz o esforço de escrever letra a letra e acrescenta o lazer terapêutico.',
    devices: 'Até 3 dispositivos ativos',
    support: 'Suporte prioritário por mensagem',
    recommended: true,
    includes: [
      'Tudo do plano Essencial',
      'Assistente de conversação com inteligência artificial',
      'Módulo de lazer e bem-estar com jogos adaptados',
      'Relatórios de sessão e histórico de uso para a família',
      'Uma sessão de calibração assistida no primeiro mês',
      'Atualizações contínuas enquanto a assinatura estiver ativa',
    ],
  },
  {
    id: 'voz',
    name: 'Voz',
    price: 649,
    period: 'por mês',
    tagline: 'A voz do próprio paciente, reconstruída a partir de gravações anteriores à perda da fala.',
    note: 'A clonagem de voz está em fase experimental: o modelo é gerado e roda no próprio computador, e o módulo só é ativado mediante autorização expressa da família, porque o áudio de referência é dado biométrico. O plano Voz só entra em comercialização quando esse módulo for validado — até lá, indicamos o Completo.',
    devices: 'Até 5 dispositivos ativos',
    support: 'Suporte dedicado com resposta em até 4 h úteis',
    includes: [
      'Tudo do plano Completo',
      'Clonagem da voz do próprio paciente',
      'Perfis múltiplos no mesmo dispositivo',
      'Backup em nuvem das frases, pictogramas e configurações',
      'Onboarding assistido, com sessão de configuração acompanhada',
      'Canal direto com a equipe técnica',
    ],
  },
] satisfies Plan[]).map((p) => ({ ...p, purchasable: !BETA.ativo }))

/**
 * Plano do programa beta. Não entra em `PLANS` (a grade de venda continua
 * com os três planos pagos): só existe para a conta criada por
 * `complete_beta_registration` ter nome, bullets e `getPlan('beta')` resolver.
 */
export const BETA_PLAN: Plan = {
  id: 'beta',
  name: 'Beta',
  price: 0,
  period: 'sem cobrança',
  tagline:
    'Acesso completo durante o programa beta, em troca do retorno de quem usa. Sem cartão, sem cobrança.',
  devices: 'Sem limite durante a beta',
  support: 'Canal direto com a equipe',
  purchasable: false,
  includes: [
    'Comunicação por olhar, teclado em português e frases rápidas',
    'Controle do cursor do sistema operacional',
    'Painel do cuidador, app do cuidador no celular e acionamento de emergência',
    'Assistente de conversação e módulo de lazer e bem-estar',
    'Relatórios de sessão e histórico de uso para a família',
    'Instalador para Windows 10/11, com atualizações durante a beta (macOS e Linux em preparação)',
  ],
}

/** Garantias comuns a todos os planos, exibidas ao lado da grade. */
export const PLAN_GUARANTEES: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'relogio',
    title: 'Testa antes de pagar',
    text: 'A avaliação é gratuita e não pede cartão. Se a pessoa não conseguir operar o sistema, não há cobrança nenhuma.',
  },
  {
    icon: 'cadeado-aberto',
    title: 'Sai quando quiser',
    text: 'Cancelamento pelo próprio painel, a qualquer momento, sem multa e sem ligação de retenção.',
  },
  {
    icon: 'notebook',
    title: 'Nada para comprar',
    text: 'Roda na webcam do computador que já está em casa. Não existe equipamento a adquirir, nem taxa de adesão.',
  },
]

/**
 * Busca um plano pelo id, com fallback silencioso no recomendado.
 *
 * `plans` permite aplicar a mesma regra à lista vinda do banco (é o que
 * `usePlans().getPlan` faz); sem o argumento, procura na reserva.
 */
export function getPlan(id: string | null | undefined, plans: Plan[] = PLANS): Plan {
  // O plano beta não está na grade de venda, mas é o que a conta da beta
  // carrega: resolve antes do fallback para o recomendado.
  if (id === BETA_PLAN.id) return plans.find((p) => p.id === id) ?? BETA_PLAN
  return plans.find((p) => p.id === id) ?? plans.find((p) => p.recommended) ?? plans[0]
}

/** Menor preço de uma lista — usado em copy do tipo "a partir de R$ X". */
export function cheapestPlan(plans: Plan[] = PLANS): Plan {
  return plans.reduce((a, b) => (a.price < b.price ? a : b))
}

/** Plano exibido como padrão em CTAs onde o usuário ainda não escolheu. */
export const DEFAULT_PLAN: Plan = getPlan('completo')

/**
 * Menor preço da RESERVA. Para o valor do banco, use `usePlans().cheapest`;
 * esta constante só serve onde não há React (e como valor inicial do hook).
 */
export const CHEAPEST_PLAN: Plan = cheapestPlan()

/* ---------------- perguntas frequentes ---------------- */

export const FAQ = [
  {
    q: 'Preciso comprar algum equipamento?',
    a: `Não. O ${BRAND.product} foi construído sob a restrição de funcionar com uma webcam comum, e foi essa restrição autoimposta que definiu toda a arquitetura técnica. Se o computador da família tem câmera e roda Windows, macOS ou Linux, ele roda o ${BRAND.product}.`,
  },
  {
    q: 'Funciona com quem usa óculos?',
    a: 'Sim. A equipe esperava que as lentes fossem um fator de degradação, mas, depois da correção de um problema específico no processamento, a melhor sessão com lentes registrou o mesmo erro em pixels da melhor sessão sem lentes.',
  },
  {
    q: 'E se a cabeça do usuário escorregar durante a sessão?',
    a: 'O sistema mede os três ângulos da cabeça a cada quadro e aplica a correção geométrica na saída. Além disso, quando o desvio postural acumulado passa do equivalente a sessenta pixels, o cuidador recebe um aviso que distingue o desvio lento, que só exige reapoiar a nuca, do desvio errático, que indica necessidade de recalibrar.',
  },
  {
    q: `O ${BRAND.product} controla qualquer programa do computador?`,
    a: 'Ela entrega controle pleno dentro das próprias telas e controle do cursor do sistema operacional em nível funcional: abrir um programa, navegar em uma página, clicar em botões de tamanho razoável. Interfaces de terceiros com alvos pequenos, menus densos ou arraste preciso ficam fora do alcance confortável do rastreamento por webcam, e preferimos declarar isso a prometer o que a física do sensor não permite.',
  },
  {
    q: 'As imagens da câmera são enviadas para algum servidor?',
    a: 'Não. Imagens da câmera, marcos faciais, dados de calibração e registros brutos de sessão são processados e permanecem exclusivamente no dispositivo do usuário: nada disso trafega pela rede. Quando existe conta vinculada, o que sobe é apenas o texto que o paciente escolheu enviar, os alertas e indicadores agregados de uso. Clonagem de voz e chatbot integrado são as duas exceções, e cada uma depende de autorização expressa e revogável antes de funcionar.',
  },
  {
    q: 'Quanto tempo leva a calibração?',
    a: 'Entre dezenove e vinte e nove segundos, em uma grade de nove pontos com ordem embaralhada. A faixa é deliberada: acima de aproximadamente quarenta segundos, a fadiga ocular começa a degradar a qualidade dos próprios dados coletados.',
  },
  {
    q: 'Já existe validação clínica do produto?',
    a: 'Ainda não. O produto mínimo viável está construído e funcionando, com protocolo de medição reproduzível, mas os testes de precisão foram feitos com um único operador da equipe. O teste com pacientes do público-alvo é a próxima tarefa do roteiro técnico, seguido de um programa de validação de noventa dias com parceiros clínicos.',
  },
  {
    q: 'E se a família não tiver como pagar?',
    a: 'Fale com a gente antes de desistir. A IrisFlow mantém o programa IrisFlow Doa, pelo qual licenças são cedidas gratuitamente a pacientes indicados por associações parceiras. A solução existe por causa de uma barreira de preço, e seria incoerente deixar essa barreira de pé no nosso próprio caixa.',
  },
  {
    q: 'Quem instala e ensina a usar?',
    a: 'Nós. A principal causa de abandono de tecnologia assistiva não é falha do produto: é falta de apoio na adoção. Um software que funciona mas que a família não consegue instalar, calibrar ou ajustar acaba na gaveta. Por isso o primeiro uso guiado, o tutorial dentro do produto, o material em linguagem simples e o suporte em português fazem parte da assinatura, e não de um serviço à parte.',
  },
  {
    q: 'O código da IrisFlow é aberto?',
    a: 'Em parte, e a posição mudou. Durante a fase acadêmica o repositório inteiro era público. Agora o núcleo de calibração é proprietário, porque é a única barreira técnica real que uma empresa pequena tem. Continuam abertos a documentação técnica, o protocolo de medição de acurácia, os relatórios de precisão com as condições em que foram obtidos e os componentes de interface acessível. Além disso, o tráfego de rede da aplicação passa por verificação externa antes do lançamento, com resultado publicado.',
  },
  {
    q: `O ${BRAND.product} é um dispositivo médico?`,
    a: `Não. É um recurso de comunicação e de autonomia, sem finalidade de diagnóstico, de monitoramento clínico ou de decisão terapêutica, e a leitura preliminar da equipe é que fica fora do escopo da RDC 657/2022 da Anvisa. A confirmação formal desse enquadramento é uma tarefa do primeiro ano. O ${BRAND.product} não substitui avaliação clínica e não deve ser o único meio de pedido de socorro em situação de risco à vida.`,
  },
  {
    q: 'Como funciona o cancelamento?',
    a: 'Pelo painel da conta, a qualquer momento, sem multa. Não há equipamento adquirido que prenda o cliente. A retenção depende da utilidade percebida mês a mês.',
  },
]

/* ---------------- equipe e empresa ---------------- */

export const VALUES = [
  {
    title: 'Acessibilidade',
    text: 'A solução foi construída para rodar em webcam comum. Essa restrição, assumida no começo do projeto, definiu toda a arquitetura técnica.',
  },
  {
    title: 'Empatia',
    text: 'A posição fixa do botão de emergência e o retorno de fixação em três estágios existem porque o usuário precisa de tempo para desistir de uma seleção.',
  },
  {
    title: 'Inovação com propósito',
    text: 'A inteligência artificial entrou no produto para resolver um problema motor concreto, e é avaliada por esse resultado.',
  },
  {
    title: 'Autonomia e dignidade',
    text: 'O usuário é tratado como agente da própria comunicação. Toda a interface parte disso.',
  },
  {
    title: 'Transparência',
    text: 'Publicamos os resultados de precisão junto com as condições em que foram obtidos, inclusive quando desfavoráveis.',
  },
  {
    title: 'Colaboração',
    text: 'A relação com profissionais de saúde, associações e famílias se apoia em prescrição e validação, antes de qualquer venda.',
  },
]

/* ---------------- quem faz ----------------
   Três sócios fundadores, com as atribuições do tópico 6.3 do plano.
   ------------------------------------------------------- */

export const TEAM = [
  {
    name: 'Gabriel Almeida Santos Zambe',
    role: 'Product Owner e desenvolvimento back-end',
    text: 'Definiu e construiu o núcleo de visão computacional desde a primeira linha: calibração, regressão, filtragem e a suíte de testes automatizados. Decide o que entra no produto e em que ordem.',
  },
  {
    name: 'Marcus Vinicius Duarte',
    role: 'CTO e desenvolvimento front-end',
    text: 'Responde pela arquitetura da interface e pelos componentes de seleção por fixação. Em um produto assim, a usabilidade não é acabamento: é o que decide se a pessoa consegue ou não se comunicar.',
  },
  {
    name: 'Giulia Calioni',
    role: 'Diretoria de Marketing e Financeiro',
    text: 'Conduziu a modelagem financeira e a pesquisa de mercado com os 38 respondentes. Cuida do posicionamento, do relacionamento com associações e profissionais de saúde e da gestão do caixa.',
  },
]

/* ---------------- compromissos assumidos ----------------
   Tópico 3.1 do plano (ESG e Agenda 2030). Cada item aqui tem
   contrapartida concreta: nada entra só como declaração.
   ------------------------------------------------------- */

export const COMMITMENTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'pessoas',
    title: 'IrisFlow Doa',
    text: 'Licenças cedidas gratuitamente a pacientes indicados por associações parceiras. Quem não pode pagar não fica de fora do produto que existe justamente por causa do preço.',
  },
  {
    icon: 'lazer',
    title: 'Dia de impacto',
    text: 'Jornada remunerada para a equipe atuar junto às associações. É benefício e também método: aproximar quem escreve o código de quem usa o software é a forma mais rápida de descobrir o que está errado.',
  },
  {
    icon: 'notebook',
    title: 'Menos descarte, não mais',
    text: 'Não produzimos, embalamos, transportamos nem descartamos hardware. Rodar no computador que a família já tem prolonga a vida útil de um equipamento em vez de exigir outro.',
  },
  {
    icon: 'cadeado',
    title: 'O que o processamento local não resolve',
    text: 'Manter o rastreamento inteiro no dispositivo reduz o risco na origem, mas não elimina as obrigações da LGPD. Continuamos tratando dados de conta, de suporte, o texto que o paciente escolhe enviar e, quando autorizado, o áudio de referência da voz. A política de privacidade diz exatamente quais, por quanto tempo e como revogar cada autorização.',
  },
]

/** Objetivos de Desenvolvimento Sustentável a que a operação se conecta. */
export const SDGS = [
  { n: 3, title: 'Saúde e bem-estar', text: 'Restabelecer a comunicação permite que a pessoa relate dor e desconforto, informação clínica hoje frequentemente inacessível.' },
  { n: 9, title: 'Indústria e inovação', text: 'Tecnologia assistiva desenvolvida no Brasil, em um segmento historicamente dependente de importação.' },
  { n: 10, title: 'Redução das desigualdades', text: 'O que hoje depende de dezenas de milhares de reais passa a caber no orçamento de uma família de renda média.' },
  { n: 17, title: 'Parcerias', text: 'Associações de pacientes, profissionais de saúde e instituições de ensino ampliam o alcance além do que o mercado sozinho alcançaria.' },
]

/* ---------------- posição sobre o código ----------------
   Mudou na virada para a fase comercial: núcleo fechado,
   periferia aberta. Ver tópico 1.3 do plano.
   ------------------------------------------------------- */

export const CODE_POSITION = {
  title: 'O que é nosso e o que fica aberto.',
  lead: 'Durante a fase acadêmica o repositório inteiro era público. Na virada comercial essa posição mudou, e é melhor dizer isso do que deixar a página antiga no ar.',
  closed: {
    title: 'Fechado',
    text: 'O extrator de características do olho, o modelo de calibração individual, a detecção de pontos contaminados e a compensação geométrica de pose. É a única barreira técnica real que temos, num mercado em que detecção de rosto e redes de estimação de olhar estão disponíveis para qualquer concorrente.',
  },
  open: {
    title: 'Aberto',
    text: 'A documentação técnica, o protocolo de medição de acurácia, os relatórios de precisão com as condições em que foram obtidos e os componentes de interface acessível. O que precisa ser auditado em tecnologia assistiva é o que o software faz com a imagem capturada — e isso continua verificável.',
  },
}

export const ROADMAP = [
  {
    when: 'Concluído',
    title: 'Fluxo de rastreamento completo',
    text: 'Captura, detecção de 478 marcos faciais, calibração, predição e seleção por fixação em sessão real de uso.',
  },
  {
    when: 'Concluído',
    title: 'Sete módulos funcionais',
    text: 'Onboarding, comunicação, computador, lazer, cuidador, emergência e configurações, com instaladores para os três sistemas.',
  },
  {
    when: 'Concluído',
    title: 'Infraestrutura de medição',
    text: 'Gravação de sessões sem vídeo, reprodução determinista fora de linha e protocolo formal de acurácia com grade de validação separada.',
  },
  {
    when: 'Em realização',
    title: 'Assistente, voz e site de compra',
    text: 'Composição assistida de frases, clonagem da voz do próprio paciente e o ambiente web de contratação, que é este site. Enquanto esses três não ficam prontos, o que a IrisFlow tem para vender é o plano Essencial.',
  },
  {
    when: 'Próxima tarefa',
    title: 'Teste com o público-alvo',
    text: 'Precisão e usabilidade com dois pacientes com restrição motora severa. Até aqui, todas as sessões foram conduzidas por um integrante da própria equipe: a segunda pessoa a calibrar é o dado mais valioso que o projeto pode receber agora.',
  },
  {
    when: 'Pendente',
    title: 'Programa de validação de 90 dias',
    text: 'Com parceiros clínicos, medição de acurácia em uso continuado, ciclos quinzenais de ajuste e documentação de casos. As famílias dessa primeira safra ficam com condição diferenciada permanente.',
  },
]

export const MARQUEE_ITEMS = [
  'webcam comum',
  'processamento local',
  'sem hardware proprietário',
  'teclado em português',
  'síntese de voz',
  'funciona offline',
  'painel do cuidador',
  'emergência sempre acessível',
  'protocolo de medição aberto',
]

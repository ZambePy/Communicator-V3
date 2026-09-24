/* ============================================================
   Conteúdo do site, centralizado aqui para que texto e números
   possam ser revisados sem abrir nenhum componente.

   Regra: o que descreve o produto diz o que o aplicativo faz HOJE
   (conferido no código e no README da raiz), sem recurso prometido
   como pronto. Números de mercado vêm da pesquisa de 2026 (38
   respondentes) e do Plano de Negócios, e aparecem com a ressalva
   de amostra onde são usados.
   ============================================================ */

import type { IconName } from '@/components/ui/Icon'
import { resolveSiteUrl } from '@/seo/site'
import { platformsText, RELEASES_AVAILABLE, RELEASES_REPO } from '@/lib/releases'

/** Origem pública do site: base de URLs absolutas (og:image, canonical).
    Vem de VITE_SITE_URL no build; sem ela, o padrão de src/seo/site.ts. */
export const SITE_URL = resolveSiteUrl(import.meta.env.VITE_SITE_URL)

/** Plataformas suportadas hoje — uma frase só, usada em todo o site.
    Derivada de VITE_RELEASES_AVAILABLE (src/lib/releases.ts): com o padrão
    (só Windows) fica "Windows 10/11 (macOS e Linux em preparação)". */
export const PLATFORMS = platformsText(RELEASES_AVAILABLE)

/** As condições atendidas, na forma curta usada em títulos e chamadas. */
export const CONDITIONS_SHORT = 'ELA, AVC, esclerose múltipla, lesão medular e paralisia cerebral'

/** A frase de privacidade, igual no hero e no FAQ. */
export const PRIVACY_LINE =
  'O vídeo da webcam é processado 100 % no seu computador; nenhuma imagem sai dele.'

export const BRAND = {
  /** Nome da EMPRESA. Usado em rodapé, páginas legais, contato e "sobre". */
  company: 'IrisFlow',
  /** Nome do PRODUTO entregue ao usuário — o aplicativo instalável.
      Usado onde o texto fala do software: hero, solução, módulos,
      download e planos. Empresa e produto não são intercambiáveis. */
  product: 'IrisFlow Communicator',
  solution: 'a solução da IrisFlow',
  tagline: 'Seu olhar tem voz.',
  claim: 'Comunicação pelo olhar para quem tem ELA, AVC ou lesão medular — com a webcam que já está em casa.',
  /** Título e descrição padrão das páginas (document.title / meta description). */
  seoTitle: 'Comunicador por olhar para ELA, AVC e tetraplegia | IrisFlow',
  seoDescription:
    'O IrisFlow Communicator transforma o movimento dos olhos em fala e em controle do computador para pessoas com ELA, AVC, esclerose múltipla, lesão medular alta e paralisia cerebral — com a webcam comum, processado 100 % no seu computador. Beta gratuita.',
  email: 'irisflowteam@gmail.com',
  instagram: 'https://www.instagram.com/irisflow.ia',
  linkedin: 'https://www.linkedin.com/company/irisflowia/',
  /** Código-fonte público (GPL-3.0): o mesmo repositório dos instaladores
      (VITE_RELEASES_REPO). Ver CODE_POSITION. */
  code: `https://github.com/${RELEASES_REPO}`,
}

/** Texto do hero da home. */
export const HERO = {
  eyebrow: 'Comunicação assistiva por rastreamento ocular',
  title: 'Seu olhar tem voz',
  /** Palavra do título em gradiente. */
  titleAccent: 'voz',
  lead: 'O IrisFlow Communicator transforma o olhar em comunicação e controle do computador, usando uma webcam comum.',
  primary: 'Experimente sem risco',
  secondary: 'Ver como funciona',
}

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
  /** A frase de missão, ao lado da foto dos três. */
  mission:
    'Nenhuma família com ELA ou AVC no Brasil deveria ficar sem voz por causa do preço de um aparelho.',
}

/* ---------------- por condição ----------------
   Blocos curtos de "isto é para você": a família precisa se reconhecer
   antes de ler qualquer especificação. Uma frase de encaixe, uma de
   ressalva honesta e a pergunta que leva ao FAQ.
   ---------------------------------------------------------------- */

export const SEGMENTS: {
  id: string
  icon: IconName
  title: string
  fit: string
  caveat: string
}[] = [
  {
    id: 'ela',
    icon: 'olho',
    title: 'Para quem tem ELA',
    fit: 'O olhar costuma ser o último movimento voluntário preservado. O IrisFlow foi desenhado primeiro para ELA: teclado por fixação, frases prontas, pedido de ajuda sempre no mesmo lugar.',
    caveat: 'Vale começar cedo, enquanto a pessoa ainda fala: a calibração e o vocabulário ficam prontos antes de serem indispensáveis.',
  },
  {
    id: 'avc',
    icon: 'conversa',
    title: 'Após um AVC',
    fit: 'Quando a sequela atinge a fala e o movimento, mas a compreensão está preservada, a pessoa consegue apontar com os olhos o que quer dizer.',
    caveat: 'Em afasia com comprometimento da compreensão ou da leitura, a prancha de pictogramas ajuda mais que o teclado. Avaliação caso a caso.',
  },
  {
    id: 'lesao-medular',
    icon: 'monitor',
    title: 'Lesão medular alta',
    fit: 'Tetraplegia por lesão cervical: cognição e visão intactas, quadro estável. Além de falar, a pessoa volta a usar o computador — navegar, escrever, trabalhar.',
    caveat: 'No Windows, a lupa do Modo Computador torna alcançáveis os botões pequenos, mas arraste fino e menus muito densos continuam trabalhosos.',
  },
  {
    id: 'esclerose-multipla',
    icon: 'inclinacao',
    title: 'Esclerose múltipla',
    fit: 'Em fases avançadas, com disartria grave e perda de função das mãos, o olhar segue sendo um canal confiável. O tempo de fixação é ajustável conforme o dia.',
    caveat: 'Nistagmo ou visão dupla podem degradar o rastreamento; a preparação automática do posto informa quando a leitura não está confiável.',
  },
  {
    id: 'paralisia-cerebral',
    icon: 'lazer',
    title: 'Paralisia cerebral',
    fit: 'Para crianças e adultos sem fala funcional e sem controle das mãos, com o olhar preservado: prancha de pictogramas grande, jogos pelo olhar e teclado quando fizer sentido.',
    caveat: 'Movimentos involuntários acentuados ainda não foram avaliados pela equipe. Vale testar na beta antes de contar com o sistema.',
  },
]

/* ---------------- checklist de elegibilidade ---------------- */

export const ELIGIBILITY = {
  title: 'O IrisFlow serve para a pessoa que você tem em mente?',
  lead: 'Três perguntas resolvem a maior parte dos casos. Se a resposta for sim para as três, vale instalar e testar na beta — de graça, com a webcam que já está em casa.',
  items: [
    {
      q: 'Consegue fixar o olhar em um ponto por cerca de um segundo?',
      why: 'É o gesto que substitui o clique. Tremor leve e óculos não atrapalham, e o tempo de fixação é ajustável de 0,4 a 4 segundos.',
    },
    {
      q: 'Compreende o que é dito e reconhece letras ou figuras?',
      why: 'O teclado pede leitura; a prancha de pictogramas, não. Basta que a pessoa entenda o que quer comunicar.',
    },
    {
      q: 'A visão está preservada, ao menos em um dos olhos?',
      why: 'A câmera precisa ver a íris. Visão dupla, nistagmo intenso ou baixa visão severa podem impedir o rastreamento.',
    },
  ],
  extra: 'Se ficou em dúvida em alguma resposta, escreva para a gente: a equipe responde caso a caso, sem compromisso.',
}

/* ---------------- o problema ---------------- */

export const PROBLEM = {
  title: 'Quem perde a fala e o movimento continua com tudo a dizer — e com os olhos.',
  lead: 'A IrisFlow é feita para pessoas com esclerose lateral amiotrófica (ELA), sequela grave de AVC, esclerose múltipla avançada, tetraplegia alta por lesão medular, paralisia cerebral severa ou distrofia muscular avançada. São condições diferentes, com uma coisa em comum: a pessoa perde a fala e o movimento das mãos, mas continua lúcida, com opiniões, dor, vontades e afetos — e com o controle dos olhos preservado. É esse movimento que vira palavra.',
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
      name: 'Esclerose múltipla avançada',
      text: 'Quando a disartria e a perda de função das mãos tornam fala e digitação impraticáveis. A fadiga varia dia a dia, por isso o tempo de fixação é ajustável; visão dupla e nistagmo pedem avaliação antes.',
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

/* ---------------- módulos do aplicativo ----------------
   O que o IrisFlow Communicator tem hoje, na ordem em que a família
   encontra (a Home mostra os seis primeiros). Cada descrição foi conferida
   no aplicativo; "Experimental" é o mesmo selo que o próprio app mostra.
   ------------------------------------------------------------------ */

export type ModuleState = 'Implementado' | 'Experimental'

export const MODULES: {
  icon: IconName
  name: string
  description: string
  state: ModuleState
}[] = [
    {
      icon: 'teclado',
      name: 'Comunicação',
      description:
        'Teclado em dois passos — primeiro o grupo de letras, depois a letra —, frases rápidas e pictogramas, tudo falado em voz alta em português. Letras e botões grandes, sempre no mesmo lugar.',
      state: 'Implementado',
    },
    {
      icon: 'monitor',
      name: 'Modo Computador',
      description:
        'O cursor do olhar sai do aplicativo e controla o Windows inteiro: clicar, clicar duas vezes, clicar com o botão direito, arrastar, rolar e digitar em qualquer programa, com uma lupa para os alvos pequenos.',
      state: 'Implementado',
    },
    {
      icon: 'conversa',
      name: 'Conversa com o cuidador',
      description:
        'O que a pessoa escreve com os olhos chega ao app do cuidador no celular; o que a família responde aparece e é falado na tela do computador, com respostas rápidas que o cuidador cadastra.',
      state: 'Implementado',
    },
    {
      icon: 'alerta',
      name: 'Emergência',
      description:
        'Botão de socorro no mesmo lugar em todas as telas. Dispara um alarme no computador e aparece em tela cheia no app do cuidador; se ninguém confirmar no prazo, o pedido é reforçado.',
      state: 'Implementado',
    },
    {
      icon: 'lazer',
      name: 'Lazer e bem-estar',
      description:
        'Jogos feitos para o olhar (Estoura Bolhas, Siga o Alvo, Jogo da Memória e Desenho), notícias, meditação, câmera com álbum de fotos e um modo descanso para os olhos.',
      state: 'Implementado',
    },
    {
      icon: 'alvo',
      name: 'Primeiros passos e calibração',
      description:
        'Tutorial de dez passos nas telas de verdade, um perfil por paciente, preparo do posto de uso e calibração guiada de cerca de meio minuto, com teste de precisão ao final.',
      state: 'Implementado',
    },
    {
      icon: 'ajustes',
      name: 'Área do cuidador',
      description:
        'Protegida por PIN: tempo de fixação, estabilidade do cursor, som, voz e idioma, painel com o estado do rastreamento, guia de instalação e um relatório de suporte que nunca inclui o que a pessoa escreveu.',
      state: 'Implementado',
    },
    {
      icon: 'documento',
      name: 'Assistente de escrita',
      description:
        'Aprende as palavras e as frases que a pessoa usa e as sugere no teclado e na conversa, para que repetir o que já foi dito custe uma fixação em vez de vinte. Roda inteiro no computador.',
      state: 'Implementado',
    },
    {
      icon: 'voz',
      name: 'Voz personalizada',
      description:
        'O que a pessoa escreve sai na própria voz dela, recriada no computador a partir de uma gravação antiga — só com autorização expressa, porque voz é dado biométrico. Pede um computador com mais memória.',
      state: 'Experimental',
    },
  ]

/* ---------------- como funciona: os seis estágios, em linguagem de benefício ----------------
   Aqui entra o QUE cada etapa entrega a quem usa, não a técnica (bibliotecas,
   modelos, parâmetros): quem quiser o detalhe tem o código aberto e o README. */

/** A versão em três frases, para quem não é engenheiro. Fica acima do pipeline. */
export const PIPELINE_SIMPLE = [
  'A webcam filma o rosto e o programa encontra os olhos, dezenas de vezes por segundo.',
  'Uma calibração de cerca de meio minuto ensina ao programa para onde aquela pessoa está olhando, inclusive nos cantos da tela.',
  'Olhar fixo em uma tecla por um instante vira letra, frase e voz — tudo dentro do computador.',
]

export const PIPELINE = [
  {
    step: '01',
    title: 'Captura',
    text: 'A webcam comum do computador filma o rosto em vídeo contínuo. Nenhum equipamento adicional, nenhuma câmera especial.',
  },
  {
    step: '02',
    title: 'Leitura do rosto',
    text: 'A cada quadro, o programa localiza o rosto e os olhos, íris incluída, dentro do próprio computador. Nenhuma imagem sai dele.',
  },
  {
    step: '03',
    title: 'Leitura do olhar',
    text: 'Dos olhos e da posição da cabeça sai a estimativa de para onde a pessoa está olhando, sem exigir que ela fique imóvel.',
  },
  {
    step: '04',
    title: 'Calibração pessoal',
    text: 'Uma calibração rápida ensina ao sistema, na hora, o jeito de olhar daquela pessoa, naquele computador, naquela posição.',
  },
  {
    step: '05',
    title: 'Cursor estável',
    text: 'O cursor fica firme sem ficar atrasado, e dá para escolher entre mais estabilidade ou mais agilidade conforme o perfil motor de quem usa.',
  },
  {
    step: '06',
    title: 'Interação',
    text: 'O cursor de fixação entra na interface: olhar fixo em um alvo confirma a escolha, com tempo ajustável e uma pausa que evita a reativação acidental.',
  },
]

/* ---------------- diferenciais ---------------- */

export const DIFFERENTIATORS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'olho',
    title: 'Calibração que aprende o seu olhar',
    text: 'Em cerca de meio minuto, o sistema aprende o jeito de olhar de cada pessoa, naquele computador e naquela posição, e percebe quando um ponto da calibração saiu ruim para que ele não estrague o resultado. Ao final, um teste mede a precisão alcançada.',
  },
  {
    icon: 'inclinacao',
    title: 'A cabeça não precisa ficar imóvel',
    text: 'Movimentos pequenos — virar, inclinar, aproximar ou afastar o rosto — são compensados automaticamente. Quando a postura muda muito, a tela avisa e um reajuste de dois segundos resolve, sem refazer a calibração.',
  },
  {
    icon: 'webcam',
    title: 'Preparação automática do posto de uso',
    text: 'Antes de calibrar, o sistema confere distância, enquadramento, postura e iluminação, inclusive reflexo nos óculos, e ajusta zoom, brilho e contraste da câmera sozinho quando dá. Quando não dá, diz qual providência tomar em vez de fingir que ajustou.',
  },
  {
    icon: 'teclado',
    title: 'Escrever custa cada vez menos',
    text: 'O teclado tem letras enormes, escolhidas em dois passos, e o assistente de escrita aprende o vocabulário da pessoa: sugere a próxima palavra, a frase inteira e até a resposta que ela costuma dar a cada pergunta do cuidador.',
  },
  {
    icon: 'offline',
    title: 'Funciona sem internet',
    text: 'Rastreamento, teclado, frases e o alarme de emergência no computador funcionam offline. Isso foi apontado como essencial por 57,9% dos respondentes da nossa pesquisa, à frente até da síntese de voz — em casas com conexão instável, depender da internet seria fragilidade.',
  },
  {
    icon: 'cadeado',
    title: 'Privacidade por desenho',
    text: 'O rastreamento é 100% local: imagens da câmera, marcos do rosto, calibração e registros brutos de sessão nunca saem do computador. Com a conta vinculada, sai só o que a pessoa escolheu dizer, os alertas e números agregados de uso. A voz personalizada depende de autorização expressa e revogável. E o código é aberto: qualquer pessoa pode conferir essas promessas.',
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

/* ---------------- comparativo ----------------
   As duas categorias de comparação vêm da análise de mercado do Plano de
   Negócios (faixas de preço, não marcas). O custo da IrisFlow é o da grade
   de planos PREVISTA (12 × Essencial a 12 × Voz) — na beta, é gratuito.
   ---------------------------------------------- */

export const COMPARISON = {
  columns: ['IrisFlow', 'Eye tracker dedicado', 'Comunicador nacional por assinatura'],
  rows: [
    { feature: 'Custo no primeiro ano', values: ['grátis na beta; depois, R$ 2.988 a R$ 7.788 (previsto)', 'R$ 15.000 a R$ 80.000', 'R$ 708 a R$ 1.490'] },
    { feature: 'Compra de equipamento', values: ['não', 'sim', 'parcial'] },
    { feature: 'Apontamento direto pelo olhar', values: ['sim', 'sim', 'não'] },
    { feature: 'Controle do sistema operacional', values: ['sim', 'sim', 'não'] },
    { feature: 'Painel do cuidador e emergência', values: ['sim', 'parcial', 'não'] },
    { feature: 'Funciona offline', values: ['sim', 'sim', 'parcial'] },
    { feature: 'Validação clínica publicada', values: ['não', 'sim', 'parcial'] },
    { feature: 'Adoção institucional consolidada', values: ['não', 'sim', 'sim'] },
  ],
  honesty:
    'Duas coisas precisam ser ditas aqui, e nenhuma delas ajuda a vender. A primeira: a IrisFlow não é a solução mais barata do mercado brasileiro de tecnologia assistiva. Existem comunicadores nacionais por assinatura que custam menos, com distribuição consolidada e adoção por grandes centros de reabilitação — mas eles não apontam direto pelo olhar. Entre as soluções que apontam pelo olhar, cujo equipamento custa de R$ 15 mil a R$ 80 mil, a IrisFlow é a de menor custo de entrada que conhecemos no país: não há nada para comprar, e durante a beta o uso é gratuito. A segunda: a IrisFlow ainda não tem estudo clínico publicado, e nisso perde para quem tem décadas de vantagem. Essa distância não se fecha com texto de site. Fecha com execução, e o programa de validação de noventa dias é o começo dela.',
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
   A ÚNICA chave que liga e desliga o modo beta no site (README da raiz,
   seção "Site (site/)").
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
      'Comunicação por olhar: teclado, frases rápidas, pictogramas e voz em português',
      'Modo Computador: o Windows inteiro pelo olhar',
      'App do cuidador no celular, com conversa e alertas de emergência',
      'Lazer e bem-estar: jogos pelo olhar, notícias e meditação',
      'Calibração guiada e preparação automática do posto',
      `Instalador para ${PLATFORMS.long}, com funcionamento offline`,
    ],
  },
  {
    id: 'completo',
    name: 'Completo',
    price: 399,
    period: 'por mês',
    tagline: 'O plano recomendado. O assistente de escrita poupa o esforço de escrever letra a letra, e os relatórios mostram à família como está o uso.',
    devices: 'Até 3 dispositivos ativos',
    support: 'Suporte prioritário por mensagem',
    recommended: true,
    includes: [
      'Tudo do plano Essencial',
      'Assistente de escrita, que aprende as palavras e as frases da pessoa',
      'Relatórios de uso e do teste de precisão no app do cuidador',
      'O mesmo acesso em mais de um computador',
      'Uma sessão de calibração assistida no primeiro mês',
    ],
  },
  {
    id: 'voz',
    name: 'Voz',
    price: 649,
    period: 'por mês',
    tagline: 'A voz do próprio paciente, reconstruída a partir de gravações anteriores à perda da fala.',
    note: 'A voz personalizada está em fase experimental: é gerada e roda no próprio computador, pede um computador com 16 GB de memória para funcionar bem e só é ativada com autorização expressa da família, porque o áudio de referência é dado biométrico. O plano Voz só entra em comercialização quando esse recurso for validado — até lá, indicamos o Completo.',
    devices: 'Até 5 dispositivos ativos',
    support: 'Suporte dedicado, com prioridade',
    includes: [
      'Tudo do plano Completo',
      'Voz personalizada: a própria voz do paciente, recriada no computador',
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
    'Comunicação por olhar: teclado, frases rápidas, pictogramas e voz em português',
    'Modo Computador: o Windows inteiro pelo olhar',
    'App do cuidador no celular, com conversa, alertas de emergência e relatórios',
    'Assistente de escrita, lazer e bem-estar',
    'Voz personalizada, em fase experimental',
    `Instalador para ${PLATFORMS.long}, com atualizações automáticas durante a beta`,
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
    q: 'Em que estágio da ELA vale começar?',
    a: 'Antes de precisar. Quem ainda fala usa o IrisFlow para o computador e vai montando o vocabulário; quando a fala vai embora, a calibração e as frases já estão prontas e a família já sabe operar. Em estágio avançado também funciona — o olhar costuma ser o último movimento voluntário — mas o aprendizado é mais cansativo para todo mundo.',
  },
  {
    q: 'Serve para afasia pós-AVC?',
    a: 'Depende do tipo. Quando a sequela atinge a produção da fala e o movimento, mas a compreensão está preservada, sim: a pessoa aponta com os olhos o que quer dizer. Quando a afasia compromete a compreensão ou a leitura, o teclado ajuda pouco; a prancha de pictogramas e as frases rápidas são o caminho, com avaliação do fonoaudiólogo. É por isso que a beta é gratuita: para testar antes de contar com o sistema.',
  },
  {
    q: 'Serve para esclerose múltipla?',
    a: 'Sim, nas fases em que a disartria e a perda de função das mãos tornam a fala e a digitação impraticáveis. O tempo de fixação é ajustável dia a dia, porque a fadiga varia. Nistagmo ou visão dupla podem degradar o rastreamento; a preparação automática do posto avisa quando a leitura não está confiável, em vez de fingir que está.',
  },
  {
    q: 'Criança com paralisia cerebral consegue usar?',
    a: 'Consegue, quando o olhar está preservado e a criança compreende o que quer comunicar. Começa-se pela prancha de pictogramas grande e pelos jogos pelo olhar, que ensinam o gesto de fixar sem exigir leitura. O que ainda não avaliamos é o uso com movimentos involuntários acentuados — nesses casos, teste na beta com o terapeuta que acompanha.',
  },
  {
    q: 'As imagens da câmera saem do meu computador?',
    a: `Não. ${PRIVACY_LINE} Marcos faciais, dados de calibração e registros brutos de sessão também ficam no dispositivo. Quando existe conta vinculada, o que sobe é apenas o texto que o paciente escolheu enviar, os alertas e indicadores agregados de uso. A voz personalizada também é gerada no computador — a gravação de referência não é enviada — e só é ligada com autorização expressa e revogável, porque voz é dado biométrico. O assistente de escrita aprende no próprio computador e não envia nada.`,
  },
  {
    q: 'Preciso comprar algum equipamento?',
    a: `Não. O ${BRAND.product} foi construído sob a restrição de funcionar com uma webcam comum, e foi essa restrição autoimposta que definiu toda a arquitetura técnica. Basta um computador com ${PLATFORMS.long}, webcam e pelo menos 8 GB de memória — a voz personalizada, se for usada, pede 16 GB. A página da beta confere o computador antes da instalação.`,
  },
  {
    q: 'Funciona com quem usa óculos?',
    a: 'Sim. O reflexo fixo de uma lente é reconhecido e não atrapalha: o rastreamento enxerga em volta dele. O que atrapalha é reflexo que se move sobre os olhos, e o preparo do posto detecta esse caso antes da calibração e diz como resolver — em geral, inclinar a tela uns 10° para baixo ou reduzir luzes e janelas atrás da pessoa.',
  },
  {
    q: 'E se a cabeça do usuário escorregar durante a sessão?',
    a: 'O sistema acompanha a posição da cabeça o tempo todo e compensa sozinho os movimentos pequenos. Quando a postura fica diferente da calibração, a tela avisa e oferece um reajuste de dois segundos; se a precisão cair além do que foi medido, ela sugere refazer a calibração. Nenhum desses avisos bloqueia o botão de emergência.',
  },
  {
    q: `O ${BRAND.product} controla qualquer programa do computador?`,
    a: 'No Windows, sim: no Modo Computador o cursor do olhar sai do aplicativo e passa a clicar, clicar duas vezes, clicar com o botão direito, arrastar, rolar e digitar em qualquer programa. Uma lupa amplia a região em volta do olhar antes do clique, e é ela que torna alcançáveis botões pequenos, como o de fechar uma janela. Arraste fino e menus muito densos continuam trabalhosos com a precisão de uma webcam, e preferimos declarar isso a prometer o que a física do sensor não permite.',
  },
  {
    q: 'Quanto tempo leva a calibração?',
    a: 'Cerca de meio minuto: a pessoa só acompanha com o olhar alguns pontos na tela, inclusive nos cantos. A calibração é curta de propósito, porque, quando ela se estende, o cansaço dos olhos começa a atrapalhar a própria calibração.',
  },
  {
    q: 'Já existe validação clínica do produto?',
    a: 'Ainda não. O produto mínimo viável está construído e funcionando, com protocolo de medição reproduzível, mas os testes de precisão foram feitos com um único operador da equipe. O teste com pacientes do público-alvo é a próxima tarefa do roteiro técnico, seguido de um programa de validação de noventa dias com parceiros clínicos.',
  },
  {
    q: 'E se a família não tiver como pagar?',
    a: 'Durante a beta, nada é cobrado. Para depois dela, se o preço for o que impede o uso, fale com a gente antes de desistir: o IrisFlow existe justamente por causa de uma barreira de preço, e cada caso é conversado com a família.',
  },
  {
    q: 'Quem instala e ensina a usar?',
    a: 'Nós. A principal causa de abandono de tecnologia assistiva não é falha do produto: é falta de apoio na adoção. Um software que funciona mas que a família não consegue instalar, calibrar ou ajustar acaba na gaveta. Por isso o preparo guiado do posto, o tutorial dentro do aplicativo, o guia de instalação para o cuidador e o suporte em português, direto com a equipe, fazem parte do produto, e não de um serviço à parte.',
  },
  {
    q: 'O código da IrisFlow é aberto?',
    a: 'Sim. O código-fonte do aplicativo, do site e do app do cuidador é público no GitHub, sob a licença GPL-3.0, junto com o protocolo de medição de precisão e os resultados obtidos. Em tecnologia assistiva, o que precisa ser auditável é o que o programa faz com a imagem da câmera e com o que a pessoa escreve — e, com o código aberto, qualquer pessoa pode conferir.',
  },
  {
    q: `O ${BRAND.product} é um dispositivo médico?`,
    a: `Não. É um recurso de comunicação e de autonomia, sem finalidade de diagnóstico, de monitoramento clínico ou de decisão terapêutica, e a leitura preliminar da equipe é que fica fora do escopo da RDC 657/2022 da Anvisa. A confirmação formal desse enquadramento é uma tarefa do primeiro ano. O ${BRAND.product} não substitui avaliação clínica e não deve ser o único meio de pedido de socorro em situação de risco à vida.`,
  },
  {
    q: 'Como funciona o cancelamento?',
    a: 'Durante a beta não há cartão nem cobrança, então não há o que cancelar: para sair, basta pedir a exclusão da conta. Quando os planos pagos começarem, o cancelamento será pelo painel da conta, a qualquer momento e sem multa — não há equipamento comprado que prenda ninguém.',
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

export const TEAM: {
  name: string
  role: string
  /** Uma frase, no cartão com foto. */
  line: string
  text: string
  /** Base do arquivo em /team/ (gera -400/-800 .jpg e .webp). */
  photo: string
  alt: string
}[] = [
  {
    name: 'Gabriel Almeida Santos Zambe',
    role: 'Product Owner e back-end',
    line: 'Escreveu o núcleo de calibração desde a primeira linha.',
    text: 'Definiu e construiu o núcleo de rastreamento ocular desde a primeira linha, da calibração à suíte de testes automatizados. Decide o que entra no produto e em que ordem.',
    photo: 'gabriel',
    alt: 'Gabriel Zambe, de óculos e camiseta branca, braços cruzados, olhando para a câmera.',
  },
  {
    name: 'Marcus Vinicius Duarte',
    role: 'CTO e front-end',
    line: 'Responde pela interface que a pessoa opera só com os olhos.',
    text: 'Responde pela arquitetura da interface e pelos componentes de seleção por fixação. Em um produto assim, a usabilidade não é acabamento: é o que decide se a pessoa consegue ou não se comunicar.',
    photo: 'marcus',
    alt: 'Marcus Duarte, de camiseta branca, em pé com os braços cruzados.',
  },
  {
    name: 'Giulia Calioni',
    role: 'Marketing e Financeiro',
    line: 'Conduziu a pesquisa com as famílias e cuida do caixa.',
    text: 'Conduziu a modelagem financeira e a pesquisa de mercado com os 38 respondentes. Cuida do posicionamento, do relacionamento com associações e profissionais de saúde e da gestão do caixa.',
    photo: 'giulia',
    alt: 'Giulia Calioni, de cabelo comprido, de perfil, sorrindo para a câmera.',
  },
]

/** Foto dos três, usada na Home e na abertura da página Sobre. */
export const TEAM_PHOTO = {
  base: 'equipe',
  alt: 'Giulia, Marcus e Gabriel, os três fundadores da IrisFlow, em estúdio, sorrindo.',
}

/* ---------------- história de origem e números ---------------- */

export const ORIGIN = {
  title: 'Começou como projeto de estudo. Virou a única coisa que a gente queria fazer.',
  paragraphs: [
    'O projeto começou em ambiente acadêmico, acompanhado por orientadores, com uma pergunta técnica: dá para estimar o olhar com precisão suficiente, só com a webcam comum e sem hardware dedicado, para escolher uma tecla na tela?',
    'A resposta veio junto com uma pesquisa de mercado. Entre os 38 respondentes — a maioria profissionais de saúde — 60,5 % apontaram o preço como a principal barreira das soluções existentes, e uma delas, médica, contou que a própria mãe tinha perdido a fala na semana anterior. A pergunta deixou de ser técnica.',
    'Daí nasceu a IrisFlow: três pessoas, um aplicativo para o computador, um app para o celular do cuidador e um programa beta gratuito aberto às famílias. O código é público, e as medições de precisão são publicadas com as condições em que foram feitas — inclusive quando o resultado não favorece.',
  ],
  numbers: [
    { value: 100, suffix: ' %', label: 'do processamento da imagem feito no próprio computador' } as { value: number; suffix: string; label: string; decimals?: number },
    { value: 1, suffix: ' min', label: 'ou menos para calibrar, olhando para alguns pontos na tela' },
    { value: 60.5, suffix: ' %', decimals: 1, label: 'dos respondentes da nossa pesquisa apontam o preço como a principal barreira' },
    { value: 0, suffix: '', label: 'imagens da câmera enviadas para a internet' },
  ],
}

/* ---------------- compromissos assumidos ----------------
   Só entra aqui o que já vale hoje e dá para conferir: no produto, no
   código público ou nos termos da beta.
   ------------------------------------------------------- */

export const COMMITMENTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'pessoas',
    title: 'Beta gratuita de verdade',
    text: 'Durante a beta, o aplicativo completo e o app do cuidador são gratuitos, sem cartão cadastrado. Quando ela terminar, nada é cobrado automaticamente: plano pago só com contratação expressa da família.',
  },
  {
    icon: 'cadeado-aberto',
    title: 'Código aberto',
    text: 'O código do aplicativo, do site e do app do cuidador é público, sob a licença GPL-3.0. A promessa de que a imagem da câmera não sai do computador pode ser conferida por qualquer pessoa, e não apenas declarada por nós.',
  },
  {
    icon: 'notebook',
    title: 'Menos descarte, não mais',
    text: 'Não produzimos, embalamos, transportamos nem descartamos hardware. Rodar no computador que a família já tem prolonga a vida útil de um equipamento em vez de exigir outro.',
  },
  {
    icon: 'cadeado',
    title: 'O que o processamento local não resolve',
    text: 'Manter o rastreamento inteiro no computador reduz o risco na origem, mas não elimina as obrigações da LGPD. Continuamos tratando dados de conta, de suporte e o texto que a pessoa escolhe enviar ao celular do cuidador. A política de privacidade diz exatamente quais, por quanto tempo e como pedir a exclusão.',
  },
]

/** Objetivos de Desenvolvimento Sustentável a que a operação se conecta. */
export const SDGS = [
  { n: 3, title: 'Saúde e bem-estar', text: 'Restabelecer a comunicação permite que a pessoa relate dor e desconforto, informação clínica hoje frequentemente inacessível.' },
  { n: 9, title: 'Indústria e inovação', text: 'Tecnologia assistiva desenvolvida no Brasil, em um segmento historicamente dependente de importação.' },
  { n: 10, title: 'Redução das desigualdades', text: 'Um eye tracker dedicado custa de R$ 15 mil a R$ 80 mil, pago de uma vez. O IrisFlow roda no computador que a família já tem, é gratuito durante a beta e, depois, será uma assinatura mensal cancelável.' },
  { n: 17, title: 'Parcerias', text: 'Buscamos associações de pacientes, profissionais de saúde e instituições de ensino para validar o produto com quem vai usá-lo e levá-lo a mais famílias.' },
]

/* ---------------- código aberto ----------------
   O repositório do produto é público, sob a GPL-3.0 (LICENSE na raiz).
   O link vem de BRAND.code — o mesmo repositório dos instaladores.
   ------------------------------------------------------- */

export const CODE_POSITION = {
  title: 'O código é aberto, do rastreamento à interface.',
  lead: 'O código-fonte do IrisFlow Communicator, do site e do app do cuidador é público no GitHub, sob a licença GPL-3.0.',
  what: {
    title: 'O que está aberto',
    text: 'O rastreamento e a calibração, a interface operada pelo olhar, o app do cuidador, este site e o banco de dados, junto com o protocolo de medição de precisão e os resultados obtidos, com as condições em que foram medidos.',
  },
  why: {
    title: 'Por que aberto',
    text: 'Em tecnologia assistiva, o que precisa ser auditável é o que o software faz com a imagem da câmera e com o que a pessoa escreve. Com o código público, qualquer pessoa pode conferir que nada disso sai do computador sem autorização.',
  },
}

export const ROADMAP = [
  {
    when: 'Concluído',
    title: 'Rastreamento completo',
    text: 'Da câmera à seleção por fixação, com preparo do posto de uso, calibração guiada e teste de precisão, tudo processado no próprio computador.',
  },
  {
    when: 'Concluído',
    title: `Aplicativo para ${PLATFORMS.short}`,
    text: 'Comunicação, teclado com assistente de escrita, Modo Computador, conversa com o cuidador, emergência, lazer e área do cuidador, com atualização automática.',
  },
  {
    when: 'Concluído',
    title: 'App do cuidador e site',
    text: 'App para Android com conversa, alertas e relatórios, e este site, com a inscrição na beta, a conta e os downloads.',
  },
  {
    when: 'Em realização',
    title: 'Beta aberta às famílias',
    text: 'Gratuita até o fim do programa. É a fase de ouvir quem usa de verdade e corrigir rápido; a voz personalizada, já disponível, segue em fase experimental.',
  },
  {
    when: 'Próxima tarefa',
    title: 'Teste com o público-alvo',
    text: 'Precisão e usabilidade com pacientes com restrição motora severa. Até aqui, as medições de precisão foram feitas por um integrante da própria equipe: a próxima pessoa a calibrar é o dado mais valioso que o projeto pode receber agora.',
  },
  {
    when: 'Pendente',
    title: 'Programa de validação de 90 dias',
    text: 'Com parceiros clínicos: medição de precisão em uso continuado, ciclos quinzenais de ajuste e documentação de casos.',
  },
]

export const MARQUEE_ITEMS = [
  'ELA · AVC · esclerose múltipla · lesão medular · paralisia cerebral',
  'webcam comum',
  'processamento local',
  'sem hardware proprietário',
  'teclado em português',
  'síntese de voz',
  'funciona offline',
  'painel do cuidador',
  'emergência sempre acessível',
  'código aberto',
]

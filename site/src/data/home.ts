/* ============================================================
   Conteúdo da home. Pouco texto de propósito: a home mostra o
   produto funcionando e deixa a explicação longa para as páginas
   de dentro (Produto, Como funciona, Planos, FAQ).
   A regra do content.ts vale aqui: o que descreve o produto diz o
   que o aplicativo faz HOJE, conferido no código.
   ============================================================ */

import { RESSALVA_DOS_ALERTAS } from './cuidador'

/** Um vídeo real do produto, com um quadro dele como pôster. */
export type Demo = {
  mp4: string
  webm?: string
  poster: string
  /** Descreve o que acontece no vídeo, para quem não vê. */
  descricao: string
}

/** Gravação de tela do IrisFlow Communicator (18/09/2026): teclado, menu e tutorial,
 *  com o cursor do olhar. */
export const DEMO_COMMUNICATOR: Demo = {
  // VP9 primeiro, H.264 de reserva: o Chromium sem codecs proprietários (o de
  // várias distribuições Linux) não toca MP4, e o pôster ficava parado.
  webm: '/media/demo-communicator.webm',
  mp4: '/media/demo-communicator.mp4',
  // O quadro do menu (10,5 s), não o de abertura: nos primeiros 9 s o app mostra a
  // Emergência por cima de "Voltar ao tutorial" (defeito do app, anotado na auditoria
  // P2-13, 21/10/2026). O pôster não pode carregar esse defeito.
  poster: '/media/demo-communicator-poster.jpg',
  descricao:
    'Gravação da tela do IrisFlow Communicator: a pessoa escolhe um grupo de letras e depois a letra só com o olhar, volta ao menu principal e ajusta o tempo de fixação no tutorial. O círculo na tela é o cursor do olhar.',
}

/** Gravação de tela do IrisFlow Cuidador no celular, em modo de demonstração
 *  (dados simulados). Da gravação original saíram só os trechos com avisos
 *  técnicos de desenvolvimento (tela de entrada e nota de push na aba Alertas);
 *  a barra do Android deu lugar a uma barra de status limpa, com a mesma hora. */
export const DEMO_CUIDADOR: Demo = {
  mp4: '/media/demo-cuidador.mp4',
  webm: '/media/demo-cuidador.webm',
  poster: '/media/demo-cuidador-poster.jpg',
  descricao:
    'Gravação da tela do IrisFlow Cuidador, com dados de demonstração: o resumo da sessão da pessoa, a conversa em que as respostas são faladas na tela dela, os relatórios da semana, os ajustes feitos de longe e a conta.',
}

/** A explicação curta da solução, no alto dos capítulos. */
export const COMO_FUNCIONA_EM_UMA_FRASE =
  'A webcam acompanha para onde você olha, e o cursor vai junto. Para clicar, basta manter o olhar num botão por um instante. Se mudar de ideia, é só desviar.'

export type Capitulo = {
  id: string
  /** Nome curto do trecho, na legenda do vídeo. */
  rotulo: string
  titulo: string
  texto: string
  /** Onde o capítulo começa na gravação DEMO_COMMUNICATOR, em segundos. Termina onde o próximo começa. */
  inicio: number
  /** O que a gravação mostra a partir de cada instante (segundos da gravação, dentro do capítulo). */
  legendas: { de: number; texto: string }[]
  /** Um quadro da gravação neste capítulo: o pôster com movimento reduzido, que não toca sozinho. */
  quadro: string
}

/** Duração da gravação DEMO_COMMUNICATOR, para o último capítulo antes de o vídeo carregar. */
export const DURACAO_DA_DEMO_COMMUNICATOR = 23.57

/**
 * Os capítulos do produto, na ordem da gravação DEMO_COMMUNICATOR: o teclado
 * (0–9 s), o menu (9–16 s) e o tutorial (16 s ao fim). O vídeo toca uma vez
 * por todos, e o passo aceso e a legenda seguem o tempo dele. As legendas
 * dizem só o que aparece na tela naquele momento (conferido quadro a quadro).
 */
export const CAPITULOS: Capitulo[] = [
  {
    id: 'falar',
    rotulo: 'Escrever',
    titulo: 'Escreva com o olhar. O computador fala.',
    texto:
      'Primeiro o grupo de letras, depois a letra. O teclado sugere palavras e guarda as frases do dia a dia, que saem em voz alta na hora.',
    inicio: 0,
    legendas: [
      { de: 0, texto: 'O círculo é o cursor do olhar.' },
      { de: 1.2, texto: 'Olhar parado no grupo: ele se abre.' },
      { de: 2.6, texto: 'Depois, a letra.' },
      { de: 5.1, texto: 'A letra entra no texto.' },
      { de: 6.4, texto: 'O mesmo gesto volta ao início.' },
    ],
    quadro: '/media/capitulos/escrever.jpg',
  },
  {
    id: 'escolher',
    rotulo: 'Escolher',
    titulo: 'Tudo ao alcance do olhar.',
    texto: 'Botões grandes, sempre no mesmo lugar. O pedido de ajuda fica no canto de todas as telas.',
    inicio: 9,
    legendas: [
      { de: 9, texto: 'Nove cartões, sempre no mesmo lugar.' },
      { de: 10, texto: 'O cartão sob o olhar se acende.' },
      { de: 13.8, texto: 'A emergência fica sempre no canto.' },
    ],
    quadro: '/media/capitulos/escolher.jpg',
  },
  {
    id: 'aprender',
    rotulo: 'Aprender',
    titulo: 'Cada pessoa no seu ritmo.',
    texto:
      'A calibração leva cerca de um minuto e o tutorial de dez passos ensina na prática. Quanto tempo o olhar fica parado para clicar, quem decide é a pessoa.',
    inicio: 16.1,
    legendas: [
      { de: 16.1, texto: 'O tutorial ensina com a prática.' },
      { de: 17.2, texto: 'Frases prontas: o caminho mais curto.' },
      { de: 18.3, texto: 'Depois, uma frase escrita por você.' },
    ],
    quadro: '/media/capitulos/aprender.jpg',
  },
]

/** O contraste de preço que define o projeto. A faixa junta as duas fontes da
 *  equipe: R$ 15 mil a R$ 80 mil nas linhas PCEye e EyeMobile (plano de negócios,
 *  revenda Civiam) e R$ 60 mil a R$ 120 mil nos aparelhos I-Series já
 *  nacionalizados (aba 7 da planilha financeira). */
export const CONTRASTE = {
  titulo: 'O mesmo olhar, sem o aparelho caro.',
  dedicado: {
    rotulo: 'Rastreador ocular dedicado, no Brasil',
    valor: 'R$ 15 mil a R$ 120 mil',
    nota: 'equipamento importado, com sensor próprio, pago de uma vez',
  },
  irisflow: {
    rotulo: 'IrisFlow Communicator',
    valor: 'A webcam que já está em casa',
    nota: 'grátis na beta; depois, a partir de R$ 249 por mês',
  },
}

export const CUIDADOR_DESTAQUE = {
  titulo: 'Quem cuida acompanha de qualquer lugar.',
  texto: 'O app IrisFlow Cuidador mostra no celular o que a pessoa escreve, os pedidos de ajuda e o resumo do dia.',
  pontos: [
    'O que você responde é falado na tela dela.',
    'O pedido de socorro ocupa a tela toda e é reenviado se ninguém confirmar.',
    'Ajustes do computador feitos de longe.',
  ],
  // A ressalva dos alertas não repete aqui: a home a mostra uma vez só, no cartão "Pedir socorro",
  // onde a promessa do alerta no celular aparece primeiro (auditoria P2-14, 21/10/2026).
}

export const PRIVACIDADE = {
  titulo: 'A câmera vê. Ninguém mais.',
  texto:
    'Todo o rastreamento acontece no computador. Nenhuma imagem da webcam é gravada ou enviada: o que sai, quando há conta, é só o que a pessoa escolheu dizer, os alertas e os números de uso.',
}

/* ---------------- rodada 3 (21/10/2026): a home no estilo do vídeo ----------------
   Mesma regra: o que está aqui o app faz hoje (conferido no código do
   desktop e do app do cuidador). */

/** "Testar com o meu olhar": o teste ao vivo com a câmera, que só baixa no clique. */
export const TESTE_AO_VIVO = {
  botao: 'Testar com o meu olhar',
  fechar: 'Fechar o teste',
  nota: 'No computador, com a webcam. A imagem não sai dele.',
  notaNoCelular: 'No computador, dá para testar com o próprio olhar.',
  carregando: 'Abrindo o teste…',
  falhou: 'Não consegui abrir o teste agora. Confira a internet e tente de novo; o vídeo acima mostra o IrisFlow em uso.',
  tentarDeNovo: 'Tentar de novo',
}

/**
 * A tela real do app que acompanha um cartão (as imagens de public/media).
 * Largura e altura são as da imagem: o navegador reserva o espaço antes de ela
 * chegar, sem pulo de layout.
 */
export type TelaDoRecurso = {
  src: string
  /** O que a imagem mostra, para quem não a vê. */
  alt: string
  largura: number
  altura: number
  /** Captura do celular (vertical): vai numa moldura de celular, não num monitor. */
  celular?: boolean
}

export type RecursoDoOlhar = {
  id: 'escrever' | 'socorro' | 'cuidar' | 'privacidade' | 'voz' | 'dor'
  titulo: string
  texto: string
  pontos: string[]
  /** Ressalva do que ainda depende de algo, dita junto da promessa. */
  nota?: string
  link?: { to: string; rotulo: string }
  /**
   * A tela de verdade deste recurso. Falta só onde ainda não há captura
   * ("Mostrar onde dói"): nada é desenhado no lugar dela.
   */
  tela?: TelaDoRecurso
}

/*
 * Revisão final de 22/10/2026: a beta.12 (com "Mostrar onde dói") sai na noite
 * de 22/10, então a ressalva do cartão 06 e a abertura de "cinco coisas e uma
 * que chega" saíram. ANTES DE PUBLICAR O SITE, conferir que a beta.12 já está
 * no ar: sem ela, o cartão promete o que o instalador da página de download
 * ainda não tem.
 */
export const O_QUE_UM_OLHAR_FAZ = {
  titulo: 'O que dá para fazer só com o olhar.',
  texto: 'Seis coisas que o IrisFlow faz hoje. Todas pedem só o olhar parado por um instante.',
}

/** Os cartões numerados, na ordem do uso: escrever, pedir socorro, quem cuida, privacidade, voz, dor.
 *  Cada um traz a tela real do app (public/media), menos o último, que ainda não tem captura. */
export const RECURSOS_DO_OLHAR: RecursoDoOlhar[] = [
  {
    id: 'escrever',
    titulo: 'Escrever',
    texto: 'Primeiro o grupo de letras, depois a letra. As sugestões completam a palavra, e as frases do dia a dia já estão prontas.',
    pontos: ['Teclado em dois passos', 'Sugestões que aprendem', 'Frases e pictogramas'],
    link: { to: '/como-funciona', rotulo: 'Ver o teclado' },
    tela: {
      src: '/media/telas/teclado.webp',
      alt: 'Teclado do IrisFlow Communicator: seis grupos grandes de letras e uma tecla de frases.',
      largura: 1600,
      altura: 900,
    },
  },
  {
    id: 'socorro',
    titulo: 'Pedir socorro',
    texto: 'O botão de emergência fica sempre no mesmo canto e continua disponível mesmo quando o rastreamento oscila.',
    pontos: ['Alarme no computador', 'Alerta no celular de quem cuida', 'Reforço se ninguém confirmar'],
    nota: RESSALVA_DOS_ALERTAS,
    link: { to: '/solucao', rotulo: 'A emergência' },
    tela: {
      src: '/media/telas/emergencia.webp',
      alt: 'Tela de emergência com quatro botões grandes: dor forte, falta de ar, frio ou febre e outra emergência.',
      largura: 1600,
      altura: 900,
    },
  },
  {
    id: 'cuidar',
    titulo: 'Conversar com quem cuida',
    texto: 'O que a pessoa escreve chega ao IrisFlow Cuidador, e o que a família responde é falado na tela dela.',
    pontos: ['Mensagens em tempo real', 'Respostas faladas na tela', 'Ajustes feitos a distância'],
    link: { to: '/cuidador', rotulo: 'O app de quem cuida' },
    tela: {
      src: '/media/cuidador/conversa.webp',
      alt: 'Conversa no app IrisFlow Cuidador, com as mensagens da pessoa e as respostas da família.',
      largura: 784,
      altura: 1544,
      celular: true,
    },
  },
  {
    id: 'privacidade',
    titulo: 'Ficar no computador',
    texto: 'A imagem da webcam é lida ali mesmo. Nada é gravado nem enviado, e o código é aberto para quem quiser conferir.',
    pontos: ['Rastreamento no próprio computador', 'Nenhuma imagem gravada', 'Código aberto (GPL-3.0)'],
    link: { to: '/privacidade', rotulo: 'Como tratamos os dados' },
    tela: {
      src: '/media/telas/preparo.webp',
      alt: 'Tela de preparo do IrisFlow Communicator, que pede a câmera e avisa: a imagem nunca sai deste computador, nada é gravado nem enviado.',
      largura: 1600,
      altura: 900,
    },
  },
  {
    id: 'voz',
    titulo: 'Falar em voz alta',
    texto: 'Tudo o que é escrito sai em voz alta, em português. A voz da própria pessoa, recriada de gravações antigas, está em fase experimental.',
    pontos: ['Voz em português', 'Frases rápidas faladas na hora', 'Voz personalizada, experimental'],
    link: { to: '/solucao', rotulo: 'Os módulos' },
    tela: {
      src: '/media/telas/voz.webp',
      alt: 'Tela de configuração da voz personalizada, recurso experimental: a voz da pessoa recriada a partir de uma gravação, tudo no computador.',
      largura: 1600,
      altura: 900,
    },
  },
  {
    id: 'dor',
    titulo: 'Mostrar onde dói',
    texto: 'Um mapa do corpo para dizer onde dói e quanto, só com o olhar. O computador fala a frase e a manda para quem cuida.',
    pontos: ['Onde e quanto dói', 'A frase dita em voz alta', 'Vai para a conversa com quem cuida'],
  },
]

/** A lista numerada dos módulos, com a tela real ao lado. */
export const MODULOS_NA_HOME = {
  titulo: 'As telas do aplicativo.',
  texto: 'Toque, passe o mouse ou use o teclado numa linha para ver a tela de verdade.',
  link: 'Ver todos os módulos',
}

/** "Para quem": as condições, numa curva. */
export const PARA_QUEM_O_OLHAR = {
  titulo: 'Quando o corpo para, o olhar continua.',
  texto: 'Em muitas condições, o olhar é o último movimento que sobra. Cada caso é diferente, por isso a beta é gratuita: dá para testar antes de depender dela.',
}

export const CONDICOES_NO_ARCO: { nome: string; to: string }[] = [
  { nome: 'ELA', to: '/como-funciona#para-ela' },
  { nome: 'AVC de tronco', to: '/como-funciona#para-avc' },
  { nome: 'Lesão medular alta', to: '/como-funciona#para-lesao-medular' },
  { nome: 'Paralisia cerebral', to: '/como-funciona#para-paralisia-cerebral' },
  // As duas últimas estão em "Outra condição?" da página Como funciona.
  { nome: 'Síndrome do encarceramento', to: '/como-funciona#para-quem' },
  { nome: 'Distrofias', to: '/como-funciona#para-quem' },
]

/** Perguntas que ficam na home; a lista completa segue no FAQ do content.ts. */
export const PERGUNTAS_DA_HOME = [
  'Preciso comprar algum equipamento?',
  'As imagens da câmera saem do meu computador?',
  'Funciona com quem usa óculos?',
  'Quanto tempo leva a calibração?',
  'Já existe validação clínica do produto?',
]

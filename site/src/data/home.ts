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
  'A webcam acompanha para onde a pessoa olha, e o cursor vai junto. Para clicar, basta manter o olhar num botão por um instante. Para desistir, é só desviar.'

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
    titulo: 'Escreve, e o computador fala.',
    texto: 'Primeiro o grupo de letras, depois a letra. As sugestões completam a palavra.',
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
    texto: 'A calibração leva cerca de um minuto, e o tempo do olhar parado se ajusta a quem usa.',
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
  /** A faixa azul da home: os mesmos dois lados, com os números grandes. */
  faixa: {
    dedicado: { valor: 'R$ 15 a 120 mil', nota: 'Equipamento importado, com sensor próprio, pago de uma vez.' },
    irisflow: { valor: 'A webcam de casa' },
  },
}

/** A nota do lado IrisFlow na faixa azul: o menor preço vem de usePlans (banco ou reserva). */
export function notaDoIrisflowNaFaixa(menorPreco: number, betaAtiva: boolean): string {
  const depois = `a partir de R$\u00a0${menorPreco} por mês, sem fidelidade.`
  return betaAtiva ? `Grátis na beta. Depois, ${depois}` : `${depois[0].toUpperCase()}${depois.slice(1)}`
}

export const CUIDADOR_DESTAQUE = {
  titulo: 'O recado chega no celular.',
  texto: 'O que a pessoa escreve chega no celular de quem cuida. A resposta é falada na tela do computador.',
  /** A conversa de verdade no app (a mesma captura de /cuidador), no celular da faixa. */
  tela: {
    src: '/media/cuidador/conversa.webp',
    alt: 'Conversa no app IrisFlow Cuidador: a pessoa escreve "Estou com sede", a resposta da família é falada na tela dela e, embaixo, as respostas rápidas.',
    largura: 784,
    altura: 1544,
  },
  /**
   * As quatro funções do app (redesenho de 01/11/2026, segunda volta): cada uma
   * com a tela real dele e a cor do campo que ela pinta na faixa. O socorro é
   * vermelho como o alerta do próprio app.
   */
  funcoes: [
    {
      id: 'conversa',
      nome: 'Conversa',
      texto: 'O que a pessoa escreve chega na hora. Responda com um toque: sim, não, já estou indo. A resposta é falada na tela dela.',
      tela: '/media/cuidador/conversa.webp',
    },
    {
      id: 'socorro',
      nome: 'Socorro',
      texto: 'O pedido de ajuda toma a tela inteira do celular. Se ninguém confirmar, ele é reenviado a todos os celulares.',
      tela: '/media/cuidador/alertas.webp',
      alt: 'Alerta de emergência em tela cheia no app IrisFlow Cuidador, com o botão "Estou indo!".',
    },
    {
      id: 'ajustes',
      nome: 'Ajustes',
      texto: 'O tempo do olhar e a suavização mudam de longe, sem mexer no computador da pessoa.',
      tela: '/media/cuidador/ajustes.webp',
      alt: 'Ajustes do computador da pessoa feitos pelo app IrisFlow Cuidador: tempo de fixação e suavização do olhar.',
    },
    {
      id: 'relatorios',
      nome: 'Relatórios',
      texto: 'Frases faladas e tempo de uso de cada dia, para acompanhar a evolução.',
      tela: '/media/cuidador/relatorios.webp',
      alt: 'Relatórios no app IrisFlow Cuidador: frases faladas por dia e tempo de uso.',
    },
  ] as { id: 'conversa' | 'socorro' | 'ajustes' | 'relatorios'; nome: string; texto: string; tela: string; alt?: string }[],
  botaoAndroid: 'Baixar o app para Android',
  botaoConhecer: 'Conhecer o app',
  // A ressalva dos alertas (RESSALVA_DOS_ALERTAS) aparece uma vez só na home, aqui, logo depois
  // da promessa do socorro no celular (auditoria P2-14, 21/10/2026). Os cartões numerados, onde
  // ela morava, saíram no redesenho de 31/10/2026.
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

/** "Para quem": as condições, numa lista de duas colunas. */
export const PARA_QUEM_O_OLHAR = {
  titulo: 'Quando o corpo para, o olhar continua.',
  texto: 'Em muitas condições, o olhar é o último movimento que sobra. Cada caso é diferente, por isso a beta é gratuita: dá para testar antes de depender dela.',
}

/**
 * As condições da home (redesenho de 01/11/2026): cada uma é uma aba, com a
 * linha do que muda, por que o olhar funciona nela, o cuidado antes de começar
 * e a tela do app que mais serve a ela. Os textos de ELA, AVC, lesão medular e
 * paralisia cerebral vêm de SEGMENTS (content.ts, a página Como funciona); os
 * de encarceramento e distrofias seguem a mesma linha e estão em "Outra
 * condição?" de lá.
 */
export type CondicaoNaHome = {
  id: string
  nome: string
  linha: string
  to: string
  porque: string
  cuidado: string
  tela: { src: string; alt: string; legenda: string }
}

const TELAS = '/media/telas'

export const CONDICOES_NA_HOME: CondicaoNaHome[] = [
  {
    id: 'ela',
    nome: 'ELA',
    linha: 'Quando a fala e as mãos já não respondem.',
    to: '/como-funciona#para-ela',
    porque: 'O olhar costuma ser o último movimento que a pessoa controla. O IrisFlow foi pensado primeiro para a ELA: teclado por fixação, frases prontas e pedido de ajuda sempre no mesmo lugar.',
    cuidado: 'Vale começar cedo, enquanto a pessoa ainda fala. Assim, quando a fala for embora, a calibração e as frases já estão prontas.',
    tela: { src: `${TELAS}/teclado.webp`, alt: 'Teclado do IrisFlow Communicator: seis grupos grandes de letras e uma tecla de frases.', legenda: 'O teclado em seis grupos grandes, escolhidos com o olhar parado.' },
  },
  {
    id: 'avc',
    nome: 'AVC de tronco',
    linha: 'Para voltar a responder, pedir e conversar.',
    to: '/como-funciona#para-avc',
    porque: 'Quando a sequela atinge a fala e o movimento, mas a pessoa entende o que ouve, ela consegue apontar com os olhos o que quer dizer.',
    cuidado: 'Se a afasia atrapalha a compreensão ou a leitura, as figuras ajudam mais que o teclado. Cada caso é avaliado à parte.',
    tela: { src: `${TELAS}/teclado-sugestoes.webp`, alt: 'Teclado do IrisFlow Communicator com frases prontas na tecla ao lado das letras.', legenda: 'Frases prontas ao lado das letras: uma fixação e a frase sai falada.' },
  },
  {
    id: 'lesao-medular',
    nome: 'Lesão medular alta',
    linha: 'O computador inteiro pelo olhar: navegar, assistir, escrever.',
    to: '/como-funciona#para-lesao-medular',
    porque: 'Tetraplegia por lesão na região do pescoço, com visão e raciocínio preservados e quadro estável. Além de falar, a pessoa volta a usar o computador: navegar, escrever, trabalhar.',
    cuidado: 'No Windows, a lupa do Modo Computador alcança os botões pequenos. Arrastar com precisão e usar menus muito cheios continua trabalhoso.',
    tela: { src: `${TELAS}/computador.webp`, alt: 'Tela do Modo Computador, que explica e liga o controle do Windows pelo olhar.', legenda: 'O Modo Computador: o Windows inteiro pelo olhar.' },
  },
  {
    id: 'paralisia-cerebral',
    nome: 'Paralisia cerebral',
    linha: 'Pranchas e frases no ritmo de quem usa.',
    to: '/como-funciona#para-paralisia-cerebral',
    porque: 'Para crianças e adultos sem fala funcional e sem controle das mãos, com o olhar preservado: prancha grande de figuras, jogos pelo olhar e teclado quando fizer sentido.',
    cuidado: 'A equipe ainda não avaliou movimentos involuntários acentuados. Vale testar na beta antes de contar com o sistema.',
    tela: { src: `${TELAS}/lazer.webp`, alt: 'Tela de lazer e bem-estar, com câmera, galeria de fotos e os jogos feitos para o olhar.', legenda: 'Jogos feitos para o olhar, que também treinam a fixação.' },
  },
  {
    id: 'encarceramento',
    nome: 'Síndrome do encarceramento',
    linha: 'Quando só os olhos se movem, eles bastam para falar.',
    to: '/como-funciona#para-quem',
    porque: 'A pessoa está consciente e entende tudo, mas quase só os olhos se movem. Esse movimento basta para escolher letras e frases e para pedir ajuda.',
    cuidado: 'Quando sobra só o movimento vertical dos olhos, alvos grandes ajudam mais. Vale testar na beta e contar o caso à equipe.',
    tela: { src: `${TELAS}/emergencia.webp`, alt: 'Tela de emergência com quatro botões grandes: dor forte, falta de ar, frio ou febre e outra emergência.', legenda: 'O pedido de ajuda em quatro botões grandes, sempre ao alcance.' },
  },
  {
    id: 'distrofias',
    nome: 'Distrofias',
    linha: 'Os ajustes acompanham a força que muda com o tempo.',
    to: '/como-funciona#para-quem',
    porque: 'Conforme a força das mãos vai embora, o olhar assume o que elas faziam. O tempo de olhar parado se ajusta de 0,4 a 4 s, e a calibração pode ser refeita quando precisar.',
    cuidado: 'Cada distrofia evolui de um jeito. Vale testar na beta antes de depender do sistema.',
    tela: { src: `${TELAS}/calibracao.webp`, alt: 'Calibração: um ponto na tela para a pessoa acompanhar com o olhar.', legenda: 'A calibração guiada, refeita em cerca de um minuto.' },
  },
]

/** A faixa dos planos na home: o cartão da beta (ou os preços, sem a beta). */
export const PLANOS_NA_HOME = {
  tituloBeta: 'Na beta, tudo é grátis.',
  /** Antes da data do fim da beta (dd/mm/aaaa, de beta_program.ends_at). */
  ate: 'até',
  textoBeta: 'Sem cartão e sem cobrança. Estes são os preços previstos para depois:',
  tituloSemBeta: 'Um plano para cada momento.',
  textoSemBeta: 'Todos com 15 dias para testar antes de pagar e cancelamento a qualquer momento.',
  porMes: 'por mês',
  link: 'Comparar os planos',
}

/** Perguntas que ficam na home; a lista completa segue no FAQ do content.ts. */
export const PERGUNTAS_DA_HOME = [
  'Preciso comprar algum equipamento?',
  'As imagens da câmera saem do meu computador?',
  'Funciona com quem usa óculos?',
  'Quanto tempo leva a calibração?',
  'Já existe validação clínica do produto?',
]

/**
 * A frase logo abaixo da abertura (redesenho de 01/11/2026): o que muda entre a
 * prancha de letras, o jeito como a maioria das famílias ainda conversa (plano de
 * negócios, tópico 1.1), e o IrisFlow. Desde a revisão do dono, só texto: as
 * miniaturas no meio das palavras saíram.
 */
export const PRANCHA = {
  antes: 'Na prancha de letras, alguém aponta o alfabeto até a pessoa piscar.',
  depois: 'No IrisFlow, o olhar escreve, o computador fala e o celular avisa.',
}

/**
 * "Medido, com as ressalvas" (redesenho de 01/11/2026). Os números vêm de
 * docs/MEDICOES.md e da tabela 1 do plano de negócios; a ressalva anda junto
 * de todos, sempre (PRODUCT.md, "Evidence on Hand"). Nada aqui é estatística
 * de uso ou de negócio: é o que foi medido na bancada e o que o app aplica.
 */
export const MEDIDO = {
  titulo: 'Medido, com as ressalvas.',
  marcas: [
    { valor: '1,40°', texto: 'de erro médio na melhor sessão de bancada (56 px na tela).' },
    { valor: '76%', texto: 'das estimativas caíram a menos de 100 px do alvo, na mesma sessão.' },
    { valor: '215 px', texto: 'é o menor botão das telas da pessoa: cabe o erro e o tremor do olhar.' },
    { valor: '1,5 s', texto: 'de olhar parado vira clique. Quem cuida ajusta de 0,4 a 4 s.' },
    { valor: '13', texto: 'pontos na calibração guiada, em cerca de um minuto.' },
    { valor: '0', texto: 'imagens da câmera gravadas ou enviadas. O rastreamento roda no computador.' },
    { valor: '2° a 4°', texto: 'é o erro que a literatura mede em rastreamento só com webcam.' },
  ],
  ressalva:
    'Os dois primeiros números são de uma pessoa só, num posto de uso conhecido, calibrada para ela mesma, em 20/09/2026 e com a versão anterior do modelo. O modelo de hoje ainda não foi medido ao vivo. Rastreadores infravermelhos de laboratório erram de 0,5° a 1°.',
}

/** A equipe na home: a foto dos três e dois blocos curtos, tirados de ORIGIN (content.ts). */
export const EQUIPE_NA_HOME = {
  titulo: 'Feito por três, em São Paulo.',
  blocos: [
    {
      titulo: 'Começou com uma pergunta',
      texto: 'Dá para saber para onde a pessoa olha só com a webcam comum, com precisão para escolher uma tecla? Uma pesquisa com famílias e profissionais de saúde mostrou que o preço era a barreira.',
    },
    {
      titulo: 'Aberto para conferir',
      texto: 'O código é público, sob a GPL-3.0, e as medições saem com as condições em que foram feitas. A beta está no ar desde 29/09/2026, para Windows 10 e 11.',
    },
  ],
  botao: 'Conhecer a equipe',
}

/**
 * "Segure o olhar" (redesenho de 01/11/2026): a peça viva da home. Quem visita
 * para o ponteiro (ou o foco) numa frase, o aro fecha no tempo escolhido e a
 * frase sai em voz alta, como no app, e chega no celular de quem cuida. Os
 * tempos são três pontos da faixa que o app aceita (0,4 a 4 s; padrão 1,5 s).
 */
export const EXPERIMENTE = {
  titulo: 'Segure o olhar. A frase fala.',
  texto: 'Pare o ponteiro numa frase até o aro fechar: é o mesmo gesto que a pessoa faz com os olhos no IrisFlow. Desviar antes desiste. Clicar, tocar ou apertar Enter também escolhe.',
  textoToque: 'Toque e segure numa frase até o aro fechar: é o mesmo gesto que a pessoa faz com os olhos no IrisFlow. Soltar antes desiste.',
  tempos: [0.8, 1.5, 3],
  tempoPadrao: 1.5,
  rotuloTempo: 'Tempo do olhar parado',
  notaTempo: 'Quem cuida ajusta de 0,4 a 4 segundos.',
  som: 'Voz',
  aguardando: 'Escolha uma frase.',
  falou: 'Saiu em voz alta:',
  semVoz: 'Este navegador não tem voz em português; no app, a frase sai em voz alta.',
  chegou: { nome: 'Carlos', iniciais: 'CS' },
  /** As frases da prancha (os quatro primeiros pictogramas de DwellDemo). */
  quantas: 4,
}

/**
 * "Do olhar ao clique" (redesenho de 01/11/2026): o caminho do vídeo da
 * webcam até o clique, a figura 1 do plano de negócios em cinco passos. Os
 * números são os da tabela 1 do plano (webcam mínima 1280 × 720 a 30 quadros
 * por segundo, calibração de 13 pontos, fixação padrão de 1,5 s).
 */
export const DO_OLHAR_AO_CLIQUE = {
  titulo: 'Do olhar ao clique.',
  texto: 'Tudo acontece no próprio computador, trinta vezes por segundo. Nenhuma imagem é gravada nem enviada.',
  passos: [
    { id: 'webcam', titulo: 'A webcam de casa', texto: 'Uma webcam comum basta, a partir de 1280 × 720 a 30 quadros por segundo. Sem sensor especial e sem infravermelho.' },
    { id: 'rosto', titulo: 'O rosto, quadro a quadro', texto: 'Em cada quadro, o computador encontra o rosto e os olhos. A cabeça pode se mexer um pouco: o rastreamento acompanha.' },
    { id: 'iris', titulo: 'Para onde a íris aponta', texto: 'A posição das íris, junto da inclinação da cabeça, diz para onde a pessoa está olhando.' },
    { id: 'tela', titulo: 'Um ponto na tela', texto: 'A calibração de 13 pontos ensina o IrisFlow a ler aquele olhar. A suavização tira o tremor, e o cursor vai junto.' },
    { id: 'clique', titulo: 'Olhar parado vira clique', texto: 'Parado num botão por 1,5 s, o aro fecha e o clique acontece. Desviar antes desiste. Quem cuida ajusta o tempo.' },
  ],
}

/**
 * "A câmera vê. Ninguém mais." (redesenho de 01/11/2026): a privacidade nas
 * três camadas, na ordem em que é explicada à família (PRODUCT.md,
 * "Operating Context").
 */
export const PRIVACIDADE_EM_CAMADAS = {
  titulo: 'A câmera vê. Ninguém mais.',
  texto: 'A privacidade não é uma promessa de texto: é a forma como o IrisFlow foi construído. Três camadas, de dentro para fora.',
  camadas: [
    {
      id: 'computador',
      nome: 'Fica no computador, sempre',
      texto: 'A imagem da câmera, os pontos do rosto e a calibração nunca saem dele. O app funciona inteiro sem internet.',
    },
    {
      id: 'conta',
      nome: 'Sai só com conta vinculada',
      texto: 'O que a pessoa escolheu dizer, os pedidos de socorro e os números de uso vão para o celular de quem cuida. Sem conta, nada disso existe.',
    },
    {
      id: 'autorizacao',
      nome: 'Só com autorização, e dá para voltar atrás',
      texto: 'A voz personalizada usa uma gravação da pessoa e só é feita com autorização expressa, que pode ser retirada.',
    },
  ],
}

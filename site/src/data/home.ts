/* ============================================================
   Conteúdo da home. Pouco texto de propósito: a home mostra o
   produto funcionando e deixa a explicação longa para as páginas
   de dentro (Produto, Como funciona, Planos, FAQ).
   A regra do content.ts vale aqui: o que descreve o produto diz o
   que o aplicativo faz HOJE, conferido no código.
   ============================================================ */

import { RESSALVA_DOS_ALERTAS } from './cuidador'

/** Um vídeo real do produto, com o quadro de abertura como pôster. */
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
    'Gravação da tela do IrisFlow Cuidador, com dados de demonstração: o resumo da sessão do paciente, a conversa em que as respostas são faladas na tela dele, os relatórios da semana, os ajustes feitos a distância e a conta.',
}

export type Capitulo = {
  id: string
  titulo: string
  texto: string
  imagem: { src: string; alt: string; largura: number; altura: number }
}

/**
 * Os capítulos do produto, na ordem em que a pessoa vive o dia: falar, escolher,
 * usar o computador, aprender. Cada um com UMA tela de verdade do aplicativo.
 */
export const CAPITULOS: Capitulo[] = [
  {
    id: 'falar',
    titulo: 'Escreva com o olhar. O computador fala.',
    texto:
      'Um teclado feito para a fixação: primeiro o grupo de letras, depois a letra. Frases prontas para o que se diz todo dia, ditas em voz alta na hora.',
    imagem: {
      src: '/media/telas/teclado.webp',
      alt: 'Teclado do IrisFlow Communicator com as letras em seis grupos grandes; o cursor do olhar está sobre o grupo A B C D E F.',
      largura: 1600,
      altura: 900,
    },
  },
  {
    id: 'escolher',
    titulo: 'Tudo a um olhar de distância.',
    texto:
      'Comunicação, teclado, computador, conversa com quem cuida e lazer, em alvos grandes e sempre no mesmo lugar. A emergência fica no canto de todas as telas.',
    imagem: {
      src: '/media/telas/menu.webp',
      alt: 'Menu principal do IrisFlow Communicator: nove cartões grandes (Comunicação, Teclado Virtual, Computador, Configurações, Lazer e bem-estar, Conversa, Modo Descanso, Controle de Voz e Acessibilidade) e o botão Emergência no canto superior direito.',
      largura: 1600,
      altura: 900,
    },
  },
  {
    id: 'aprender',
    titulo: 'No tempo de quem usa.',
    texto:
      'Uma calibração guiada e um tutorial de dez passos. O tempo que o olhar precisa ficar parado para clicar é a pessoa quem escolhe.',
    imagem: {
      src: '/media/telas/tutorial.webp',
      alt: 'Passo do tutorial "O tempo certo é o seu", com a escolha do tempo de permanência entre lento, normal e rápido e um alvo para testar.',
      largura: 1280,
      altura: 800,
    },
  },
]

/** O contraste de preço que define o projeto. A faixa junta as duas fontes da
 *  equipe: R$ 15 mil a R$ 80 mil nas linhas PCEye e EyeMobile (plano de negócios,
 *  revenda Civiam) e R$ 60 mil a R$ 120 mil nos aparelhos I-Series já
 *  nacionalizados (aba 7 da planilha financeira). */
export const CONTRASTE = {
  titulo: 'O mesmo gesto, sem o aparelho.',
  dedicado: {
    rotulo: 'Rastreador ocular dedicado, no Brasil',
    valor: 'R$ 15 mil a R$ 120 mil',
    nota: 'equipamento importado, com sensor infravermelho próprio, pago de uma vez',
  },
  irisflow: {
    rotulo: 'IrisFlow Communicator',
    valor: 'A webcam que já está em casa',
    nota: 'grátis na beta; depois, a partir de R$ 249 por mês',
  },
}

export const CUIDADOR_DESTAQUE = {
  titulo: 'Quem cuida acompanha de qualquer lugar.',
  texto:
    'O IrisFlow Cuidador leva ao celular o que o paciente escreve, os pedidos de ajuda e o resumo de cada dia.',
  pontos: [
    'O que você responde é falado na tela do paciente.',
    'Pedido de socorro em tela cheia, reenviado se ninguém confirmar.',
    'Ajustes do computador feitos a distância.',
  ],
  ressalva: RESSALVA_DOS_ALERTAS,
}

export const PRIVACIDADE = {
  titulo: 'A câmera vê. Ninguém mais.',
  texto:
    'Todo o rastreamento acontece no computador. Nenhuma imagem da webcam é gravada ou enviada: o que sai, quando há conta, é só o que o paciente escolheu dizer, os alertas e os números de uso.',
}

/** Perguntas que ficam na home; a lista completa segue no FAQ do content.ts. */
export const PERGUNTAS_DA_HOME = [
  'Preciso comprar algum equipamento?',
  'As imagens da câmera saem do meu computador?',
  'Funciona com quem usa óculos?',
  'Quanto tempo leva a calibração?',
  'Já existe validação clínica do produto?',
]

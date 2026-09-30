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

/** A explicação curta da solução, no alto dos capítulos. */
export const COMO_FUNCIONA_EM_UMA_FRASE =
  'A webcam comum acompanha o olhar, e o cursor vai aonde ele vai. Parar o olhar num botão por um instante é o clique — com tempo para desistir.'

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
      'Um teclado feito para a fixação: primeiro o grupo de letras, depois a letra. As sugestões completam a palavra, e as frases prontas do dia a dia são faladas na hora.',
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
    titulo: 'Tudo a um olhar de distância.',
    texto:
      'Comunicação, teclado, computador, conversa com quem cuida e lazer, em alvos grandes e sempre no mesmo lugar. A emergência fica no canto de todas as telas.',
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
    titulo: 'No tempo de quem usa.',
    texto:
      'Uma calibração guiada e um tutorial de dez passos, com prática. O tempo que o olhar precisa ficar parado para clicar é a pessoa quem escolhe.',
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

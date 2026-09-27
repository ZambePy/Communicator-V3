/* Conteúdo da página do IrisFlow Cuidador (/cuidador). Descreve o app como ele
   é hoje (app/ no monorepo, conferido no código): sem recurso prometido. */

/**
 * A ressalva dos alertas no celular, a MESMA onde quer que a promessa apareça
 * (home, /solucao, /cuidador). Sem o push das lojas configurado, o socorro
 * chega ao celular com o app aberto. Tirar daqui quando o push estiver ativo.
 */
export const RESSALVA_DOS_ALERTAS =
  'Na beta, os alertas chegam com o app aberto; com ele fechado, junto com a publicação nas lojas.'

export const CUIDADOR = {
  titulo: 'O IrisFlow no celular de quem cuida.',
  lead: 'Veja o que o paciente escreve, responda de onde estiver e receba os pedidos de ajuda na hora.',
}

export type RecursoDoCuidador = {
  id: string
  titulo: string
  texto: string
  tela: { src: string; alt: string }
  /** Recurso de plano (os planos valem depois da beta; na beta, tudo liberado). */
  plano?: string
  /** Ressalva do que ainda não está pronto, dita junto do recurso. */
  nota?: string
}

export const RECURSOS_DO_CUIDADOR: RecursoDoCuidador[] = [
  {
    id: 'conversa',
    titulo: 'Converse em tempo real',
    texto: 'O que você escreve é falado na tela do paciente, e a resposta dele chega no seu celular.',
    tela: {
      src: '/media/cuidador/conversa.webp',
      alt: 'Tela de conversa: o paciente escreve "Estou com sede", a resposta da família é falada na tela dele e ele responde "Sim"; embaixo, as respostas rápidas.',
    },
  },
  {
    id: 'alertas',
    titulo: 'Socorro sem demora',
    texto: 'O pedido de ajuda ocupa a tela e vibra. Se ninguém confirmar no prazo, ele é reenviado para todos os celulares da conta.',
    tela: {
      src: '/media/cuidador/alertas.webp',
      alt: 'Alerta em tela cheia: "Pedido de socorro. Carlos precisa de você agora", com o motivo (dor muito forte), o prazo para alguém confirmar e o botão "Estou indo!".',
    },
    nota: RESSALVA_DOS_ALERTAS,
  },
  {
    id: 'relatorios',
    titulo: 'A semana num relance',
    texto: 'Frases por dia, tempo de uso e a precisão da calibração de cada sessão.',
    tela: {
      src: '/media/cuidador/relatorios.webp',
      alt: 'Tela de relatórios: 161 frases nos últimos sete dias, em gráfico de barras por dia, com 92% de acerto médio e o erro da calibração.',
    },
    plano: 'Completo e Voz',
  },
  {
    id: 'ajustes',
    titulo: 'Ajuste de longe',
    texto: 'Tempo de fixação, suavização do cursor e prazo da emergência, sem ir até o computador.',
    tela: {
      src: '/media/cuidador/ajustes.webp',
      alt: 'Tela de ajustes com o tempo de fixação (800, 1500 ou 2500 milissegundos) e a suavização do olhar.',
    },
  },
]

/** Como os dois apps se encontram: a mesma conta nos três lugares. */
export const PASSOS_DO_CUIDADOR = [
  { titulo: 'Crie a conta no site', texto: 'Na página da beta, com e-mail e senha. É a conta da família.' },
  { titulo: 'Entre no computador', texto: 'No IrisFlow Communicator, com a mesma conta. O computador fica vinculado.' },
  { titulo: 'Entre no celular', texto: 'No IrisFlow Cuidador, com a mesma conta. Pronto: os dois se encontram.' },
]

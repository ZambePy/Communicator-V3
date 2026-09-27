/* ============================================================
   Página do produto (/solucao) e página "Como funciona".
   Mesma regra do content.ts: o que está aqui é o que o app faz HOJE,
   conferido no código. As telas são capturas do app de verdade (build
   de desenvolvimento, com dados de demonstração), geradas pelo script
   descrito no README do site.
   ============================================================ */

import type { IconName } from '@/components/ui/Icon'
import type { Recurso, Numero } from '@/components/pagina/Blocos'
import type { ModuleState } from './content'
import { RESSALVA_DOS_ALERTAS } from './cuidador'

export type Tela = { src: string; alt: string; largura?: number; altura?: number }

export type ModuloEmTela = {
  id: string
  icone: IconName
  nome: string
  resumo: string
  pontos: string[]
  estado: ModuleState
  /** Em que planos o módulo entra, quando não é em todos. */
  plano?: string
  /** A tela do computador. */
  tela: Tela
  /** A tela do celular de quem cuida, quando o módulo também vive lá. */
  celular?: Tela
  /** Ressalva do que ainda depende de algo (ex.: o push das lojas). */
  nota?: string
}

const T = '/media/telas'
const C = '/media/cuidador'

/** Os módulos do IrisFlow Communicator, na ordem em que a família os encontra. */
export const MODULOS_EM_TELA: ModuloEmTela[] = [
  {
    id: 'comunicacao',
    icone: 'teclado',
    nome: 'Comunicação',
    resumo: 'Escrever, escolher frases prontas e pictogramas, e ouvir tudo em voz alta.',
    pontos: [
      'Teclado em dois passos: primeiro o grupo, depois a letra',
      'Frases rápidas e pictogramas para o dia a dia',
      'Voz em português, com letras e botões grandes',
    ],
    estado: 'Implementado',
    tela: {
      src: `${T}/teclado.webp`,
      alt: 'Teclado do IrisFlow Communicator: seis grupos grandes de letras e uma tecla de frases.',
    },
  },
  {
    id: 'computador',
    icone: 'monitor',
    nome: 'Modo Computador',
    resumo: 'O cursor do olhar sai do app e controla o Windows inteiro.',
    pontos: [
      'Clicar, clicar duas vezes, botão direito, arrastar, rolar e digitar',
      'Uma lupa amplia a região antes do clique, para os botões pequenos',
      'Uma barra lateral traz o IrisFlow de volta a qualquer momento',
    ],
    estado: 'Implementado',
    tela: {
      src: `${T}/computador.webp`,
      alt: 'Tela do Modo Computador, que explica e liga o controle do Windows pelo olhar.',
    },
  },
  {
    id: 'conversa',
    icone: 'conversa',
    nome: 'Conversa com o cuidador',
    resumo: 'O que a pessoa escreve chega ao celular da família, e a resposta é falada na tela.',
    pontos: [
      'Mensagens em tempo real com o app IrisFlow Cuidador',
      'Respostas rápidas que o cuidador cadastra',
      'O que a família responde aparece e é lido em voz alta',
    ],
    estado: 'Implementado',
    tela: {
      src: `${T}/teclado-sugestoes.webp`,
      alt: 'Teclado do IrisFlow Communicator com sugestões de palavras na tecla de frases.',
    },
    celular: {
      src: `${C}/conversa.webp`,
      alt: 'Conversa no app IrisFlow Cuidador, com as mensagens do paciente e as respostas da família.',
    },
  },
  {
    id: 'emergencia',
    icone: 'alerta',
    nome: 'Emergência',
    resumo: 'Um botão de socorro no mesmo lugar, em todas as telas.',
    pontos: [
      'Alarme no computador e alerta em tela cheia no celular',
      'Se ninguém confirmar no prazo, o pedido é reforçado',
      'Continua acionável mesmo quando o rastreamento oscila',
    ],
    nota: RESSALVA_DOS_ALERTAS,
    estado: 'Implementado',
    tela: {
      src: `${T}/emergencia.webp`,
      alt: 'Tela de emergência com quatro botões grandes: dor forte, falta de ar, frio ou febre e outra emergência.',
    },
    celular: {
      src: `${C}/alertas.webp`,
      alt: 'Alerta de emergência em tela cheia no app IrisFlow Cuidador.',
    },
  },
  {
    id: 'lazer',
    icone: 'lazer',
    nome: 'Lazer e bem-estar',
    resumo: 'Jogos feitos para o olhar, fotos, leituras e meditação.',
    pontos: [
      'Estoura Bolhas, Siga o Alvo, Jogo da Memória e Desenho',
      'Câmera com álbum de fotos e leituras em voz alta',
      'Meditação guiada e um modo descanso para os olhos',
    ],
    estado: 'Implementado',
    plano: 'Completo e Voz',
    tela: {
      src: `${T}/lazer.webp`,
      alt: 'Tela de lazer e bem-estar, com câmera, galeria de fotos e os jogos feitos para o olhar.',
    },
  },
  {
    id: 'calibracao',
    icone: 'alvo',
    nome: 'Primeiros passos',
    resumo: 'Um tutorial nas telas de verdade e uma calibração de cerca de meio minuto.',
    pontos: [
      'Preparo do posto: distância, luz e reflexo nos óculos',
      'Calibração guiada de 13 pontos, com teste de precisão',
      'Tutorial em 10 passos e um perfil para cada paciente',
    ],
    estado: 'Implementado',
    tela: {
      src: `${T}/tutorial.webp`,
      alt: 'Passo do tutorial "O tempo certo é o seu", com a escolha do tempo de permanência e um alvo para testar.',
      largura: 1280,
      altura: 800,
    },
  },
  {
    id: 'area-do-cuidador',
    icone: 'ajustes',
    nome: 'Área do cuidador',
    resumo: 'Ajustes protegidos por PIN, no computador ou a distância, pelo celular.',
    pontos: [
      'Tempo de fixação, estabilidade do cursor, som, voz e idioma',
      'Painel com o estado do rastreamento e guia de instalação',
      'Relatório de suporte que nunca inclui o que a pessoa escreveu',
    ],
    estado: 'Implementado',
    tela: {
      src: `${T}/area-do-cuidador.webp`,
      alt: 'Área do cuidador no computador, protegida por PIN.',
    },
    celular: {
      src: `${C}/ajustes.webp`,
      alt: 'Ajustes do computador do paciente feitos pelo app IrisFlow Cuidador.',
    },
  },
  {
    id: 'assistente',
    icone: 'documento',
    nome: 'Assistente de escrita',
    resumo: 'Aprende as palavras e as frases da pessoa e as sugere enquanto ela escreve.',
    pontos: [
      'Sugere a próxima palavra e a frase inteira',
      'Repetir o que já foi dito custa uma fixação, não vinte',
      'Aprende e roda no próprio computador',
    ],
    estado: 'Implementado',
    plano: 'Completo e Voz',
    tela: {
      src: `${T}/teclado-sugestoes.webp`,
      alt: 'Teclado com as sugestões do assistente de escrita no lugar das frases.',
    },
  },
  {
    id: 'voz',
    icone: 'voz',
    nome: 'Voz personalizada',
    resumo: 'As frases saem na voz da própria pessoa, recriada a partir de gravações antigas.',
    pontos: [
      'Gerada e tocada no computador: o áudio não vai para a nuvem',
      'Só é ativada com autorização expressa da família',
      'Pede um computador com 16 GB de memória',
    ],
    estado: 'Experimental',
    plano: 'Voz',
    tela: {
      src: `${T}/voz.webp`,
      alt: 'Tela de configuração da voz personalizada.',
    },
  },
]

/** As seis decisões de projeto, na versão de uma frase. */
export const DECISOES: Recurso[] = [
  {
    icone: 'olho',
    titulo: 'Calibração que aprende o seu olhar',
    texto: 'Meio minuto de pontos na tela. Um ponto ruim é descartado, e um teste mede a precisão no final.',
  },
  {
    icone: 'inclinacao',
    titulo: 'A cabeça não precisa ficar imóvel',
    texto: 'Movimentos pequenos são compensados. Se a postura mudar muito, um reajuste de dois segundos resolve.',
  },
  {
    icone: 'webcam',
    titulo: 'O posto se prepara sozinho',
    texto: 'Distância, enquadramento, luz e reflexo nos óculos são conferidos antes. O que não dá para ajustar, a tela diz como resolver.',
  },
  {
    icone: 'teclado',
    titulo: 'Escrever custa cada vez menos',
    texto: 'Letras grandes em dois passos e sugestões que aprendem o vocabulário de cada pessoa.',
  },
  {
    icone: 'offline',
    titulo: 'Funciona sem internet',
    texto: 'Rastreamento, teclado, frases e o alarme de emergência no computador funcionam offline.',
  },
  {
    icone: 'cadeado',
    titulo: 'Privacidade por desenho',
    texto: 'A imagem da câmera nunca sai do computador. O código é aberto para qualquer pessoa conferir.',
  },
]

/** O que acompanha o instalador: a adoção faz parte do produto. */
export const ADOCAO: Recurso[] = [
  { icone: 'webcam', titulo: 'Primeiro uso guiado', texto: 'Câmera, luz e calibração, passo a passo, antes de qualquer uso de verdade.' },
  { icone: 'monitor', titulo: 'Tutorial dentro do app', texto: 'A explicação aparece na tela em que a dúvida surge, não num manual.' },
  { icone: 'documento', titulo: 'Guia para quem cuida', texto: 'Instalação e teste de precisão explicados em linguagem simples.' },
  { icone: 'email', titulo: 'Suporte com gente', texto: 'Em português, respondido pela própria equipe que faz o produto.' },
]

/** O que o produto ainda não entrega: dito antes de alguém descobrir. */
export const LIMITES = [
  'Arraste fino e menus muito densos continuam trabalhosos com a precisão de uma webcam, mesmo com a lupa.',
  'O uso por quem tem movimento involuntário acentuado, espasticidade ou tremor ainda não foi avaliado.',
  'A taxa de acionamento acidental em uso contínuo ainda não foi medida: é tarefa do programa de validação.',
  'Ainda não há estudo clínico publicado, e nisso as soluções internacionais têm décadas de vantagem.',
]

/* ---------------- como funciona ---------------- */

export type PassoComTela = { titulo: string; texto: string; tela: Tela }

/** Os quatro passos do primeiro uso, cada um com a tela em que acontece. */
export const PASSOS_DO_PRIMEIRO_USO: PassoComTela[] = [
  {
    titulo: 'Instale',
    texto: 'No computador que já existe em casa. A webcam do notebook basta.',
    tela: {
      src: `${T}/menu.webp`,
      alt: 'Menu principal do IrisFlow Communicator, com nove cartões grandes.',
    },
  },
  {
    titulo: 'Prepare o posto',
    texto: 'O app confere distância, luz e reflexo nos óculos, e diz o que mudar.',
    tela: {
      src: `${T}/preparo.webp`,
      alt: 'Tela de preparo do posto de uso, com as conferências de câmera, distância e luz.',
    },
  },
  {
    titulo: 'Calibre',
    texto: 'A pessoa acompanha alguns pontos com o olhar. Leva cerca de meio minuto.',
    tela: {
      src: `${T}/calibracao.webp`,
      alt: 'Calibração: um ponto na tela para a pessoa acompanhar com o olhar.',
    },
  },
  {
    titulo: 'Fale',
    texto: 'Teclado, frases e pictogramas, falados em voz alta. E o Windows inteiro, se quiser.',
    tela: {
      src: `${T}/teclado.webp`,
      alt: 'Teclado do IrisFlow Communicator, com os grupos de letras.',
    },
  },
]

/** Do vídeo da webcam ao clique: os seis estágios, uma linha cada. */
export const ESTAGIOS: { icone: IconName; titulo: string; texto: string }[] = [
  { icone: 'webcam', titulo: 'Captura', texto: 'A webcam comum filma o rosto.' },
  { icone: 'olho', titulo: 'Rosto e olhos', texto: 'O programa acha os olhos e a íris, quadro a quadro.' },
  { icone: 'inclinacao', titulo: 'Direção do olhar', texto: 'Dos olhos e da cabeça sai para onde a pessoa olha.' },
  { icone: 'alvo', titulo: 'Calibração', texto: 'Meio minuto ensina o jeito de olhar daquela pessoa.' },
  { icone: 'relogio', titulo: 'Cursor estável', texto: 'Firme sem ficar atrasado, no ritmo de quem usa.' },
  { icone: 'check', titulo: 'Seleção', texto: 'Olhar fixo por um instante confirma a escolha.' },
]

/** As travas contra o clique sem querer. */
export const TRAVAS: Recurso[] = [
  {
    icone: 'relogio',
    titulo: 'Tempo de fixação ajustável',
    texto: 'De 0,4 a 4 segundos, com um aro que enche até confirmar: dá tempo de desistir.',
  },
  {
    icone: 'bloqueio',
    titulo: 'Pausa depois de cada seleção',
    texto: 'O alvo recém-acionado fica bloqueado por um instante, contra o clique duplo.',
  },
  {
    icone: 'alerta',
    titulo: 'Nada é aceito com leitura ruim',
    texto: 'Se o rastreamento perde confiança, as seleções param. Só a emergência continua.',
  },
  {
    icone: 'olho',
    titulo: 'Avisos de postura e cansaço',
    texto: 'Se a cabeça sai da posição, a tela oferece um reajuste de dois segundos.',
  },
]

/** As três perguntas antes de instalar (a família responde sozinha). */
export const TRES_PERGUNTAS: Recurso[] = [
  {
    titulo: 'Consegue fixar o olhar por cerca de um segundo?',
    texto: 'É o gesto que substitui o clique. Tremor leve e óculos não atrapalham.',
  },
  {
    titulo: 'Compreende o que é dito e reconhece letras ou figuras?',
    texto: 'O teclado pede leitura; a prancha de pictogramas, não.',
  },
  {
    titulo: 'Enxerga bem com pelo menos um dos olhos?',
    texto: 'A câmera precisa ver a íris. Visão dupla ou nistagmo intenso podem impedir.',
  },
]

/** Os números do produto que qualquer pessoa pode conferir no app. */
export const NUMEROS_DO_PRODUTO: Numero[] = [
  { valor: '13', rotulo: 'pontos na calibração guiada, com teste de precisão no final' },
  { valor: '0,4–4 s', rotulo: 'de tempo de fixação, ajustável conforme o dia' },
  { valor: '10', rotulo: 'passos de tutorial, nas telas de verdade' },
  { valor: '0', rotulo: 'imagens da câmera enviadas para a internet' },
]

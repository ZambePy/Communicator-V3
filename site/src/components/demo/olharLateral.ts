/* ============================================================
   "Teste com o seu olhar" (pedido de 21/10/2026): o visitante responde
   Sim ou Não olhando para uma das duas metades da tela, com a webcam dele.

   De propósito, só esquerda × direita e sem calibração fina: quem chega ao
   site não vai fazer os 13 pontos do app. Um eixo só, com metades enormes,
   aguenta o que uma webcam de notebook entrega sem treino nenhum.

   Tudo aqui é lógica pura (sem DOM, sem relógio próprio), para os testes
   cobrirem o que decide a resposta.
   ============================================================ */

export type Lado = 'esquerda' | 'direita' | 'centro'

/** Graus a partir do meio de cada pessoa: entrar num lado pede `entrada`, sair dele, menos que `saida`. */
export type Limiares = { entrada: number; saida: number }

/**
 * Entrar num lado pede 4,5°; sair dele, voltar a menos de 2,5°.
 *
 * Num notebook de 14" a uns 55 cm, o meio de cada metade fica a uns 9° do
 * centro da tela: 4,5° é metade do caminho, longe do tremor de uma webcam
 * (perto de 1°) e perto o bastante para quem mexe só os olhos. A diferença
 * entre os dois limiares é a histerese: o olhar que treme na borda não fica
 * entrando e saindo do lado, e o anel não recomeça à toa.
 */
export const LIMIARES_PADRAO: Limiares = { entrada: 4.5, saida: 2.5 }

/* ---------- de onde vem a posição do olhar ---------- */

/** Um ponto do Face Landmarker: x e y em frações da largura e da altura da imagem. */
export type Ponto = { readonly x: number; readonly y: number }

/** A malha com o refinamento da íris (468–477). Sem ele não há o que medir. */
export const PONTOS_COM_IRIS = 478

/**
 * Quantos graus de olhar vale a íris andar uma largura inteira do olho (de um
 * canto ao outro). O centro da íris fica a uns 10 mm do centro de giro do
 * olho, e o olho tem uns 30 mm de canto a canto: girar θ leva a íris
 * 10·sen θ / 30 ≈ 0,34·sen θ larguras — perto de 170° por largura. O
 * Face Landmarker costuma encurtar os extremos, e o giro da cabeça soma por
 * cima: 150 fica entre os dois, sem precisar de precisão — a resposta é só
 * esquerda ou direita, com 4,5° de folga.
 */
export const GRAUS_POR_LARGURA_DO_OLHO = 150

/**
 * Abaixo desta abertura (distância entre as pálpebras sobre a largura do
 * olho), o olho está fechando — piscada — e a íris que o modelo devolve
 * não é medida, é palpite. Aberto, o olho fica perto de 0,3.
 */
const ABERTURA_MINIMA = 0.12

/**
 * Os dois olhos na malha do MediaPipe: cantos, pálpebras (meio de cima e de
 * baixo) e o centro da íris. Qual canto fica à esquerda da imagem se decide
 * pela geometria, não pelo nome (ver src/faceLandmarks.ts, onde os nomes
 * "esquerdo" e "direito" já confundiram uma vez).
 */
const OLHOS = [
  { cantos: [33, 133], palpebras: [159, 145], iris: 468 },
  { cantos: [362, 263], palpebras: [386, 374], iris: 473 },
] as const

const finito = (p: Ponto | undefined): p is Ponto => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)

/**
 * Giro da cabeça (yaw), em graus, pela matriz facial do MediaPipe (4 × 4,
 * coluna-maior): a mesma decomposição de src/poseDaCabeca.ts,
 * yaw = atan2(R₀₂, R₂₂). Positivo é a cabeça virada para a esquerda da
 * PESSOA. A escala do Procrustes some no atan2. `null` se a matriz não serve.
 */
export function giroDaCabeca(matriz: ArrayLike<number> | null | undefined): number | null {
  if (!matriz || matriz.length !== 16) return null
  const r02 = matriz[8]
  const r22 = matriz[10]
  if (!Number.isFinite(r02) || !Number.isFinite(r22) || (r02 === 0 && r22 === 0)) return null
  return (Math.atan2(r02, r22) * 180) / Math.PI
}

/**
 * Onde está a íris entre os cantos do olho, em frações da largura do olho:
 * 0 no meio, positivo para a DIREITA DA IMAGEM. Média dos dois olhos; `null`
 * se algum não serve (fechado, ponto inválido).
 *
 * Os dois olhos, sempre: a íris não fica no meio dos cantos, fica mais perto
 * do canto de fora — no rosto do vídeo de teste, −0,056 num olho e +0,054 no
 * outro, olhando reto (medido com o MediaPipe em 21/10/2026). A média cancela
 * isso; um olho sozinho (uma piscada que fecha um antes do outro) faria a
 * leitura saltar uns 8° para um lado.
 *
 * A conta é em pixels (x × largura, y × altura): numa imagem 16:9, frações
 * da imagem distorcem o olho inclinado, e olhar para cima com a cabeça
 * tombada viraria olhar para o lado. A posição é a projeção da íris na reta
 * entre os cantos — o eixo do olho, que tomba junto com a cabeça.
 */
function deslocamentoDaIris(pontos: readonly Ponto[], largura: number, altura: number): number | null {
  const px = (p: Ponto) => ({ x: p.x * largura, y: p.y * altura })
  let soma = 0
  let olhos = 0
  for (const olho of OLHOS) {
    const c1 = pontos[olho.cantos[0]]
    const c2 = pontos[olho.cantos[1]]
    const sup = pontos[olho.palpebras[0]]
    const inf = pontos[olho.palpebras[1]]
    const iris = pontos[olho.iris]
    if (!finito(c1) || !finito(c2) || !finito(sup) || !finito(inf) || !finito(iris)) continue
    let a = px(c1)
    let b = px(c2)
    if (b.x < a.x) [a, b] = [b, a]
    const ex = b.x - a.x
    const ey = b.y - a.y
    const l2 = ex * ex + ey * ey
    if (!(l2 > 0)) continue
    const s = px(sup)
    const i = px(inf)
    if (Math.hypot(s.x - i.x, s.y - i.y) / Math.sqrt(l2) < ABERTURA_MINIMA) continue
    const c = px(iris)
    soma += ((c.x - a.x) * ex + (c.y - a.y) * ey) / l2 - 0.5
    olhos++
  }
  return olhos === OLHOS.length ? soma / olhos : null
}

/**
 * Posição horizontal do olhar neste quadro, em graus: positivo é a DIREITA
 * DA TELA. `null` quando não dá para medir (sem a íris, um olho fechado ou
 * com ponto inválido). Ainda não descontado o meio da pessoa — isso vem dos
 * 2 s olhando para o centro (`passoDoTeste`).
 *
 * Por que o sinal: a imagem da webcam chega SEM espelho, como outra pessoa
 * veria. Quem olha para a esquerda da tela — a esquerda dela — leva a íris
 * para a direita da IMAGEM; quem vira a cabeça para a própria esquerda tem
 * yaw positivo (src/poseDaCabeca.ts; a compensação de pose do app usa a
 * mesma convenção, SINAL_YAW_X em src/poseCompensation.ts). Os dois somam
 * como "esquerda da pessoa"; a tela é o contrário, por isso o sinal de
 * menos no fim.
 */
export function olharHorizontal(
  pontos: readonly Ponto[],
  matriz?: ArrayLike<number> | null,
  largura = 1,
  altura = 1,
): number | null {
  if (pontos.length < PONTOS_COM_IRIS) return null
  const iris = deslocamentoDaIris(pontos, largura, altura)
  if (iris === null) return null
  const giro = giroDaCabeca(matriz) ?? 0
  return -(giro + GRAUS_POR_LARGURA_DO_OLHO * iris)
}

/* ---------- do olhar à resposta ---------- */

/** Mediana de uma lista não vazia de números finitos. */
export function mediana(valores: readonly number[]): number {
  const v = [...valores].sort((a, b) => a - b)
  const meio = v.length >> 1
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2
}

/**
 * Para que lado a pessoa está olhando, a partir das últimas amostras da
 * posição horizontal do olhar (graus, já descontado o meio dela; + = direita
 * da tela).
 *
 * Vale a mediana das amostras: um quadro fora da curva (piscada, reflexo nos
 * óculos) não decide sozinho. `anterior` é o lado de antes — é ele que dá a
 * histerese. Sem amostra válida (o rosto saiu da câmera), é centro: ninguém
 * responde por quem a câmera não vê.
 */
export function classificarLado(
  amostras: readonly number[],
  anterior: Lado = 'centro',
  limiares: Limiares = LIMIARES_PADRAO,
): Lado {
  const validas = amostras.filter(Number.isFinite)
  if (validas.length === 0) return 'centro'
  const m = mediana(validas)
  if (anterior === 'esquerda' && m <= -limiares.saida) return 'esquerda'
  if (anterior === 'direita' && m >= limiares.saida) return 'direita'
  if (m <= -limiares.entrada) return 'esquerda'
  if (m >= limiares.entrada) return 'direita'
  return 'centro'
}

/* ---------- o teste quadro a quadro ----------
   Primeiro, 2 s olhando para o ponto no meio: a mediana desse tempo é o
   "reto" daquela pessoa, com aquela câmera e aquele jeito de sentar — é a
   única calibração que o teste pede. Depois, cada quadro vira um lado, e
   1,5 s no mesmo lado é a resposta (o anel fecha), como o tempo de fixação
   padrão do app.

   O progresso só anda com leituras seguidas (piscar, perder o rosto ou a
   aba escondida não contam como olhar fixo), e uma resposta só se repete
   depois que o olhar sai do lado — quem continua olhando para o "Sim" não
   responde "Sim, Sim, Sim". */

export type LadoEscolhido = Exclude<Lado, 'centro'>

/** Quanto tempo de leituras do meio define o zero da pessoa. */
export const TEMPO_DO_CENTRO_MS = 2000
/** O tempo de fixação padrão do app: o anel fecha nele. */
export const TEMPO_DE_FIXACAO_MS = 1500
/**
 * Quanto uma leitura soma, no máximo, ao tempo de olhar contínuo: 350 ms, ou
 * 1,5 vez o ritmo dos quadros, se ele for mais lento. A 30 quadros por
 * segundo, cada leitura soma o intervalo inteiro (33 ms) e uma piscada curta
 * não interrompe; uma falta de leitura mais longa só conta em parte.
 */
const PASSO_MAXIMO_MS = 350
/**
 * Sem leitura por mais que isto (a aba escondida, um travamento), o anel
 * recomeça: 1 s, ou 3 vezes o ritmo dos quadros num computador lento.
 * Relato de 21/10/2026: num Chromium com WebGL por software o
 * reconhecimento levava 0,8 a 1,5 s por quadro, e um limite fixo de 1 s
 * zerava o anel a cada leitura — o meio levou 36 s e o "Não" nunca fechou.
 */
const LACUNA_QUE_ZERA_MS = 1000
/** Um instante no centro (tremor na borda do limiar) não zera o anel. */
const GRACA_MS = 300
/** A classificação olha as últimas leituras deste intervalo... */
const JANELA_MS = 400
/** ...até este tanto: a 30 quadros por segundo, uns 150 ms de olhar. */
const AMOSTRAS_NA_JANELA = 5
/** Sem rosto por menos que isto é piscada ou cabeça mexendo: não vale aviso. */
const AVISO_SEM_ROSTO_MS = 700
/** Sem rosto por tanto tempo, o convite para ver o vídeo em vez do teste. */
const CONVITE_AO_VIDEO_MS = 6000
/** Fora da câmera por mais que isto, a pessoa pode ter mudado de lugar: o meio é refeito. */
const RECENTRAR_DEPOIS_DE_MS = 4000
/** Rosto à vista, mas sem leitura dos olhos (óculos escuros, reflexo, pouca luz) por tanto tempo: aviso. */
const AVISO_SEM_OLHOS_MS = 2500
/** Quadros mais espaçados que isto (menos de 2 por segundo): o teste diz que vai demorar. */
const INTERVALO_LENTO_MS = 500
/** Intervalos entre quadros guardados para saber se o computador está lento. */
const INTERVALOS_GUARDADOS = 5
/** Teto do limiar de entrada, por mais tremido que o meio tenha sido. */
const LIMIAR_MAXIMO = 9
/** Leituras guardadas na medida do meio (2 s a 60 quadros por segundo, com folga). */
const MAXIMO_DA_COLETA = 240

type Fixacao = Readonly<{
  lado: LadoEscolhido | null
  /** Tempo de olhar contínuo naquele lado. */
  ms: number
  /** Desde quando o olhar está no centro, na graça (null: está no lado). */
  foraDesde: number | null
}>

const SEM_FIXACAO: Fixacao = { lado: null, ms: 0, foraDesde: null }

export type EstadoDoTeste = Readonly<{
  fase: 'centro' | 'teste'
  /** Leituras do meio (fase centro) e o tempo contínuo que elas somam. */
  coleta: readonly number[]
  coletaMs: number
  /** O meio da pessoa (graus brutos) e os limiares que o tremor dele pediu. */
  centro: number
  limiares: Limiares
  /** Últimas leituras da fase do teste, já descontado o meio. */
  recentes: ReadonlyArray<Readonly<{ t: number; x: number }>>
  lado: Lado
  fixacao: Fixacao
  /** O lado que acabou de responder: só responde de novo depois que o olhar sair dele. */
  bloqueado: LadoEscolhido | null
  /** Instante da última leitura válida. */
  ultimaLeitura: number | null
  /** Desde quando a câmera não vê rosto (null: está vendo). */
  semRostoDesde: number | null
  /** Desde quando há rosto, mas sem leitura dos olhos (null: há leitura, ou não há rosto). */
  semLeituraDesde: number | null
  /** Instante do último quadro (com ou sem leitura) e os últimos intervalos entre quadros. */
  ultimoQuadro: number | null
  intervalos: readonly number[]
}>

export function estadoInicial(): EstadoDoTeste {
  return {
    fase: 'centro',
    coleta: [],
    coletaMs: 0,
    centro: 0,
    limiares: LIMIARES_PADRAO,
    recentes: [],
    lado: 'centro',
    fixacao: SEM_FIXACAO,
    bloqueado: null,
    ultimaLeitura: null,
    semRostoDesde: null,
    semLeituraDesde: null,
    ultimoQuadro: null,
    intervalos: [],
  }
}

/** Um quadro da câmera: há rosto? e a posição horizontal bruta do olhar (null se não deu para medir). */
export type QuadroDoTeste = { agoraMs: number; temRosto: boolean; olhar: number | null }

/**
 * Limiares a partir do tremor das leituras do meio. O desvio é a mediana dos
 * desvios × 1,4826 (vale o desvio-padrão para ruído normal, sem se deixar
 * levar por uma olhada para o lado). Entrar pede 3 desvios, nunca menos que
 * o padrão nem mais que 9°; sair, 2° a menos. Numa webcam boa, com luz, o
 * tremor fica perto de 1° e valem os padrões; com pouca luz, a margem cresce
 * e o teste não responde sozinho.
 */
export function limiaresDoCentro(amostras: readonly number[]): Limiares {
  const validas = amostras.filter(Number.isFinite)
  if (validas.length === 0) return LIMIARES_PADRAO
  const m = mediana(validas)
  const desvio = 1.4826 * mediana(validas.map((v) => Math.abs(v - m)))
  const entrada = Math.min(LIMIAR_MAXIMO, Math.max(LIMIARES_PADRAO.entrada, 3 * desvio))
  return { entrada, saida: Math.max(LIMIARES_PADRAO.saida, entrada - 2) }
}

function janela(recentes: EstadoDoTeste['recentes'], agoraMs: number): EstadoDoTeste['recentes'] {
  return recentes.filter((r) => agoraMs - r.t <= JANELA_MS).slice(-AMOSTRAS_NA_JANELA)
}

/** O olhar está no centro: o anel espera um instante antes de zerar. */
function naGraca(f: Fixacao, agoraMs: number): Fixacao {
  if (f.lado === null) return f
  const foraDesde = f.foraDesde ?? agoraMs
  return agoraMs - foraDesde > GRACA_MS ? SEM_FIXACAO : { ...f, foraDesde }
}

const liberar = (bloqueado: LadoEscolhido | null, lado: Lado) => (bloqueado !== null && lado !== bloqueado ? null : bloqueado)

/**
 * Um quadro do teste. Devolve o estado novo e, quando o anel fecha, o lado
 * respondido (uma vez por fixação).
 */
export function passoDoTeste(
  e: EstadoDoTeste,
  q: QuadroDoTeste,
): { estado: EstadoDoTeste; resposta: LadoEscolhido | null } {
  const t = q.agoraMs
  const olhar = q.temRosto && q.olhar !== null && Number.isFinite(q.olhar) ? q.olhar : null
  const relogio = {
    semRostoDesde: q.temRosto ? null : (e.semRostoDesde ?? t),
    semLeituraDesde: q.temRosto && olhar === null ? (e.semLeituraDesde ?? t) : null,
    ultimoQuadro: t,
    intervalos: e.ultimoQuadro === null ? e.intervalos : [...e.intervalos, t - e.ultimoQuadro].slice(-INTERVALOS_GUARDADOS),
  }

  if (olhar === null) {
    // Nada a medir neste quadro. No teste, o lado se refaz com o que sobra
    // da janela, que esvazia sozinha: sem leitura, ninguém responde.
    if (e.fase === 'centro') return { estado: { ...e, ...relogio }, resposta: null }
    const recentes = janela(e.recentes, t)
    const lado = classificarLado(
      recentes.map((r) => r.x),
      e.lado,
      e.limiares,
    )
    const fixacao = lado === 'centro' ? naGraca(e.fixacao, t) : e.fixacao
    return {
      estado: { ...e, ...relogio, recentes, lado, fixacao, bloqueado: liberar(e.bloqueado, lado) },
      resposta: null,
    }
  }

  // Voltou depois de muito tempo fora da câmera: refaz o meio.
  if (e.fase === 'teste' && e.semRostoDesde !== null && t - e.semRostoDesde > RECENTRAR_DEPOIS_DE_MS) {
    return passoDoTeste(estadoInicial(), q)
  }

  const intervalo = e.ultimaLeitura === null ? Number.POSITIVE_INFINITY : t - e.ultimaLeitura
  const ritmo = relogio.intervalos.length ? mediana(relogio.intervalos) : 0
  const lacuna = Math.max(LACUNA_QUE_ZERA_MS, 3 * ritmo)
  const passo = intervalo <= lacuna ? Math.min(intervalo, Math.max(PASSO_MAXIMO_MS, 1.5 * ritmo)) : 0

  if (e.fase === 'centro') {
    const coleta = [...e.coleta, olhar].slice(-MAXIMO_DA_COLETA)
    const coletaMs = e.coletaMs + passo
    if (coletaMs < TEMPO_DO_CENTRO_MS) {
      return { estado: { ...e, ...relogio, coleta, coletaMs, ultimaLeitura: t }, resposta: null }
    }
    return {
      estado: {
        ...estadoInicial(),
        ...relogio,
        fase: 'teste',
        coletaMs,
        centro: mediana(coleta),
        limiares: limiaresDoCentro(coleta),
        ultimaLeitura: t,
      },
      resposta: null,
    }
  }

  const recentes = janela([...e.recentes, { t, x: olhar - e.centro }], t)
  const lado = classificarLado(
    recentes.map((r) => r.x),
    e.lado,
    e.limiares,
  )
  let bloqueado = liberar(e.bloqueado, lado)
  let fixacao: Fixacao
  if (lado === 'centro') fixacao = naGraca(e.fixacao, t)
  else if (lado === bloqueado) fixacao = SEM_FIXACAO
  else if (e.fixacao.lado === lado) {
    fixacao = { lado, ms: intervalo > lacuna ? 0 : e.fixacao.ms + passo, foraDesde: null }
  } else fixacao = { lado, ms: 0, foraDesde: null }

  let resposta: LadoEscolhido | null = null
  if (fixacao.lado !== null && fixacao.ms >= TEMPO_DE_FIXACAO_MS) {
    resposta = fixacao.lado
    bloqueado = fixacao.lado
    fixacao = SEM_FIXACAO
  }
  return {
    estado: { ...e, ...relogio, recentes, lado, fixacao, bloqueado, ultimaLeitura: t },
    resposta,
  }
}

export type ResumoDoTeste = {
  fase: EstadoDoTeste['fase']
  /** 0 a 1: quanto dos 2 s do meio já foi medido. */
  progressoDoCentro: number
  lado: Lado
  /** O anel em andamento (lado e 0 a 1), ou null. */
  fixacao: { lado: LadoEscolhido; progresso: number } | null
  /** O que o teste está vendo agora (graus a partir do meio; + = direita), para a régua. */
  x: number | null
  limiares: Limiares
  /** Rosto fora da câmera por um tempo, e por muito tempo; ou o rosto à vista sem leitura dos olhos. */
  aviso: null | 'sem-rosto' | 'sem-rosto-ha-tempo' | 'sem-olhos'
  /** Os quadros chegam devagar (menos de 2 por segundo): as respostas vão demorar. */
  lento: boolean
}

/** O que a tela mostra num instante. */
export function resumoDoTeste(e: EstadoDoTeste, agoraMs: number): ResumoDoTeste {
  const semRostoMs = e.semRostoDesde === null ? 0 : agoraMs - e.semRostoDesde
  const semLeituraMs = e.semLeituraDesde === null ? 0 : agoraMs - e.semLeituraDesde
  const xs = e.recentes.map((r) => r.x)
  return {
    fase: e.fase,
    progressoDoCentro: Math.min(1, e.coletaMs / TEMPO_DO_CENTRO_MS),
    lado: e.lado,
    fixacao: e.fixacao.lado ? { lado: e.fixacao.lado, progresso: Math.min(1, e.fixacao.ms / TEMPO_DE_FIXACAO_MS) } : null,
    x: xs.length ? mediana(xs) : null,
    limiares: e.limiares,
    aviso:
      semRostoMs >= CONVITE_AO_VIDEO_MS
        ? 'sem-rosto-ha-tempo'
        : semRostoMs >= AVISO_SEM_ROSTO_MS
          ? 'sem-rosto'
          : semLeituraMs >= AVISO_SEM_OLHOS_MS
            ? 'sem-olhos'
            : null,
    lento: e.intervalos.length >= 3 && mediana(e.intervalos) > INTERVALO_LENTO_MS,
  }
}

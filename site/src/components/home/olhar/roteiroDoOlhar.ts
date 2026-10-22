import {
  INICIO,
  selecionar,
  teclaQueMostra,
  type Efeito,
  type EstadoDoTeclado,
  type IdDaTecla,
} from './maquinaDoTeclado'
import { ROTEIRO, type RoteiroDeFrases } from './frasesDaAbertura'

/**
 * O roteiro da abertura da home: o olhar escrevendo no teclado do IrisFlow.
 *
 * Tudo o que se mexe é o que acontece no app (pedido de 20/10/2026): o ponto
 * do olhar SALTA de tecla em tecla (sacada, ~60–90 ms), passa um pouco do alvo
 * e assenta, e fica tremendo de leve na fixação (1–2 px, como o cursor de
 * verdade); parado numa tecla, a tecla aquece e o traço sob a letra cresce
 * até acionar; um grupo se abre nas suas letras; a letra entra na linha de
 * cima; a sugestão completa a frase; e só a tecla Falar fala.
 *
 * Uma função do tempo, e só dele: `quadroNoTempo(roteiro, t)` diz o que a tela
 * mostra em `t` milissegundos. O componente desenha e o teste confere, sem
 * relógio de verdade.
 */

export { ROTEIRO, type RoteiroDeFrases } from './frasesDaAbertura'

export const TEMPOS = {
  /** O tempo de fixação do atalho "rápido" do app (frontend/src/dwellMs.ts). */
  fixacaoMs: 800,
  /** Sacada: ~60 ms entre teclas vizinhas, ~90 ms atravessando a tela. */
  sacadaBaseMs: 60,
  sacadaPorCelulaMs: 13,
  sacadaMaximaMs: 90,
  /** O ponto passa um pouco do alvo e volta: o assentamento depois do salto. */
  assentoMs: 120,
  /** O quanto ele passa do alvo, em fração do salto. */
  passaDoAlvo: 0.04,
  /** O filtro do cursor alcança o olhar: a fixação conta logo depois do pouso. */
  atrasoDoDwellMs: 50,
  /** A tecla escolhida acende, ainda com o que foi escolhido nela; só então
   *  a tela muda (o grupo abre, a letra entra). Sem essa espera, o aceso caía
   *  na tecla nova e parecia que outra coisa tinha sido escolhida. */
  disparoMs: 180,
  /** Até o próximo salto: ver o que mudou na tela e decidir. */
  latenciaMs: 300,
  /** Depois de um grupo se abrir, as letras chegam e o olho procura a dele. */
  latenciaAoAbrirMs: 420,
  /** "Falou": as ondas e o brilho na linha do texto. */
  falouMs: 900,
  /** A frase fica na tela, lida, antes da próxima. */
  esperaDepoisDaFalaMs: 1400,
  /** A frase some antes da próxima. */
  apagarMs: 320,
  /** O ponto aparece na tela antes do primeiro salto. */
  entradaMs: 520,
  /** E some no fim. */
  saidaMs: 400,
} as const

export type Tempos = typeof TEMPOS

/** Onde o olhar pode estar: numa tecla, no meio da grade ou na frase escrita. */
export type Pouso = IdDaTecla | 'repouso' | 'texto'

/** Posição de cada pouso em "células" (coluna, linha), só para medir o salto. */
const LUGAR: Record<Pouso, [number, number]> = {
  voltar: [0, 0],
  falar: [0.6, 0],
  texto: [2.2, 0],
  c0: [0, 1],
  c1: [1, 1],
  c2: [2, 1],
  c3: [0, 2],
  c4: [1, 2],
  c5: [2, 2],
  repouso: [1, 1.5],
}

/** Duração da sacada entre dois pousos: cresce com a distância, como no olho. */
export function duracaoDaSacada(de: Pouso, para: Pouso, tempos: Tempos = TEMPOS): number {
  const [x0, y0] = LUGAR[de]
  const [x1, y1] = LUGAR[para]
  const d = Math.hypot(x1 - x0, y1 - y0)
  return Math.min(tempos.sacadaMaximaMs, tempos.sacadaBaseMs + tempos.sacadaPorCelulaMs * d)
}

/** Uma ida do olhar: o salto até um pouso e, se for tecla, a fixação que a aciona. */
export type Fixacao = {
  de: Pouso
  para: Pouso
  inicioDaSacada: number
  fimDaSacada: number
  /** Só nas teclas: quando a fixação começa a contar, quando aciona (a tecla
   *  acende) e quando a tela muda. */
  inicioDoDwell: number | null
  disparo: number | null
  troca: number | null
  antes: EstadoDoTeclado
  depois: EstadoDoTeclado
  efeito: Efeito
}

export type Ciclo = {
  frase: string
  inicio: number
  fixacoes: Fixacao[]
  /** Quando a frase começa a sumir (null no último ciclo: ela fica). */
  inicioDoApagar: number | null
  fim: number
}

export type Roteiro = { ciclos: Ciclo[]; duracao: number; tempos: Tempos }

/**
 * Monta a linha do tempo inteira. Lança erro se uma escolha não existir na
 * tela daquele momento — o teste pega roteiro quebrado antes do site.
 */
export function montarRoteiro(frases: RoteiroDeFrases = ROTEIRO, tempos: Tempos = TEMPOS): Roteiro {
  const ciclos: Ciclo[] = []
  let t = 0
  let olhar: Pouso = 'repouso'

  frases.forEach((f, n) => {
    const inicio = t
    let estado: EstadoDoTeclado = INICIO
    const fixacoes: Fixacao[] = []
    // No primeiro ciclo o ponto aparece no meio da grade; nos outros ele já
    // está na frase anterior, que acabou de sumir.
    t += n === 0 ? tempos.entradaMs : tempos.latenciaMs

    for (const escolha of f.escolhas) {
      const tecla = teclaQueMostra(estado, escolha)
      if (!tecla) throw new Error(`Roteiro: "${escolha}" não está na tela (${f.frase}).`)
      const inicioDaSacada = t
      const fimDaSacada = t + duracaoDaSacada(olhar, tecla, tempos)
      const inicioDoDwell = fimDaSacada + tempos.atrasoDoDwellMs
      const disparo = inicioDoDwell + tempos.fixacaoMs
      const troca = disparo + tempos.disparoMs
      const { estado: depois, efeito } = selecionar(estado, tecla)
      if (efeito === 'nada') throw new Error(`Roteiro: "${escolha}" não aciona nada (${f.frase}).`)
      fixacoes.push({ de: olhar, para: tecla, inicioDaSacada, fimDaSacada, inicioDoDwell, disparo, troca, antes: estado, depois, efeito })
      estado = depois
      olhar = tecla
      t = troca + (efeito === 'abriu' ? tempos.latenciaAoAbrirMs : tempos.latenciaMs)
    }

    // Depois de falar, o olho volta para a frase escrita (é o que se faz
    // depois de dizer alguma coisa: conferir o que saiu).
    const fala = fixacoes[fixacoes.length - 1]
    const inicioDaOlhada = t
    const fimDaOlhada = t + duracaoDaSacada(olhar, 'texto', tempos)
    fixacoes.push({
      de: olhar,
      para: 'texto',
      inicioDaSacada: inicioDaOlhada,
      fimDaSacada: fimDaOlhada,
      inicioDoDwell: null,
      disparo: null,
      troca: null,
      antes: estado,
      depois: estado,
      efeito: 'nada',
    })
    olhar = 'texto'

    const fimDaFala = (fala.troca ?? t) + tempos.falouMs
    const ultimo = n === frases.length - 1
    const inicioDoApagar = ultimo ? null : Math.max(fimDaOlhada, fimDaFala) + tempos.esperaDepoisDaFalaMs
    const fim = ultimo
      ? Math.max(fimDaOlhada, fimDaFala) + tempos.esperaDepoisDaFalaMs
      : (inicioDoApagar as number) + tempos.apagarMs
    ciclos.push({ frase: f.frase, inicio, fixacoes, inicioDoApagar, fim })
    t = fim
  })

  return { ciclos, duracao: t, tempos }
}

/** O que a tela mostra num instante. */
export type Quadro = {
  ciclo: number
  estado: EstadoDoTeclado
  olhar: {
    de: Pouso
    para: Pouso
    /** 0 a 1, cru: a curva do salto é aplicada em `posicaoDoOlhar`. */
    sacada: number
    /** 0 a 1, o assentamento depois do salto. */
    assento: number
    /** 0 a 1: o ponto aparecendo no começo e sumindo no fim. */
    visivel: number
  }
  /** A tecla sob a fixação e quanto dela já passou (0 a 1). */
  dwell: { tecla: IdDaTecla; progresso: number } | null
  /** A tecla acesa no acionamento e há quanto tempo. */
  disparo: { tecla: IdDaTecla; idade: number } | null
  /** Há quanto tempo a frase foi falada, enquanto o sinal de "falou" dura. */
  falou: number | null
  /** 0 a 1 enquanto a frase some entre um ciclo e outro. */
  apagando: number | null
  /** Passou do fim: o quadro final, parado. */
  fim: boolean
}

const entre = (v: number) => Math.min(1, Math.max(0, v))

/** O quadro de `t` milissegundos. Antes do começo vale o começo; depois do fim, o fim. */
export function quadroNoTempo(roteiro: Roteiro, t: number): Quadro {
  const { ciclos, duracao, tempos } = roteiro
  const agora = Math.max(0, t)
  let n = 0
  while (n < ciclos.length - 1 && agora >= ciclos[n + 1].inicio) n++
  const ciclo = ciclos[n]

  // A ida em curso: a última cujo salto já começou.
  let atual: Fixacao | null = null
  for (const f of ciclo.fixacoes) {
    if (agora >= f.inicioDaSacada) atual = f
    else break
  }

  const anterior = n > 0 ? ciclos[n - 1] : null
  const pousoInicial: Pouso = anterior ? 'texto' : 'repouso'
  const olhar = atual
    ? {
        de: atual.de,
        para: atual.para,
        sacada: entre((agora - atual.inicioDaSacada) / (atual.fimDaSacada - atual.inicioDaSacada)),
        assento: entre((agora - atual.fimDaSacada) / tempos.assentoMs),
        visivel: 1,
      }
    : { de: pousoInicial, para: pousoInicial, sacada: 1, assento: 1, visivel: 1 }

  // O ponto entra no começo da abertura e sai no fim dela.
  if (n === 0) olhar.visivel = entre(agora / 300)
  if (agora > duracao) olhar.visivel = 1 - entre((agora - duracao) / tempos.saidaMs)

  const estado = atual ? (atual.troca !== null && agora >= atual.troca ? atual.depois : atual.antes) : INICIO

  let dwell: Quadro['dwell'] = null
  let disparo: Quadro['disparo'] = null
  let falou: number | null = null
  for (const f of ciclo.fixacoes) {
    if (f.inicioDoDwell === null || f.disparo === null || f.troca === null) continue
    if (f.para === 'repouso' || f.para === 'texto') continue
    if (agora >= f.inicioDoDwell && agora < f.disparo) {
      dwell = { tecla: f.para, progresso: entre((agora - f.inicioDoDwell) / tempos.fixacaoMs) }
    }
    if (agora >= f.disparo && agora < f.troca) disparo = { tecla: f.para, idade: agora - f.disparo }
    if (f.efeito === 'falou' && agora >= f.troca && agora < f.troca + tempos.falouMs) falou = agora - f.troca
  }

  const apagando =
    ciclo.inicioDoApagar !== null && agora >= ciclo.inicioDoApagar
      ? entre((agora - ciclo.inicioDoApagar) / tempos.apagarMs)
      : null

  return { ciclo: n, estado, olhar, dwell, disparo, falou, apagando, fim: agora >= duracao }
}

/** O estado do quadro final: a última frase escrita, no nível 1. */
export function estadoFinal(roteiro: Roteiro): EstadoDoTeclado {
  const ultimo = roteiro.ciclos[roteiro.ciclos.length - 1]
  return ultimo.fixacoes[ultimo.fixacoes.length - 1].depois
}

/* ---------------- o movimento do ponto ---------------- */

export type Ponto = { x: number; y: number }

/** Curva de menor solavanco (minimum jerk): acelera e freia como um salto do olho. */
export function curvaDaSacada(p: number): number {
  const s = entre(p)
  return s * s * s * (10 - 15 * s + 6 * s * s)
}

/**
 * O tremor da fixação: o cursor do olhar nunca fica parado de todo. Soma de
 * senos em frequências que não se repetem juntas — um tremor contínuo, de no
 * máximo ~1,5 px, igual em toda máquina (o teste mede).
 */
export function tremor(t: number): Ponto {
  const s = t / 1000
  const dois = 2 * Math.PI
  return {
    x: 0.85 * Math.sin(dois * 5.3 * s + 0.7) + 0.45 * Math.sin(dois * 11.9 * s + 2.1),
    y: 0.75 * Math.sin(dois * 4.1 * s + 1.9) + 0.45 * Math.sin(dois * 13.7 * s + 0.3),
  }
}

/**
 * Onde o ponto está, em pixels, dados os centros dos pousos na tela: o salto
 * pela curva do olho, passando um pouco do alvo, o assentamento e o tremor.
 */
export function posicaoDoOlhar(
  olhar: Quadro['olhar'],
  centros: Record<Pouso, Ponto>,
  t: number,
  tempos: Tempos = TEMPOS,
): Ponto {
  const a = centros[olhar.de]
  const b = centros[olhar.para]
  const passa = tempos.passaDoAlvo
  const f =
    olhar.sacada < 1
      ? (1 + passa) * curvaDaSacada(olhar.sacada)
      : 1 + passa * Math.pow(1 - entre(olhar.assento), 3)
  const tr = tremor(t)
  return { x: a.x + (b.x - a.x) * f + tr.x, y: a.y + (b.y - a.y) * f + tr.y }
}

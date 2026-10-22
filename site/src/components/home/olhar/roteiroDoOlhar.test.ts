import { describe, expect, it } from 'vitest'
import {
  ROTEIRO,
  TEMPOS,
  curvaDaSacada,
  duracaoDaSacada,
  estadoFinal,
  montarRoteiro,
  posicaoDoOlhar,
  quadroNoTempo,
  tremor,
  type Pouso,
  type Ponto,
} from './roteiroDoOlhar'

/* A abertura da home é uma função do tempo: o olhar salta (sacada), assenta e
   treme de leve na fixação; a tecla sob ele enche e aciona; a frase se
   completa pela sugestão e só é falada na tecla Falar; dois ciclos e para. */

const roteiro = montarRoteiro()

describe('o roteiro da abertura', () => {
  it('monta as duas frases, cada uma terminando falada', () => {
    expect(roteiro.ciclos.map((c) => c.frase)).toEqual(ROTEIRO.map((r) => r.frase))
    for (const c of roteiro.ciclos) {
      const acionadas = c.fixacoes.filter((f) => f.disparo !== null)
      expect(acionadas.map((f) => f.efeito)).toEqual(['abriu', 'escreveu', 'abriu', 'escreveu', 'falou'])
      expect(acionadas[acionadas.length - 1].depois.texto).toBe(`${c.frase} `)
    }
    expect(estadoFinal(roteiro)).toEqual({ nivel: { tipo: 'grupos' }, texto: 'Obrigado, amor. ' })
  })

  it('as sacadas duram entre 60 e 90 ms, mais longas quanto mais longe', () => {
    const todas = roteiro.ciclos.flatMap((c) => c.fixacoes).map((f) => f.fimDaSacada - f.inicioDaSacada)
    for (const d of todas) {
      expect(d).toBeGreaterThanOrEqual(60)
      expect(d).toBeLessThanOrEqual(90)
    }
    expect(duracaoDaSacada('c0', 'c1')).toBeLessThan(duracaoDaSacada('c0', 'c5'))
  })

  it('a fixação enche em 800 ms e aciona no fim; entre uma tecla e outra, nada enche', () => {
    const f = roteiro.ciclos[0].fixacoes[0]
    const inicio = f.inicioDoDwell!
    expect(quadroNoTempo(roteiro, inicio - 1).dwell).toBeNull()
    const meio = quadroNoTempo(roteiro, inicio + TEMPOS.fixacaoMs / 2).dwell!
    expect(meio.tecla).toBe('c0')
    expect(meio.progresso).toBeCloseTo(0.5)
    expect(quadroNoTempo(roteiro, f.disparo! - 1).estado.nivel).toEqual({ tipo: 'grupos' })
    // Aciona: a tecla acende ainda com o grupo nela, e só depois a tela muda.
    const aceso = quadroNoTempo(roteiro, f.disparo! + 1)
    expect(aceso.dwell).toBeNull()
    expect(aceso.disparo).toEqual({ tecla: 'c0', idade: 1 })
    expect(aceso.estado.nivel).toEqual({ tipo: 'grupos' })
    const depois = quadroNoTempo(roteiro, f.troca! + 1)
    expect(depois.disparo).toBeNull()
    expect(depois.estado.nivel).toEqual({ tipo: 'grupo', grupo: 0 })
    // Durante o salto seguinte, a fixação ainda não começou.
    const proxima = roteiro.ciclos[0].fixacoes[1]
    expect(quadroNoTempo(roteiro, proxima.inicioDaSacada + 10).dwell).toBeNull()
  })

  it('a letra entra na linha; a frase completa pela sugestão; o "falou" só depois do Falar', () => {
    const [grupo, letra, sugestoes, frase, falar] = roteiro.ciclos[0].fixacoes
    expect(quadroNoTempo(roteiro, letra.troca! + 5).estado.texto).toBe('E')
    expect(sugestoes.para).toBe('c5')
    expect(quadroNoTempo(roteiro, frase.troca! + 5).estado.texto).toBe('Estou com sede. ')
    // Escrever a frase não fala nada.
    for (let t = grupo.inicioDaSacada; t < falar.troca!; t += 50) {
      expect(quadroNoTempo(roteiro, t).falou).toBeNull()
    }
    expect(falar.para).toBe('falar')
    expect(quadroNoTempo(roteiro, falar.troca! + 100).falou).toBe(100)
    expect(quadroNoTempo(roteiro, falar.troca! + TEMPOS.falouMs + 1).falou).toBeNull()
    // Depois de falar, o olho volta para a frase.
    const olhada = roteiro.ciclos[0].fixacoes[5]
    expect(olhada.para).toBe('texto')
    expect(olhada.disparo).toBeNull()
  })

  it('entre as frases a primeira some; depois de duas, para no quadro final e o ponto sai', () => {
    const [primeiro, segundo] = roteiro.ciclos
    const meio = primeiro.inicioDoApagar! + TEMPOS.apagarMs / 2
    expect(quadroNoTempo(roteiro, meio).apagando).toBeCloseTo(0.5)
    expect(quadroNoTempo(roteiro, segundo.inicio + 1).estado.texto).toBe('')
    expect(segundo.inicioDoApagar).toBeNull()
    const fim = quadroNoTempo(roteiro, roteiro.duracao + 1)
    expect(fim.fim).toBe(true)
    expect(fim.estado.texto).toBe('Obrigado, amor. ')
    expect(fim.dwell).toBeNull()
    expect(quadroNoTempo(roteiro, roteiro.duracao + TEMPOS.saidaMs + 1).olhar.visivel).toBe(0)
    // As duas frases cabem em menos de 20 s.
    expect(roteiro.duracao).toBeLessThan(20_000)
  })

  it('um roteiro com escolha que não está na tela não monta', () => {
    expect(() => montarRoteiro([{ frase: 'x', escolhas: ['Ç'] }])).toThrow(/não está na tela/)
  })
})

describe('o movimento do ponto', () => {
  const centros = {
    repouso: { x: 0, y: 0 },
    texto: { x: 0, y: 0 },
    voltar: { x: 0, y: 0 },
    falar: { x: 0, y: 0 },
    c0: { x: 0, y: 100 },
    c1: { x: 200, y: 100 },
    c2: { x: 400, y: 100 },
    c3: { x: 0, y: 200 },
    c4: { x: 200, y: 200 },
    c5: { x: 400, y: 200 },
  } satisfies Record<Pouso, Ponto>

  it('a curva do salto parte parada e chega parada', () => {
    expect(curvaDaSacada(0)).toBe(0)
    expect(curvaDaSacada(1)).toBe(1)
    expect(curvaDaSacada(0.5)).toBeCloseTo(0.5)
    expect(curvaDaSacada(0.02)).toBeLessThan(0.001)
  })

  it('passa um pouco do alvo no fim do salto e assenta nele', () => {
    const base = { de: 'c0' as Pouso, para: 'c1' as Pouso, visivel: 1 }
    // t = 0: o tremor de t = 0 entra igual nas três medidas.
    const tr = tremor(0)
    const fimDoSalto = posicaoDoOlhar({ ...base, sacada: 1, assento: 0 }, centros, 0)
    const assentado = posicaoDoOlhar({ ...base, sacada: 1, assento: 1 }, centros, 0)
    expect(fimDoSalto.x - tr.x).toBeCloseTo(200 * (1 + TEMPOS.passaDoAlvo))
    expect(assentado.x - tr.x).toBeCloseTo(200)
    expect(posicaoDoOlhar({ ...base, sacada: 0, assento: 0 }, centros, 0).x - tr.x).toBeCloseTo(0)
  })

  it('o tremor da fixação fica entre 1 e 2 px', () => {
    let maior = 0
    for (let t = 0; t < 5000; t += 7) {
      const { x, y } = tremor(t)
      maior = Math.max(maior, Math.hypot(x, y))
    }
    expect(maior).toBeGreaterThan(1)
    expect(maior).toBeLessThanOrEqual(2)
  })
})

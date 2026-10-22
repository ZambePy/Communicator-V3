import { describe, expect, it } from 'vitest'
import {
  classificarLado,
  estadoInicial,
  limiaresDoCentro,
  olharHorizontal,
  passoDoTeste,
  resumoDoTeste,
  type EstadoDoTeste,
} from './olharLateral'

/* ============================================================
   "Teste com o seu olhar" (pedido de 21/10/2026): só esquerda × direita.
   As amostras são a posição horizontal do olhar em graus, já medida a
   partir do meio de cada pessoa (+ = direita da tela). Os limiares padrão
   são 4,5° para entrar num lado e 2,5° para sair dele.
   ============================================================ */

describe('classificarLado', () => {
  it('olhar perto do meio é centro', () => {
    expect(classificarLado([0.5, -1, 1.2, -0.3, 0])).toBe('centro')
    expect(classificarLado([-4, -4.2, -3.9])).toBe('centro')
  })

  it('o limiar de entrada separa o centro dos lados', () => {
    expect(classificarLado([4.4, 4.4, 4.4])).toBe('centro')
    expect(classificarLado([4.6, 4.6, 4.6])).toBe('direita')
    expect(classificarLado([-4.4, -4.4, -4.4])).toBe('centro')
    expect(classificarLado([-4.6, -4.6, -4.6])).toBe('esquerda')
  })

  it('histerese: quem já está num lado só sai dele abaixo do limiar de saída', () => {
    // −3° não basta para entrar na esquerda...
    expect(classificarLado([-3, -3, -3], 'centro')).toBe('centro')
    // ...mas basta para continuar nela: o olhar que treme perto da borda
    // não fica entrando e saindo, e o anel não recomeça à toa.
    expect(classificarLado([-3, -3, -3], 'esquerda')).toBe('esquerda')
    expect(classificarLado([3, 3, 3], 'direita')).toBe('direita')
    // Abaixo de 2,5°, volta ao centro.
    expect(classificarLado([-2, -2, -2], 'esquerda')).toBe('centro')
    expect(classificarLado([2, 2, 2], 'direita')).toBe('centro')
  })

  it('a histerese não prende num lado quando o olhar cruza para o outro', () => {
    expect(classificarLado([5, 5, 5], 'esquerda')).toBe('direita')
    expect(classificarLado([-5, -5, -5], 'direita')).toBe('esquerda')
  })

  it('um quadro fora da curva (piscada, reflexo) não decide sozinho: vale a mediana', () => {
    expect(classificarLado([0, 0.4, 9, -0.2, 0.1])).toBe('centro')
    expect(classificarLado([9, 8.5, -0.5, 9.2, 8.8])).toBe('direita')
  })

  it('sem amostra (rosto fora da câmera) é centro, mesmo vindo de um lado', () => {
    expect(classificarLado([])).toBe('centro')
    expect(classificarLado([], 'direita')).toBe('centro')
  })

  it('valores que não são número não contam', () => {
    expect(classificarLado([Number.NaN, 5, 5, Number.POSITIVE_INFINITY])).toBe('direita')
    expect(classificarLado([Number.NaN], 'esquerda')).toBe('centro')
  })

  it('aceita limiares próprios (o centro tremido de quem testa pede margem maior)', () => {
    const limiares = { entrada: 8, saida: 6 }
    expect(classificarLado([6, 6, 6], 'centro', limiares)).toBe('centro')
    expect(classificarLado([8.5, 8.5, 8.5], 'centro', limiares)).toBe('direita')
    expect(classificarLado([6.5, 6.5, 6.5], 'direita', limiares)).toBe('direita')
    expect(classificarLado([5.5, 5.5, 5.5], 'direita', limiares)).toBe('centro')
  })
})

/* ---------- rosto sintético (478 pontos, como o Face Landmarker entrega) ----------
   Imagem de 1280 × 720 SEM espelho, como a webcam manda: o olho que aparece à
   esquerda da imagem é o direito da pessoa (cantos 33 e 133, íris 468); o da
   direita da imagem é o esquerdo dela (362 e 263, íris 473). A pessoa olhando
   para a ESQUERDA dela — a metade esquerda da tela que está à frente — leva a
   íris para a DIREITA da imagem. */

const W = 1280
const H = 720
type P = { x: number; y: number }

type OpcoesDoOlho = {
  /** Íris ao longo do olho, em frações da largura (+ = direita da imagem). */
  deslocamento?: number
  /** Íris para cima, perpendicular ao olho, em pixels. */
  acimaPx?: number
  /** Inclinação do olho na imagem (a cabeça tombada), em graus. */
  inclinacao?: number
  /** Distância entre as pálpebras, em pixels (o olho tem 60 px de largura). */
  aberturaPx?: number
}

function montarOlho(
  pontos: P[],
  i: { esq: number; dir: number; sup: number; inf: number; iris: number },
  cantoEsquerdo: P,
  { deslocamento = 0, acimaPx = 0, inclinacao = 0, aberturaPx = 20 }: OpcoesDoOlho,
) {
  const largura = 60
  const a = (inclinacao * Math.PI) / 180
  const u = { x: Math.cos(a), y: Math.sin(a) }
  const n = { x: -Math.sin(a), y: Math.cos(a) } // para baixo na imagem, com o olho reto
  const em = (base: P, ao: number, perp: number): P => ({ x: base.x + ao * u.x + perp * n.x, y: base.y + ao * u.y + perp * n.y })
  const norm = (p: P): P => ({ x: p.x / W, y: p.y / H })
  pontos[i.esq] = norm(cantoEsquerdo)
  pontos[i.dir] = norm(em(cantoEsquerdo, largura, 0))
  pontos[i.sup] = norm(em(cantoEsquerdo, largura / 2, -aberturaPx / 2))
  pontos[i.inf] = norm(em(cantoEsquerdo, largura / 2, aberturaPx / 2))
  pontos[i.iris] = norm(em(cantoEsquerdo, largura / 2 + deslocamento * largura, -acimaPx))
}

function rosto(olhoDaEsquerda: OpcoesDoOlho = {}, olhoDaDireita: OpcoesDoOlho = olhoDaEsquerda): P[] {
  const pontos: P[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
  montarOlho(pontos, { esq: 33, dir: 133, sup: 159, inf: 145, iris: 468 }, { x: 540, y: 330 }, olhoDaEsquerda)
  montarOlho(pontos, { esq: 362, dir: 263, sup: 386, inf: 374, iris: 473 }, { x: 680, y: 330 }, olhoDaDireita)
  return pontos
}

/** Matriz facial do MediaPipe (4 × 4, coluna-maior) com a cabeça girada `graus` (yaw). */
function matrizComGiro(graus: number): number[] {
  const a = (graus * Math.PI) / 180
  const m = new Array(16).fill(0)
  m[0] = Math.cos(a)
  m[2] = -Math.sin(a)
  m[5] = 1
  m[8] = Math.sin(a)
  m[10] = Math.cos(a)
  m[15] = 1
  return m
}

describe('olharHorizontal (graus; + = direita da tela)', () => {
  it('íris no meio do olho e cabeça reta: 0', () => {
    expect(olharHorizontal(rosto(), matrizComGiro(0), W, H)).toBeCloseTo(0, 6)
  })

  it('íris para a direita da imagem é olhar para a ESQUERDA da tela (150° por largura de olho)', () => {
    // 0,05 da largura do olho × 150 = 7,5°.
    expect(olharHorizontal(rosto({ deslocamento: 0.05 }), matrizComGiro(0), W, H)).toBeCloseTo(-7.5, 6)
    expect(olharHorizontal(rosto({ deslocamento: -0.04 }), matrizComGiro(0), W, H)).toBeCloseTo(6, 6)
  })

  it('a cabeça virada para a esquerda da pessoa (yaw > 0) soma como olhar para a esquerda da tela', () => {
    expect(olharHorizontal(rosto(), matrizComGiro(10), W, H)).toBeCloseTo(-10, 6)
    // Giro e íris somam: −6° de cabeça e 0,02 × 150 = 3° de íris para a esquerda dão +3°.
    expect(olharHorizontal(rosto({ deslocamento: 0.02 }), matrizComGiro(-6), W, H)).toBeCloseTo(3, 6)
  })

  it('sem a matriz da cabeça, vale só a íris', () => {
    expect(olharHorizontal(rosto({ deslocamento: 0.05 }), null, W, H)).toBeCloseTo(-7.5, 6)
    expect(olharHorizontal(rosto({ deslocamento: 0.05 }), [1, 0, 0], W, H)).toBeCloseTo(-7.5, 6)
  })

  it('cada olho tem o seu meio (a íris fica perto do canto de fora): vale a média dos dois, e um olho só não dá leitura', () => {
    // Medido com o MediaPipe no rosto do vídeo de teste, olhando reto: −0,056 e +0,054.
    expect(olharHorizontal(rosto({ deslocamento: -0.055 }, { deslocamento: 0.055 }), matrizComGiro(0), W, H)).toBeCloseTo(0, 6)
    // Uma piscada que fecha um olho antes do outro: com um olho só, a leitura saltaria 8° para um lado.
    const umFechado = rosto({ deslocamento: -0.055, aberturaPx: 3 }, { deslocamento: 0.055 })
    expect(olharHorizontal(umFechado, matrizComGiro(0), W, H)).toBeNull()
    expect(olharHorizontal(rosto({ aberturaPx: 3 }), matrizComGiro(0), W, H)).toBeNull()
  })

  it('olhar para cima com a cabeça tombada não vira olhar para o lado (conta em pixels, não em frações da imagem)', () => {
    const tombado = { inclinacao: 20, acimaPx: 8 }
    expect(olharHorizontal(rosto(tombado), matrizComGiro(0), W, H)).toBeCloseTo(0, 6)
  })

  it('o lado de cada canto vem da imagem, não do número do ponto', () => {
    const trocado = rosto({ deslocamento: 0.05 })
    ;[trocado[33], trocado[133]] = [trocado[133], trocado[33]]
    ;[trocado[362], trocado[263]] = [trocado[263], trocado[362]]
    expect(olharHorizontal(trocado, matrizComGiro(0), W, H)).toBeCloseTo(-7.5, 6)
  })

  it('sem os pontos da íris (malha de 468) ou com coordenada inválida, não há leitura', () => {
    expect(olharHorizontal(rosto().slice(0, 468), matrizComGiro(0), W, H)).toBeNull()
    const quebrado = rosto({ deslocamento: 0.05 })
    quebrado[468] = { x: Number.NaN, y: 0.4 }
    expect(olharHorizontal(quebrado, matrizComGiro(0), W, H)).toBeNull()
    const outro = rosto({ deslocamento: 0.05 })
    outro[473] = { x: 0.5, y: Number.POSITIVE_INFINITY }
    expect(olharHorizontal(outro, matrizComGiro(0), W, H)).toBeNull()
  })
})

/* ---------- o teste quadro a quadro ----------
   Um quadro a cada 40 ms (25 por segundo). `olhar` é a posição horizontal
   bruta (graus, + = direita da tela), antes de descontar o meio. */

type Resposta = { t: number; lado: 'esquerda' | 'direita' }

/** Roda quadros de `de` até antes de `ate`, todos com o mesmo olhar. */
function rodar(
  estado: EstadoDoTeste,
  de: number,
  ate: number,
  olhar: number | null | ((i: number) => number),
  { temRosto = true, passo = 40 }: { temRosto?: boolean; passo?: number } = {},
) {
  let e = estado
  const respostas: Resposta[] = []
  for (let t = de, i = 0; t < ate; t += passo, i++) {
    const valor = typeof olhar === 'function' ? olhar(i) : olhar
    const r = passoDoTeste(e, { agoraMs: t, temRosto, olhar: valor })
    e = r.estado
    if (r.resposta) respostas.push({ t, lado: r.resposta })
  }
  return { estado: e, respostas }
}

/** Os 2 s olhando para o meio: quadros de 0 a 2000 ms. O teste começa em 2040. */
function calibrado(olhar: number | ((i: number) => number) = 0): EstadoDoTeste {
  const { estado } = rodar(estadoInicial(), 0, 2040, olhar)
  expect(estado.fase).toBe('teste')
  return estado
}

describe('limiaresDoCentro', () => {
  it('centro firme: os limiares padrão (4,5° para entrar, 2,5° para sair)', () => {
    expect(limiaresDoCentro([0, 0.3, -0.2, 0.1, -0.4, 0.2])).toEqual({ entrada: 4.5, saida: 2.5 })
  })

  it('centro tremido: o limiar sobe para 3 desvios (desvio pela mediana dos desvios × 1,4826)', () => {
    // Mediana 0, desvios 2 → 1,4826 × 2 × 3 = 8,8956.
    const l = limiaresDoCentro([-2, 0, 2, -2, 0, 2])
    expect(l.entrada).toBeCloseTo(8.8956, 4)
    expect(l.saida).toBeCloseTo(6.8956, 4)
  })

  it('o limiar não passa de 9°: mais que isso, nem virando a cabeça a pessoa responderia', () => {
    expect(limiaresDoCentro([-3, 0, 3, -3, 0, 3])).toEqual({ entrada: 9, saida: 7 })
  })
})

describe('passoDoTeste — o meio de cada pessoa', () => {
  it('2 s olhando para o centro viram o zero: um rosto virado 10° na medida é o centro dessa pessoa', () => {
    let e = calibrado(-10)
    let r = rodar(e, 2040, 2540, -10)
    expect(r.estado.lado).toBe('centro')
    e = r.estado
    // 6° à esquerda do meio DELA.
    r = rodar(e, 2540, 2840, -16)
    expect(r.estado.lado).toBe('esquerda')
  })

  it('o meio só fecha com 2 s de leituras: sem rosto, a contagem espera', () => {
    let r = rodar(estadoInicial(), 0, 1040, 0)
    expect(r.estado.fase).toBe('centro')
    expect(resumoDoTeste(r.estado, 1000).progressoDoCentro).toBeCloseTo(0.5, 6)
    r = rodar(r.estado, 1040, 2560, null, { temRosto: false })
    expect(r.estado.fase).toBe('centro')
    expect(resumoDoTeste(r.estado, 2520).progressoDoCentro).toBeCloseTo(0.5, 6)
    // A primeira leitura depois da falta não soma o buraco; mais 1 s fecha.
    r = rodar(r.estado, 2560, 3560, 0)
    expect(r.estado.fase).toBe('centro')
    r = rodar(r.estado, 3560, 3600, 0)
    expect(r.estado.fase).toBe('teste')
  })
})

describe('passoDoTeste — a fixação de 1,5 s', () => {
  it('olhar 1,5 s para a direita responde "direita" uma vez; para responder de novo, precisa sair do lado', () => {
    let r = rodar(calibrado(), 2040, 3740, 8)
    expect(r.respostas).toHaveLength(1)
    expect(r.respostas[0].lado).toBe('direita')
    expect(r.respostas[0].t).toBeGreaterThanOrEqual(2040 + 1500)
    expect(r.respostas[0].t).toBeLessThanOrEqual(2040 + 1500 + 80)
    // Continuar olhando não repete a resposta.
    r = rodar(r.estado, 3740, 6740, 8)
    expect(r.respostas).toEqual([])
    // Volta ao meio e olha de novo: responde de novo.
    r = rodar(r.estado, 6740, 7340, 0)
    expect(r.respostas).toEqual([])
    r = rodar(r.estado, 7340, 9040, 8)
    expect(r.respostas.map((x) => x.lado)).toEqual(['direita'])
  })

  it('antes de 1,5 s não responde', () => {
    const r = rodar(calibrado(), 2040, 2040 + 1400, -8)
    expect(r.respostas).toEqual([])
    expect(r.estado.lado).toBe('esquerda')
  })

  it('trocar de lado no meio da fixação recomeça o anel do outro lado', () => {
    let r = rodar(calibrado(), 2040, 3040, 8)
    expect(r.respostas).toEqual([])
    r = rodar(r.estado, 3040, 4740, -8)
    expect(r.respostas.map((x) => x.lado)).toEqual(['esquerda'])
  })

  it('um instante no centro (menos de 0,3 s) não zera o anel; mais que isso, zera', () => {
    const comecou = rodar(calibrado(), 2040, 3040, 8).estado
    // 0,2 s olhando o meio e de volta à direita: o anel continua de onde estava.
    let r = rodar(comecou, 3040, 3240, 0)
    r = rodar(r.estado, 3240, 4040, 8)
    expect(r.respostas.map((x) => x.lado)).toEqual(['direita'])
    // 0,6 s no meio: o anel recomeça, e 0,8 s não bastam.
    r = rodar(comecou, 3040, 3640, 0)
    r = rodar(r.estado, 3640, 4440, 8)
    expect(r.respostas).toEqual([])
  })

  it('um engasgo curto (0,6 s sem quadros) não zera o anel, mas também não conta inteiro como olhar', () => {
    let r = rodar(calibrado(), 2040, 3040, 8)
    // Último quadro em 3000 (anel em 0,96 s); o próximo só chega em 3600.
    // Contando o buraco inteiro, o anel fecharia já nesse quadro (0,96 + 0,6 ≥ 1,5).
    r = rodar(r.estado, 3600, 3640, 8)
    expect(r.respostas).toEqual([])
    r = rodar(r.estado, 3640, 4200, 8)
    expect(r.respostas.map((x) => x.lado)).toEqual(['direita'])
  })

  it('computador lento (um quadro a cada 670 ms): o meio e a resposta saem, só que mais devagar', () => {
    // Cada passo vale até 350 ms: com quadros espaçados, o teste anda mais devagar, mas anda.
    let r = rodar(estadoInicial(), 0, 6700, 0, { passo: 670 })
    expect(r.estado.fase).toBe('teste')
    r = rodar(r.estado, 6700, 6700 + 670 * 8, 8, { passo: 670 })
    expect(r.respostas.map((x) => x.lado)).toEqual(['direita'])
  })

  it('computador muito lento (um quadro a cada 1,2 s): ainda mede o meio e responde, no ritmo dele', () => {
    // Medido em 21/10/2026 num Chromium com WebGL por software: 0,8 a 1,5 s por quadro.
    let r = rodar(estadoInicial(), 0, 1200 * 4, 0, { passo: 1200 })
    expect(r.estado.fase).toBe('teste')
    r = rodar(r.estado, 1200 * 4, 1200 * 8, 8, { passo: 1200 })
    expect(r.respostas.map((x) => x.lado)).toEqual(['direita'])
  })

  it('a aba ficou escondida (nenhum quadro por 5 s): o anel recomeça', () => {
    let r = rodar(calibrado(), 2040, 3040, 8)
    r = rodar(r.estado, 8000, 8800, 8)
    expect(r.respostas).toEqual([])
  })

  it('com o centro tremido, 6° não respondem; 10°, sim', () => {
    const tremido = calibrado((i) => [-3, 0, 3][i % 3])
    let r = rodar(tremido, 2040, 4040, 6)
    expect(r.respostas).toEqual([])
    r = rodar(r.estado, 4040, 5740, 10)
    expect(r.respostas.map((x) => x.lado)).toEqual(['direita'])
  })
})

describe('passoDoTeste — rosto fora da câmera', () => {
  it('sem rosto não há resposta, e o anel não anda', () => {
    let r = rodar(calibrado(), 2040, 3040, 8)
    r = rodar(r.estado, 3040, 5040, null, { temRosto: false })
    expect(r.respostas).toEqual([])
    expect(r.estado.lado).toBe('centro')
    expect(resumoDoTeste(r.estado, 5000).fixacao).toBeNull()
  })

  it('o aviso aparece depois de 0,7 s sem rosto, e o convite ao vídeo depois de 6 s', () => {
    const r = rodar(calibrado(), 2040, 2080, null, { temRosto: false })
    expect(resumoDoTeste(r.estado, 2040 + 600).aviso).toBeNull()
    expect(resumoDoTeste(r.estado, 2040 + 800).aviso).toBe('sem-rosto')
    expect(resumoDoTeste(r.estado, 2040 + 6100).aviso).toBe('sem-rosto-ha-tempo')
    // O rosto voltou: some o aviso.
    const volta = rodar(r.estado, 2080, 2120, 0)
    expect(resumoDoTeste(volta.estado, 2120).aviso).toBeNull()
  })

  it('rosto à vista, mas sem leitura dos olhos por mais de 2,5 s: aviso para mostrar os olhos', () => {
    const r = rodar(calibrado(), 2040, 2080, null, { temRosto: true })
    expect(resumoDoTeste(r.estado, 2040 + 1900).aviso).toBeNull()
    expect(resumoDoTeste(r.estado, 2040 + 2600).aviso).toBe('sem-olhos')
    // Os olhos voltaram: some o aviso.
    const volta = rodar(r.estado, 4700, 4740, 0)
    expect(resumoDoTeste(volta.estado, 4740).aviso).toBeNull()
  })

  it('quadros espaçados (menos de 2 por segundo) acendem o aviso de lentidão', () => {
    const devagar = rodar(estadoInicial(), 0, 670 * 6, 0, { passo: 670 })
    expect(resumoDoTeste(devagar.estado, 670 * 5).lento).toBe(true)
    const normal = rodar(estadoInicial(), 0, 400, 0)
    expect(resumoDoTeste(normal.estado, 360).lento).toBe(false)
  })

  it('olho fechado com o rosto à vista não é rosto perdido', () => {
    const r = rodar(calibrado(), 2040, 4040, null, { temRosto: true })
    expect(resumoDoTeste(r.estado, 4000).aviso).toBeNull()
  })

  it('voltou depois de mais de 4 s fora da câmera: o meio é refeito (a pessoa pode ter mudado de lugar)', () => {
    let r = rodar(calibrado(), 2040, 6600, null, { temRosto: false })
    r = rodar(r.estado, 6600, 6640, 0)
    expect(r.estado.fase).toBe('centro')
    // Fora por 2 s, o meio continua valendo.
    r = rodar(calibrado(), 2040, 4040, null, { temRosto: false })
    r = rodar(r.estado, 4040, 4080, 0)
    expect(r.estado.fase).toBe('teste')
  })
})

describe('resumoDoTeste', () => {
  it('a régua mostra a mediana do que o teste está vendo, já descontado o meio', () => {
    const e = calibrado(-10)
    const r = rodar(e, 2040, 2160, (i) => [-9, -8, -7][i])
    expect(resumoDoTeste(r.estado, 2120).x).toBeCloseTo(2, 6)
  })

  it('o anel mostra quanto da fixação já passou', () => {
    const r = rodar(calibrado(), 2040, 2790, 8)
    const resumo = resumoDoTeste(r.estado, 2760)
    expect(resumo.fixacao?.lado).toBe('direita')
    expect(resumo.fixacao?.progresso).toBeCloseTo(720 / 1500, 6)
  })
})

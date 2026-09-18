import { describe, it, expect } from 'vitest';
import { RidgeRegressor, targetGroupKey } from './ridge';
import { expandPolynomialFeatures } from './calibration/polynomial';
import { StandardScaler } from './scaler';

/**
 * Arranjo do vetor × extrapolação para os cantos.
 *
 * O pipeline treina com 9 alvos distintos e ~15 amostras por alvo. Com a
 * expansão completa de 6 dims são 27 colunas para 9 alvos determinarem — três
 * por alvo. Durante a janela de um alvo o olhar está PARADO por construção,
 * então toda variação intra-alvo é ruído; as colunas que só esse ruído
 * preenche ficam aliasadas com a identidade do alvo, e é na EXTRAPOLAÇÃO que
 * isso aparece — os cantos, onde o paciente perde o botão.
 *
 * Duas reduções, independentes:
 *
 *  - `dimsDaIris`: `offsetX` e `relX` diferem por um divisor que varia pouco
 *    (correlação ~0,9996). Levar os quatro gasta duas dimensões num sinal só, e
 *    a expansão as transforma em três colunas quase idênticas.
 *  - `formaDaExpansao`: o bloco angular já chega linearizado pela tangente
 *    (`x_tela ≈ x_olho + d·tan(yaw)`), então seus termos quadráticos capturam
 *    só curvatura residual.
 *
 * ── O que este arquivo mede, e o que NÃO mede ──────────────────────────────
 *
 * Mundo SINTÉTICO com a relação verdadeira conhecida. Não é o erro do produto
 * (isso é o teste de precisão, na pessoa, com a câmera dela) e nenhum número
 * daqui deve ser citado como acurácia. O que ele fixa é a propriedade
 * estrutural: tirar colunas que só o jitter preenchia não custa capacidade
 * explicativa, e ajuda mais conforme o rastreamento piora — que é justamente
 * a direção em que o paciente real fica.
 */

const ALVOS_9 = [0.2, 0.5, 0.8].flatMap((y) => [0.2, 0.5, 0.8].map((x) => ({ x, y })));
const CANTOS = [
  { x: 0.05, y: 0.05 }, { x: 0.95, y: 0.05 },
  { x: 0.05, y: 0.95 }, { x: 0.95, y: 0.95 },
];
const AMOSTRAS_POR_ALVO = 15;
/** Amplitude do jitter que iguala o próprio sinal (±0,024 em `gx`). */
const JITTER_TOTAL = 0.024;

/** Gerador determinístico — um teste que falha 1 em 20 execuções não serve. */
function rng(semente: number): () => number {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Arranjo {
  /** Projeção do vetor de 6 dims no conjunto sob teste. */
  proj: (v: number[]) => number[];
  /** Posições que ficam fora dos termos quadráticos. */
  lin?: readonly number[];
}

const AMBAS_COMPLETA: Arranjo = { proj: (v) => v };
const AMBAS_PARCIAL: Arranjo = { proj: (v) => v, lin: [4, 5] };
const NORMALIZADAS_COMPLETA: Arranjo = { proj: (v) => [v[2], v[3], v[4], v[5]] };
const NORMALIZADAS_PARCIAL: Arranjo = { proj: (v) => [v[2], v[3], v[4], v[5]], lin: [2, 3] };

/**
 * Mundo sintético: a tela é função suave do olhar, e o vetor carrega esse
 * olhar em 6 dims — 4 de íris (duas COLINEARES com as outras duas, como no
 * vetor real) e 2 angulares já linearizadas.
 */
function vetorDoQuadro(gx: number, gy: number, jit: number, ru: (a: number) => number): number[] {
  const offsetX = gx + ru(jit);
  const offsetY = gy + ru(jit);
  // Largura/altura do olho: quase constantes, com a oscilação da pálpebra —
  // que é o divisor ruidoso por trás de `relX`/`relY`.
  const larg = 0.08 * (1 + ru(0.08));
  const alt = 0.035 * (1 + ru(0.12));
  return [
    offsetX,
    offsetY,
    offsetX / larg,
    offsetY / alt,
    Math.tan(gx * 3) + ru(jit * 0.5),
    Math.tan(gy * 3) + ru(jit * 0.5),
  ];
}

/** Treina e devolve o erro médio nos CANTOS, fora do fecho dos alvos. */
function erroNosCantos(a: Arranjo, semente: number, jit: number): { erro: number; dims: number } {
  const r = rng(semente);
  const ru = (amp: number) => (r() - 0.5) * 2 * amp;

  const features: number[][] = [];
  const alvoX: number[] = [];
  const alvoY: number[] = [];
  const grupos: string[] = [];
  for (const t of ALVOS_9) {
    const gx = (t.x - 0.5) * 0.08;
    const gy = (t.y - 0.5) * 0.06;
    for (let k = 0; k < AMOSTRAS_POR_ALVO; k++) {
      features.push(a.proj(vetorDoQuadro(gx, gy, jit, ru)));
      alvoX.push(t.x);
      alvoY.push(t.y);
      grupos.push(targetGroupKey({ screenX: t.x, screenY: t.y }));
    }
  }

  const expandido = features.map((f) => expandPolynomialFeatures(f, a.lin));
  const scaler = new StandardScaler();
  scaler.fit(expandido);
  const reg = new RidgeRegressor();
  reg.train(scaler.transform(expandido), alvoX, alvoY, grupos);

  const r2 = rng(semente + 7777);
  const ru2 = (amp: number) => (r2() - 0.5) * 2 * amp;
  let soma = 0;
  let n = 0;
  for (const c of CANTOS) {
    const gx = (c.x - 0.5) * 0.08;
    const gy = (c.y - 0.5) * 0.06;
    for (let k = 0; k < 20; k++) {
      const f = expandPolynomialFeatures(a.proj(vetorDoQuadro(gx, gy, jit, ru2)), a.lin);
      const p = reg.predict(scaler.transformSingle(f));
      soma += Math.hypot(p.x - c.x, p.y - c.y);
      n++;
    }
  }
  return { erro: soma / n, dims: reg.getModel()?.numFeatures ?? 0 };
}

const SEMENTES = Array.from({ length: 16 }, (_, i) => i + 1);
const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Erro médio nos cantos sobre 16 mundos independentes. */
function erroMedio(a: Arranjo, jit: number): number {
  return media(SEMENTES.map((s) => erroNosCantos(a, s, jit).erro));
}

describe('arranjo do vetor × extrapolação para os cantos', () => {
  it('a contagem de colunas é o ponto: 27 → 16 → 7', () => {
    const v = [1, 2, 3, 4, 5, 6];
    expect(erroNosCantos(AMBAS_COMPLETA, 1, 0.004).dims).toBe(27);
    expect(erroNosCantos(AMBAS_PARCIAL, 1, 0.004).dims).toBe(16);
    expect(erroNosCantos(NORMALIZADAS_COMPLETA, 1, 0.004).dims).toBe(14);
    expect(erroNosCantos(NORMALIZADAS_PARCIAL, 1, 0.004).dims).toBe(7);
    // E as contagens vêm da expansão, não de uma tabela paralela.
    expect(expandPolynomialFeatures(v)).toHaveLength(27);
    expect(expandPolynomialFeatures(v, [4, 5])).toHaveLength(16);
  });

  it('as quatro formas treinam e preveem — nenhuma degenera', () => {
    for (const a of [AMBAS_COMPLETA, AMBAS_PARCIAL, NORMALIZADAS_COMPLETA, NORMALIZADAS_PARCIAL]) {
      const { erro } = erroNosCantos(a, 1, 0.004);
      expect(Number.isFinite(erro)).toBe(true);
      // Sanidade: um Ridge que encolhe tudo para a média erra ~64 % da tela no
      // canto. Qualquer coisa nessa ordem significa que o teste não mediu nada.
      expect(erro).toBeLessThan(0.1);
    }
  });

  it('cortar as colunas do bloco angular não custa capacidade explicativa', () => {
    // Afirmação fraca de propósito no regime limpo: com pouco ruído os dois
    // arranjos empatam, e prometer ganho aqui seria prometer o mundo.
    const completa = erroMedio(AMBAS_COMPLETA, 0.004);
    const parcial = erroMedio(AMBAS_PARCIAL, 0.004);
    expect(parcial).toBeLessThanOrEqual(completa);
  });

  it('as duas reduções são INDEPENDENTES e se somam', () => {
    const jit = JITTER_TOTAL / 2;
    const base = erroMedio(AMBAS_COMPLETA, jit);
    const soExpansao = erroMedio(AMBAS_PARCIAL, jit);
    const soIris = erroMedio(NORMALIZADAS_COMPLETA, jit);
    const ambas = erroMedio(NORMALIZADAS_PARCIAL, jit);

    expect(soExpansao).toBeLessThan(base);
    expect(soIris).toBeLessThan(base);
    // Juntas ganham mais que qualquer uma sozinha: são cortes em eixos
    // diferentes (entrada × termos), não duas versões do mesmo corte.
    expect(ambas).toBeLessThan(soExpansao);
    expect(ambas).toBeLessThan(soIris);
  });

  it('a vantagem CRESCE com o ruído — que é a direção do paciente real', () => {
    // Quem usa numa sala escura, com óculos ou com ptose tem mais jitter. É
    // exatamente onde as colunas aliasadas com a identidade do alvo cobram
    // mais caro, e onde cortar ajuda mais.
    const razao = (jit: number) => erroMedio(NORMALIZADAS_PARCIAL, jit) / erroMedio(AMBAS_COMPLETA, jit);
    const pouco = razao(JITTER_TOTAL / 6);
    const muito = razao(JITTER_TOTAL);
    expect(pouco).toBeLessThan(1);
    expect(muito).toBeLessThan(pouco);
  });
});

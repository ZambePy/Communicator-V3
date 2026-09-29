/**
 * Ordem de percurso dos alvos de calibração.
 *
 * A tela mostra UMA bola que caminha de alvo em alvo. O motor devolve os
 * alvos na ordem em que a geometria os calcula; ordenar aqui, na tela, mantém
 * a coleta intacta: muda só a SEQUÊNCIA em que os mesmos alvos são visitados.
 *
 * Há duas ordens, escolhidas pela flag `ordemDescorrelacionada`:
 *
 *  - `ordemDaGrade` (anterior): ordem de leitura, linha por linha, de cima
 *    para baixo e da esquerda para a direita.
 *  - `ordemDescorrelacionada` (V3): a ordem que não se confunde com a deriva
 *    da cabeça.
 *
 * ── Por que a ordem de leitura atrapalha ────────────────────────────────────
 *
 * A cabeça anda durante a calibração, quase sempre num sentido só: em 8 de 9
 * sessões do histórico o pitch derivou monotonicamente, de 1,6° a 6,8°. Em
 * ordem de leitura a altura do alvo cresce junto com o tempo (r = 0,95 na
 * grade de 13), e o ajuste não tem como separar "olhou mais para baixo" de "a
 * cabeça inclinou": a deriva vira ganho e deslocamento verticais. Com a ordem
 * descorrelacionada a mesma deriva deixa de ter a forma de um alvo e vira
 * ruído, que a regularização trata. Num modelo simples com 200 px de deriva
 * residual o erro RMS vertical cai de 54 px para ~8 px (docs/PESQUISA.md
 * §3.2). As ferramentas de laboratório sorteiam a ordem por padrão (Titta,
 * PsychoPy); aqui ela é CALCULADA, para ser determinística e ter caminho curto.
 */

export interface PontoDaGrade {
  /** Posição horizontal em porcentagem da viewport (0–100). */
  x: number;
  /** Posição vertical em porcentagem da viewport (0–100). */
  y: number;
}

/**
 * Distância vertical, em pontos percentuais, abaixo da qual dois alvos são
 * considerados da MESMA linha na ordem de leitura.
 *
 * As linhas da grade padrão ficam em 5 / 50 / 83,75 / 95 %: a menor separação
 * real é de ~11 pontos. Oito absorve o arredondamento da geometria sem fundir
 * duas linhas de verdade.
 */
export const TOLERANCIA_DE_LINHA_PCT = 8;

/**
 * Índices dos pontos na ordem de leitura (topo→baixo, esquerda→direita).
 *
 * Devolve ÍNDICES, não pontos: quem coleta indexa a lista original da sessão,
 * e reordenar a lista em si dessincronizaria os índices que o resto da tela e
 * o motor já usam.
 */
export function ordemDaGrade(
  pontos: readonly PontoDaGrade[],
  toleranciaPct: number = TOLERANCIA_DE_LINHA_PCT
): number[] {
  if (pontos.length === 0) return [];

  // `indice` entra no critério de desempate para a ordem ser determinística
  // mesmo com dois alvos exatamente sobrepostos.
  const porAltura = pontos
    .map((p, indice) => ({ indice, x: p.x, y: p.y }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.indice - b.indice);

  const linhaPorIndice = new Map<number, number>();
  let linha = 0;
  let inicioDaLinha = porAltura[0].y;
  for (const p of porAltura) {
    if (p.y - inicioDaLinha > toleranciaPct) {
      linha += 1;
      inicioDaLinha = p.y;
    }
    linhaPorIndice.set(p.indice, linha);
  }

  return porAltura
    .slice()
    .sort(
      (a, b) =>
        (linhaPorIndice.get(a.indice) ?? 0) - (linhaPorIndice.get(b.indice) ?? 0) ||
        a.x - b.x ||
        a.indice - b.indice
    )
    .map((p) => p.indice);
}

/** O que se mede numa ordem de visita, para escolher e para testar. */
export interface MetricasDaOrdem {
  /** Correlação de Pearson entre a posição na sequência e o `x` do alvo. */
  rTx: number;
  /** Idem para `y`: a que importa contra a deriva vertical da cabeça. */
  rTy: number;
  /** Correlação entre (t − meio)² e `x`: deriva que curva e volta. */
  rT2x: number;
  rT2y: number;
  /**
   * Correlação entre `t` e os termos de 2º grau que o modelo ajusta
   * ((x−½)², (y−½)², (x−½)(y−½)). O maior dos três em valor absoluto.
   */
  rTQuadMax: number;
  /** Comprimento do percurso, em alturas de tela (unidade isotrópica). */
  caminho: number;
  /** Maior trecho entre dois alvos consecutivos, na mesma unidade. */
  maiorTrecho: number;
}

function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  // Variável constante não tem correlação com nada: devolve 0 em vez de NaN.
  if (saa < 1e-12 || sbb < 1e-12) return 0;
  return sab / Math.sqrt(saa * sbb);
}

/**
 * Métricas de uma ordem.
 *
 * `proporcao` = largura/altura da viewport. As coordenadas chegam em
 * porcentagem de cada eixo; para o caminho valer em distância de verdade, `x`
 * é multiplicado pela proporção (numa tela 16:9, 10 % da largura é 1,78× mais
 * longe que 10 % da altura).
 */
export function metricasDaOrdem(
  pontos: readonly PontoDaGrade[],
  ordem: readonly number[],
  proporcao: number
): MetricasDaOrdem {
  const n = ordem.length;
  const t = new Float64Array(n);
  const t2 = new Float64Array(n);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const qx = new Float64Array(n);
  const qy = new Float64Array(n);
  const qxy = new Float64Array(n);
  const meio = (n - 1) / 2;
  let caminho = 0;
  let maiorTrecho = 0;
  for (let k = 0; k < n; k++) {
    const p = pontos[ordem[k]];
    const x = p.x / 100;
    const y = p.y / 100;
    t[k] = k;
    t2[k] = (k - meio) * (k - meio);
    xs[k] = x;
    ys[k] = y;
    qx[k] = (x - 0.5) * (x - 0.5);
    qy[k] = (y - 0.5) * (y - 0.5);
    qxy[k] = (x - 0.5) * (y - 0.5);
    if (k > 0) {
      const d = Math.hypot((xs[k] - xs[k - 1]) * proporcao, ys[k] - ys[k - 1]);
      caminho += d;
      if (d > maiorTrecho) maiorTrecho = d;
    }
  }
  return {
    rTx: pearson(t, xs),
    rTy: pearson(t, ys),
    rT2x: pearson(t2, xs),
    rT2y: pearson(t2, ys),
    rTQuadMax: Math.max(
      Math.abs(pearson(t, qx)),
      Math.abs(pearson(t, qy)),
      Math.abs(pearson(t, qxy))
    ),
    caminho,
    maiorTrecho,
  };
}

/**
 * Pesos do custo que a busca minimiza.
 *
 * A ordem das prioridades é a do problema: a correlação linear com `x` e `y`
 * (deriva que vai num sentido só, o caso medido) pesa mais; a deriva que curva
 * e a correlação com os termos quadráticos do modelo vêm depois; caminho e
 * maior salto entram como fração dos da ordem de leitura, para a bola não
 * atravessar a tela à toa. Com estes pesos, nas cinco geometrias de tela de
 * `ordemDaGrade.test.ts`, |r(t,x)| e |r(t,y)| ficam ≤ 0,10, as correlações
 * com a deriva que curva e com os termos quadráticos ficam ≤ 0,15, o caminho
 * sai 10–20 % mais curto que o de leitura e o maior salto não passa do dela.
 */
const PESO_LINEAR = 20;
const PESO_CURVA = 6;
const PESO_QUADRATICO = 8;
const PESO_CAMINHO = 1;
const PESO_SALTO = 1;

/** Um alvo a menos que isto do centro (em alturas de tela) abre a sequência. */
const RAIO_DO_CENTRO = 0.03;

/**
 * Quantos começos a busca local tenta. A busca é determinística (semente
 * fixa); com 256 começos ela cumpre os limites de `ordemDaGrade.test.ts` em
 * todas as geometrias testadas, em algumas dezenas de milissegundos para 14
 * alvos — uma vez por calibração, antes da contagem regressiva.
 */
const RECOMECOS = 256;

/**
 * Até este tamanho a busca é exaustiva (8! = 40 320 ordens): as rodadas de
 * reforço e o modo rápido têm de 2 a 8 alvos.
 */
const MAX_EXAUSTIVA = 8;

/**
 * Custo de uma ordem, calculado sem alocar nada.
 *
 * A busca avalia dezenas de milhares de ordens. Tudo o que não depende da
 * ordem (médias e variâncias de x, y e dos termos quadráticos; as somas de t;
 * as distâncias entre pares de alvos) é calculado uma vez; por ordem só se
 * acumulam as somas cruzadas Σ t·v e o caminho, num laço só. As correlações
 * saem das somas: r = (Σ t·v − n·t̄·v̄) / √(S_tt·S_vv).
 */
function avaliadorDeCusto(pontos: readonly PontoDaGrade[], asp: number, ref: MetricasDaOrdem) {
  const n = pontos.length;
  const colunas = 5; // x, y, (x−½)², (y−½)², (x−½)(y−½)
  const v = new Float64Array(n * colunas);
  const media = new Float64Array(colunas);
  const escala = new Float64Array(colunas); // √S_vv, 0 se a variável é constante
  for (let i = 0; i < n; i++) {
    const x = pontos[i].x / 100;
    const y = pontos[i].y / 100;
    v[i * colunas] = x;
    v[i * colunas + 1] = y;
    v[i * colunas + 2] = (x - 0.5) * (x - 0.5);
    v[i * colunas + 3] = (y - 0.5) * (y - 0.5);
    v[i * colunas + 4] = (x - 0.5) * (y - 0.5);
  }
  for (let c = 0; c < colunas; c++) {
    let m = 0;
    for (let i = 0; i < n; i++) m += v[i * colunas + c];
    m /= n;
    let s = 0;
    for (let i = 0; i < n; i++) s += (v[i * colunas + c] - m) ** 2;
    media[c] = m;
    escala[c] = s < 1e-12 ? 0 : Math.sqrt(s);
  }
  const meio = (n - 1) / 2;
  const t2 = new Float64Array(n);
  let somaT2 = 0;
  for (let k = 0; k < n; k++) {
    t2[k] = (k - meio) * (k - meio);
    somaT2 += t2[k];
  }
  const mediaT2 = somaT2 / n;
  let stt = 0;
  let st2 = 0;
  for (let k = 0; k < n; k++) {
    stt += (k - meio) ** 2;
    st2 += (t2[k] - mediaT2) ** 2;
  }
  const raizStt = Math.sqrt(stt);
  const raizSt2 = st2 < 1e-12 ? 0 : Math.sqrt(st2);
  const dist = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      dist[i * n + j] = Math.hypot(
        (v[i * colunas] - v[j * colunas]) * asp,
        v[i * colunas + 1] - v[j * colunas + 1]
      );
    }
  }
  const r = (cruzada: number, somaT: number, raizT: number, c: number) =>
    raizT === 0 || escala[c] === 0 ? 0 : (cruzada - somaT * media[c]) / (raizT * escala[c]);
  const somaT = (n * (n - 1)) / 2;

  return (ordem: readonly number[]): number => {
    let tx = 0;
    let ty = 0;
    let t2x = 0;
    let t2y = 0;
    let tqx = 0;
    let tqy = 0;
    let tqxy = 0;
    let caminho = 0;
    let maiorTrecho = 0;
    for (let k = 0; k < n; k++) {
      const i = ordem[k] * colunas;
      tx += k * v[i];
      ty += k * v[i + 1];
      t2x += t2[k] * v[i];
      t2y += t2[k] * v[i + 1];
      tqx += k * v[i + 2];
      tqy += k * v[i + 3];
      tqxy += k * v[i + 4];
      if (k > 0) {
        const d = dist[ordem[k - 1] * n + ordem[k]];
        caminho += d;
        if (d > maiorTrecho) maiorTrecho = d;
      }
    }
    const rTx = r(tx, somaT, raizStt, 0);
    const rTy = r(ty, somaT, raizStt, 1);
    const rT2x = r(t2x, somaT2, raizSt2, 0);
    const rT2y = r(t2y, somaT2, raizSt2, 1);
    const q = Math.max(
      Math.abs(r(tqx, somaT, raizStt, 2)),
      Math.abs(r(tqy, somaT, raizStt, 3)),
      Math.abs(r(tqxy, somaT, raizStt, 4))
    );
    const caminhoRel = ref.caminho > 0 ? caminho / ref.caminho : 0;
    const saltoRel = ref.maiorTrecho > 0 ? maiorTrecho / ref.maiorTrecho : 0;
    return (
      PESO_LINEAR * (rTx * rTx + rTy * rTy) +
      PESO_CURVA * (rT2x * rT2x + rT2y * rT2y) +
      PESO_QUADRATICO * q * q +
      PESO_CAMINHO * caminhoRel +
      PESO_SALTO * saltoRel * saltoRel
    );
  };
}

/** Desempate estável: a menor ordem lexicográfica vence. */
function menorLexicografica(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** xorshift32: gerador fixo, para a busca dar a mesma ordem em toda máquina. */
function proximoAleatorio(s: number): number {
  let x = s >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function permutacoes(itens: number[]): number[][] {
  if (itens.length <= 1) return [itens.slice()];
  const out: number[][] = [];
  for (let i = 0; i < itens.length; i++) {
    const resto = itens.slice(0, i).concat(itens.slice(i + 1));
    for (const p of permutacoes(resto)) out.push([itens[i], ...p]);
  }
  return out;
}

/**
 * Índices dos pontos numa ordem que não se confunde com a deriva da cabeça.
 *
 * Começa pelo alvo do centro quando há um (o baseline de pose da sessão é
 * montado enquanto a bola está no primeiro alvo; começar num canto faria o
 * baseline nascer com a cabeça virada). Até 8 alvos a busca é exaustiva; acima
 * disso é uma busca local (trocas e realocações) a partir de começos gerados
 * por semente fixa. Nos dois casos o resultado é determinístico.
 */
export function ordemDescorrelacionada(
  pontos: readonly PontoDaGrade[],
  proporcao: number = 16 / 9
): number[] {
  const n = pontos.length;
  if (n <= 2) return pontos.map((_, i) => i);
  const asp = Number.isFinite(proporcao) && proporcao > 0 ? proporcao : 16 / 9;
  const ref = metricasDaOrdem(pontos, ordemDaGrade(pontos), asp);
  const custo = avaliadorDeCusto(pontos, asp, ref);

  const distCentro = pontos.map((p) => Math.hypot((p.x / 100 - 0.5) * asp, p.y / 100 - 0.5));
  let inicio = 0;
  for (let i = 1; i < n; i++) {
    if (distCentro[i] < distCentro[inicio]) inicio = i;
  }
  const fixo = distCentro[inicio] < RAIO_DO_CENTRO;
  const livres = pontos.map((_, i) => i).filter((i) => !(fixo && i === inicio));
  const prefixo = fixo ? [inicio] : [];

  let melhor: number[] = [];
  let melhorCusto = Number.POSITIVE_INFINITY;
  const considerar = (ordem: number[], c: number) => {
    if (c < melhorCusto - 1e-12 || (Math.abs(c - melhorCusto) <= 1e-12 && menorLexicografica(ordem, melhor))) {
      melhor = ordem;
      melhorCusto = c;
    }
  };

  if (livres.length <= MAX_EXAUSTIVA) {
    for (const p of permutacoes(livres)) {
      const ordem = prefixo.concat(p);
      considerar(ordem, custo(ordem));
    }
    return melhor;
  }

  const inicioLivre = prefixo.length;
  const tentativa = new Array<number>(n);
  let semente = 0x9e3779b9;
  for (let r = 0; r < RECOMECOS; r++) {
    const perm = livres.slice();
    for (let k = perm.length - 1; k > 0; k--) {
      semente = proximoAleatorio(semente);
      const j = semente % (k + 1);
      [perm[k], perm[j]] = [perm[j], perm[k]];
    }
    const ordem = prefixo.concat(perm);
    let c = custo(ordem);
    let melhorou = true;
    while (melhorou) {
      melhorou = false;
      // Trocas de dois alvos.
      for (let i = inicioLivre; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
          const c2 = custo(ordem);
          if (c2 < c - 1e-12) {
            c = c2;
            melhorou = true;
          } else {
            [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
          }
        }
      }
      // Realocação de um alvo para outra posição.
      for (let i = inicioLivre; i < n; i++) {
        for (let j = inicioLivre; j < n; j++) {
          if (i === j) continue;
          for (let k = 0; k < n; k++) tentativa[k] = ordem[k];
          const [e] = tentativa.splice(i, 1);
          tentativa.splice(j, 0, e);
          const c2 = custo(tentativa);
          if (c2 < c - 1e-12) {
            for (let k = 0; k < n; k++) ordem[k] = tentativa[k];
            c = c2;
            melhorou = true;
          }
        }
      }
    }
    considerar(ordem.slice(), c);
  }
  return melhor;
}

/**
 * A ordem que a tela usa: descorrelacionada no V3, de leitura na base.
 *
 * `usarDescorrelacionada` vem de `EXPERIMENT.ordemDescorrelacionada`, lido
 * por quem chama — este módulo fica puro para ser testado sem configuração.
 */
export function ordemDaSequencia(
  pontos: readonly PontoDaGrade[],
  usarDescorrelacionada: boolean,
  proporcao: number = 16 / 9
): number[] {
  return usarDescorrelacionada ? ordemDescorrelacionada(pontos, proporcao) : ordemDaGrade(pontos);
}

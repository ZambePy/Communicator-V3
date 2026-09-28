/**
 * Quantos alvos de resposta cabem na coluna da direita da conversa, sem rolar.
 *
 * A coluna tem duas partes: em cima, Sim e Não (sempre, e grandes); embaixo,
 * Escrever, as frases e Repetir. Cada alvo tem piso no alvo mínimo de 5°
 * (`alvoMinimoPx`): abaixo disso ele deixa de ser alcançável pelo olhar.
 *
 * Antes eram duas grades fixas (2×2 e 3×2) que pediam quatro linhas de 5°.
 * Com a faixa do tutorial e a dica abertas elas não cabiam: a linha de
 * Repetir/Escrever saía cortada e a segunda linha de frases ficava abaixo da
 * tela, onde o cursor para na borda. Agora, quando não cabe tudo, as frases
 * viram páginas e um alvo "Mais" passa para a próxima — nada fica fora da tela.
 * Se nem duas linhas cabem (tela baixa com as duas faixas), Sim e Não descem
 * para a mesma fileira dos outros alvos.
 */

export const VAO_TOPO = 16;
export const VAO = 12;

export type PlanoDasRespostas = {
  /** Altura da faixa de Sim/Não, em px; `null` sem medida ou sem a faixa. */
  alturaTopo: number | null;
  /** Sim e Não vão para a grade de baixo, como os dois primeiros alvos. */
  simNaoNaGrade: boolean;
  colunas: number;
  /** Linhas da grade de baixo que vão de fato para a tela. */
  linhas: number;
  /** `null`: todos os alvos cabem. Senão, quantos itens por página. */
  porPagina: number | null;
  /** Quantos alvos do começo da lista ficam fixos fora das páginas. */
  fixos: number;
};

const entre = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function planejarRespostas({
  largura,
  altura,
  piso,
  quantidade,
}: {
  largura: number;
  altura: number;
  piso: number;
  quantidade: number;
}): PlanoDasRespostas {
  // Sem medida (primeiro quadro, testes sem layout): tudo, em três colunas.
  if (!(largura > 0) || !(altura > 0) || !(piso > 0)) {
    return { alturaTopo: null, simNaoNaGrade: false, colunas: 3, linhas: Math.max(1, Math.ceil(quantidade / 3)), porPagina: null, fixos: 0 };
  }

  const colunas = entre(Math.floor((largura + VAO) / (piso + VAO)), 2, 4);

  // Nem duas linhas cabem: uma fileira só, com Sim e Não fixos na frente, uma
  // página (Escrever, as frases, Repetir) e "Mais".
  if (altura < 2 * piso + VAO_TOPO) {
    return { alturaTopo: null, simNaoNaGrade: true, colunas, linhas: 1, porPagina: Math.max(1, colunas - 3), fixos: 2 };
  }

  // Quantas linhas cabem embaixo se Sim/Não ficarem no piso: é o máximo.
  const maxLinhas = entre(Math.floor((altura - piso - VAO_TOPO + VAO) / (piso + VAO)), 1, 3);
  const capacidade = colunas * maxLinhas;

  let linhas: number;
  let porPagina: number | null = null;
  let fixos = 0;
  if (quantidade <= capacidade) {
    linhas = Math.max(1, Math.ceil(quantidade / colunas));
  } else {
    // Não cabe: Escrever fica fixo (quando sobra lugar), o último alvo vira
    // "Mais" e o resto é a página.
    linhas = maxLinhas;
    fixos = capacidade >= 3 ? 1 : 0;
    porPagina = Math.max(1, capacidade - fixos - 1);
  }

  // Sim/Não ficam com 40 % da altura, sem descer do piso e sem roubar o
  // espaço das linhas de baixo.
  const alturaDasLinhas = linhas * piso + (linhas - 1) * VAO;
  const alturaTopo = entre(Math.round(altura * 0.4), piso, Math.max(piso, altura - VAO_TOPO - alturaDasLinhas));

  return { alturaTopo, simNaoNaGrade: false, colunas, linhas, porPagina, fixos };
}

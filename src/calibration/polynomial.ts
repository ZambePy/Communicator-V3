/**
 * Expansão polinomial de grau 2 para uso no Ridge.
 *
 * O Ridge linear tem teto matemático; a maior parte do erro residual do
 * baseline era não-linear, e expandir as features deixa o mesmo Ridge capturar
 * curvatura.
 *
 * Layout de saída para d entradas [x₁, ..., x_d]:
 *   [x₁, ..., x_d,           ← d originais, SEMPRE todas
 *    x₁², x₁·x₂, ..., x₁·x_d,  ← linha 1 da triangular superior
 *    x₂², x₂·x₃, ..., x₂·x_d,
 *    ...
 *    x_d²]
 *
 * Dimensão total: d + d·(d+1)/2 = d·(d+3)/2.
 *
 * O StandardScaler é aplicado DEPOIS desta expansão. Escalar antes destruiria
 * a relação entre x e x² (a escala da quadrática é diferente da linear).
 *
 * ── Expansão PARCIAL ───────────────────────────────────────────────────────
 *
 * A expansão completa cobra caro: com 6 dims por olho ela produz 27, contra 9
 * alvos distintos — 3 dimensões por alvo. E não todas as dimensões merecem o
 * mesmo tratamento.
 *
 * O bloco angular já chega LINEARIZADO. `l2cs/block.ts` aplica a tangente
 * justamente porque a geometria de projeção é
 *
 *     x_tela ≈ x_olho + d · tan(yaw)
 *
 * ou seja: o termo de 1ª ordem em `tan(yaw)` já é o modelo correto. O quadrado
 * e o cruzado dessas dimensões capturam apenas curvatura residual — muito
 * menos sinal por dimensão que os termos de íris, e ainda assim ocupam lugar
 * na matriz que nove alvos precisam determinar.
 *
 * Por isso `lineares` deixa posições escolhidas FORA dos termos quadráticos,
 * mantendo-as no bloco linear. Com as duas dims angulares fora, 4 dims viram
 * 7 em vez de 14 (e 6 viram 16 em vez de 27).
 *
 * Sem `lineares` o comportamento é idêntico ao histórico, bit a bit — a
 * ordem das colunas é a mesma, o que importa porque perfis salvos carregam
 * coeficientes posicionais.
 */

/**
 * @param x        vetor de features já projetado no conjunto ativo.
 * @param lineares posições de `x` que NÃO entram nos termos quadráticos.
 *                 Ausente ou vazio = expansão completa.
 */
export function expandPolynomialFeatures(
  x: readonly number[],
  lineares?: readonly number[],
): number[] {
  const d = x.length;
  if (d === 0) return [];

  // Quem participa dos produtos, em ordem crescente — a ordem das colunas é
  // parte do contrato com os perfis salvos.
  let participantes: number[] | null = null;
  if (lineares && lineares.length > 0) {
    const fora = new Set(lineares);
    participantes = [];
    for (let i = 0; i < d; i++) if (!fora.has(i)) participantes.push(i);
  }

  const p = participantes ?? null;
  const q = p === null ? d : p.length;
  const out: number[] = new Array(d + (q * (q + 1)) / 2);
  for (let i = 0; i < d; i++) out[i] = x[i];

  let k = d;
  if (p === null) {
    for (let i = 0; i < d; i++) {
      for (let j = i; j < d; j++) out[k++] = x[i] * x[j];
    }
  } else {
    for (let a = 0; a < q; a++) {
      for (let b = a; b < q; b++) out[k++] = x[p[a]] * x[p[b]];
    }
  }
  return out;
}

/** Dimensão de saída de `expandPolynomialFeatures`, sem construir o vetor. */
export function dimsDaExpansao(d: number, quantasLineares = 0): number {
  if (d <= 0) return 0;
  const q = Math.max(0, d - quantasLineares);
  return d + (q * (q + 1)) / 2;
}

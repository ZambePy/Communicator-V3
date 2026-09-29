/**
 * As duas contas que os módulos do V3 repetiam: a mediana de uma lista e a
 * rampa de Hermite que troca um degrau por uma transição contínua.
 */

/** Mediana de uma lista; `NaN` se vazia. Não mexe na lista. */
export function mediana(v: readonly number[]): number {
  if (v.length === 0) return Number.NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Passo de Hermite 3t² − 2t³ preso em [0, 1]: rampa contínua com derivada contínua. */
export function passoSuave(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

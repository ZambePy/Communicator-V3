/**
 * Ordem de percurso da grade de calibração.
 *
 * A tela mostra UMA bola que caminha pela grade. Para o percurso ser contínuo
 * — e para o olho conseguir PERSEGUIR a bola em vez de saltar atrás dela — os
 * alvos precisam sair em ordem de leitura: linha por linha, de cima para
 * baixo, e da esquerda para a direita dentro de cada linha.
 *
 * O motor devolve os alvos na ordem em que a geometria os calcula, que não é
 * necessariamente essa. Ordenar aqui, na tela, mantém a coleta intacta: o que
 * muda é só a SEQUÊNCIA em que os mesmos alvos são visitados.
 *
 * ── Por que agrupar por linha em vez de ordenar por `y` direto ──────────────
 *
 * As linhas da grade não têm `y` exatamente igual: a grade é calculada a
 * partir da distância medida da sessão e pode sair com frações diferentes por
 * coluna. Ordenar só por `y` intercalaria colunas de linhas vizinhas e a bola
 * ziguezaguearia na vertical. O agrupamento por tolerância trata "quase o
 * mesmo `y`" como a mesma linha, que é o que o olho enxerga.
 */

export interface PontoDaGrade {
  /** Posição horizontal em porcentagem da viewport (0–100). */
  x: number;
  /** Posição vertical em porcentagem da viewport (0–100). */
  y: number;
}

/**
 * Distância vertical, em pontos percentuais, abaixo da qual dois alvos são
 * considerados da MESMA linha.
 *
 * As grades em uso têm linhas a 10 / 50 / 90 % (ou 15 / 50 / 85 % quando a
 * distância medida encolhe a grade): a separação real nunca fica abaixo de
 * ~30 pontos. Oito é folgado o bastante para absorver o arredondamento da
 * geometria e apertado o bastante para nunca fundir duas linhas de verdade.
 */
export const TOLERANCIA_DE_LINHA_PCT = 8;

/**
 * Índices dos pontos na ordem de percurso (topo→baixo, esquerda→direita).
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

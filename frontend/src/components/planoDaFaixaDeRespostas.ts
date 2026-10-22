/**
 * Quantas sugestões cabem numa fileira da faixa de respostas.
 *
 * Cada alvo tem piso no alvo mínimo de 5° (`alvoMinimoPx`): abaixo disso ele
 * deixa de ser alcançável pelo olhar, que é a única entrada do paciente. A
 * faixa fica numa coluna que, numa tela de 1366 px, tem ~650 px — cabem três
 * alvos, e não cinco. Em vez de encolher os alvos (o erro de sempre) ou de
 * quebrar a faixa em duas fileiras (que comeria a altura das mensagens, a
 * pergunta que o paciente precisa LER), o que não cabe sai: as sugestões vêm
 * ordenadas da mais provável para a menos, então ficam as primeiras. O
 * "Nenhuma" fica sempre — é a saída para o teclado.
 */

/** O mesmo vão entre alvos da grade de respostas (`planoDasRespostas.VAO`). */
export const VAO_DA_FAIXA = 12;

export type PlanoDaFaixa = {
  /** Colunas da fileira: as sugestões mostradas mais o "Nenhuma". */
  colunas: number;
  /** Quantas das sugestões recebidas entram (as primeiras). */
  sugestoes: number;
};

export function planejarFaixa({
  largura,
  piso,
  quantidade,
}: {
  /** Largura da faixa em px; 0 sem medida (primeiro quadro, testes sem layout). */
  largura: number;
  piso: number;
  /** Sugestões recebidas, antes do corte. */
  quantidade: number;
}): PlanoDaFaixa {
  const total = Math.max(0, Math.floor(quantidade));
  // Sem medida: tudo, como a grade de respostas faz.
  if (!(largura > 0) || !(piso > 0)) return { colunas: total + 1, sugestoes: total };

  const cabem = Math.min(5, Math.max(2, Math.floor((largura + VAO_DA_FAIXA) / (piso + VAO_DA_FAIXA))));
  const sugestoes = Math.min(total, cabem - 1);
  return { colunas: sugestoes + 1, sugestoes };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Altura: a faixa não pode custar a pergunta que ela responde
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * O que o registro de mensagens precisa para a pergunta ser lida: uma
 * mensagem de duas linhas, com o preenchimento da caixa. Medido na Conversa
 * (21/10/2026): uma mensagem curta ocupa ~112 px; as de duas linhas, ~135.
 */
export const ALTURA_MINIMA_DO_REGISTRO = 140;

/** O título da faixa ("Sugestões de resposta, só falam se você escolher") com a margem de baixo. */
export const ALTURA_DO_TITULO_DA_FAIXA = 34;

/** O vão entre o registro e a faixa, na coluna da esquerda da Conversa (1rem). */
export const VAO_ENTRE_REGISTRO_E_FAIXA = 16;

/**
 * A faixa cabe na coluna sem tirar do registro o que ele precisa?
 *
 * O alvo de 5° é um piso (não encolhe), então a faixa tem altura fixa — o piso
 * mais o título — e quem cede é o registro. Numa tela baixa, ou na primeira
 * visita (com a dica "Entendi" aberta, ~165 px a mais no alto), o registro
 * ficava com 34 px em 1093×614: o paciente veria as respostas e não a pergunta.
 * Nesse caso a faixa espera: as respostas de sempre (Sim, Não, frases e o
 * teclado) continuam na tela, e a faixa volta quando houver espaço.
 *
 * `alturaDaColuna` é a altura da coluna inteira (registro + faixa), que não
 * depende de a faixa estar ou não na tela — por isso a decisão não oscila.
 * Zero é "sem medida" (primeiro quadro, testes sem layout): cabe.
 */
export function faixaCabeNaColuna({ alturaDaColuna, piso }: { alturaDaColuna: number; piso: number }): boolean {
  if (!(alturaDaColuna > 0)) return true;
  return alturaDaColuna >= ALTURA_MINIMA_DO_REGISTRO + VAO_ENTRE_REGISTRO_E_FAIXA + ALTURA_DO_TITULO_DA_FAIXA + piso;
}

/**
 * Recoleta dos alvos ruins da calibração (item 7 do pedido de 19/10/2026).
 *
 * Depois dos 13 pontos, um ou outro alvo sai ruim por um motivo PASSAGEIRO: a
 * pessoa chegou atrasada ao ponto, piscou muito, mexeu a cabeça, o rosto sumiu
 * por um instante. O modelo inteiro sofre — o alvo ruim está DENTRO do treino
 * dos outros, e um canto ruim tem alavanca alta —, e mandar refazer a
 * calibração inteira custa mais ~40 s de fixação a quem tem ELA. Este módulo
 * decide QUAIS alvos refazer e se o modelo novo pode substituir o antigo. É
 * puro: quem guarda estado e retreina é `calibration.ts`.
 *
 * ## A qualidade de cada alvo: duas medidas, as duas honestas
 *
 *  1. ERRO FORA DA AMOSTRA (leave-one-target-out). Treina-se sem o alvo e
 *     mede-se onde o modelo põe as amostras dele. É honesto porque o alvo não
 *     ajudou a montar o modelo que o avalia. O resíduo no próprio treino seria
 *     otimista — e mais otimista justamente nos alvos de alavanca alta (os
 *     cantos), onde o ajuste se curva para passar perto deles.
 *  2. DISPERSÃO DENTRO DO ALVO: o quanto a predição anda em volta da própria
 *     média durante a fixação (RMS, em px). Não depende de acertar o alvo; diz
 *     se a fixação foi estável. É o que denuncia a chegada atrasada e o olhar
 *     que vagou no meio da coleta.
 *
 * ## Com quem cada alvo é comparado
 *
 * O LOTO de um alvo de BORDA é extrapolação por construção: sem ele, o modelo
 * adivinha o canto a partir do miolo, e numa sessão boa o erro sai 3–4× o do
 * miolo (replay de 23/09: ~83 px no miolo, ~300 px nos cantos). Comparar um
 * canto com a mediana de todos mandaria refazer os quatro cantos em TODA
 * calibração. Por isso cada alvo é comparado com a mediana da própria REGIÃO —
 * miolo com miolo, borda com borda.
 *
 * A mediana inclui o próprio alvo, de propósito. Com quatro cantos, a mediana
 * é a média do 2º e do 3º: um canto ruim sozinho não a puxa (é o maior, e o
 * maior não entra), então ele passa do corte. Já um defeito que pega DOIS
 * cantos ao mesmo tempo — a pálpebra nos dois de baixo, que satura as features
 * abaixo da grade (`correcaoLocal.ts`) — sobe a mediana junto e não dispara
 * nada: é da geometria do posto, refazer daria as mesmas amostras, e a
 * correção local dos cantos já trata disso. Uma mediana sem o próprio alvo
 * marcaria os dois cantos de baixo em toda calibração dessa pessoa — tempo de
 * fixação gasto à toa, toda vez.
 *
 * ## O corte: relativo E absoluto
 *
 * Um alvo é ruim quando a medida passa de 2× a mediana da região E de um
 * piso em graus. O relativo acha o alvo fora da curva DESTA sessão; o piso
 * impede que, numa sessão muito boa, um alvo "duas vezes pior" mas ainda
 * excelente gaste tempo do paciente. Os dois pisos saem do alvo mínimo do app
 * (5°, abaixo disso o `GazeButton` avisa), com R = 2,5° = metade dele:
 *
 *  - erro: 2,5° — acima disso o cursor, na média, cai fora de um botão mínimo.
 *    É também a fronteira "Ruim" do teste de precisão (100 px ≈ 2,6° na
 *    bancada de referência), então "refazer este ponto" e "Ruim" concordam;
 *  - dispersão: 2,0° — com a predição espalhada assim, mesmo sem viés nenhum
 *    uma em cada cinco amostras cai fora do botão mínimo. Numa nuvem gaussiana
 *    isotrópica de raio quadrático médio ρ, P(r > R) = exp(−R²/ρ²); com
 *    R = 2,5° e P = 1/5 sai ρ = R/√ln 5 ≈ 2,0°.
 *
 * Um alvo com menos amostras que o mínimo de referência também é refeito: a
 * média dele é ruído de poucos quadros (o rosto sumiu, a coleta fechou pelo
 * teto).
 *
 * ## Substituir, não somar
 *
 * As amostras novas de um alvo SUBSTITUEM as antigas. Somar dobraria o peso
 * daquele alvo contra os outros (no ajuste, o peso de um alvo é proporcional
 * ao número de amostras dele) e ainda deixaria no treino as amostras ruins que
 * motivaram a recoleta. Um alvo cuja recoleta não rendeu amostras bastantes
 * fica com as antigas.
 *
 * ## A trava de aceitação
 *
 * Com as amostras finais o treino é refeito do zero — StandardScaler, λ pela
 * validação cruzada, Huber, correção dos cantos —, e o modelo novo só fica se
 * o LOTO médio dos alvos não piorar. Senão volta o antigo, inteiro. É isso que
 * deixa ligar a recoleta por padrão: no pior caso ela custa os segundos do
 * paciente, nunca o modelo.
 */

/** O que o diagnóstico do ajuste sabe de cada alvo. */
export interface MedidaDoAlvo {
  /** Chave do alvo nominal (`targetGroupKey`): a mesma das amostras no perfil. */
  chave: string;
  /** Alvo nominal, em fração da tela — onde a bola é desenhada. */
  x: number;
  y: number;
  /** Erro médio leave-one-target-out, em px. `NaN` quando a dobra falhou. */
  erroLotoPx: number;
  /** Dispersão RMS da predição em volta da média do próprio alvo, em px. */
  dispersaoPx: number;
  amostras: number;
  /** Fora da grade interna: cantos da tela, meio da borda de baixo (M7), anel
   *  de borda do perfil `computador`. */
  borda: boolean;
}

export type MotivoDaRecoleta = 'erro' | 'dispersao' | 'poucasAmostras';

export interface QualidadeDoAlvo extends MedidaDoAlvo {
  erroLotoDeg: number;
  dispersaoDeg: number;
  /** Mediana da região do alvo (com ele), em px. `NaN` sem medida na região. */
  referenciaDoErroPx: number;
  referenciaDaDispersaoPx: number;
  /** Corte efetivo, em px: o maior entre 2× a referência e o piso. `NaN` sem referência. */
  corteDoErroPx: number;
  corteDaDispersaoPx: number;
  /** Vazio = alvo bom. */
  motivos: MotivoDaRecoleta[];
  /** Maior razão medida/corte; acima de 1 passou de algum corte. Ordena os piores. */
  severidade: number;
}

/** "Mais de 2× a mediana da região". */
export const FATOR_SOBRE_OS_PARES = 2;

/** Piso do erro LOTO, em graus: metade do alvo mínimo de 5°. */
export const PISO_DO_ERRO_DEG = 2.5;

/** Piso da dispersão, em graus: 1 amostra em 5 fora do alvo mínimo (ver o cabeçalho). */
export const PISO_DA_DISPERSAO_DEG = 2.0;

/**
 * No máximo quantos alvos uma rodada refaz. Quatro alvos são ~15 s com o
 * deslocamento da bola: menos da metade de uma calibração. Acima disso o
 * problema é da sessão, não de pontos avulsos.
 */
export const MAXIMO_DE_ALVOS_POR_RODADA = 4;

/**
 * Abaixo disto não se avalia nada. Com menos alvos cada dobra do LOTO tira uma
 * fração grande do treino (no modo rápido, 1 de 4) e a comparação na região
 * deixa de significar alguma coisa.
 */
export const MINIMO_DE_ALVOS_PARA_AVALIAR = 9;

function mediana(v: readonly number[]): number {
  if (v.length === 0) return Number.NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Mediana da REGIÃO do alvo `i` (miolo ou borda), com medida finita, contando
 * o próprio alvo — ver o cabeçalho. Com menos de três alvos medidos na região
 * (um perfil com um alvo de borda só) a referência passa a ser a mediana de
 * todos: a mediana de um ou dois valores é o próprio alvo, e ele nunca
 * passaria de 2× ele mesmo.
 */
function referenciaDaRegiao(
  medidas: readonly MedidaDoAlvo[],
  i: number,
  valor: (m: MedidaDoAlvo) => number,
): number {
  const medidos = medidas.filter((m) => Number.isFinite(valor(m)));
  const regiao = medidos.filter((m) => m.borda === medidas[i].borda);
  return mediana((regiao.length >= 3 ? regiao : medidos).map(valor));
}

/**
 * Avalia cada alvo contra a região dele. Pura e total: medida não finita nunca
 * vira motivo (uma dobra que falhou não é evidência de coleta ruim, e refazer
 * não conserta uma dobra degenerada).
 *
 * @param pxPorGrau px de tela por grau de ângulo visual na geometria da sessão.
 * @param minimoDeAmostras o mínimo de referência por alvo (`MIN_ACCEPTED_SAMPLES`).
 */
export function avaliarAlvos(
  medidas: readonly MedidaDoAlvo[],
  pxPorGrau: number,
  minimoDeAmostras: number,
): QualidadeDoAlvo[] {
  const escala = Number.isFinite(pxPorGrau) && pxPorGrau > 0 ? pxPorGrau : Number.NaN;
  const pisoErroPx = PISO_DO_ERRO_DEG * escala;
  const pisoDispersaoPx = PISO_DA_DISPERSAO_DEG * escala;
  // Sem geometria o piso não existe; vale só o relativo — melhor que inventar
  // uma escala, e a trava de aceitação continua valendo.
  const corte = (referencia: number, piso: number) =>
    Number.isFinite(referencia)
      ? Math.max(FATOR_SOBRE_OS_PARES * referencia, Number.isFinite(piso) ? piso : 0)
      : Number.NaN;

  return medidas.map((m, i) => {
    const referenciaDoErroPx = referenciaDaRegiao(medidas, i, (a) => a.erroLotoPx);
    const referenciaDaDispersaoPx = referenciaDaRegiao(medidas, i, (a) => a.dispersaoPx);
    const corteDoErroPx = corte(referenciaDoErroPx, pisoErroPx);
    const corteDaDispersaoPx = corte(referenciaDaDispersaoPx, pisoDispersaoPx);

    const motivos: MotivoDaRecoleta[] = [];
    const razoes: number[] = [];
    if (Number.isFinite(m.erroLotoPx) && corteDoErroPx > 0) {
      razoes.push(m.erroLotoPx / corteDoErroPx);
      if (m.erroLotoPx > corteDoErroPx) motivos.push('erro');
    }
    if (Number.isFinite(m.dispersaoPx) && corteDaDispersaoPx > 0) {
      razoes.push(m.dispersaoPx / corteDaDispersaoPx);
      if (m.dispersaoPx > corteDaDispersaoPx) motivos.push('dispersao');
    }
    if (minimoDeAmostras > 0 && m.amostras < minimoDeAmostras) {
      razoes.push(minimoDeAmostras / Math.max(1, m.amostras));
      motivos.push('poucasAmostras');
    }

    return {
      ...m,
      erroLotoDeg: m.erroLotoPx / escala,
      dispersaoDeg: m.dispersaoPx / escala,
      referenciaDoErroPx,
      referenciaDaDispersaoPx,
      corteDoErroPx,
      corteDaDispersaoPx,
      motivos,
      severidade: razoes.length > 0 ? Math.max(...razoes) : 0,
    };
  });
}

/**
 * Os alvos que valem uma recoleta, do pior para o menos ruim, até `maximo`.
 * Desempate pela chave, para a escolha ser determinística.
 */
export function escolherAlvosParaRecoletar(
  qualidade: readonly QualidadeDoAlvo[],
  maximo: number = MAXIMO_DE_ALVOS_POR_RODADA,
): QualidadeDoAlvo[] {
  return qualidade
    .filter((a) => a.motivos.length > 0)
    .sort((a, b) => b.severidade - a.severidade || a.chave.localeCompare(b.chave))
    .slice(0, Math.max(0, maximo));
}

/**
 * Troca as amostras dos alvos recoletados pelas novas.
 *
 * Um alvo só é trocado quando a recoleta rendeu amostras bastantes: o mínimo
 * de referência, ou — quando o alvo já tinha menos que isso — pelo menos
 * tantas quanto tinha. Senão fica com as antigas: trocar 40 amostras por 3
 * deixaria o alvo mais fraco do que estava.
 *
 * Sem nenhuma troca, devolve o perfil de antes, os MESMOS objetos na mesma
 * ordem — é o que garante que "nada a trocar" não mexe em nada.
 */
export function substituirAmostras<T>(
  antes: readonly T[],
  novas: readonly T[],
  chaveDe: (p: T) => string,
  recoletadas: ReadonlySet<string>,
  minimoPorAlvo: number,
): { perfil: T[]; substituidas: string[]; mantidas: string[] } {
  const contar = (lista: readonly T[]) => {
    const n = new Map<string, number>();
    for (const p of lista) {
      const k = chaveDe(p);
      if (recoletadas.has(k)) n.set(k, (n.get(k) ?? 0) + 1);
    }
    return n;
  };
  const nAntes = contar(antes);
  const nNovas = contar(novas);
  const ordenadas = [...recoletadas].sort();
  const substituidas = ordenadas.filter((k) => {
    const novasDoAlvo = nNovas.get(k) ?? 0;
    return novasDoAlvo > 0 && novasDoAlvo >= Math.min(minimoPorAlvo, nAntes.get(k) ?? 0);
  });
  const mantidas = ordenadas.filter((k) => !substituidas.includes(k));
  if (substituidas.length === 0) return { perfil: [...antes], substituidas, mantidas };
  const trocar = new Set(substituidas);
  return {
    perfil: [
      ...antes.filter((p) => !trocar.has(chaveDe(p))),
      ...novas.filter((p) => trocar.has(chaveDe(p))),
    ],
    substituidas,
    mantidas,
  };
}

/** Erro LOTO de um alvo, como a trava o compara. */
export interface LotoDoAlvo {
  chave: string;
  erroPx: number;
  /** Alvo da grade interna (entra na média "sem os cantos"). */
  interno: boolean;
}

export type MotivoDaDecisao = 'melhorou' | 'igual' | 'piorou' | 'dobra_nova_falhou' | 'sem_comparacao';

export interface DecisaoDeAceitacao {
  aceito: boolean;
  motivo: MotivoDaDecisao;
  /** LOTO médio nos alvos comparados, antes e depois, em px. */
  looAntesPx: number;
  looDepoisPx: number;
  /** O mesmo só nos alvos da grade interna (`NaN` sem eles). Registrado, não decide. */
  looInternoAntesPx: number;
  looInternoDepoisPx: number;
  alvosComparados: number;
}

const media = (v: readonly number[]) => (v.length > 0 ? v.reduce((a, b) => a + b, 0) / v.length : Number.NaN);

/**
 * A trava: o modelo novo só fica se o LOTO médio dos alvos não piorar.
 *
 * A comparação é feita nos MESMOS alvos dos dois lados — os que tinham LOTO
 * finito antes e existem depois —, porque a média de populações diferentes
 * não compara nada. Um alvo cuja dobra funcionava e passou a falhar reprova o
 * modelo novo: ele perdeu a capacidade de prever aquele ponto, e a média dos
 * que sobraram esconderia isso.
 *
 * Empate conta como "não piorou": o pedido é não piorar, e o modelo novo foi
 * treinado com amostras mais recentes dos alvos refeitos.
 */
export function decidirAceitacao(
  antes: readonly LotoDoAlvo[],
  depois: readonly LotoDoAlvo[],
): DecisaoDeAceitacao {
  const doDepois = new Map(depois.map((d) => [d.chave, d] as const));
  const comuns = antes.filter((a) => Number.isFinite(a.erroPx) && doDepois.has(a.chave));
  const vazio = (motivo: MotivoDaDecisao): DecisaoDeAceitacao => ({
    aceito: false,
    motivo,
    looAntesPx: Number.NaN,
    looDepoisPx: Number.NaN,
    looInternoAntesPx: Number.NaN,
    looInternoDepoisPx: Number.NaN,
    alvosComparados: comuns.length,
  });
  if (comuns.some((a) => !Number.isFinite((doDepois.get(a.chave) as LotoDoAlvo).erroPx))) {
    return vazio('dobra_nova_falhou');
  }
  if (comuns.length < 3) return vazio('sem_comparacao');

  const looAntesPx = media(comuns.map((a) => a.erroPx));
  const looDepoisPx = media(comuns.map((a) => (doDepois.get(a.chave) as LotoDoAlvo).erroPx));
  const internos = comuns.filter((a) => a.interno);
  const decisao: DecisaoDeAceitacao = {
    aceito: looDepoisPx <= looAntesPx,
    motivo: looDepoisPx < looAntesPx ? 'melhorou' : looDepoisPx === looAntesPx ? 'igual' : 'piorou',
    looAntesPx,
    looDepoisPx,
    looInternoAntesPx: media(internos.map((a) => a.erroPx)),
    looInternoDepoisPx: media(internos.map((a) => (doDepois.get(a.chave) as LotoDoAlvo).erroPx)),
    alvosComparados: comuns.length,
  };
  return decisao;
}

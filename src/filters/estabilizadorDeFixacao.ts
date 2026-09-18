/**
 * Estabilizador por estado do olho: fixação congela, sacada solta (sprint S5).
 *
 * ## Por que um filtro só não dá conta
 *
 * Qualquer filtro de parâmetro único é obrigado a ser ruim em algum regime:
 * manso o bastante para uma fixação estável é lento demais para uma sacada, e
 * vice-versa. É o compromisso que a função de custo precisão×atraso mede — e
 * ele só se resolve de verdade classificando o estado ANTES de filtrar.
 *
 * ## O que este estágio faz, e por que ele é o ganho barato
 *
 * Durante uma fixação, a melhor estimativa da posição do olhar não é a última
 * amostra: é a MÉDIA das amostras da fixação. Com 30 Hz e uma janela de 200 ms
 * isso já divide o ruído por √6; ao longo de um dwell de 1500 ms o mesmo
 * raciocínio leva o tremor de ~22 px para ~3 px. A medição M1 registrou razão
 * de filtro 0,99 — o One Euro em produção praticamente não suaviza — então esse
 * espaço está inteiro disponível.
 *
 * Na sacada, o oposto: a média é veneno, porque mistura o ponto de partida com
 * o de chegada. Detectada a sacada, a janela é jogada fora e a saída volta a
 * ser a amostra filtrada, sem atraso adicional nenhum.
 *
 * ## O critério
 *
 * Dispersão I-DT clássica — (máx − mín) em X mais (máx − mín) em Y sobre a
 * janela — comparada a um limiar em GRAUS, convertido para pixels pela
 * geometria da tela. Entra em fixação abaixo de 1,0°, sai acima de 1,5°.
 *
 * ## A saída é um PESO, não uma chave
 *
 * A primeira versão comutava: ou a saída era a média, ou era a amostra crua. A
 * histerese existia para o estado não oscilar no limiar — e o comentário
 * original dizia exatamente por quê: "o cursor pularia entre a média e a
 * amostra crua".
 *
 * Pularia mesmo, e pulava: a média pode estar a até `DESLOCAMENTO_MAX_DEG`
 * (0,5°) da amostra, e na geometria de referência isso são ~19 px. Todo
 * cruzamento de limiar somava esses 19 px de UMA VEZ, e a histerese só
 * espaçava os pulos — não os eliminava. Pior, o pulo caía nos dois piores
 * instantes possíveis: no começo da sacada (média → cru) e, principalmente, no
 * FIM dela (cru → média), que é exatamente quando a pessoa está pousando no
 * alvo. O mesmo valia para `MIN_AMOSTRAS`: depois de cada sacada a janela
 * recomeçava com uma amostra, e na quarta a média entrava inteira de um quadro
 * para o outro.
 *
 * Agora a saída é `x + w · (média − x)`, com `w` contínuo em [0,1]:
 *
 *   w = enchimento(n) · dispersão(d)
 *
 * `enchimento` sobe de 0 (uma amostra) a 1 (`MIN_AMOSTRAS`); `dispersão` cai de
 * 1 (≤ 1,0°) a 0 (≥ 1,5°). Os dois extremos reproduzem EXATAMENTE o
 * comportamento anterior — `w = 1` é a média de antes, `w = 0` é a amostra crua
 * de antes — e o que some é só o degrau entre eles. Como a saída passou a ser
 * contínua na dispersão, a histerese deixou de ser necessária para o cursor;
 * ela permanece apenas no `estado` REPORTADO, que é diagnóstico e não muda o
 * que se desenha.
 *
 * Sem geometria não há como converter graus em pixels, e aí este estágio se
 * declara inativo e devolve a entrada intacta — nunca um chute.
 */

import { pixelsPorGrau, type GeometriaDeTela } from './angularVelocity';

/** Janela de análise. 200 ms a 30 Hz são ~6 amostras — o mesmo tempo que a
 *  zona morta do EMA adaptativo já usa. */
export const JANELA_MS = 200;

/** Abaixo desta dispersão, é fixação. O 1,0° é o valor clássico do I-DT. */
export const LIMIAR_FIXACAO_DEG = 1.0;

/** Acima desta, sai de fixação. A folga é a histerese. */
export const LIMIAR_SACADA_DEG = 1.5;

/**
 * Mínimo de amostras para declarar fixação.
 *
 * Quatro: com menos, a dispersão de uma janela recém-criada é pequena
 * simplesmente porque ela tem poucos pontos, e toda sacada começaria
 * classificada como fixação.
 *
 * Continua sendo o número que fecha o estado `'fixando'`; o que mudou é que a
 * MÉDIA não espera mais por ele de forma binária: o peso sobe por uma rampa de
 * `1` a `MIN_AMOSTRAS` amostras, em vez de saltar de 0 a 1 na quarta.
 */
export const MIN_AMOSTRAS = 4;

/**
 * Quanto a saída pode se afastar da amostra corrente, em graus.
 *
 * É a guarda mais importante deste módulo, e ela existe por um modo de falha
 * concreto: quatro botões que se encontram num canto. Se o olhar alterna entre
 * dois quadrantes opostos com dispersão abaixo do limiar de fixação, a média
 * cai bem no encontro dos quatro — um lugar onde o olhar cru NUNCA esteve — e,
 * pior, cai lá PARADA, o que faz o dwell concluir. Trocar letra errada é
 * exatamente o dano que este produto não pode causar.
 *
 * Com o teto, a saída nunca fica a mais de meio grau de onde o olho está de
 * fato. Meio grau é bem menor que qualquer alvo desta interface (o mínimo é
 * 5°), então a média continua tirando ruído sem poder inventar posição.
 */
export const DESLOCAMENTO_MAX_DEG = 0.5;

interface Amostra {
  x: number;
  y: number;
  t: number;
}

export type EstadoDoOlho = 'fixando' | 'movendo';

export interface SaidaDoEstabilizador {
  x: number;
  y: number;
  estado: EstadoDoOlho;
  /** Dispersão da janela em graus. `null` sem geometria ou janela curta. */
  dispersaoDeg: number | null;
  /** Amostras na janela que alimentou a média. 1 = a saída é a entrada. */
  amostrasNaMedia: number;
  /**
   * Peso com que a média entrou na saída, em [0,1].
   *
   * É a grandeza exata: `amostrasNaMedia` diz quantas amostras existiam,
   * este diz quanto delas foi usado. `0` = saída idêntica à entrada,
   * `1` = média pura (o comportamento antigo nos dois extremos).
   */
  pesoDaMedia: number;
}

/** Hermite 3t²−2t³: contínua em valor e em derivada nas duas pontas. */
function suavePasso(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Peso da média para uma janela de `n` amostras com dispersão `dispersaoDeg`.
 *
 * Exportada para o teste poder afirmar a continuidade diretamente, sem passar
 * pela geometria nem pelo estado interno.
 */
export function pesoDaMedia(n: number, dispersaoDeg: number | null): number {
  if (!Number.isFinite(n) || n < 2 || dispersaoDeg === null || !Number.isFinite(dispersaoDeg)) {
    return 0;
  }
  const enchimento = suavePasso((n - 1) / Math.max(1, MIN_AMOSTRAS - 1));
  const faixa = LIMIAR_SACADA_DEG - LIMIAR_FIXACAO_DEG;
  const dispersao = 1 - suavePasso((dispersaoDeg - LIMIAR_FIXACAO_DEG) / faixa);
  return enchimento * dispersao;
}

export class EstabilizadorDeFixacao {
  private readonly janela: Amostra[] = [];
  private readonly pxPorGrau: number | null;
  private estado: EstadoDoOlho = 'movendo';

  constructor(geometria: GeometriaDeTela | null | undefined) {
    this.pxPorGrau = geometria ? pixelsPorGrau(geometria) : null;
  }

  /** O estágio tem geometria para trabalhar? */
  get ativo(): boolean {
    return this.pxPorGrau !== null && this.pxPorGrau > 0;
  }

  reset(): void {
    this.janela.length = 0;
    this.estado = 'movendo';
  }

  /** Dispersão I-DT da janela, em pixels. */
  private dispersaoPx(): number {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const a of this.janela) {
      if (a.x < minX) minX = a.x;
      if (a.x > maxX) maxX = a.x;
      if (a.y < minY) minY = a.y;
      if (a.y > maxY) maxY = a.y;
    }
    return (maxX - minX) + (maxY - minY);
  }

  processar(x: number, y: number, nowMs: number): SaidaDoEstabilizador {
    if (!this.ativo || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(nowMs)) {
      return { x, y, estado: 'movendo', dispersaoDeg: null, amostrasNaMedia: 1, pesoDaMedia: 0 };
    }

    this.janela.push({ x, y, t: nowMs });
    // Descarta o que saiu da janela. `<=` e não `<`: uma amostra exatamente no
    // limite é do passado, e mantê-la faria a janela crescer sem teto quando o
    // relógio parasse de avançar.
    while (this.janela.length > 0 && nowMs - this.janela[0].t >= JANELA_MS) {
      this.janela.shift();
    }
    // A amostra corrente pode ter sido descartada junto (relógio para trás, ou
    // uma pausa maior que a janela). Recomeça a janela com ela.
    if (this.janela.length === 0) this.janela.push({ x, y, t: nowMs });

    const px = this.pxPorGrau as number;
    const n = this.janela.length;
    const dispersaoDeg = n >= 2 ? this.dispersaoPx() / px : null;

    // Sacada declarada: a janela vai fora inteira, para a próxima fixação
    // começar limpa. Descartar aqui NÃO produz degrau na saída — a rampa de
    // dispersão já zerou o peso em `LIMIAR_SACADA_DEG`, então a saída deste
    // quadro seria a amostra crua de qualquer forma.
    if (dispersaoDeg !== null && dispersaoDeg > LIMIAR_SACADA_DEG) {
      this.estado = 'movendo';
      this.janela.length = 0;
      this.janela.push({ x, y, t: nowMs });
      return { x, y, estado: 'movendo', dispersaoDeg, amostrasNaMedia: 1, pesoDaMedia: 0 };
    }

    // Estado REPORTADO. Mantém a histerese original (entra em 1,0°, sai em
    // 1,5°) e o mínimo de amostras: é o que a diagnóstica e as gravações leem,
    // e mudar o critério mudaria o significado de série histórica. Ele já não
    // decide o que se desenha — quem decide é o peso abaixo.
    const limiar = this.estado === 'fixando' ? LIMIAR_SACADA_DEG : LIMIAR_FIXACAO_DEG;
    this.estado = n >= MIN_AMOSTRAS && dispersaoDeg !== null && dispersaoDeg <= limiar
      ? 'fixando'
      : 'movendo';

    const w = pesoDaMedia(n, dispersaoDeg);
    if (w <= 0) {
      return { x, y, estado: this.estado, dispersaoDeg, amostrasNaMedia: 1, pesoDaMedia: 0 };
    }

    let sx = 0;
    let sy = 0;
    for (const a of this.janela) {
      sx += a.x;
      sy += a.y;
    }
    // Mistura contínua entre a amostra e a média da janela. Em `w = 1` isto é
    // a média pura; em `w = 0` é a amostra. Nenhum dos dois extremos mudou.
    let mx = x + (sx / n - x) * w;
    let my = y + (sy / n - y) * w;

    // Teto de deslocamento: a média pode limpar ruído, não inventar posição.
    // Aplicado DEPOIS da mistura, sobre o que realmente sai — ver
    // `DESLOCAMENTO_MAX_DEG`.
    const maxPx = DESLOCAMENTO_MAX_DEG * px;
    const dx = mx - x;
    const dy = my - y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxPx) {
      const escala = maxPx / dist;
      mx = x + dx * escala;
      my = y + dy * escala;
    }

    return {
      x: mx,
      y: my,
      estado: this.estado,
      dispersaoDeg,
      amostrasNaMedia: n,
      pesoDaMedia: w,
    };
  }
}

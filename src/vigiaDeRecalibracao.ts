/**
 * Vigia de recalibração — quando os nove pontos são de fato necessários.
 *
 * A deriva de postura tem a referência lenta; a distância tem a correção
 * aditiva; o resíduo tem a correção por dwell; "sentei diferente" tem a
 * reancoragem. Depois de tudo isso, o que ainda justifica pedir uma
 * calibração inteira é o modelo ter deixado de descrever a pessoa: a
 * DISPERSÃO durante a fixação cresceu muito (BCEA) ou o VIÉS que a correção
 * por dwell acumula passou do que ela consegue absorver.
 *
 * As duas medidas são comparadas com as do ÚLTIMO TESTE DE PRECISÃO salvo
 * (`accuracy.ts` grava `accuracyResult`): é a única linha de base que
 * descreve este usuário, neste posto, com este modelo. Sem teste salvo não há
 * com que comparar, e a resposta é "não sei" — nunca "recalibre" por palpite.
 */

import { bcea } from './accuracy';

/** Janela de uma fixação candidata, em ms. */
export const JANELA_DE_FIXACAO_MS = 500;
/** Menos amostras que isto e a BCEA não significa nada. */
export const AMOSTRAS_MINIMAS_DA_FIXACAO = 8;
/** Raio máximo (px) da nuvem para a janela contar como fixação, e não sacada. */
export const RAIO_DE_FIXACAO_PX = 60;
/** Quantas fixações recentes entram na mediana. */
export const FIXACOES_LEMBRADAS = 20;

/** Fator sobre a referência a partir do qual a BCEA recente acusa. */
export const FATOR_BCEA = 3;
/** Piso absoluto da BCEA para acusar: elipse de raio ~30 px, em px². */
export const BCEA_MINIMA_PX2 = Math.PI * 30 * 30;
/** Fator sobre o viés de referência a partir do qual o viés recente acusa. */
export const FATOR_VIES = 2;
/** Piso absoluto do viés para acusar: metade de um alvo de 96 px. */
export const VIES_MINIMO_PX = 48;

/**
 * Teto do limiar relativo de viés, em px.
 *
 * O viés recente é o deslocamento da correção por dwell, limitado a 8 % da
 * tela (`TETO_NORMALIZADO` em `correcaoPorDwell.ts`) — em 1080p isso é ~86 px
 * na vertical. Sem este teto, uma referência de precisão ruim (viés ≥ 43 px,
 * que é o caso comum) produzia um limiar que a medida não pode ultrapassar, e
 * o critério nunca disparava justamente para quem mais precisa.
 */
export const VIES_TETO_ABSOLUTO_PX = 80;

/** A partir desta fração do teto da correção, o viés deixou de ser corrigível. */
export const FRACAO_DO_TETO_MAX = 0.9;

export type MotivoDeRecalibracao = 'bcea' | 'vies' | null;

export interface ReferenciaDePrecisao {
  bceaPx2: number | null;
  viesPx: number | null;
  timestamp: number | null;
}

export interface MedidaRecente {
  /**
   * Fração do TETO da correção por dwell que já está em uso (0…1).
   *
   * É o sinal honesto de "o viés passou do que a correção consegue consertar":
   * o deslocamento por dwell é limitado a 8 % da tela, então comparar o
   * deslocamento em pixels com o viés residual do último teste de precisão
   * nunca dispara para quem calibrou mal (o limiar `2 × referência` fica acima
   * do teto absoluto da correção). A fração não tem esse teto embutido.
   */
  fracaoDoTeto?: number | null;
  bceaPx2: number | null;
  viesPx: number | null;
}

export interface VeredictoDeRecalibracao {
  precisa: boolean;
  motivo: MotivoDeRecalibracao;
}

/**
 * Lê a referência gravada pelo último teste de precisão. `null` quando não há
 * teste salvo ou o registro é anterior aos campos de BCEA/viés.
 */
export function lerReferenciaDePrecisao(
  storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): ReferenciaDePrecisao | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem('accuracyResult');
    if (!raw) return null;
    const r = JSON.parse(raw) as Record<string, unknown>;
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const bx = num(r.biasX);
    const by = num(r.biasY);
    return {
      bceaPx2: num(r.bceaPx2),
      viesPx: bx !== null && by !== null ? Math.hypot(bx, by) : null,
      timestamp: num(r.timestamp),
    };
  } catch {
    return null;
  }
}

/**
 * Compara o recente com a referência. Pura.
 *
 * O viés vem primeiro: dispersão a correção por dwell não conserta, mas viés
 * ela conserta até o teto — e é justamente quando ele passa do teto que a
 * pessoa precisa dos nove pontos.
 */
export function avaliarNecessidadeDeRecalibracao(
  recente: MedidaRecente,
  referencia: ReferenciaDePrecisao | null,
): VeredictoDeRecalibracao {
  if (!referencia) return { precisa: false, motivo: null };

  // Correção por dwell encostada no teto: ela já corrigiu tudo o que podia e
  // o viés continua. Critério independente da referência, e o único que
  // funciona para quem calibrou mal desde o começo — nesse caso o limiar
  // relativo abaixo fica acima do teto da própria correção e jamais dispara.
  const fracao = recente.fracaoDoTeto;
  if (typeof fracao === 'number' && Number.isFinite(fracao) && fracao >= FRACAO_DO_TETO_MAX) {
    return { precisa: true, motivo: 'vies' };
  }

  if (recente.viesPx !== null && referencia.viesPx !== null) {
    const limiar = Math.min(
      // Sem o teto o limiar relativo vira inalcançável: o deslocamento por
      // dwell não passa de 8 % da tela por construção.
      VIES_TETO_ABSOLUTO_PX,
      Math.max(VIES_MINIMO_PX, FATOR_VIES * referencia.viesPx),
    );
    if (recente.viesPx > limiar) return { precisa: true, motivo: 'vies' };
  }
  if (recente.bceaPx2 !== null && referencia.bceaPx2 !== null) {
    const limiar = Math.max(BCEA_MINIMA_PX2, FATOR_BCEA * referencia.bceaPx2);
    if (recente.bceaPx2 > limiar) return { precisa: true, motivo: 'bcea' };
  }
  return { precisa: false, motivo: null };
}

/**
 * Acumula a BCEA das fixações recentes a partir das predições PRÉ-filtro.
 *
 * Pré-filtro porque a BCEA mede o modelo; depois do One Euro e do
 * estabilizador ela mediria o filtro. A fixação é detectada pelo raio da
 * nuvem numa janela de 500 ms — sem alvo conhecido, é o que dá para saber.
 */
export class VigiaDeRecalibracao {
  private xs: number[] = [];
  private ys: number[] = [];
  private ts: number[] = [];
  private bceas: number[] = [];
  private ultimaAvaliacaoMs = -Infinity;

  registrarPredicao(x: number, y: number, tMs: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(tMs)) return;
    this.xs.push(x); this.ys.push(y); this.ts.push(tMs);
    while (this.ts.length > 0 && tMs - this.ts[0] > JANELA_DE_FIXACAO_MS) {
      this.xs.shift(); this.ys.shift(); this.ts.shift();
    }
    // Uma avaliação por janela, não por quadro: a BCEA é O(n) e as janelas
    // consecutivas compartilham quase todas as amostras.
    if (tMs - this.ultimaAvaliacaoMs < JANELA_DE_FIXACAO_MS) return;
    if (this.ts.length < AMOSTRAS_MINIMAS_DA_FIXACAO) return;
    if (tMs - this.ts[0] < JANELA_DE_FIXACAO_MS * 0.8) return;
    this.ultimaAvaliacaoMs = tMs;

    const n = this.xs.length;
    let mx = 0, my = 0;
    for (let i = 0; i < n; i++) { mx += this.xs[i]; my += this.ys[i]; }
    mx /= n; my /= n;
    let raio = 0;
    for (let i = 0; i < n; i++) raio = Math.max(raio, Math.hypot(this.xs[i] - mx, this.ys[i] - my));
    if (raio > RAIO_DE_FIXACAO_PX) return;

    const area = bcea(this.xs, this.ys);
    if (area === null) return;
    this.bceas.push(area);
    if (this.bceas.length > FIXACOES_LEMBRADAS) this.bceas.shift();
  }

  /** Mediana da BCEA das fixações recentes; `null` sem fixação medida. */
  bceaRecentePx2(): number | null {
    if (this.bceas.length === 0) return null;
    const s = [...this.bceas].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  get fixacoesMedidas(): number {
    return this.bceas.length;
  }

  reiniciar(): void {
    this.xs = []; this.ys = []; this.ts = []; this.bceas = [];
    this.ultimaAvaliacaoMs = -Infinity;
  }
}

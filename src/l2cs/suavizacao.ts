/**
 * Suavização temporal dos ângulos do L2CS durante a FIXAÇÃO.
 *
 * A rede devolve um ângulo por inferência (10 Hz em WebGPU, ~6 Hz em WASM) com
 * ruído de ~1–2° entre inferências consecutivas sobre o mesmo olhar. Esse
 * ruído entra em `tan(yaw)`/`tan(pitch)`, atravessa o Ridge e vira jitter no
 * cursor — e o One Euro, ajustado para não atrasar sacada, deixa boa parte
 * passar. Uma EMA curta sobre o ÂNGULO, antes do vetor de features, tira o
 * ruído na origem.
 *
 * O preço de uma EMA é atraso na sacada, e é por isso que ela SOLTA: quando a
 * velocidade angular entre duas inferências passa do limiar, a saída vira a
 * leitura crua e a EMA recomeça dali. Constante de tempo ≤ 150 ms: a uma
 * cadência de 100 ms cada inferência nova pesa ~50 %; a 160 ms, ~65 %.
 *
 * Só processa inferência NOVA (timestamp diferente): o rAF lê o mesmo cache
 * várias vezes entre inferências, e alimentar a EMA com a mesma leitura três
 * vezes só a faria convergir mais rápido para um valor já suavizado.
 */

/** Constante de tempo padrão e teto, em ms. */
export const TAU_PADRAO_MS = 120;
export const TAU_MAX_MS = 150;
/** Acima disto (°/s) é sacada: a EMA solta. */
export const VELOCIDADE_DE_SACADA_DEG_S = 40;

const GRAUS = 180 / Math.PI;

export interface AnguloSuavizado {
  yaw: number;
  pitch: number;
  /** A EMA soltou neste passo (sacada) — saída crua. */
  soltou: boolean;
}

export class SuavizadorDeAngulos {
  private readonly tauMs: number;
  private readonly limiar: number;
  private estado: { yaw: number; pitch: number; timestamp: number } | null = null;
  private ultimoCru: { yaw: number; pitch: number; timestamp: number } | null = null;

  constructor(opts: { constanteDeTempoMs?: number; velocidadeDeSacadaDegS?: number } = {}) {
    const tau = opts.constanteDeTempoMs ?? TAU_PADRAO_MS;
    this.tauMs = Number.isFinite(tau) && tau > 0 ? Math.min(TAU_MAX_MS, tau) : TAU_PADRAO_MS;
    this.limiar = opts.velocidadeDeSacadaDegS ?? VELOCIDADE_DE_SACADA_DEG_S;
  }

  /**
   * `timestamp` é o instante da CAPTURA da inferência (o que o cliente carimba).
   * Uma leitura com o mesmo timestamp da anterior devolve o estado corrente.
   */
  processar(yaw: number, pitch: number, timestamp: number): AnguloSuavizado {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || !Number.isFinite(timestamp)) {
      return { yaw, pitch, soltou: false };
    }
    if (this.estado !== null && this.ultimoCru !== null && timestamp === this.ultimoCru.timestamp) {
      return { yaw: this.estado.yaw, pitch: this.estado.pitch, soltou: false };
    }
    const anterior = this.ultimoCru;
    this.ultimoCru = { yaw, pitch, timestamp };

    if (this.estado === null || anterior === null) {
      this.estado = { yaw, pitch, timestamp };
      return { yaw, pitch, soltou: false };
    }

    const dtMs = timestamp - anterior.timestamp;
    if (!(dtMs > 0)) {
      this.estado = { yaw, pitch, timestamp };
      return { yaw, pitch, soltou: false };
    }
    const velDegS = Math.hypot(yaw - anterior.yaw, pitch - anterior.pitch) * GRAUS / (dtMs / 1000);
    if (velDegS > this.limiar) {
      // Sacada: a EMA solta e recomeça na leitura crua.
      this.estado = { yaw, pitch, timestamp };
      return { yaw, pitch, soltou: true };
    }
    const alfa = 1 - Math.exp(-dtMs / this.tauMs);
    this.estado = {
      yaw: this.estado.yaw + alfa * (yaw - this.estado.yaw),
      pitch: this.estado.pitch + alfa * (pitch - this.estado.pitch),
      timestamp,
    };
    return { yaw: this.estado.yaw, pitch: this.estado.pitch, soltou: false };
  }

  reiniciar(): void {
    this.estado = null;
    this.ultimoCru = null;
  }
}

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
 * O preço de uma EMA é atraso na sacada, e é por isso que ela SOLTA: conforme a
 * velocidade angular sobe, a saída se aproxima da leitura crua. Constante de
 * tempo ≤ 150 ms: a uma cadência de 100 ms cada inferência nova pesa ~50 %; a
 * 160 ms, ~65 %.
 *
 * A SOLTURA É CONTÍNUA, e essa é a correção de um bug medido. A versão anterior
 * tinha um limiar único em 40 °/s: abaixo dele a saída era a EMA, acima era a
 * leitura crua, sem nada no meio e sem histerese. Como a EMA fica ~44 % atrás do
 * cru numa cadência de 100 ms, cada cruzamento do limiar jogava esse atraso na
 * saída de uma vez — e 40 °/s em 100 ms é 4°, que a 38,5 px/grau vale ~154 px de
 * tela. Um movimento oscilando em torno do limiar alternava suavizado↔cru a
 * 10 Hz, injetando degraus de ~68 px no termo de 1ª ordem do vetor de features,
 * ANTES do Ridge e de qualquer filtro. Nas gravações isso aparecia como o cursor
 * "parando e teleportando": 11,8 % dos quadros com salto > 30 px, contra 0,9 %
 * numa build anterior, com a MESMA taxa de atualização.
 *
 * Agora a soltura é uma rampa suave (smoothstep) sobre a `faixaDeSoltura`:
 * em fixação o peso é o da EMA; na sacada plena a saída é exatamente a leitura
 * crua (idêntico ao comportamento antigo nos extremos); e no meio o peso varia
 * de forma contínua, sem degrau. Os dois extremos foram preservados de propósito
 * para não trocar o compromisso ruído↔atraso que já tinha sido ajustado.
 *
 * Só processa inferência NOVA (timestamp diferente): o rAF lê o mesmo cache
 * várias vezes entre inferências, e alimentar a EMA com a mesma leitura três
 * vezes só a faria convergir mais rápido para um valor já suavizado.
 */

import { EXPERIMENT } from '../config/experiment';

/** Constante de tempo padrão e teto, em ms. */
export const TAU_PADRAO_MS = 120;
export const TAU_MAX_MS = 150;
/**
 * Ponto MÉDIO da faixa de soltura, em °/s.
 *
 * É o limiar único da versão anterior, mantido de propósito: a mudança foi
 * remover o degrau, não mover o compromisso.
 */
export const VELOCIDADE_DE_SACADA_DEG_S = 40;

/**
 * Meia-largura da faixa, como FRAÇÃO do ponto médio.
 *
 * A faixa é `meio ± meio·FRACAO`: com o padrão, 20 °/s a 60 °/s. Abaixo do
 * início a saída é a EMA pura; acima do fim é a leitura crua; entre os dois,
 * uma rampa suave (Hermite).
 *
 * É uma FRAÇÃO, e não um par de constantes absolutas, porque o ponto médio é
 * configurável (`velocidadeDeSacadaDegS`) e a faixa tem que acompanhá-lo. A
 * versão anterior deste bloco exportava `..._INICIO = 20` e `..._PLENA = 60`
 * como se fossem a faixa em vigor; nenhuma das duas era lida pelo código, que
 * derivava a faixa do meio, e as duas só coincidiam com a verdade enquanto
 * ninguém passasse outro ponto médio. Documentação que se descola do código
 * na primeira configuração é pior que nenhuma.
 */
export const FRACAO_DA_FAIXA_DE_SOLTURA = 0.5;

/** Início e fim da faixa para um dado ponto médio. Exportada para o teste
 *  afirmar os extremos sem reimplementar a conta. */
export function faixaDeSoltura(meioDegS: number = VELOCIDADE_DE_SACADA_DEG_S): {
  inicio: number;
  plena: number;
} {
  const meio = Number.isFinite(meioDegS) && meioDegS > 0 ? meioDegS : VELOCIDADE_DE_SACADA_DEG_S;
  const metade = meio * FRACAO_DA_FAIXA_DE_SOLTURA;
  return { inicio: Math.max(0, meio - metade), plena: meio + metade };
}

const GRAUS = 180 / Math.PI;

/**
 * M29 (`EXPERIMENT.rampaDoL2cs`): limites da rampa entre inferências. Ela dura
 * o intervalo mediano entre as capturas das últimas inferências (~100 ms em
 * WebGPU, ~160 ms em WASM), para chegar ao valor novo quando a inferência
 * seguinte deve chegar.
 */
export const RAMPA_MINIMA_DO_L2CS_MS = 60;
export const RAMPA_MAXIMA_DO_L2CS_MS = 200;
/** M29: um intervalo entre capturas acima deste múltiplo da mediana é lacuna: sem rampa. */
export const FATOR_DA_LACUNA = 2;

interface RampaDoAngulo {
  deYaw: number; dePitch: number;
  paraYaw: number; paraPitch: number;
  inicioMs: number;
  duracaoMs: number;
}

function naRampa(r: RampaDoAngulo, agoraMs: number): { yaw: number; pitch: number } {
  if (r.duracaoMs <= 0 || agoraMs >= r.inicioMs + r.duracaoMs) return { yaw: r.paraYaw, pitch: r.paraPitch };
  const u = Math.max(0, (agoraMs - r.inicioMs) / r.duracaoMs);
  return { yaw: r.deYaw + (r.paraYaw - r.deYaw) * u, pitch: r.dePitch + (r.paraPitch - r.dePitch) * u };
}

/** Hermite 3t²−2t³ em [0,1]: contínua em valor E em derivada nas duas pontas. */
function suavePasso(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

export interface AnguloSuavizado {
  yaw: number;
  pitch: number;
  /**
   * A EMA soltou POR COMPLETO neste passo (sacada plena): a saída é a leitura
   * crua. Entre `INICIO` e `PLENA` isto é `false` mesmo havendo soltura
   * parcial — quem quiser a fração contínua deve ler `fracaoDeSoltura`.
   */
  soltou: boolean;
  /** 0 = EMA pura (fixação) · 1 = leitura crua (sacada plena). */
  fracaoDeSoltura: number;
}

export class SuavizadorDeAngulos {
  private readonly tauMs: number;
  private readonly vInicio: number;
  private readonly vPlena: number;
  private estado: { yaw: number; pitch: number; timestamp: number } | null = null;
  private ultimoCru: { yaw: number; pitch: number; timestamp: number } | null = null;
  /** M29: a rampa em curso até a última inferência. */
  private rampa: RampaDoAngulo | null = null;
  /** M29: intervalos entre as capturas das últimas inferências. */
  private intervalos: number[] = [];

  constructor(
    opts: {
      constanteDeTempoMs?: number;
      /** Ponto MÉDIO da rampa. A faixa é construída simétrica em torno dele. */
      velocidadeDeSacadaDegS?: number;
    } = {},
  ) {
    const tau = opts.constanteDeTempoMs ?? TAU_PADRAO_MS;
    this.tauMs = Number.isFinite(tau) && tau > 0 ? Math.min(TAU_MAX_MS, tau) : TAU_PADRAO_MS;
    const faixa = faixaDeSoltura(opts.velocidadeDeSacadaDegS ?? VELOCIDADE_DE_SACADA_DEG_S);
    this.vInicio = faixa.inicio;
    this.vPlena = faixa.plena;
  }

  /**
   * `timestamp` é o instante da CAPTURA da inferência (o que o cliente carimba).
   * Uma leitura com o mesmo timestamp da anterior devolve o estado corrente.
   */
  processar(yaw: number, pitch: number, timestamp: number, agoraMs?: number): AnguloSuavizado {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || !Number.isFinite(timestamp)) {
      return { yaw, pitch, soltou: false, fracaoDeSoltura: 0 };
    }
    const comRampa = agoraMs !== undefined && Number.isFinite(agoraMs);
    if (this.estado !== null && this.ultimoCru !== null && timestamp === this.ultimoCru.timestamp) {
      // M29: entre inferências, a saída anda pela rampa até a última.
      if (comRampa && this.rampa) return { ...naRampa(this.rampa, agoraMs!), soltou: false, fracaoDeSoltura: 0 };
      return {
        yaw: this.estado.yaw,
        pitch: this.estado.pitch,
        soltou: false,
        fracaoDeSoltura: 0,
      };
    }
    const intervalo = this.intervaloMediano();
    const lacuna = this.ultimoCru !== null && timestamp - this.ultimoCru.timestamp > FATOR_DA_LACUNA * intervalo;
    const r = this.processarInferenciaNova(yaw, pitch, timestamp);
    if (!comRampa) {
      this.rampa = null;
      return r;
    }
    // M29: parte de onde a saída está agora e chega ao valor novo quando a
    // inferência seguinte deve chegar. Na sacada (soltura plena) não há rampa;
    // depois de uma lacuna (rosto perdido, inferência atrasada) também não: a
    // rampa partiria de um ângulo velho, e a EMA já sai quase crua com dt grande.
    const de = this.rampa ? naRampa(this.rampa, agoraMs!) : { yaw: r.yaw, pitch: r.pitch };
    const duracao = lacuna
      ? 0
      : Math.max(RAMPA_MINIMA_DO_L2CS_MS, Math.min(RAMPA_MAXIMA_DO_L2CS_MS, intervalo)) * (1 - r.fracaoDeSoltura);
    this.rampa = { deYaw: de.yaw, dePitch: de.pitch, paraYaw: r.yaw, paraPitch: r.pitch, inicioMs: agoraMs!, duracaoMs: duracao };
    return { ...naRampa(this.rampa, agoraMs!), soltou: r.soltou, fracaoDeSoltura: r.fracaoDeSoltura };
  }

  /** A EMA com soltura de sempre, para uma inferência nova. */
  private processarInferenciaNova(yaw: number, pitch: number, timestamp: number): AnguloSuavizado {
    const anterior = this.ultimoCru;
    this.ultimoCru = { yaw, pitch, timestamp };

    if (this.estado === null || anterior === null) {
      this.estado = { yaw, pitch, timestamp };
      return { yaw, pitch, soltou: false, fracaoDeSoltura: 1 };
    }

    const dtMs = timestamp - anterior.timestamp;
    // Uma lacuna não entra na mediana do intervalo (M29): só o ritmo de sempre.
    if (dtMs > 0 && !(this.intervalos.length >= 3 && dtMs > FATOR_DA_LACUNA * this.intervaloMediano())) {
      this.intervalos.push(dtMs);
      if (this.intervalos.length > 5) this.intervalos.shift();
    }
    if (!(dtMs > 0)) {
      this.estado = { yaw, pitch, timestamp };
      return { yaw, pitch, soltou: false, fracaoDeSoltura: 1 };
    }
    const velDegS = (Math.hypot(yaw - anterior.yaw, pitch - anterior.pitch) * GRAUS) / (dtMs / 1000);

    // Rampa contínua entre EMA pura e leitura crua. `g` interpola o PESO, não a
    // saída: assim `g=0` reproduz exatamente a EMA antiga e `g=1` reproduz
    // exatamente a soltura antiga, sem nada descontínuo entre os dois.
    const g = suavePasso((velDegS - this.vInicio) / Math.max(1e-9, this.vPlena - this.vInicio));
    const alfaEma = 1 - Math.exp(-dtMs / this.tauMs);
    const alfa = alfaEma + (1 - alfaEma) * g;

    this.estado = {
      yaw: this.estado.yaw + alfa * (yaw - this.estado.yaw),
      pitch: this.estado.pitch + alfa * (pitch - this.estado.pitch),
      timestamp,
    };
    return {
      yaw: this.estado.yaw,
      pitch: this.estado.pitch,
      soltou: g >= 1,
      fracaoDeSoltura: g,
    };
  }

  /** M29: o intervalo mediano entre as capturas das últimas inferências (100 ms sem histórico). */
  private intervaloMediano(): number {
    const o = [...this.intervalos].sort((a, b) => a - b);
    return o.length > 0 ? o[o.length >> 1] : 100;
  }

  reiniciar(): void {
    this.estado = null;
    this.ultimoCru = null;
    this.rampa = null;
    this.intervalos = [];
  }
}

/**
 * O ângulo do L2CS que o engine põe nas features. Com o M29
 * (`EXPERIMENT.rampaDoL2cs`) vai o relógio do quadro e a saída anda em rampa
 * entre inferências; sem ele, muda de uma vez na inferência, como antes.
 */
export function anguloDoL2csNoQuadro(
  s: SuavizadorDeAngulos,
  yaw: number,
  pitch: number,
  capturaMs: number,
  quadroMs: number,
): AnguloSuavizado {
  return s.processar(yaw, pitch, capturaMs, EXPERIMENT.rampaDoL2cs ? quadroMs : undefined);
}

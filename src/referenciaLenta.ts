/**
 * Referência geométrica LENTA — os dois relógios da compensação de pose.
 *
 * `poseCompensation` e `translationCompensation` medem um Δ entre o quadro
 * corrente e uma REFERÊNCIA. Até aqui a referência era a média da calibração,
 * congelada: correta no minuto em que o modelo foi treinado e cada vez menos
 * depois, porque a postura de quem passa horas na cadeira migra — o pescoço
 * cede, o tronco escorrega, a cabeça encosta no apoio. Em ELA isso é a regra.
 * Esse desvio lento é da pessoa, não do olhar; compensá-lo como se fosse uma
 * virada de cabeça produz um deslocamento constante que a pessoa passa a
 * combater com os olhos.
 *
 * A saída é ter dois relógios:
 *
 *   - o RÁPIDO é o quadro: uma virada de cabeça em 200 ms entra inteira no Δ,
 *     porque a referência não teve tempo de se mexer;
 *   - o LENTO é esta EMA, com constante de tempo de dezenas de segundos: a
 *     postura que migra ao longo de meia hora é absorvida e o Δ volta a zero.
 *
 * ── Por que 30 s, e por que NUNCA 1–2 s ────────────────────────────────────
 *
 * Uma janela de 1–2 s engoliria o próprio olhar: a pessoa vira a cabeça para
 * um botão da borda, a referência acompanha em dois segundos e a compensação
 * some com a pessoa ainda olhando para lá. O construtor aceita 20–45 s e
 * corrige para dentro dessa faixa qualquer outro valor.
 *
 * ── Quando a referência NÃO anda ────────────────────────────────────────────
 *
 *   (b) quadro inválido — sem rosto, piscando, L2CS implausível, contraluz —
 *       não entra: o que ele mede não é postura;
 *   (c) rosto perdido congela; ao voltar, o primeiro quadro só reancora o
 *       relógio, e o `dt` do passo seguinte é limitado, então não há salto;
 *   (d) movimento RÁPIDO (velocidade angular ou de translação acima do
 *       limiar) congela: durante a virada a referência fica onde estava, e é
 *       isso que faz o Δ entrar inteiro. Sem esta guarda a EMA absorveria
 *       ~0,3 % da virada por quadro — pouco, mas no sentido errado.
 *   (e) RESÍDUO GRANDE congela — ver abaixo.
 *
 * ── (e) Por que o limiar de velocidade não basta ───────────────────────────
 *
 * A guarda (d) só vale DURANTE a virada. Depois que a cabeça para na pose
 * desviada, a velocidade volta a zero e a EMA recomeça a perseguir: virar 10°
 * e SEGURAR por 30 s faz a referência comer ~63 % da virada, a compensação
 * `d·tan Δ` encolher junto e o cursor escorregar centenas de pixels enquanto a
 * pessoa ainda está olhando para lá. Pior: ao voltar a cabeça, a referência
 * está 6° fora e a compensação passa a puxar para o lado ERRADO, decaindo em
 * mais 30 s.
 *
 * A separação honesta não é "rápido × devagar", é o TAMANHO do resíduo:
 *
 *   - o que a EMA existe para absorver é deriva do ESTIMADOR e da postura,
 *     contínua e lenta; enquanto ela acompanha, o resíduo fica no atraso de
 *     regime (taxa × τ): 5° em 30 min dá 0,08°, um escorregão de 10° em 1 min
 *     dá 5°;
 *   - uma virada deliberada põe o resíduo em 10–25° e o deixa lá.
 *
 * Por isso acima de `RESIDUO_MAX_DEG` (ou `RESIDUO_MAX_CM` na translação) a EMA
 * para. A guarda se desfaz sozinha quando a cabeça volta — o resíduo cai e o
 * relógio lento volta a andar. Não há válvula por tempo: se a pessoa de fato
 * SENTOU diferente e a nova pose veio para ficar, quem resolve isso é a
 * reancoragem (`reancoragem.ts`, alvo único de 2 s), que move referência e
 * distância de uma vez e com a pessoa olhando para um ponto conhecido — não
 * uma EMA adivinhando sozinha, que é justamente o que come o olhar.
 *
 * Três detalhes que a versão ingênua desta guarda erra:
 *
 *   • POR EIXO. O argumento de julgar pose e centro juntos é de (d): a virada
 *     mexe nos dois ao mesmo tempo, e congelar só um deixaria o outro comer
 *     metade do gesto. Esse argumento NÃO vale aqui — um escorregão lateral
 *     sustentado não diz nada sobre o desvio de pose. Julgados juntos, um
 *     escorregão de 3 cm na cadeira desligaria também o relógio da pose, cujo
 *     resíduo é zero, pelo resto da sessão.
 *
 *   • EM CENTÍMETROS, não em fração do quadro. `x` é normalizado pela largura
 *     e `y` pela altura: em 16:9 o mesmo 0,04 vale 2,8 cm na horizontal e
 *     1,6 cm na vertical. Um limiar assim dispara no eixo em que o tronco
 *     escorrega com metade do deslocamento do outro. O resíduo de translação
 *     é medido com a MESMA conta da compensação (`deslocamentoCm`), em cm.
 *
 *   • COM HISTERESE. Sem ela o jitter de ~0,3°/quadro do MediaPipe vira
 *     catraca: numa virada mantida a 8,3°, os poucos quadros que medem abaixo
 *     de 8° dão um passo cada, cada passo encurta o resíduo, e em alguns
 *     segundos a virada inteira acaba absorvida — de novo. Uma vez congelado,
 *     só descongela abaixo de `FATOR_DE_HISTERESE` do limiar.
 */

import type { Pose } from './poseCompensation';
import { deslocamentoCm, type CentroFacial, type EscalaFacial } from './translationCompensation';

/** Constante de tempo padrão e faixa aceita, em segundos. */
export const TAU_PADRAO_S = 30;
export const TAU_MIN_S = 20;
export const TAU_MAX_S = 45;

/** Acima disto a cabeça está VIRANDO, não migrando. 20°/s é bem abaixo de
 *  qualquer virada deliberada (dezenas a centenas de °/s), bem acima da
 *  deriva postural (frações de grau por segundo) e acima do jitter da matriz
 *  facial do MediaPipe a 30 Hz (~0,3° por quadro ≈ 10°/s). */
export const VELOCIDADE_ANGULAR_MAX_DEG_S = 20;
/** Idem para a translação, em fração do quadro de vídeo por segundo. Um
 *  escorregão na cadeira move o nariz ~5 % do quadro em meio segundo. */
export const VELOCIDADE_TRANSLACAO_MAX_POR_S = 0.05;

/**
 * Maior `dt` que um passo da EMA pode usar, em ms. Depois de uma perda de
 * rosto de 10 s, o primeiro passo com `dt` real moveria a referência em 28 %
 * de uma vez — o salto que (c) proíbe. Limitado a 100 ms, o passo vale no
 * máximo 0,3 %.
 */
export const DT_MAX_MS = 100;

/**
 * Resíduo (|pose atual − referência lenta|) acima do qual a EMA para, em graus.
 *
 * Fica acima do atraso de regime da deriva mais rápida que ainda é postura —
 * um escorregão de 10° em 1 min vale 0,17°/s × 30 s = 5° — e abaixo de
 * qualquer virada deliberada, que começa na casa dos 10°.
 */
export const RESIDUO_MAX_DEG = 8;

/**
 * Idem para a translação, em CENTÍMETROS de deslocamento real do rosto.
 *
 * Mesma derivação: o escorregão declarado em `VELOCIDADE_TRANSLACAO_MAX_POR_S`
 * é de ~5 % do quadro em meio segundo — em 1080p com iod ≈ 250 px, uns 3,5 cm.
 * Acontecendo devagar o bastante para (d) deixar passar (3,5 cm em 1 min =
 * 0,058 cm/s), o atraso de regime é 0,058 × 30 = 1,8 cm. O limiar fica com
 * folga sobre isso e bem abaixo de uma inclinação deliberada do tronco, que
 * passa de 10 cm.
 */
export const RESIDUO_MAX_CM = 5;

/**
 * Fração do limiar abaixo da qual a EMA volta a andar. Sem esta histerese, o
 * jitter do estimador em torno do limiar reduz o resíduo a passinhos até ele
 * cair sozinho — a catraca descrita no cabeçalho.
 */
export const FATOR_DE_HISTERESE = 0.75;

export interface AmostraGeometrica {
  pose: Pose | null;
  centro: CentroFacial | null;
  /**
   * Escala facial do quadro, para medir o resíduo de translação em cm com a
   * MESMA conta da compensação. Ausente, o eixo de translação nunca congela
   * por (e) — não se congela por um número que não se sabe converter.
   */
  escala?: EscalaFacial | null;
}

export interface OpcoesDaReferenciaLenta {
  constanteDeTempoS?: number;
  velocidadeAngularMaxDegS?: number;
  velocidadeTranslacaoMaxPorS?: number;
  residuoMaxDeg?: number;
  residuoMaxCm?: number;
}

export type MotivoDeCongelamento =
  | 'invalido'
  | 'movimento_rapido'
  | 'residuo_grande'
  | 'retomada'
  | null;

const GRAUS = 180 / Math.PI;

function poseFinita(p: Pose | null): p is Pose {
  return !!p && Number.isFinite(p.yaw) && Number.isFinite(p.pitch) && Number.isFinite(p.roll);
}

function centroFinito(c: CentroFacial | null): c is CentroFacial {
  return !!c && Number.isFinite(c.x) && Number.isFinite(c.y);
}

/** Constante de tempo dentro da faixa aceita. */
export function constanteDeTempoValida(tauS: number | undefined): number {
  if (tauS === undefined || !Number.isFinite(tauS)) return TAU_PADRAO_S;
  return Math.min(TAU_MAX_S, Math.max(TAU_MIN_S, tauS));
}

export class ReferenciaLenta {
  private readonly tauMs: number;
  private readonly velAngMax: number;
  private readonly velTransMax: number;
  private readonly residuoMaxDeg: number;
  private readonly residuoMaxCm: number;

  private refPose: Pose | null = null;
  private refCentro: CentroFacial | null = null;
  /** Última amostra válida vista, para medir velocidade. */
  private anterior: { pose: Pose | null; centro: CentroFacial | null; tMs: number } | null = null;
  private ultimoMotivo: MotivoDeCongelamento = null;
  private passos = 0;
  /** Resíduo do último quadro válido: o que o Δ instantâneo vale agora. */
  private residuoDeg = 0;
  private residuoEmCm = 0;
  /** Congelamento por (e), POR EIXO — pegajoso, com histerese. */
  private congelaPose = false;
  private congelaCentro = false;
  /** Instante em que o congelamento por (e) começou; `null` fora dele. */
  private congeladoDesdeMs: number | null = null;
  private msNoResiduo = 0;

  constructor(opts: OpcoesDaReferenciaLenta = {}) {
    this.tauMs = constanteDeTempoValida(opts.constanteDeTempoS) * 1000;
    this.velAngMax = opts.velocidadeAngularMaxDegS ?? VELOCIDADE_ANGULAR_MAX_DEG_S;
    this.velTransMax = opts.velocidadeTranslacaoMaxPorS ?? VELOCIDADE_TRANSLACAO_MAX_POR_S;
    this.residuoMaxDeg = opts.residuoMaxDeg ?? RESIDUO_MAX_DEG;
    this.residuoMaxCm = opts.residuoMaxCm ?? RESIDUO_MAX_CM;
  }

  /** (a) Nasce na referência da calibração. `null` num eixo desliga aquele eixo. */
  iniciar(ref: AmostraGeometrica): void {
    this.refPose = poseFinita(ref.pose) ? { ...ref.pose } : null;
    this.refCentro = centroFinito(ref.centro) ? { ...ref.centro } : null;
    this.anterior = null;
    this.ultimoMotivo = null;
    this.passos = 0;
    this.zerarResiduo();
  }

  limpar(): void {
    this.refPose = null;
    this.refCentro = null;
    this.anterior = null;
    this.ultimoMotivo = null;
    this.passos = 0;
    this.zerarResiduo();
  }

  private zerarResiduo(): void {
    this.residuoDeg = 0;
    this.residuoEmCm = 0;
    this.congelaPose = false;
    this.congelaCentro = false;
    this.congeladoDesdeMs = null;
    this.msNoResiduo = 0;
  }

  get iniciada(): boolean {
    return this.refPose !== null || this.refCentro !== null;
  }

  /** Por que o último `atualizar` não moveu a referência; `null` = moveu. */
  get motivoDoCongelamento(): MotivoDeCongelamento {
    return this.ultimoMotivo;
  }

  /** Quantos passos da EMA já andaram — diagnóstico e teste. */
  get passosDados(): number {
    return this.passos;
  }

  /**
   * Resíduo do último quadro válido: |pose atual − referência lenta|, em graus.
   * É o tamanho do Δ que a compensação está aplicando neste instante.
   */
  get residuoPoseDeg(): number {
    return this.residuoDeg;
  }

  /** Deslocamento do rosto em relação à referência, em cm. Zero sem escala. */
  get residuoCentroCm(): number {
    return this.residuoEmCm;
  }

  /** Qual eixo está parado por (e). */
  get congeladoPorResiduo(): { pose: boolean; centro: boolean } {
    return { pose: this.congelaPose, centro: this.congelaCentro };
  }

  /**
   * Há quanto tempo (ms) algum eixo está parado por (e), em tempo de RELÓGIO —
   * conta também os quadros inválidos e os de movimento rápido, porque a
   * pergunta é "há quanto tempo esta pessoa está fora da referência", não
   * "quantos quadros bons houve". Sustentado por minutos, é o sinal de que a
   * postura mudou de vez e a saída é a reancoragem.
   */
  get msCongeladoPorResiduo(): number {
    return this.msNoResiduo;
  }

  get pose(): Pose | null {
    return this.refPose;
  }

  get centro(): CentroFacial | null {
    return this.refCentro;
  }

  /**
   * Um quadro. `valido` é o veredito de quem chama (rosto presente, sem
   * piscada, L2CS plausível, sem contraluz forte); quadro inválido congela.
   */
  atualizar(amostra: AmostraGeometrica, tMs: number, valido: boolean): void {
    if (!this.iniciada || !Number.isFinite(tMs)) return;
    const pose = poseFinita(amostra.pose) ? amostra.pose : null;
    const centro = centroFinito(amostra.centro) ? amostra.centro : null;

    if (!valido || (pose === null && centro === null)) {
      // (c) rosto perdido / quadro inválido: congela e esquece o quadro
      // anterior — a velocidade não pode ser medida atravessando um buraco.
      // O relógio de (e) continua correndo: um minuto de rosto perdido com a
      // cabeça na mesma pose desviada é um minuto fora da referência.
      this.anterior = null;
      this.ultimoMotivo = 'invalido';
      this.marcarRelogio(tMs);
      return;
    }

    // Resíduo e congelamento são propriedade do QUADRO, não do passo: valem
    // igual em retomada e em movimento rápido, que retornam antes da EMA.
    this.medirResiduo(pose, centro, amostra.escala ?? null);
    this.atualizarCongelamento(tMs);

    const ant = this.anterior;
    this.anterior = { pose, centro, tMs };
    if (ant === null) {
      // Primeiro quadro válido depois de um buraco: só reancora o relógio.
      this.ultimoMotivo = 'retomada';
      return;
    }

    const dtMs = tMs - ant.tMs;
    if (!(dtMs > 0)) {
      this.ultimoMotivo = 'retomada';
      return;
    }

    // (d) movimento rápido congela. Os dois eixos são julgados juntos: uma
    // virada de cabeça mexe pose E centro, e congelar só um deixaria o outro
    // absorver metade do gesto.
    if (this.movimentoRapido(ant, pose, centro, dtMs)) {
      this.ultimoMotivo = 'movimento_rapido';
      return;
    }

    const alfa = 1 - Math.exp(-Math.min(DT_MAX_MS, dtMs) / this.tauMs);
    // (e) é POR EIXO: o eixo congelado fica, o outro segue andando. O motivo
    // reportado é o do eixo BLOQUEADO — saber que o relógio da pose está
    // parado importa mesmo quando o da translação continua andando.
    let bloqueado = false;
    let andou = false;
    if (this.refPose && pose) {
      if (this.congelaPose) bloqueado = true;
      else {
        this.refPose = {
          yaw: this.refPose.yaw + alfa * (pose.yaw - this.refPose.yaw),
          pitch: this.refPose.pitch + alfa * (pose.pitch - this.refPose.pitch),
          roll: this.refPose.roll + alfa * (pose.roll - this.refPose.roll),
        };
        andou = true;
      }
    }
    if (this.refCentro && centro) {
      if (this.congelaCentro) bloqueado = true;
      else {
        this.refCentro = {
          x: this.refCentro.x + alfa * (centro.x - this.refCentro.x),
          y: this.refCentro.y + alfa * (centro.y - this.refCentro.y),
        };
        andou = true;
      }
    }
    if (andou) this.passos++;
    this.ultimoMotivo = bloqueado ? 'residuo_grande' : null;
  }

  /**
   * Guarda o resíduo do quadro corrente contra a referência atual: a pose em
   * graus, a translação em CENTÍMETROS pela mesma conta da compensação.
   */
  private medirResiduo(
    pose: Pose | null,
    centro: CentroFacial | null,
    escala: EscalaFacial | null,
  ): void {
    this.residuoDeg =
      this.refPose && pose
        ? Math.hypot(pose.yaw - this.refPose.yaw, pose.pitch - this.refPose.pitch) * GRAUS
        : 0;
    // Sem escala, `deslocamentoCm` devolve (0,0) — e o eixo simplesmente não
    // congela, que é o comportamento honesto: não se congela por um número
    // que não se sabe converter.
    const d = deslocamentoCm(centro, this.refCentro, escala);
    this.residuoEmCm = Math.hypot(d.x, d.y);
  }

  /**
   * Decide o congelamento de cada eixo com histerese e mantém o relógio.
   * Pegajoso: uma vez congelado, só solta abaixo de `FATOR_DE_HISTERESE` do
   * limiar — sem isso o jitter do estimador vira catraca (ver cabeçalho).
   */
  private atualizarCongelamento(tMs: number): void {
    const limitePose = this.congelaPose
      ? this.residuoMaxDeg * FATOR_DE_HISTERESE
      : this.residuoMaxDeg;
    const limiteCentro = this.congelaCentro
      ? this.residuoMaxCm * FATOR_DE_HISTERESE
      : this.residuoMaxCm;
    this.congelaPose = this.residuoDeg > limitePose;
    this.congelaCentro = this.residuoEmCm > limiteCentro;
    this.marcarRelogio(tMs);
  }

  /** Relógio de parede do congelamento por (e). */
  private marcarRelogio(tMs: number): void {
    if (!this.congelaPose && !this.congelaCentro) {
      this.congeladoDesdeMs = null;
      this.msNoResiduo = 0;
      return;
    }
    if (this.congeladoDesdeMs === null || tMs < this.congeladoDesdeMs) {
      this.congeladoDesdeMs = tMs;
    }
    this.msNoResiduo = tMs - this.congeladoDesdeMs;
  }

  private movimentoRapido(
    ant: { pose: Pose | null; centro: CentroFacial | null },
    pose: Pose | null,
    centro: CentroFacial | null,
    dtMs: number,
  ): boolean {
    const dtS = dtMs / 1000;
    if (ant.pose && pose) {
      const velDegS = Math.hypot(pose.yaw - ant.pose.yaw, pose.pitch - ant.pose.pitch) * GRAUS / dtS;
      if (velDegS > this.velAngMax) return true;
    }
    if (ant.centro && centro) {
      const velPorS = Math.hypot(centro.x - ant.centro.x, centro.y - ant.centro.y) / dtS;
      if (velPorS > this.velTransMax) return true;
    }
    return false;
  }
}

/** Δ de pose entre o quadro e a referência lenta, em radianos por eixo. */
export function deltaDePose(atual: Pose | null, referencia: Pose | null): { yaw: number; pitch: number } {
  if (!poseFinita(atual) || !poseFinita(referencia)) return { yaw: 0, pitch: 0 };
  return { yaw: atual.yaw - referencia.yaw, pitch: atual.pitch - referencia.pitch };
}

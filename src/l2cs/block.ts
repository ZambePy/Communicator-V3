// Bloco de features L2CS (ver docs/L2CS-NET.md).
//
// 7 termos derivados de (yaw, pitch, dProxy) que entram como features
// adicionais no vetor por olho antes do Ridge.
//
// Por que a tangente antes do polinômio:
//   x_tela ≈ x_olho + d · tan(yaw)         (geometria de projeção)
//   tan(x) = x + x³/3 + 2x⁵/15 + …          (Taylor — expansão ímpar)
// Um PolynomialFeatures(degree=2) sobre o ângulo gera x², que não aparece
// nessa expansão. Aplicando tan primeiro, o termo de 1ª ordem já é exato e
// o grau 2 captura resíduo (tela plana, câmera não centrada).
//
// CLAMP obrigatório em ±π/4. tan() explode perto de ±π/2; um único frame
// de pose extrema envenena o StandardScaler.fit em cascata — média/desvio
// vão a infinito e o regressor inteiro degenera. Mesmo padrão do comentário
// anti-NaN de asin() no extractor.ts.

export const L2CS_BLOCK_DIM = 7;

// ±45°. Escolhido conservador: usos normais de gaze ficam bem dentro disto;
// valores fora são artefatos de pose extrema ou má detecção.
const CLAMP_RAD = Math.PI / 4;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Layout FIXO — a Ridge depende da ordem estável.
//   [0] tan(yaw)              1ª ordem, X
//   [1] tan(pitch)             1ª ordem, Y
//   [2] tan(yaw) · dProxy      paralaxe X
//   [3] tan(pitch) · dProxy    paralaxe Y
//   [4] tan(yaw)²              curvatura residual X
//   [5] tan(pitch)²            curvatura residual Y
//   [6] tan(yaw) · tan(pitch)  cruzado (rotação/skew da tela)
//
// Limite de plausibilidade físico. Quem olha para uma tela a 50-70 cm fica
// dentro de ~±30° em yaw e ~±20° em pitch. Um ângulo QUE ENCOSTA no clamp
// não é um olhar extremo: é sinal de que a rede recebeu lixo (crop
// degenerado, rosto ausente, imagem preta) e devolveu um valor arbitrário.
// Clampar silenciosamente transforma lixo em constante, e constante em
// feature — daí o gate por plausibilidade abaixo.
const PLAUSIBLE_RAD = 0.61;   // ~35°, folgado sobre o uso real

/** O ângulo é fisicamente compatível com alguém olhando para a tela? */
export function isGazePlausible(yaw: number, pitch: number): boolean {
  return (
    Number.isFinite(yaw) && Number.isFinite(pitch) &&
    Math.abs(yaw) <= PLAUSIBLE_RAD && Math.abs(pitch) <= PLAUSIBLE_RAD
  );
}

/**
 * Confiança mínima da softmax (`1 − H/H_max`) para o gaze entrar no vetor de
 * features.
 *
 * Um crop degenerado (preto, congelado) produz distribuição difusa cujo ângulo
 * decodificado é arbitrário mas pode cair dentro da faixa fisiológica —
 * `isGazePlausible` não pega isso. A entropia é o único sinal que distingue
 * "olhando para o centro" de "o modelo não faz ideia".
 *
 * 0,15 é conservador: bem abaixo do regime concentrado (>0,9 num pico) e bem
 * acima do uniforme (~0), então rejeita o crop quebrado sem descartar
 * inferência legítima em luz ruim. Valor provisório até medição em campo.
 */
export const L2CS_CONFIDENCE_MIN = 0.15;

/**
 * Por que o último bloco angular saiu zerado, e com que números.
 *
 * As três causas — leitura obsoleta, ângulo implausível e confiança baixa —
 * eram indistinguíveis para quem consome o vetor: todas viram sete zeros. A
 * calibração então contava tudo como um contador só e a tela dizia "o sistema
 * perdeu o olhar" mesmo quando a leitura chegou na hora e o problema era a
 * distribuição difusa da softmax. Culpar o olhar do paciente por um limiar do
 * modelo manda a pessoa se mexer, o que só piora.
 */
export interface DiagnosticoBloco {
  /** `stale-reuso`: a leitura corrente não valia (obsoleta ou de confiança
   *  baixa) e o bloco REUTILIZOU o último ângulo válido, ainda dentro de
   *  `REUSO_MAX_MS`. Não é zero: o Ridge não vê degrau. */
  motivo: 'stale' | 'implausivel' | 'confianca' | 'stale-reuso' | null;
  yawDeg: number;
  pitchDeg: number;
  confidence: number | null;
  /** Idade do ângulo reutilizado, em ms; `null` fora do reuso. */
  reusoDeMs: number | null;
  /**
   * Com que força o ângulo entrou no vetor, em [0,1].
   *
   * `1` = leitura válida, ou reuso dentro da janela cheia. `0` = sete zeros.
   * Entre os dois, o desvanecimento do reuso (ver `REUSO_DESVANECIMENTO_MS`).
   * Quem pondera amostra — a calibração — precisa deste número: um bloco
   * atenuado não é um bloco bom, mesmo não sendo exatamente zero.
   */
  pesoDoAngulo: number;
}

let ultimoDiag: DiagnosticoBloco = {
  motivo: null, yawDeg: 0, pitchDeg: 0, confidence: null, reusoDeMs: null, pesoDoAngulo: 1,
};

/**
 * Por quanto tempo o último ângulo válido é reutilizado quando a leitura
 * corrente não vale.
 *
 * Antes, `stale` virava sete zeros no meio do vetor. Zero não é "sem
 * informação" depois do StandardScaler — é um degrau: o Ridge saltava, o
 * cursor pulava e o One Euro "travava" tentando seguir. Reutilizar o ângulo
 * de até 600 ms atrás custa um atraso que o olho não nota; um zero custa um
 * salto que ele nota. Vale também para confiança baixa isolada (1–2
 * inferências a 100–160 ms de cadência cabem na janela).
 */
export const REUSO_MAX_MS = 600;

/**
 * Largura da rampa em que o ângulo reutilizado DESVANECE até zero, em ms.
 *
 * Por que existe: a janela de reuso era um portão. No instante em que ela
 * vencia, o vetor passava de `termos(ângulo)` para sete zeros de um quadro
 * para o outro — e o comentário de `REUSO_MAX_MS` acima já explica por que
 * isso é grave: "zero não é 'sem informação' depois do StandardScaler — é um
 * degrau". O mecanismo criado para EVITAR o degrau tinha um degrau na saída.
 *
 * O desvanecimento é feito no ÂNGULO, não nos sete termos. A diferença
 * importa: escalar os termos produziria um vetor que não corresponde a ângulo
 * nenhum (os quadráticos e o cruzado deixariam de ser coerentes com os
 * lineares), enquanto escalar o ângulo mantém o bloco sempre válido para
 * ALGUM olhar. E o destino é idêntico ao anterior: todos os sete termos têm
 * fator `tan(yaw)` ou `tan(pitch)`, então ângulo zero dá exatamente os mesmos
 * sete zeros de antes.
 *
 * 200 ms: curto o bastante para não fingir medição por meio segundo a mais,
 * longo o bastante para a transição não ser vista como salto (~6 quadros).
 */
export const REUSO_DESVANECIMENTO_MS = 200;

/** Hermite 3t²−2t³: contínua em valor e em derivada nas duas pontas. */
function suavePasso(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Peso do ângulo reutilizado para uma dada idade.
 *
 * `1` até `janelaMs`, `0` a partir de `janelaMs + REUSO_DESVANECIMENTO_MS`,
 * rampa suave entre os dois. Exportada para o teste afirmar a continuidade
 * sem depender do estado global do módulo.
 */
export function pesoDoReuso(idadeMs: number, janelaMs: number = reusoMaxMs): number {
  if (!Number.isFinite(idadeMs) || idadeMs < 0) return 0;
  if (idadeMs <= janelaMs) return 1;
  return 1 - suavePasso((idadeMs - janelaMs) / REUSO_DESVANECIMENTO_MS);
}

let reusoMaxMs = REUSO_MAX_MS;

export function setReusoMaxMs(ms: number): void {
  reusoMaxMs = Number.isFinite(ms) && ms >= 0 ? ms : REUSO_MAX_MS;
}

/** Último ângulo válido e o instante em que foi visto. */
let ultimoValido: { yaw: number; pitch: number; emMs: number } | null = null;

export function reiniciarReusoDoBloco(): void {
  ultimoValido = null;
  ultimoDiag = {
    motivo: null, yawDeg: 0, pitchDeg: 0, confidence: null, reusoDeMs: null, pesoDoAngulo: 1,
  };
}

/** Diagnóstico do último `buildL2CSBlock`. Válido para o quadro corrente. */
export function ultimoDiagnosticoDoBloco(): DiagnosticoBloco {
  return ultimoDiag;
}

const GRAUS = 180 / Math.PI;

export function buildL2CSBlock(
  yaw: number,
  pitch: number,
  valid: boolean,
  dProxy: number,
  /** Confiança da softmax (`1 − H/H_max`). Ausente mantém o comportamento
   *  anterior — gravações e chamadores antigos não a fornecem, e rejeitar por
   *  ausência transformaria todo dado histórico em lixo. */
  confidence?: number,
  /** Instante do quadro, em ms. Sem ele não há reuso (gravações e chamadores
   *  antigos mantêm o comportamento determinístico de zerar). */
  nowMs?: number,
): number[] {
  const conf = typeof confidence === 'number' ? confidence : null;
  const anotar = (motivo: DiagnosticoBloco['motivo'], reusoDeMs: number | null = null) => {
    ultimoDiag = {
      motivo, yawDeg: yaw * GRAUS, pitchDeg: pitch * GRAUS, confidence: conf, reusoDeMs,
      // `anotar` só é chamada nos caminhos que devolvem sete zeros e no
      // caminho feliz; este último sobrescreve o peso logo abaixo.
      pesoDoAngulo: motivo === null ? 1 : 0,
    };
  };

  // Reuso do último ângulo válido, quando a leitura corrente não vale por
  // idade ou por confiança. Ângulo IMPLAUSÍVEL não entra aqui: ele diz que a
  // rede recebeu lixo, e lixo não é "atraso".
  const reutilizar = (motivoSeExpirado: 'stale' | 'confianca'): number[] => {
    if (nowMs !== undefined && ultimoValido !== null) {
      const idade = nowMs - ultimoValido.emMs;
      const w = idade >= 0 ? pesoDoReuso(idade) : 0;
      if (w > 0) {
        // O ângulo desvanece com a idade em vez de sumir de uma vez. Ver
        // `REUSO_DESVANECIMENTO_MS`: dentro da janela `w` vale 1 e o
        // comportamento é idêntico ao anterior; passada a janela ele decai por
        // uma rampa de 200 ms até os mesmos sete zeros de sempre.
        const yawUsado = ultimoValido.yaw * w;
        const pitchUsado = ultimoValido.pitch * w;
        // O diagnóstico descreve o ângulo que ENTROU no vetor — o reutilizado,
        // já com o peso aplicado.
        ultimoDiag = {
          motivo: 'stale-reuso',
          yawDeg: yawUsado * GRAUS,
          pitchDeg: pitchUsado * GRAUS,
          confidence: conf,
          reusoDeMs: idade,
          pesoDoAngulo: w,
        };
        return termos(yawUsado, pitchUsado, dProxy);
      }
    }
    anotar(motivoSeExpirado);
    return [0, 0, 0, 0, 0, 0, 0];
  };

  // Ângulo implausível é tratado como inválido, não como extremo.
  if (valid && !isGazePlausible(yaw, pitch)) {
    anotar('implausivel');
    return [0, 0, 0, 0, 0, 0, 0];
  }
  // Gate de confiança, independente da plausibilidade acima: aquela pega o
  // ângulo impossível, esta pega a distribuição sem informação que produziu
  // um ângulo possível.
  if (valid && conf !== null && conf < L2CS_CONFIDENCE_MIN) {
    return reutilizar('confianca');
  }
  // Degradação graciosa — quando o L2CS ainda não emitiu resultado, ou o cache
  // está stale, o Ridge continua operando com o comportamento pré-L2CS (as
  // dimensões novas ficam constantes em zero, não contribuem para a predição).
  if (!valid) {
    return reutilizar('stale');
  }
  anotar(null);
  if (nowMs !== undefined) ultimoValido = { yaw, pitch, emMs: nowMs };

  return termos(yaw, pitch, dProxy);
}

/** Os sete termos, no layout fixo acima. */
function termos(yaw: number, pitch: number, dProxy: number): number[] {
  const y = clamp(yaw, -CLAMP_RAD, CLAMP_RAD);
  const p = clamp(pitch, -CLAMP_RAD, CLAMP_RAD);
  const ty = Math.tan(y);
  const tp = Math.tan(p);

  return [
    ty,
    tp,
    ty * dProxy,
    tp * dProxy,
    ty * ty,
    tp * tp,
    ty * tp,
  ];
}

/**
 * Vigia de saída CONSTANTE do L2CS.
 *
 * `isGazePlausible` pega ângulo fora da faixa fisiológica. Não pega o modo de
 * falha em que a inferência sobre imagem degenerada devolve um ângulo
 * perfeitamente plausível — só que sempre o MESMO.
 *
 * Um olho humano nunca fica exatamente parado: micro-sacadas e ruído do modelo
 * garantem variação. Saída idêntica bit a bit ao longo de segundos é hardware
 * ou pipeline quebrado, nunca fisiologia.
 */
export interface L2CSHealthOptions {
  /**
   * Por quanto TEMPO o yaw pode ficar idêntico antes de acusar travamento.
   *
   * Conta tempo, não quadros: `observe` roda no rAF sobre o valor EM CACHE,
   * então o mesmo resultado é observado várias vezes entre inferências. Um
   * limiar em quadros disparava falso positivo com uma única inferência lenta
   * (1–1,5 s em WASM single-thread).
   */
  janelaMs?: number;
}

const JANELA_PADRAO_MS = 6000;

export class L2CSHealthMonitor {
  private ultimoYaw: number | null = null;
  /** Instante em que o yaw atual apareceu pela primeira vez. */
  private desdeMs: number | null = null;
  private avisou = false;
  private acabouDeRecuperar = false;
  private readonly janelaMs: number;

  constructor(opts: L2CSHealthOptions = {}) {
    this.janelaMs = opts.janelaMs ?? JANELA_PADRAO_MS;
  }

  /**
   * Observa o gaze corrente. Devolve `true` no instante em que o travamento é
   * detectado (uma vez por episódio).
   *
   * `nowMs` é injetável para os testes rodarem com relógio virtual; em
   * produção o engine passa o `performance.now()` do frame.
   */
  observe(yaw: number, valid: boolean, nowMs: number = performance.now()): boolean {
    if (!valid || !Number.isFinite(yaw)) {
      // Worker aquecendo ou gaze stale: ausência de dado não é travamento,
      // mas também não é sinal de vida — a contagem fica como está. Zerar aqui
      // deixava o vigia inerte sempre que a inferência era mais lenta que a
      // tolerância, e fazia um stale isolado parecer "recuperação".
      this.acabouDeRecuperar = false;
      return false;
    }

    if (this.ultimoYaw === null || yaw !== this.ultimoYaw) {
      // O gaze variou — o pipeline está vivo. A recuperação é automática:
      // um latch de mão única deixaria a calibração bloqueada pelo resto da
      // sessão, e o público-alvo pode não conseguir recarregar a página.
      this.acabouDeRecuperar = this.avisou;
      this.avisou = false;
      this.ultimoYaw = yaw;
      this.desdeMs = nowMs;
      return false;
    }

    // Mesmo yaw. Quanto tempo faz?
    this.acabouDeRecuperar = false;
    if (this.desdeMs === null) {
      this.desdeMs = nowMs;
      return false;
    }
    if (nowMs - this.desdeMs >= this.janelaMs && !this.avisou) {
      this.avisou = true;
      return true;
    }
    return false;
  }

  /** Travamento detectado e ainda não recuperado. */
  get travado(): boolean {
    return this.avisou;
  }

  /** `true` no frame em que o gaze voltou a variar depois de um travamento.
   *  Permite ao engine devolver o status para 'ready' sem inferir a transição
   *  por conta própria. */
  get recuperou(): boolean {
    return this.acabouDeRecuperar;
  }

  reset(): void {
    this.ultimoYaw = null;
    this.desdeMs = null;
    this.avisou = false;
    this.acabouDeRecuperar = false;
  }
}

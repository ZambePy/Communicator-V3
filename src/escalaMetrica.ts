// Escala métrica pela íris: quantos centímetros vale um pixel de vídeo.
//
// O deslocamento lateral do tronco (`translationCompensation`) converte pixel
// de vídeo em cm por uma medida real do rosto — e é o ÚNICO consumidor da
// medida daqui. A estimativa de distância câmera→rosto (`setupReadiness.ts`,
// que alimenta a compensação de distância) ainda usa a constante genérica de
// 9,0 cm (`anthropometry.ts`); a compensação de pose não usa cantal nenhuma
// (usa a distância de tela configurada). Unificar é trabalho da compensação
// 6DoF.
//
// O problema é a variação entre pessoas. A distância cantal externa de um
// adulto varia com sexo, etnia e idade numa faixa da ordem de ±10 %; usar 9,0
// cm num rosto de 8,2 cm mete 10 % de erro de escala em TODA conta em
// centímetros. Com a compensação lateral ligada, esse erro vira
// sobre-correção: a cadeira anda 4 cm e o cursor anda 4,4.
//
// O diâmetro da íris não tem esse problema. O diâmetro horizontal visível da
// íris humana é notavelmente constante — cerca de 11,7 mm, com desvio padrão
// de meio milímetro (±4 %), estável entre adultos e praticamente invariante
// com etnia. É por isso que sistemas de rastreamento por webcam recentes
// (WebEyeTrack, 2025) usam a íris, e não a distância entre os olhos, como
// régua para recuperar escala métrica a partir de uma câmera sem calibração
// intrínseca.
//
// O que este módulo faz, então, não é substituir a constante cantal: é MEDIR a
// distância cantal DESTA pessoa, uma vez, usando a íris como régua, e devolver
// esse valor para o resto do pipeline usar no lugar dos 9,0 cm genéricos.
//
//     cm_por_px = DIAMETRO_DA_IRIS_CM / diâmetro_da_íris_em_px
//     cantal_desta_pessoa_cm = distância_cantal_em_px × cm_por_px
//
// As duas medidas saem do MESMO quadro, à mesma profundidade, então a
// distância da câmera se cancela e não é preciso conhecer o FOV.
//
// Guardas, porque uma régua ruim é pior que a constante:
//   • os dois olhos precisam ter a íris visível e bem formada (o MediaPipe
//     entrega o anel mesmo com o olho quase fechado, e aí o diâmetro medido é
//     a pálpebra, não a íris — daí a medida HORIZONTAL, que a pálpebra não
//     encurta, e a checagem de circularidade);
//   • cabeça aproximadamente frontal: de perfil a íris vira elipse e o
//     diâmetro horizontal projetado encolhe;
//   • mediana de várias amostras, não uma;
//   • resultado fora da faixa plausível (7,2–10,8 cm) é descartado — nesse
//     caso volta a constante genérica, que é ruim mas é conhecida.

import { CANTHAL_DISTANCE_CM } from './anthropometry';

/** Diâmetro horizontal visível da íris, em cm. Constante antropométrica. */
export const DIAMETRO_DA_IRIS_CM = 1.17;

/** Faixa plausível para a distância cantal externa de um adulto, em cm. */
export const CANTAL_MIN_CM = 7.2;
export const CANTAL_MAX_CM = 10.8;

/** Amostras mínimas antes de confiar na mediana. */
export const AMOSTRAS_MINIMAS = 12;

/** Maior razão aceita entre os diâmetros dos dois olhos (assimetria = medida ruim). */
const ASSIMETRIA_MAX = 1.25;

/** Yaw/pitch acima disto encolhem a íris projetada; a amostra não serve de régua. */
export const ANGULO_FRONTAL_MAX_DEG = 18;

/**
 * Anel da íris do MediaPipe (refineLandmarks). O centro é 468/473; os quatro
 * pontos do anel vêm na ordem direita, topo, esquerda, base para cada olho.
 */
export const IRIS_ESQUERDA_ANEL = [469, 470, 471, 472] as const;
export const IRIS_DIREITA_ANEL = [474, 475, 476, 477] as const;

export interface Ponto2D {
  x: number;
  y: number;
}

/**
 * Diâmetro horizontal da íris, em pixels de vídeo, ou `null` quando o anel não
 * está presente ou a medida não é confiável.
 *
 * Horizontal de propósito: a pálpebra corta a íris por cima e por baixo, mas
 * não pelos lados. O diâmetro vertical de um olho semiaberto mede a fresta,
 * não a íris.
 */
export function diametroDaIrisPx(
  landmarks: readonly Ponto2D[] | null | undefined,
  anel: readonly number[],
  videoWidth: number,
  videoHeight: number,
): number | null {
  if (!landmarks || !(videoWidth > 0) || !(videoHeight > 0)) return null;
  const [direita, topo, esquerda, base] = anel;
  const pd = landmarks[direita];
  const pe = landmarks[esquerda];
  const pt = landmarks[topo];
  const pb = landmarks[base];
  if (!pd || !pe || !pt || !pb) return null;

  const horizontalPx = Math.hypot((pd.x - pe.x) * videoWidth, (pd.y - pe.y) * videoHeight);
  const verticalPx = Math.hypot((pt.x - pb.x) * videoWidth, (pt.y - pb.y) * videoHeight);
  if (!(horizontalPx > 0) || !Number.isFinite(horizontalPx)) return null;

  // Circularidade: a íris é redonda. Se o vertical for muito menor que o
  // horizontal, ou o anel está degenerado, ou o olho está quase fechado e o
  // MediaPipe chutou o anel. Tolerância generosa (0,6) porque a pálpebra
  // encosta na íris em olhar para baixo, que é postura normal de uso.
  //
  // `verticalPx === 0` é o anel MAIS degenerado que existe (topo e base
  // coincidentes) e por isso recusa junto, em vez de escapar da divisão.
  if (!(verticalPx > 0) || verticalPx / horizontalPx < 0.6) return null;

  return horizontalPx;
}

export interface AmostraDeEscala {
  landmarks: readonly Ponto2D[];
  /** Distância cantal medida no quadro (landmarks 33↔263), em pixels de vídeo. */
  cantalPx: number;
  videoWidth: number;
  videoHeight: number;
  /**
   * Ângulos da cabeça em graus. OBRIGATÓRIOS na prática: sem eles a amostra é
   * recusada, porque "não sei a pose" não é o mesmo que "está de frente" — de
   * perfil a íris projetada encolhe por cos(yaw) e a régua infla na mesma
   * proporção (35° → 22 % a menos).
   */
  yawDeg?: number;
  pitchDeg?: number;
}

/**
 * Distância cantal DESTA pessoa estimada a partir de um quadro, em cm, ou
 * `null` se a amostra não serve de régua.
 */
export function cantalDoQuadroCm(a: AmostraDeEscala | null | undefined): number | null {
  if (!a || !(a.cantalPx > 0)) return null;
  // Pose desconhecida (rosto acabou de voltar, episódio de piscada ou de
  // contraluz) não é pose frontal: recusa.
  if (!Number.isFinite(a.yawDeg) || !Number.isFinite(a.pitchDeg)) return null;
  const yaw = Math.abs(a.yawDeg as number);
  const pitch = Math.abs(a.pitchDeg as number);
  if (yaw > ANGULO_FRONTAL_MAX_DEG || pitch > ANGULO_FRONTAL_MAX_DEG) return null;

  const esq = diametroDaIrisPx(a.landmarks, IRIS_ESQUERDA_ANEL, a.videoWidth, a.videoHeight);
  const dir = diametroDaIrisPx(a.landmarks, IRIS_DIREITA_ANEL, a.videoWidth, a.videoHeight);
  if (esq === null || dir === null) return null;

  // Assimetria grande entre os olhos significa um anel mal posto (oclusão,
  // reflexo de óculos). Duas medidas discordantes não fazem uma boa.
  const razao = esq > dir ? esq / dir : dir / esq;
  if (!Number.isFinite(razao) || razao > ASSIMETRIA_MAX) return null;

  const irisPx = (esq + dir) / 2;
  if (!(irisPx > 0)) return null;

  const cmPorPx = DIAMETRO_DA_IRIS_CM / irisPx;
  const cantalCm = a.cantalPx * cmPorPx;
  if (!Number.isFinite(cantalCm)) return null;
  if (cantalCm < CANTAL_MIN_CM || cantalCm > CANTAL_MAX_CM) return null;
  return cantalCm;
}

function mediana(vs: number[]): number {
  const s = [...vs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Acumula amostras durante a calibração e devolve a distância cantal da
 * pessoa. Mediana, não média: uma única leitura ruim que passou pelas guardas
 * (piscada no limiar, reflexo) não desloca o resultado.
 */
export class MedidorDeEscalaFacial {
  private readonly amostras: number[] = [];
  /** Mediana memoizada: o consumidor pergunta a cada quadro e a resposta só
   *  muda quando uma amostra entra. Sem isto era uma cópia + `sort` de até 240
   *  elementos a 30 Hz, disputando orçamento com o MediaPipe num tablet. */
  private cache: number | null = null;
  private sujo = true;

  /** Quantas amostras válidas entraram até agora. */
  get total(): number {
    return this.amostras.length;
  }

  adicionar(a: AmostraDeEscala | null | undefined): boolean {
    const cm = cantalDoQuadroCm(a);
    if (cm === null) return false;
    this.amostras.push(cm);
    // Teto para a memória não crescer numa calibração longa; a mediana de 240
    // amostras já é estável.
    if (this.amostras.length > 240) this.amostras.shift();
    this.sujo = true;
    return true;
  }

  limpar(): void {
    this.amostras.length = 0;
    this.cache = null;
    this.sujo = true;
  }

  /**
   * Distância cantal medida, ou `null` enquanto não houver amostras
   * suficientes. Quem chama decide o fallback (a constante genérica).
   */
  resultadoCm(): number | null {
    if (this.amostras.length < AMOSTRAS_MINIMAS) return null;
    if (this.sujo) {
      this.cache = mediana(this.amostras);
      this.sujo = false;
    }
    return this.cache;
  }

  /** Conveniência: o valor medido, ou a constante genérica. */
  cantalOuPadraoCm(): number {
    return this.resultadoCm() ?? CANTHAL_DISTANCE_CM;
  }
}

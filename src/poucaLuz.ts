/**
 * Pouca luz durante o USO (pedido do dono, 18/10/2026: a emergência precisa
 * funcionar "à noite, com pouca luz").
 *
 * O que acontece à noite, sem isto:
 *  1. A câmera foi ajustada de dia e a exposição ficou TRAVADA (o
 *     `GazeProvider` trava exposição, balanço e foco quando a imagem está boa,
 *     para o brilho não variar debaixo da calibração). Quando a luz do quarto
 *     cai, a câmera não compensa: a imagem escurece até o rosto sumir.
 *  2. O detector perde o rosto e a tela diz "Não estou vendo seu rosto" — a
 *     causa (a luz) não aparece, e quem está perto não sabe o que fazer.
 *  3. Sem rosto, o recorte dos olhos não existe e nada mede o brilho: o único
 *     medidor de luz (o do recorte) some justamente quando escurece.
 *
 * Aqui: um medidor do QUADRO INTEIRO (64×36, a cada 2 s — o mesmo custo do
 * medidor de contraluz), que funciona sem rosto; e uma regra com histerese
 * que diz quando a pouca luz DUROU. Quem usa (`GazeProvider`) destrava a
 * exposição uma vez por episódio e mostra o aviso com o que ajuda.
 *
 * Limiares: a média de luminância de um quadro de webcam em exposição
 * automática, num cômodo iluminado, fica perto de 0,35–0,5; no escuro, com a
 * exposição no máximo, 0,05–0,15. Entrar abaixo de 0,12 por 10 s e sair acima
 * de 0,18 por 3 s são estimativas a conferir com uma webcam de verdade (o
 * roteiro de medição tem a sessão). Com luz normal nada aqui dispara — a saída
 * do rastreamento fica idêntica.
 */

/** Abaixo disto (média do quadro, 0–1) conta como pouca luz. */
export const BRILHO_POUCA_LUZ = 0.12;
/** Acima disto a luz voltou (histerese: não pisca na fronteira). */
export const BRILHO_LUZ_VOLTOU = 0.18;
/** Quanto a pouca luz precisa durar para virar aviso. */
export const POUCA_LUZ_APOS_MS = 10_000;
/** Quanto a luz precisa ficar boa para o aviso sair. */
export const LUZ_VOLTOU_APOS_MS = 3_000;
/** Largura da amostra do quadro (a altura segue a proporção do vídeo). */
export const LARGURA_DA_AMOSTRA_DE_LUZ = 64;

/** Luminância média (Rec. 601, 0–1) de pixels RGBA. Pura. */
export function luminanciaMedia(pixels: Uint8ClampedArray | Uint8Array): number {
  const n = Math.floor(pixels.length / 4);
  if (n === 0) return 0;
  let soma = 0;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    soma += 0.299 * pixels[j] + 0.587 * pixels[j + 1] + 0.114 * pixels[j + 2];
  }
  return soma / n / 255;
}

export interface EstadoDaPoucaLuz {
  /** Desde quando o brilho está abaixo do limiar (`null` = não está). */
  abaixoDesdeMs: number | null;
  /** Desde quando o brilho voltou acima do limiar de saída, com o aviso ativo. */
  acimaDesdeMs: number | null;
  /** O aviso de pouca luz está valendo. */
  poucaLuz: boolean;
  /** Último brilho medido (para o texto e para o diagnóstico). */
  brilho: number | null;
}

export const ESTADO_INICIAL_DA_LUZ: EstadoDaPoucaLuz = { abaixoDesdeMs: null, acimaDesdeMs: null, poucaLuz: false, brilho: null };

/**
 * Um passo da regra. `brilho` `null` = não medido (sem quadro): não muda nada
 * — não medir não é prova de luz nem de escuro. `emMedicao` (calibração ou
 * teste de precisão): zera, como o resto dos avisos de uso.
 */
export function passoDaPoucaLuz(
  e: EstadoDaPoucaLuz,
  brilho: number | null,
  agoraMs: number,
  emMedicao: boolean,
): EstadoDaPoucaLuz {
  if (emMedicao) return { ...ESTADO_INICIAL_DA_LUZ, brilho };
  if (brilho === null || !Number.isFinite(brilho)) return e;
  if (!e.poucaLuz) {
    if (brilho < BRILHO_POUCA_LUZ) {
      const desde = e.abaixoDesdeMs ?? agoraMs;
      return { abaixoDesdeMs: desde, acimaDesdeMs: null, poucaLuz: agoraMs - desde >= POUCA_LUZ_APOS_MS, brilho };
    }
    return { abaixoDesdeMs: null, acimaDesdeMs: null, poucaLuz: false, brilho };
  }
  // Aviso ativo: só sai depois de a luz ficar boa por um tempo.
  if (brilho > BRILHO_LUZ_VOLTOU) {
    const desde = e.acimaDesdeMs ?? agoraMs;
    if (agoraMs - desde >= LUZ_VOLTOU_APOS_MS) return { ...ESTADO_INICIAL_DA_LUZ, brilho };
    return { ...e, acimaDesdeMs: desde, brilho };
  }
  return { ...e, acimaDesdeMs: null, brilho };
}

/** O texto do aviso, calmo e em primeira pessoa, com o que ajuda. */
export function mensagemDePoucaLuz(telaEscurecida: boolean): string {
  return (
    'Com pouca luz no rosto eu erro mais e posso perder o olhar. Uma luz de frente ajuda: ' +
    'uma luminária atrás do monitor ou a luz do quarto.' +
    (telaEscurecida ? ' A tela está escurecida, e clarear a tela também ilumina o rosto.' : '')
  );
}

/**
 * Mede o brilho do quadro inteiro, no máximo uma vez a cada `intervaloMs`.
 * Guarda a última medida (chamadas no intervalo devolvem a anterior). Sem DOM
 * de canvas (testes), devolve `null` — não medido.
 */
export class MedidorDeBrilhoDoQuadro {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private ultimaMs = -Infinity;
  private ultima: number | null = null;
  private readonly intervaloMs: number;

  constructor(intervaloMs = 2000) {
    this.intervaloMs = intervaloMs;
  }

  medir(video: ({ videoWidth: number; videoHeight: number } & CanvasImageSource) | null, agoraMs: number): number | null {
    if (!video) return this.ultima;
    if (agoraMs - this.ultimaMs < this.intervaloMs) return this.ultima;
    const vw = video.videoWidth || 0;
    const vh = video.videoHeight || 0;
    if (vw <= 0 || vh <= 0) return this.ultima;
    this.ultimaMs = agoraMs;
    const largura = LARGURA_DA_AMOSTRA_DE_LUZ;
    const altura = Math.max(1, Math.round((largura * vh) / vw));
    try {
      if (!this.canvas) {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      }
      if (!this.ctx || !this.canvas) return (this.ultima = null);
      if (this.canvas.width !== largura || this.canvas.height !== altura) {
        this.canvas.width = largura;
        this.canvas.height = altura;
      }
      this.ctx.drawImage(video, 0, 0, largura, altura);
      this.ultima = luminanciaMedia(this.ctx.getImageData(0, 0, largura, altura).data);
    } catch {
      // Sem quadro ou canvas indisponível: não medido, e não inventado.
      this.ultima = null;
    }
    return this.ultima;
  }
}

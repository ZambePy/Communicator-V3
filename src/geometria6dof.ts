/**
 * Saída 6DoF (M12 em docs/PESQUISA.md). Desligada por padrão e fora do
 * interruptor `pipeline`: depende de uma geometria que a sessão de medição
 * ainda não validou.
 *
 * ## O que ela troca
 *
 * O caminho clássico corrige a predição por três aproximações separadas:
 * distância (escala em torno do CENTRO da tela), rotação da cabeça
 * (d·tan Δ) e translação lateral (1:1 em cm). As três erram quando a
 * postura muda muito — calibrar sentado e usar reclinado. O deslocamento
 * exato de uma rotação é d·[tan(θ₀ + Δ) − tan θ₀], não d·tan Δ (~40 px na
 * linha de baixo para a deriva de 3,9° medida numa calibração), e o ponto
 * fixo de uma mudança de distância é o pé da perpendicular do olho, não o
 * centro da tela (~27 px a cada 5 % de distância) — docs/PESQUISA.md §3.3.
 *
 * ## Como: reprojeção da predição do Ridge
 *
 * O Ridge aprende "onde o olhar cairia com a cabeça na postura de
 * referência". Essa predição p̂, junto com o olho e a rotação de referência
 * (e₀, R₀), define a direção do olhar no referencial da CABEÇA:
 *
 *     g_h = R₀ᵀ · (T(p̂) − e₀)/‖T(p̂) − e₀‖
 *
 * com T(p) o ponto da tela em 3D, nas coordenadas da câmera. Com a cabeça
 * agora em (e, R), o ponto é a interseção do raio e + s·R·g_h com o plano da
 * tela (s = nᵀ(p₀ − e)/(nᵀg), relatório de 27/09 §6). É o rótulo
 * g_h* = Rᵀ(T − e)/‖T − e‖ do relatório, usado nos dois sentidos: no treino,
 * leva cada alvo da postura da amostra para a de referência; na inferência,
 * leva a predição da referência para a postura de agora.
 *
 * **Idêntica em Δ = 0, por construção**: com e = e₀ e R = R₀ a reprojeção
 * devolve p̂. A passagem entre o clássico e o 6DoF é contínua — as duas
 * saídas coincidem na postura da calibração e se afastam só com Δ.
 *
 * **Kappa.** g_h sai de pontos da tela, então já é o eixo VISUAL: o ângulo
 * kappa entre o eixo óptico e o visual (5,46 ± 1,33°, Hashemi et al. 2010;
 * ~1,5° na vertical, Guestrin & Eizenman 2006) fica absorvido pelo Ridge,
 * olho a olho, como no caminho clássico. Estimá-lo com o prior populacional
 * só tem objeto quando entra uma estimativa do eixo ÓPTICO — o ramo ocular
 * (EyeNet), fora deste escopo. Ver docs/PESQUISA.md §5.
 *
 * **Geometria só em segunda ordem.** Posição da câmera, borda entre a lente
 * e a imagem e inclinação da câmera não mexem em nada na postura de
 * referência; sob movimento de cabeça, erram a correção em segunda ordem
 * (contas em `geometria6dof.test.ts`). Por isso a lente fica na borda da
 * imagem, sem inclinação, e o que se pergunta ao cuidador é só de que lado
 * da tela a câmera está.
 *
 * Coordenadas da câmera no padrão OpenCV: x para a direita da IMAGEM (a
 * esquerda da pessoa), y para baixo, z da câmera para a pessoa. A rotação
 * da pose vem no espaço métrico do MediaPipe (x, −y, −z).
 */

/** De que lado da tela está a câmera (pergunta do preparo). */
export type PosicaoDaCamera = 'topo' | 'base' | 'notebook';
export const POSICOES_DA_CAMERA: readonly PosicaoDaCamera[] = ['topo', 'base', 'notebook'];

export function posicaoDaCameraValida(v: unknown): PosicaoDaCamera | null {
  return typeof v === 'string' && (POSICOES_DA_CAMERA as readonly string[]).includes(v)
    ? (v as PosicaoDaCamera)
    : null;
}

export type Vetor3 = [number, number, number];

export interface GeometriaTelaCamera {
  /** Área útil em px CSS (o viewport em que o modelo mapeia). */
  larguraPx: number;
  alturaPx: number;
  /** Tamanho físico de um px CSS, em cm. */
  cmPorPx: number;
  posicao: PosicaoDaCamera;
}

/** Geometria da tela a partir da densidade física. `null` se algo não serve. */
export function montarGeometria(
  posicao: PosicaoDaCamera,
  larguraPx: number,
  alturaPx: number,
  pxPorCm: number,
): GeometriaTelaCamera | null {
  if (!(larguraPx > 0) || !(alturaPx > 0) || !(pxPorCm > 0)) return null;
  return { larguraPx, alturaPx, cmPorPx: 1 / pxPorCm, posicao };
}

/**
 * Ponto (u, v) da tela, em px, nas coordenadas da câmera (cm). A tela é o
 * plano z = 0; `topo` e `notebook` têm a lente no meio da borda de cima,
 * `base` no meio da borda de baixo. u cresce para a direita DA PESSOA, que é
 * a esquerda da imagem.
 */
export function pontoDaTela(g: GeometriaTelaCamera, u: number, v: number): Vetor3 {
  const x = -(u - g.larguraPx / 2) * g.cmPorPx;
  const y = g.posicao === 'base' ? -(g.alturaPx - v) * g.cmPorPx : v * g.cmPorPx;
  return [x, y, 0];
}

/** Interseção do raio `origem + s·direcao` com a tela, em px. `null` sem interseção à frente. */
export function raioNaTela(g: GeometriaTelaCamera, origem: Vetor3, direcao: Vetor3): { x: number; y: number } | null {
  if (!(direcao[2] < 0) || !(origem[2] > 0)) return null;
  const s = -origem[2] / direcao[2];
  const px = origem[0] + s * direcao[0];
  const py = origem[1] + s * direcao[1];
  const u = g.larguraPx / 2 - px / g.cmPorPx;
  const v = g.posicao === 'base' ? g.alturaPx + py / g.cmPorPx : py / g.cmPorPx;
  return Number.isFinite(u) && Number.isFinite(v) ? { x: u, y: v } : null;
}

/**
 * Olho nas coordenadas da câmera, a partir do pixel (vídeo NÃO espelhado) e da
 * distância. A distância vem da distância cantal em px corrigida pelo yaw — de
 * lado, a projeção dos cantos encolhe por cos(yaw) — e pela régua da pessoa.
 */
export function olhoNaCamera(
  pixel: { x: number; y: number },
  video: { largura: number; altura: number },
  fovHorizontalDeg: number,
  distanciaCantal: { px: number; cm: number; yawRad: number },
): Vetor3 | null {
  const { largura: w, altura: h } = video;
  if (!(w > 0) || !(h > 0) || !(fovHorizontalDeg > 0 && fovHorizontalDeg < 180)) return null;
  const f = w / 2 / Math.tan((fovHorizontalDeg * Math.PI) / 360);
  const cantalPx = distanciaCantal.px / Math.max(0.5, Math.cos(distanciaCantal.yawRad));
  if (!(cantalPx > 0) || !(distanciaCantal.cm > 0)) return null;
  const z = (f * distanciaCantal.cm) / cantalPx;
  const x = ((pixel.x - w / 2) / f) * z;
  const y = ((pixel.y - h / 2) / f) * z;
  return [x, y, z].every(Number.isFinite) ? [x, y, z] : null;
}

function normalizar(v: Vetor3): Vetor3 | null {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n > 0 ? [v[0] / n, v[1] / n, v[2] / n] : null;
}

/**
 * Leva um ponto da tela de uma postura para outra: o olhar que, com o olho em
 * `olhoDe` e a cabeça em `rotDe`, cai em `ponto`, cai onde com o olho em
 * `olhoPara` e a cabeça em `rotPara`? Rotações em linha-maior
 * (`poseDaCabeca.matrizDaPose`), no espaço métrico do MediaPipe.
 */
export function reprojetar(
  g: GeometriaTelaCamera,
  ponto: { x: number; y: number },
  olhoDe: Vetor3,
  rotDe: readonly number[],
  olhoPara: Vetor3,
  rotPara: readonly number[],
): { x: number; y: number } | null {
  if (rotDe.length !== 9 || rotPara.length !== 9) return null;
  const t = pontoDaTela(g, ponto.x, ponto.y);
  const d = normalizar([t[0] - olhoDe[0], t[1] - olhoDe[1], t[2] - olhoDe[2]]);
  if (!d) return null;
  // OpenCV → MediaPipe, e para a cabeça: g_h = R_deᵀ·M·d.
  const m: Vetor3 = [d[0], -d[1], -d[2]];
  const r = rotDe;
  const h: Vetor3 = [
    r[0] * m[0] + r[3] * m[1] + r[6] * m[2],
    r[1] * m[0] + r[4] * m[1] + r[7] * m[2],
    r[2] * m[0] + r[5] * m[1] + r[8] * m[2],
  ];
  // De volta à câmera na postura de destino: M·R_para·g_h.
  const q = rotPara;
  const n: Vetor3 = [
    q[0] * h[0] + q[1] * h[1] + q[2] * h[2],
    q[3] * h[0] + q[4] * h[1] + q[5] * h[2],
    q[6] * h[0] + q[7] * h[1] + q[8] * h[2],
  ];
  return raioNaTela(g, olhoPara, [n[0], -n[1], -n[2]]);
}

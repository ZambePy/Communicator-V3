/**
 * `camera_ok` e `tracker_ok` do heartbeat que o celular do cuidador lê.
 *
 * Antes: `camera_ok` era "existe um objeto MediaStream" e `tracker_ok` era "o
 * engine diz `tracking`". Com a câmera desconectada no meio da sessão, os dois
 * seguiam verdadeiros — o cuidador via "tudo ok" enquanto o paciente estava sem
 * comunicação e sem emergência.
 *
 * Agora `camera_ok` exige imagem chegando AGORA (`cameraAtiva` do
 * `GazeProvider`: track viva e não muda, engine fora de `sem_camera`, quadros
 * no diagnóstico), e `tracker_ok` exige a câmera ok além do estado do engine.
 */

export interface FonteDaSaude {
  state: string;
  cameraError: string | null;
  getCameraStream: () => MediaStream | null;
  /** Ausente num provider antigo (ou num dublê de teste): cai no critério antigo. */
  cameraAtiva?: () => boolean;
}

const ESTADOS_QUE_RASTREIAM = new Set(['tracking', 'calibrating', 'uncalibrated']);

export function saudeDoRastreamento(g: FonteDaSaude): { camera_ok: boolean; tracker_ok: boolean } {
  let comImagem: boolean;
  try {
    comImagem = typeof g.cameraAtiva === 'function' ? g.cameraAtiva() : g.getCameraStream() !== null;
  } catch {
    comImagem = false;
  }
  const camera_ok = !g.cameraError && comImagem;
  return { camera_ok, tracker_ok: camera_ok && ESTADOS_QUE_RASTREIAM.has(g.state) };
}

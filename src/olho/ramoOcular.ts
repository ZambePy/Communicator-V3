// Ramo ocular: contrato e provedores.
//
// O engine não sabe que rede roda aqui — sabe que entrega dois tensores
// 3×64×96 por quadro e recebe (yaw, pitch, confiança) por olho. Dois
// provedores: o NULO, que nunca responde (o pipeline se comporta como se o
// ramo não existisse), e o ONNX, que reusa o worker do L2CS — o mesmo
// carregador, a mesma decodificação por bins, a mesma verificação de hash —
// uma instância por olho. Reusar em vez de escrever um worker novo: o código
// que já lida com WebGPU/WASM, backpressure e staleness é o mais testado do
// projeto, e a única coisa que a EyeNet exige a mais é tensor retangular.

import { createL2CSClient, urlRelativa, type L2CSClient, type MotivoDaFalhaDoWorker } from '../l2cs/client';
import type { FichaDoModelo } from '../l2cs/proveniencia';
import type { SaidaDoRamoOcular } from './bloco';
import { ALTURA_DO_OLHO, LARGURA_DO_OLHO } from './recorte';

export interface SaidasDoRamoOcular {
  esquerdo: SaidaDoRamoOcular | null;
  direito: SaidaDoRamoOcular | null;
  /**
   * Instante do quadro em que as saídas foram lidas, em ms. Habilita o reuso,
   * com rampa, do último ângulo válido no bloco ocular (`olho/bloco.ts`), como
   * no bloco do rosto. Ausente (gravações, chamadores antigos) = sem reuso.
   */
  nowMs?: number;
}

export interface RamoOcular {
  start(): Promise<void>;
  stop(): void;
  /** `true` se ao menos um olho foi aceito. Tensores são transferidos. */
  submeter(esquerdo: Float32Array | null, direito: Float32Array | null): boolean;
  /** Buffer devolvido pelo worker daquele olho, para o próximo recorte (falha #13). */
  emprestar(olho: 'esquerdo' | 'direito', comprimento: number): Float32Array | undefined;
  podeSubmeter(nowMs?: number): boolean;
  ultimas(nowMs?: number): SaidasDoRamoOcular;
  /** Ficha do modelo (a dos dois olhos é a mesma). `null` antes do `ready`. */
  ficha(): FichaDoModelo | null;
  latenciaMediaMs(): number;
  /** Provider em vigor (`'webgpu'` ou `'wasm'`); `null` antes do `ready`. */
  executionProvider(): string | null;
}

const SAIDA_INVALIDA: SaidaDoRamoOcular = { yaw: 0, pitch: 0, confianca: 0, valid: false, timestamp: 0 };

/** Nunca responde. É o que roda quando a flag está desligada. */
export const ramoOcularNulo: RamoOcular = {
  async start() {},
  stop() {},
  submeter() { return false; },
  emprestar() { return undefined; },
  podeSubmeter() { return false; },
  ultimas() { return { esquerdo: null, direito: null }; },
  ficha() { return null; },
  latenciaMediaMs() { return 0; },
  executionProvider() { return null; },
};

export interface OpcoesDoRamoOnnx {
  modelUrl?: string;
  metaUrl?: string;
  /** Cadência mínima entre submissões por olho, em ms. A rede é ~30× mais
   *  barata que a ResNet-50; 33 ms acompanha a câmera. */
  cadenceMs?: number;
  /** Provider dos dois workers. Ausente = o da flag `l2cs`. O engine força
   *  `wasm` a partir da segunda tentativa de reinício (relato de 19/10/2026). */
  provider?: 'auto' | 'webgpu' | 'wasm';
  /**
   * Chamado UMA vez quando o worker de um dos olhos, já pronto, deixa de servir
   * (morreu, errou seguidamente ou parou de responder). O ramo inteiro é dado
   * como perdido: com um olho só o bloco sai meio zerado, e o reinício é dos dois.
   */
  aoFalhar?: (motivo: MotivoDaFalhaDoWorker, detalhe: string) => void;
}

const DEFAULT_MODEL_PATH = 'models/eyenet/eyenet.onnx';
const DEFAULT_META_PATH = 'models/eyenet/eyenet.meta.json';

export function criarRamoOcularOnnx(opts: OpcoesDoRamoOnnx = {}): RamoOcular {
  const dims: [number, number] = [ALTURA_DO_OLHO, LARGURA_DO_OLHO];
  let falhou = false;
  const aoFalharDoOlho = (olho: string) => (motivo: MotivoDaFalhaDoWorker, detalhe: string) => {
    if (falhou) return;
    falhou = true;
    opts.aoFalhar?.(motivo, `${olho}: ${detalhe}`);
  };
  // O rótulo separa no console a EyeNet de cada olho da L2CS-Net do rosto: o
  // worker é o mesmo, e sem ele as três instâncias diziam `[L2CS]`.
  const fabricar = (rotulo: string): L2CSClient =>
    createL2CSClient({
      modelUrl: opts.modelUrl ?? urlRelativa(DEFAULT_MODEL_PATH),
      metaUrl: opts.metaUrl ?? urlRelativa(DEFAULT_META_PATH),
      cadenceMs: opts.cadenceMs ?? 33,
      rotulo,
      // A inferência de teste do `init` usa o tensor 3×64×96 do olho, que é o
      // que vai ser submetido — não o recorte quadrado do rosto.
      dimsDoTensor: dims,
      ...(opts.provider ? { provider: opts.provider } : {}),
      aoFalhar: aoFalharDoOlho(rotulo),
    });
  const esq = fabricar('[olho esquerdo]');
  const dir = fabricar('[olho direito]');

  const traduzir = (c: L2CSClient, nowMs?: number): SaidaDoRamoOcular => {
    const g = c.getLatestGaze(nowMs);
    if (!g.valid) return SAIDA_INVALIDA;
    return { yaw: g.yaw, pitch: g.pitch, confianca: g.confidence ?? 0, valid: true, timestamp: g.timestamp };
  };

  return {
    async start() {
      await Promise.all([esq.start(), dir.start()]);
    },
    stop() {
      esq.stop();
      dir.stop();
    },
    submeter(esquerdo, direito) {
      let aceito = false;
      if (esquerdo && esq.submitTensor(esquerdo, dims)) aceito = true;
      if (direito && dir.submitTensor(direito, dims)) aceito = true;
      return aceito;
    },
    emprestar(olho, comprimento) {
      return (olho === 'esquerdo' ? esq : dir).emprestarTensor?.(comprimento);
    },
    podeSubmeter(nowMs) {
      return esq.canSubmit(nowMs) || dir.canSubmit(nowMs);
    },
    ultimas(nowMs) {
      return {
        esquerdo: traduzir(esq, nowMs),
        direito: traduzir(dir, nowMs),
        ...(nowMs !== undefined ? { nowMs } : {}),
      };
    },
    ficha() {
      return esq.getFicha() ?? dir.getFicha();
    },
    latenciaMediaMs() {
      return (esq.getAverageLatencyMs() + dir.getAverageLatencyMs()) / 2;
    },
    executionProvider() {
      return esq.getExecutionProvider() ?? dir.getExecutionProvider();
    },
  };
}

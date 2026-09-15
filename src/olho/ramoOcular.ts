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

import { createL2CSClient, urlRelativa, type L2CSClient } from '../l2cs/client';
import type { FichaDoModelo } from '../l2cs/proveniencia';
import type { SaidaDoRamoOcular } from './bloco';
import { ALTURA_DO_OLHO, LARGURA_DO_OLHO } from './recorte';

export interface SaidasDoRamoOcular {
  esquerdo: SaidaDoRamoOcular | null;
  direito: SaidaDoRamoOcular | null;
}

export interface RamoOcular {
  start(): Promise<void>;
  stop(): void;
  /** `true` se ao menos um olho foi aceito. Tensores são transferidos. */
  submeter(esquerdo: Float32Array | null, direito: Float32Array | null): boolean;
  podeSubmeter(nowMs?: number): boolean;
  ultimas(nowMs?: number): SaidasDoRamoOcular;
  /** Ficha do modelo (a dos dois olhos é a mesma). `null` antes do `ready`. */
  ficha(): FichaDoModelo | null;
  latenciaMediaMs(): number;
}

const SAIDA_INVALIDA: SaidaDoRamoOcular = { yaw: 0, pitch: 0, confianca: 0, valid: false, timestamp: 0 };

/** Nunca responde. É o que roda quando a flag está desligada. */
export const ramoOcularNulo: RamoOcular = {
  async start() {},
  stop() {},
  submeter() { return false; },
  podeSubmeter() { return false; },
  ultimas() { return { esquerdo: null, direito: null }; },
  ficha() { return null; },
  latenciaMediaMs() { return 0; },
};

export interface OpcoesDoRamoOnnx {
  modelUrl?: string;
  metaUrl?: string;
  /** Cadência mínima entre submissões por olho, em ms. A rede é ~30× mais
   *  barata que a ResNet-50; 33 ms acompanha a câmera. */
  cadenceMs?: number;
}

const DEFAULT_MODEL_PATH = 'models/eyenet/eyenet.onnx';
const DEFAULT_META_PATH = 'models/eyenet/eyenet.meta.json';

export function criarRamoOcularOnnx(opts: OpcoesDoRamoOnnx = {}): RamoOcular {
  const fabricar = (): L2CSClient =>
    createL2CSClient({
      modelUrl: opts.modelUrl ?? urlRelativa(DEFAULT_MODEL_PATH),
      metaUrl: opts.metaUrl ?? urlRelativa(DEFAULT_META_PATH),
      cadenceMs: opts.cadenceMs ?? 33,
    });
  const esq = fabricar();
  const dir = fabricar();
  const dims: [number, number] = [ALTURA_DO_OLHO, LARGURA_DO_OLHO];

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
    podeSubmeter(nowMs) {
      return esq.canSubmit(nowMs) || dir.canSubmit(nowMs);
    },
    ultimas(nowMs) {
      return { esquerdo: traduzir(esq, nowMs), direito: traduzir(dir, nowMs) };
    },
    ficha() {
      return esq.getFicha() ?? dir.getFicha();
    },
    latenciaMediaMs() {
      return (esq.getAverageLatencyMs() + dir.getAverageLatencyMs()) / 2;
    },
  };
}

// Snapshot do runtime para o relatório de precisão.
//
// Existia só dentro de `CalibrationCheck`, e o teste disparado por
// Configurações chamava `startAccuracyTest` com dois argumentos — sem runtime.
// O relatório saía com `pipeline.runtime: null`, ou seja, sem provider
// efetivo, sem `l2csFallback`, sem `stalePct` e sem fps: exatamente os campos
// que o protocolo manda ler ANTES de acreditar num número. Foi assim que os
// dois relatórios do histórico nasceram incomparáveis.
//
// Uma função só, usada pelos dois caminhos, para não voltar a divergir.
import type { RuntimeInfo } from '@tracker/accuracy';
import type { FichaDoModelo } from '@tracker/l2cs/proveniencia';
import { getL2csInputSizeEfetivo } from '@tracker/calibration';

/** O que `getDiagnostics()` do GazeContext devolve, na parte que interessa. */
export interface DiagnosticosDeRuntime {
  l2cs?: {
    executionProvider?: string | null;
    fallback?: boolean;
    latencyMs?: number;
    /** Lado do recorte EM VIGOR (a política por provider pode diferir da flag). */
    inputSize?: number;
    stalePct?: number;
    modelo?: FichaDoModelo | null;
  } | null;
  filtro?: { efetivo?: string; preset?: string | null } | null;
  fpsRender?: number;
  video?: { width: number; height: number } | null;
}

export function buildRuntimeInfo(
  d: DiagnosticosDeRuntime | null | undefined,
): RuntimeInfo | undefined {
  if (!d) return undefined;
  return {
    l2csExecutionProvider: d.l2cs?.executionProvider ?? null,
    l2csFallback: d.l2cs?.fallback,
    modelo: d.l2cs?.modelo ?? null,
    l2csLatencyMs: d.l2cs?.latencyMs,
    l2csStalePct: d.l2cs?.stalePct,
    // O lado EFETIVO do recorte, não a flag: o engine refaz o canvas com a
    // política do provider (WASM → 224²) e a flag continua dizendo 448. Toda
    // medição feita em WASM estava anotada com o crop errado. A fonte é a
    // mesma que entra na chave do perfil de calibração.
    l2csInputSize: d.l2cs?.inputSize ?? getL2csInputSizeEfetivo(),
    filterEffective: d.filtro?.efetivo,
    filterPreset: d.filtro?.preset ?? null,
    fpsRender: d.fpsRender,
    video: d.video ? { width: d.video.width, height: d.video.height } : undefined,
  };
}

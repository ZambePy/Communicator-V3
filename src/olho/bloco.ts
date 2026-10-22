// Bloco de features do ramo ocular — duas dimensões por olho.
//
// A rede ocular devolve (yaw, pitch) do olho no referencial do recorte
// canônico, mais uma confiança. Aqui isso vira o que o Ridge consome: a
// tangente dos dois ângulos, pela mesma razão do bloco L2CS (x_tela ≈ d·tan).
//
// O gate é o mesmo do bloco facial: ângulo implausível ou confiança baixa
// zera o bloco, e o motivo fica registrado. Zerar em vez de descartar mantém
// a dimensão do vetor estável; quem tira o peso da amostra é a S1, lendo
// `ultimoDiagnosticoDoBlocoOcular()` — até 19/10/2026 ela só olhava o bloco do
// rosto, e um bloco ocular zerado entrava com peso cheio.
//
// Só DUAS dimensões, e não quatro (centro da pupila fora): a lição medida em
// `extractor.ts` — "9 alvos não determinam 45 parâmetros" — vale aqui. Com o
// bloco facial (2) + íris (4) + este (2), o vetor fica em 8 dims por olho, que
// é o teto que o relatório do V2 se deu antes de a S8 multiplicar as amostras.

import { isGazePlausible, pesoDoReuso } from '../l2cs/block';

export const BLOCO_OCULAR_DIM = 2;

/** Mesmo limiar do bloco facial, pela mesma razão: abaixo disto a softmax
 *  está difusa e o ângulo é arbitrário. */
export const CONFIANCA_MIN_OCULAR = 0.15;

const CLAMP_RAD = Math.PI / 4;

export interface SaidaDoRamoOcular {
  yaw: number;
  pitch: number;
  /** `1 − H/H_max` da softmax do pior eixo. */
  confianca: number;
  valid: boolean;
  timestamp: number;
}

/** `stale-reuso`: a leitura corrente não valia e o bloco reutilizou o último
 *  ângulo válido daquele olho, com o peso da rampa (ver `pesoDoReuso`). */
export type MotivoDoBlocoOcular = 'stale' | 'implausivel' | 'confianca' | 'stale-reuso' | null;

export interface BlocoOcular {
  valores: number[];
  motivo: MotivoDoBlocoOcular;
}

export type OlhoDoBloco = 'esquerdo' | 'direito';

/** Por que o bloco de cada olho saiu como saiu, e com que força o ângulo entrou. */
export interface DiagnosticoDoBlocoOcular {
  motivo: MotivoDoBlocoOcular;
  /** `1` = leitura válida (ou reuso na janela cheia); `0` = dois zeros. */
  pesoDoAngulo: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── Reuso do último ângulo válido, por olho (relato de 19/10/2026, A4) ────
//
// O bloco ocular zerava no primeiro quadro sem leitura válida — o degrau que o
// bloco do rosto já tinha aprendido a evitar (`l2cs/block.ts`, `REUSO_MAX_MS`):
// depois do StandardScaler, zero não é "sem informação", é um olhar no centro.
// Agora vale a mesma regra de lá: até 600 ms o último ângulo válido do MESMO
// olho é reutilizado, e depois desvanece numa rampa de 200 ms até os zeros de
// sempre. Ângulo implausível não é reutilizado — é lixo, não atraso.
const ultimoValido: Record<OlhoDoBloco, { yaw: number; pitch: number; emMs: number } | null> = {
  esquerdo: null,
  direito: null,
};
const DIAGNOSTICO_INICIAL: DiagnosticoDoBlocoOcular = { motivo: null, pesoDoAngulo: 1 };
let ultimoDiagnostico: Record<OlhoDoBloco, DiagnosticoDoBlocoOcular> = {
  esquerdo: DIAGNOSTICO_INICIAL,
  direito: DIAGNOSTICO_INICIAL,
};

/** Esquece os ângulos guardados (sessão nova: outro rosto, outro posto). */
export function reiniciarReusoDoBlocoOcular(): void {
  ultimoValido.esquerdo = null;
  ultimoValido.direito = null;
  ultimoDiagnostico = { esquerdo: DIAGNOSTICO_INICIAL, direito: DIAGNOSTICO_INICIAL };
}

/**
 * Diagnóstico do último `buildBlocoOcular` de cada olho. Válido para o quadro
 * corrente — é o que a calibração lê para dar o peso da amostra (S1), no mesmo
 * quadro, como faz com `ultimoDiagnosticoDoBloco()` do rosto.
 */
export function ultimoDiagnosticoDoBlocoOcular(): Readonly<Record<OlhoDoBloco, DiagnosticoDoBlocoOcular>> {
  return ultimoDiagnostico;
}

function tangentes(yaw: number, pitch: number): number[] {
  return [Math.tan(clamp(yaw, -CLAMP_RAD, CLAMP_RAD)), Math.tan(clamp(pitch, -CLAMP_RAD, CLAMP_RAD))];
}

/**
 * Bloco ocular de um olho.
 *
 * `olho` e `nowMs` habilitam o reuso; sem eles (testes antigos, gravações) o
 * comportamento é o de antes: zera no primeiro quadro sem leitura válida.
 */
export function buildBlocoOcular(
  saida: SaidaDoRamoOcular | null | undefined,
  olho?: OlhoDoBloco,
  nowMs?: number,
): BlocoOcular {
  const zeros = () => Array.from({ length: BLOCO_OCULAR_DIM }, () => 0);
  const anotar = (d: DiagnosticoDoBlocoOcular) => {
    if (olho) ultimoDiagnostico = { ...ultimoDiagnostico, [olho]: d };
  };
  const reutilizar = (motivo: 'stale' | 'confianca'): BlocoOcular => {
    const guardado = olho ? ultimoValido[olho] : null;
    if (guardado && nowMs !== undefined && Number.isFinite(nowMs)) {
      const idade = nowMs - guardado.emMs;
      const w = idade >= 0 ? pesoDoReuso(idade) : 0;
      if (w > 0) {
        // O ângulo desvanece, não os termos: o bloco continua descrevendo
        // ALGUM olhar (ver `REUSO_DESVANECIMENTO_MS` em `l2cs/block.ts`).
        anotar({ motivo: 'stale-reuso', pesoDoAngulo: w });
        return { valores: tangentes(guardado.yaw * w, guardado.pitch * w), motivo: 'stale-reuso' };
      }
    }
    anotar({ motivo, pesoDoAngulo: 0 });
    return { valores: zeros(), motivo };
  };

  if (!saida || !saida.valid) return reutilizar('stale');
  if (!isGazePlausible(saida.yaw, saida.pitch)) {
    anotar({ motivo: 'implausivel', pesoDoAngulo: 0 });
    return { valores: zeros(), motivo: 'implausivel' };
  }
  if (!(saida.confianca >= CONFIANCA_MIN_OCULAR)) return reutilizar('confianca');
  if (olho && nowMs !== undefined && Number.isFinite(nowMs)) {
    ultimoValido[olho] = { yaw: saida.yaw, pitch: saida.pitch, emMs: nowMs };
  }
  anotar({ motivo: null, pesoDoAngulo: 1 });
  return { valores: tangentes(saida.yaw, saida.pitch), motivo: null };
}

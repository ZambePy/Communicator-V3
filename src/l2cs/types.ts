// Contratos de dados do módulo L2CS.

// Radianos, na convenção registrada em l2cs.meta.json (`signConvention`):
//   yaw   > 0  →  olhar para a DIREITA (imagem não espelhada)
//   pitch > 0  →  olhar para CIMA
// `valid` cai para false quando o último resultado envelheceu além da
// tolerância do cliente; o consumidor degrada em vez de usar dado velho.
//
// `confidence` = min(conf_yaw, conf_pitch), com cada componente `1 - H/H_max`
// da softmax daquele eixo: 0 = distribuição uniforme, 1 = massa num único bin.
export interface L2CSGaze {
  yaw: number;
  pitch: number;
  timestamp: number;
  valid: boolean;
  confidence?: number;
}

/**
 * Ficha de proveniência do modelo — de onde vieram os pesos.
 *
 * É a resposta, em cinco minutos, à pergunta que uma auditoria ou uma
 * due diligence faz: "com que dado este modelo foi treinado, sob que licença,
 * e quem autorizou o uso comercial?". Vai no relatório de precisão e na tela
 * de diagnóstico. O checkpoint Gaze360 empacotado na beta responde
 * `usoComercial: 'proibido'`, e isso é um fato registrado, não um segredo.
 */
export interface ProvenienciaDoModelo {
  /** Bases de treino, com a licença de cada uma. */
  treino: {
    bases: { nome: string; licenca: string; url?: string }[];
    /** Configuração/receita do treino (nome do YAML, commit), quando houver. */
    config?: string | null;
    data?: string | null;
    commit?: string | null;
  };
  usoComercial: 'permitido' | 'proibido' | 'desconhecido';
  /** Contrato que autoriza o uso comercial, quando existir. */
  contrato?: { com: string; data: string; arquivo?: string } | null;
  notas?: string | null;
}

// Metadados do modelo (frontend/public/models/l2cs/l2cs.meta.json).
export interface L2CSModelMeta {
  dataset: string;
  /** Nome do arquivo ONNX (para a ficha; o worker recebe a URL à parte). */
  file?: string;
  outputBins: number;
  binWidth: number;
  binOffset: number;
  /** Espaço dos bins. Ausente → inferido pela cobertura (ver decode.ts). */
  decoding?: 'circular' | 'linear' | null;
  inputSize: number;
  inputTensorName: string;
  outputTensorNames: { yaw: string; pitch: string };
  /** SHA-256 do arquivo ONNX. Ausente → o worker calcula e informa, mas não
   *  tem com que comparar. */
  sha256?: string | null;
  proveniencia?: ProvenienciaDoModelo | null;
}

/** O que o worker apurou sobre o arquivo carregado. */
export interface VerificacaoDoModelo {
  /** SHA-256 calculado do buffer carregado (hex). `null` se a API de digest
   *  não existir no contexto. */
  sha256Calculado: string | null;
  /** `true`/`false` quando a meta declara `sha256`; `null` quando não declara. */
  hashConfere: boolean | null;
}

export type L2CSWorkerRequest =
  /** `ortBaseUrl`: diretório dos artefatos do ORT, resolvido pela PÁGINA. Dentro
   *  do worker `location.href` é a URL do script do worker (em `assets/` no
   *  build, em `/@fs/...` no dev-server), não a da página. */
  | { type: 'init'; modelUrl: string; metaUrl: string; provider: 'auto' | 'webgpu' | 'wasm'; ortBaseUrl?: string }
  /** `dims`: `[altura, largura]` do tensor quando ele NÃO é quadrado (ramo
   *  ocular, 64×96). Ausente, o lado é deduzido do comprimento. */
  | { type: 'infer'; id: number; tensor: Float32Array; dims?: [number, number] };

export type L2CSWorkerResponse =
  /** `executionProvider` é o que ficou ativo; `fallback` marca quando ele
   *  difere do pedido (só possível no modo `auto`). */
  | {
      type: 'ready';
      meta: L2CSModelMeta;
      executionProvider: 'webgpu' | 'wasm';
      requested: string;
      fallback: boolean;
      verificacao: VerificacaoDoModelo;
    }
  | { type: 'init_error'; error: string }
  | { type: 'result'; id: number; yaw: number; pitch: number; confidence: number; inferenceMs: number }
  | { type: 'infer_error'; id: number; error: string };

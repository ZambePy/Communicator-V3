// Catálogo dos modelos do rosto (a rede L2CS que lê o recorte do rosto).
//
// Cada entrada diz onde ficam o ONNX e a meta, quais lados de recorte o ONNX
// aceita e se ele pode ir no instalador. Quem escolhe qual usar é a flag
// `modeloDoRosto` (src/config/experiment.ts): URL `?rosto=gazegene`, console
// `__irisflowExp.set('modeloDoRosto', 'gazegene')` ou a variável de ambiente
// `IRISFLOW_EXP_MODELODOROSTO`. A escolha vale a partir da próxima carga da
// página, como as outras flags.
//
// Para pôr um modelo novo: crie a pasta em frontend/public/models/, ponha o
// ONNX e a meta (mesmo formato de l2cs.meta.json), acrescente a entrada aqui e
// o nome em `VALORES_ACEITOS.modeloDoRosto`. Trocar de modelo invalida o
// perfil de calibração salvo (a chave do perfil leva o modelo): os
// coeficientes do Ridge foram aprendidos sobre os ângulos de UM modelo.

export type ModeloDoRosto = 'gaze360' | 'gazegene';

export type LadoDoRecorte = 224 | 448;

export interface DescricaoDoModeloDoRosto {
  id: ModeloDoRosto;
  /** Nome para a tela de diagnóstico e o relatório. */
  nome: string;
  /** Caminhos relativos à página (ver `urlRelativa` em client.ts). */
  modelo: string;
  meta: string;
  /** Lados de recorte que o ONNX aceita. O primeiro é o usado quando o pedido
   *  (flag `l2csInputSize` ou a política por provider) não é aceito. */
  lados: readonly LadoDoRecorte[];
  /**
   * Pode ir dentro do instalador?
   *
   * `false` = pesos só para pesquisa: ficam fora do git (o *.onnx é ignorado)
   * e fora do pacote do Electron (package.json `build.files`, conferido por
   * scripts/conferir-pacote.mjs). Rodam no `npm run dev`.
   */
  vaiNoInstalador: boolean;
}

export const MODELOS_DO_ROSTO: Readonly<Record<ModeloDoRosto, DescricaoDoModeloDoRosto>> = {
  gaze360: {
    id: 'gaze360',
    nome: 'L2CS-Net (Gaze360, pesos da beta)',
    modelo: 'models/l2cs/l2cs_gaze360.onnx',
    meta: 'models/l2cs/l2cs.meta.json',
    lados: [448, 224],
    // Decisão de 29/09/2026: projeto acadêmico, beta não comercial (README, "Modelos").
    vaiNoInstalador: true,
  },
  gazegene: {
    id: 'gazegene',
    nome: 'L2CS-Net (GazeGene v2, só pesquisa)',
    modelo: 'models/l2cs-gazegene/gazegene_l2cs_r50_v2.onnx',
    meta: 'models/l2cs-gazegene/gazegene_l2cs_r50_v2.meta.json',
    // Exportado com entrada fixa 1×3×224×224: um recorte de 448 quebraria a sessão.
    lados: [224],
    // GazeGene: CC BY-NC-SA 4.0 + termos dos autores. A BUAA pediu para não usar
    // comercialmente sem licença por escrito.
    vaiNoInstalador: false,
  },
};

export const MODELO_DO_ROSTO_PADRAO: ModeloDoRosto = 'gaze360';

/** Pastas (dentro de frontend/public e de frontend/dist) dos modelos que não vão no instalador. */
export const PASTAS_FORA_DO_INSTALADOR: readonly string[] = Object.values(MODELOS_DO_ROSTO)
  .filter((m) => !m.vaiNoInstalador)
  .map((m) => m.modelo.slice(0, m.modelo.lastIndexOf('/') + 1));

export function descricaoDoModelo(id: string | null | undefined): DescricaoDoModeloDoRosto {
  return (id && Object.hasOwn(MODELOS_DO_ROSTO, id))
    ? MODELOS_DO_ROSTO[id as ModeloDoRosto]
    : MODELOS_DO_ROSTO[MODELO_DO_ROSTO_PADRAO];
}

/**
 * O lado de recorte que o modelo vai receber: o pedido, se o ONNX aceita;
 * senão o primeiro lado aceito. Nunca devolve um lado fora da lista do modelo.
 */
export function ladoAceito(lados: readonly LadoDoRecorte[], pedido: number): LadoDoRecorte {
  return (lados as readonly number[]).includes(pedido) ? (pedido as LadoDoRecorte) : lados[0];
}

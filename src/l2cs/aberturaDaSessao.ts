// Escolha do provider da sessão do ONNX Runtime, com o fallback do `auto`.
//
// Puro e fora do worker de propósito, como `conferenciaDoModelo.ts`: o worker
// roda o ONNX Runtime e não é testável no vitest; o que ele decide — qual
// provider tentar, quando cair para o WASM e o que soltar antes — é, e é o que
// precisa de teste.

import { ErroDeCompatibilidade } from './conferenciaDoModelo';

export type ProviderDaSessao = 'webgpu' | 'wasm';

/** O que o worker sabe fazer; esta função só decide a ordem. */
export interface PassosDaAbertura {
  webgpuDisponivel(): Promise<boolean>;
  /**
   * Cria a sessão no provider e roda a inferência de teste. Lança na falha —
   * e a sessão criada antes de a inferência de teste falhar continua aberta,
   * guardada por quem chama, até `liberar`.
   */
  abrir(provider: ProviderDaSessao): Promise<void>;
  /** Solta a sessão aberta, se houver (`release()` do ORT), e a esquece. */
  liberar(): Promise<void>;
  avisar(mensagem: string, erro: unknown): void;
}

/**
 * Abre a sessão no provider pedido; no `auto`, WebGPU com queda para WASM.
 *
 * Revisão do pipeline de 19/10/2026: a sessão WebGPU que SUBIA e falhava na
 * inferência de teste não era liberada — o fallback criava a WASM por cima e a
 * da GPU ficava presa (~95 MB) até o worker morrer. Agora ela sai antes do
 * fallback, e também antes de relançar o erro de compatibilidade.
 */
export async function abrirSessaoComFallback(
  pedido: 'auto' | ProviderDaSessao,
  passos: PassosDaAbertura,
): Promise<{ ativo: ProviderDaSessao; fallback: boolean }> {
  if (pedido !== 'auto') {
    await passos.abrir(pedido);
    return { ativo: pedido, fallback: false };
  }
  if (await passos.webgpuDisponivel()) {
    try {
      await passos.abrir('webgpu');
      return { ativo: 'webgpu', fallback: false };
    } catch (e) {
      await passos.liberar();
      // Meta e modelo que não combinam não melhoram no WASM: falha já, com a
      // mensagem do que não bate, em vez de pagar uma segunda sessão.
      if (e instanceof ErroDeCompatibilidade) throw e;
      passos.avisar('sessão WebGPU falhou, caindo para WASM:', e);
      await passos.abrir('wasm');
      return { ativo: 'wasm', fallback: true };
    }
  }
  await passos.abrir('wasm');
  return { ativo: 'wasm', fallback: true };
}

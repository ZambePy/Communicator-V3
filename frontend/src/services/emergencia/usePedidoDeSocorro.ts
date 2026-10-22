import { useSyncExternalStore } from 'react';
import { ouvirPedido, pedidoAtual, type PedidoDeSocorro } from './pedidoDeSocorro';

/** O pedido de socorro mais recente (inclusive encerrado), para as telas. */
export function usePedidoDeSocorro(): PedidoDeSocorro | null {
  return useSyncExternalStore(ouvirPedido, pedidoAtual, pedidoAtual);
}

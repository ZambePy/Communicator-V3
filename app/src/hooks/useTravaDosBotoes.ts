import { useEffect, useState } from 'react';

/**
 * Por quanto tempo o botão que acabou de nascer no lugar de outro não aceita
 * toque (ver `useTravaDosBotoes`).
 */
export const TRAVA_DO_BOTAO_MS = 1500;

export interface TravaDosBotoes {
  /** "Resolvido" acabou de aparecer no lugar do botão de confirmar. */
  resolver: boolean;
  /** Outro pedido acabou de assumir este lugar: o botão de confirmar dele espera. */
  confirmar: boolean;
}

/**
 * Trava curta do botão que nasce no MESMO lugar de outro, depois de um toque
 * que mudou o rodapé do pedido. Um toque duplo — comum no susto — fazia o
 * segundo toque cair no botão novo:
 *
 *  • "Resolvido" aparece onde estava "Estou indo!" (alerta em tela cheia) ou
 *    "Estou ciente" (lista de Alertas): o socorro ia de confirmado a resolvido
 *    sem ninguém querer (revisão de UX de 19/10/2026, achado 12 — a lista não
 *    tinha a trava que o alerta já tinha);
 *  • outro pedido assume o alerta da tela (o seguinte ainda sem resposta, ou
 *    um mais grave que acabou de chegar — achado 6 da mesma revisão): o
 *    "Estou indo!" dele confirmava um socorro que ninguém tinha lido.
 *
 * Vale para a confirmação feita aqui ou em outro celular (o botão muda de
 * lugar do mesmo jeito). Um pedido que já aparece confirmado não trava.
 */
export function useTravaDosBotoes(id: string, confirmado: boolean): TravaDosBotoes {
  const [visto, setVisto] = useState({ id, confirmado });
  const [trava, setTrava] = useState<{ qual: keyof TravaDosBotoes; ate: number } | null>(null);
  if (visto.id !== id || visto.confirmado !== confirmado) {
    // Ajustado durante a renderização, e não num efeito: a primeira tela em
    // que o botão novo aparece já nasce travada. Com um efeito ele ficava
    // destravado por um quadro — o bastante para o segundo toque.
    const qual: keyof TravaDosBotoes | null = visto.id !== id ? (confirmado ? 'resolver' : 'confirmar') : !visto.confirmado && confirmado ? 'resolver' : null;
    setVisto({ id, confirmado });
    setTrava(qual ? { qual, ate: Date.now() + TRAVA_DO_BOTAO_MS } : null);
  }
  useEffect(() => {
    if (!trava) return;
    const t = setTimeout(() => setTrava(null), Math.max(0, trava.ate - Date.now()));
    return () => clearTimeout(t);
  }, [trava]);
  return { resolver: trava?.qual === 'resolver', confirmar: trava?.qual === 'confirmar' };
}

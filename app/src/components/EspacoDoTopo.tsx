import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { spacing } from '@/theme';

/**
 * Espaço que uma faixa fixa no topo da janela ocupa por cima das telas — hoje,
 * a do alerta minimizado (EmergencyOverlay).
 *
 * Revisão de UX de 19/10/2026 (achado 20): a faixa fica no mesmo topo que
 * `Screen` dá ao conteúdo, então cobria exatamente os botões Voltar/Fechar
 * (e o cabeçalho fixo da Conversa) até alguém confirmar o pedido. Quem desenha
 * a faixa informa a altura dela; as telas descem o conteúdo por essa altura,
 * e a faixa continua visível e tocável.
 */
interface EspacoDoTopo {
  altura: number;
  definirAltura: (altura: number) => void;
}

const EspacoDoTopoContext = createContext<EspacoDoTopo>({ altura: 0, definirAltura: () => undefined });

export function EspacoDoTopoProvider({ children }: { children: React.ReactNode }) {
  const [altura, setAltura] = useState(0);
  const definirAltura = useCallback((a: number) => setAltura(Number.isFinite(a) && a > 0 ? Math.ceil(a) : 0), []);
  const valor = useMemo(() => ({ altura, definirAltura }), [altura, definirAltura]);
  return <EspacoDoTopoContext.Provider value={valor}>{children}</EspacoDoTopoContext.Provider>;
}

/**
 * Quanto o conteúdo de uma tela desce para não ficar embaixo da faixa: a altura
 * dela mais o respiro de sempre (`spacing.sm`). Zero sem faixa.
 */
export function useEspacoDoTopo(): number {
  const { altura } = useContext(EspacoDoTopoContext);
  return altura > 0 ? altura + spacing.sm : 0;
}

/** Para quem desenha a faixa: informa a altura que ela ocupa (0 ao sair). */
export function useDefinirEspacoDoTopo(): (altura: number) => void {
  return useContext(EspacoDoTopoContext).definirAltura;
}

import React from 'react';
import { alvoMinimoPx } from '../../design/gazeMetrics';

interface GazeGridProps {
  columns: number;
  rows: number;
  children: React.ReactNode;
  gap?: number; // em px
}

export const GazeGrid: React.FC<GazeGridProps> = ({
  columns,
  rows,
  children,
  gap = 59 // Equivalente a 1.5° de espaçamento mínimo (GAZE_TOKENS.spacingMinDeg)
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  // fonte única, derivada da geometria real do usuário.
  const cellMinPx = alvoMinimoPx();
  const childCount = React.Children.count(children);

  React.useEffect(() => {
    if (import.meta.env?.DEV) {
      if (childCount > 6) {
        console.warn(`[GazeGrid] Máximo de 6 alvos por tela recomendado para pacientes (solicitado: ${childCount}).`);
      }

      // O espaço real é o do CONTAINER, não o do viewport. Usar
      // `window.innerHeight` ignorava os ~254 px de cabeçalho e padding do
      // `GazePageLayout` e fazia o aviso calar justamente nas telas pequenas,
      // onde ele precisava falar.
      const caixa = ref.current?.getBoundingClientRect();
      const vw = caixa?.width ?? window.innerWidth;
      const vh = caixa?.height ?? window.innerHeight;

      // Estima o espaço disponível por célula
      const cellW = (vw - (columns - 1) * gap) / columns;
      const cellH = (vh - (rows - 1) * gap) / rows;
      if (cellW < cellMinPx || cellH < cellMinPx) {
        console.warn(
          `[GazeGrid] Grade ${columns}x${rows} pode resultar em células abaixo do mínimo recomendado (W: ${Math.round(cellW)}px, H: ${Math.round(cellH)}px < ${cellMinPx}px).`
        );
      }
    }
  }, [columns, rows, gap, childCount]);

  return (
    <div
      ref={ref}
      className="gaze-grid"
      style={{
        display: 'grid',
        // `minmax(0, 1fr)` nas COLUNAS: `1fr` sozinho é `minmax(auto, 1fr)`, e
        // o `auto` é o min-content do cartão — com isso a coluna se recusa a
        // encolher e a grade estoura o container.
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        // As LINHAS têm piso no alvo mínimo de 5° e crescem se houver espaço.
        //
        // Antes era `repeat(rows, 1fr)`, que na prática virava `minmax(auto,
        // 1fr)`: as linhas não encolhiam abaixo do min-content do cartão, a
        // grade ficava maior que a caixa, e o `overflow: hidden` do
        // `GazePageLayout` transformava o excedente em CORTE. Numa Home 3×3 a
        // 1366×768 a terceira linha aparecia pela metade; a 1280×720 sumia.
        //
        // A saída não é encolher: abaixo de 5° o alvo deixa de ser alcançável
        // pelo olhar, que é o único meio de entrada do paciente. A saída é
        // manter o piso e ROLAR o que não couber — e o app já rola pelo olhar.
        gridTemplateRows: `repeat(${rows}, minmax(${cellMinPx}px, 1fr))`,
        gridAutoRows: `minmax(${cellMinPx}px, 1fr)`,
        gap: `${gap}px`,
        width: '100%',
        height: '100%',
        // `minHeight: 0` é o que permite este grid encolher dentro de um pai
        // flex; sem ele o `height: 100%` vira piso e o overflow volta a vazar
        // para fora da caixa em vez de rolar aqui dentro.
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
};

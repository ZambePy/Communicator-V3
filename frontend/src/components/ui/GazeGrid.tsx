import React from 'react';
import { alvoMinimoPx } from '../../design/gazeMetrics';

interface GazeGridProps {
  columns: number;
  rows: number;
  children: React.ReactNode;
  gap?: number; // em px
  /**
   * Só vira contêiner de rolagem quando as linhas, no piso de 5°, NÃO cabem.
   *
   * Contêiner de rolagem recorta tudo o que passa da borda, e a zona de acerto
   * do `GazeButton` passa 12 px de cada cartão de propósito. Na última linha
   * isso bastava para a grade "transbordar" ~10 px sem que faltasse espaço
   * nenhum: aparecia uma barra de rolagem, o olhar ou a roda rolavam esses
   * 10 px, e a primeira linha e o anel de dwell saíam cortados no topo.
   * Com esta opção, quando cabe, a grade não recorta nada; quando não cabe,
   * continua rolando como antes. Opt-in: as outras telas não mudam.
   */
  rolarSoSeNaoCouber?: boolean;
}

export const GazeGrid: React.FC<GazeGridProps> = ({
  columns,
  rows,
  children,
  gap = 59, // Equivalente a 1.5° de espaçamento mínimo (GAZE_TOKENS.spacingMinDeg)
  rolarSoSeNaoCouber = false,
}) => {
  const ref = React.useRef<HTMLDivElement>(null);
  // fonte única, derivada da geometria real do usuário.
  const cellMinPx = alvoMinimoPx();
  const childCount = React.Children.count(children);

  // O piso entra no estado junto com o "cabe": quando a geometria muda (a
  // janela redimensionou e o `SettingsContext` recalculou o token), a grade
  // re-renderiza e as linhas passam a usar o piso novo — o mesmo da decisão.
  const [medida, setMedida] = React.useState({ cabe: false, piso: cellMinPx });
  React.useLayoutEffect(() => {
    if (!rolarSoSeNaoCouber) return;
    const el = ref.current;
    if (!el) return;
    const linhas = Math.max(rows, Math.ceil(childCount / columns));
    const medir = () => {
      const piso = alvoMinimoPx();
      // `clientHeight`, não `getBoundingClientRect()`: a entrada de rota anima
      // um `scale(0.992)`, e a caixa transformada media 463 px numa grade de
      // 467 — a Home de 1366×768 decidia "não cabe" e ficava com a rolagem.
      // 1 px de folga para o arredondamento para inteiro.
      const altura = el.clientHeight;
      const cabe = altura > 0 && linhas * piso + (linhas - 1) * gap <= altura + 1;
      setMedida((m) => (m.cabe === cabe && m.piso === piso ? m : { cabe, piso }));
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rolarSoSeNaoCouber, rows, columns, gap, childCount]);
  const semRolagem = rolarSoSeNaoCouber && medida.cabe;

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
        ...(semRolagem
          ? { overflow: 'visible' as const }
          : { overflowY: 'auto' as const, overflowX: 'hidden' as const }),
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
};

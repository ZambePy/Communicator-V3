import React from 'react';

/**
 * Indicador de estado da sessão de rastreamento, para o cabeçalho.
 *
 * Não sabe nada do engine: lê `html[data-gaze]`, que o `GazeContext` escreve
 * a cada quadro (`utils/feedbackVisual.ts`), e o CSS em `index.css` decide
 * cor e texto. Zero re-render por amostra do olhar — que é o que permite
 * mantê-lo em TODAS as telas do paciente sem custo.
 *
 * Não é alvo (`data-no-dwell`) e não muda de posição: só de cor e de texto.
 */
export const SessaoChip: React.FC = () => (
  <div className="sessao-chip" data-no-dwell="true" data-testid="sessao-chip" aria-live="off">
    <span className="sessao-chip__ponto" aria-hidden="true" />
    <span className="sessao-chip__texto sessao-chip__texto--aguardando">Aguardando câmera</span>
    <span className="sessao-chip__texto sessao-chip__texto--ok">Olhar detectado</span>
    <span className="sessao-chip__texto sessao-chip__texto--perdido">Rosto não encontrado</span>
    <span className="sessao-chip__texto sessao-chip__texto--degradado">Rastreamento impreciso</span>
  </div>
);

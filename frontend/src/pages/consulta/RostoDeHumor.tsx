import React from 'react';

/**
 * Os cinco rostos do humor (21/10/2026). Desenhados em SVG, e não em emoji: o
 * emoji muda de aparência de um Windows para outro e some em fonte sem suporte.
 * Só a boca muda de um rosto para o outro — o traço é o mesmo, para a diferença
 * ser lida no formato e não na cor — e a palavra vem sempre escrita ao lado.
 */
const BOCAS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'M17 48 Q32 28 47 48',
  2: 'M21 46 Q32 38 43 46',
  3: 'M21 43 L43 43',
  4: 'M21 40 Q32 49 43 40',
  5: 'M16 37 Q32 58 48 37',
};

export const RostoDeHumor: React.FC<{ nivel: 1 | 2 | 3 | 4 | 5; tamanho?: string }> = ({ nivel, tamanho = 'clamp(48px, 9vh, 84px)' }) => (
  <svg
    viewBox="0 0 64 64"
    width={tamanho}
    height={tamanho}
    aria-hidden="true"
    focusable="false"
    fill="none"
    stroke="currentColor"
    strokeWidth={3.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="32" cy="32" r="28" />
    <circle cx="23" cy="24" r="2.4" fill="currentColor" stroke="none" />
    <circle cx="41" cy="24" r="2.4" fill="currentColor" stroke="none" />
    <path d={BOCAS[nivel]} />
  </svg>
);

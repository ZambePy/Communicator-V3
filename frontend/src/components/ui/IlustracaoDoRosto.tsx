import React from 'react';

/**
 * Como se posicionar diante da câmera, em SVG inline: a moldura da câmera,
 * a área-guia tracejada no centro e um rosto dentro dela, com a linha dos
 * olhos marcada. Sem imagem, sem animação — é uma referência, não um alvo.
 *
 * `estado` acompanha os checks da câmera: `ok` pinta a guia em teal, o resto
 * deixa neutro. Cor sozinha nunca é a informação (o texto ao lado é), por
 * isso o rosto não muda de forma.
 */
export const IlustracaoDoRosto: React.FC<{
  estado?: 'ok' | 'pendente';
  largura?: number;
  style?: React.CSSProperties;
}> = ({ estado = 'pendente', largura = 260, style }) => {
  const guia = estado === 'ok' ? 'var(--color-teal)' : 'var(--color-primary)';
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={largura}
      height={Math.round(largura * 0.66)}
      viewBox="0 0 260 172"
      style={{ display: 'block', ...style }}
    >
      {/* Moldura da câmera */}
      <rect
        x="4"
        y="4"
        width="252"
        height="164"
        rx="18"
        fill="var(--color-bg-sunken)"
        stroke="var(--color-card-border)"
        strokeWidth="2"
      />
      {/* Cantos de enquadramento */}
      <g stroke={guia} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.9">
        <path d="M78 46 v-14 h14" />
        <path d="M182 32 h14 v14" />
        <path d="M78 126 v14 h14" />
        <path d="M196 126 v14 h-14" />
      </g>
      {/* Área-guia */}
      <rect
        x="86"
        y="40"
        width="102"
        height="92"
        rx="40"
        fill="none"
        stroke={guia}
        strokeWidth="2"
        strokeDasharray="6 7"
        opacity="0.55"
      />
      {/* Rosto */}
      <g fill="var(--color-card-bg)" stroke="var(--color-text-muted)" strokeWidth="2.5">
        <ellipse cx="137" cy="86" rx="34" ry="40" />
      </g>
      {/* Olhos, na linha que a câmera precisa ver */}
      <g fill="var(--color-text-base)">
        <circle cx="124" cy="80" r="4" />
        <circle cx="150" cy="80" r="4" />
      </g>
      <path
        d="M126 104 q11 8 22 0"
        fill="none"
        stroke="var(--color-text-muted)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Ombros */}
      <path
        d="M70 168 q12 -40 67 -40 q55 0 67 40"
        fill="var(--color-card-bg)"
        stroke="var(--color-text-muted)"
        strokeWidth="2.5"
      />
      {/* Linha dos olhos = centro da câmera */}
      <line
        x1="16"
        y1="80"
        x2="66"
        y2="80"
        stroke={guia}
        strokeWidth="2"
        strokeDasharray="3 5"
        opacity="0.7"
      />
      <line
        x1="208"
        y1="80"
        x2="244"
        y2="80"
        stroke={guia}
        strokeWidth="2"
        strokeDasharray="3 5"
        opacity="0.7"
      />
      {/* Câmera */}
      <circle cx="130" cy="14" r="5" fill={guia} />
    </svg>
  );
};

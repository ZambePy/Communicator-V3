import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { GazeButton } from './GazeButton';

interface BackButtonProps {
  to?: string;
}

/**
 * Tamanho do "Voltar" compartilhado por todos os cabeçalhos.
 *
 * Era uma pílula de 180×64 px: larga e baixa, e o olhar tem jitter nos DOIS
 * eixos — uma faixa fina de 64 px é exatamente o formato em que o dwell zera
 * por um tremor vertical. Quadrado de 96 px, com ícone e rótulo empilhados, o
 * alvo tem a mesma tolerância nas duas direções. Os layouts que reservam o
 * espaço do botão quando ele não aparece leem estas constantes.
 */
export const BACK_BUTTON_SIZE_PX = 96;
export const BACK_BUTTON_RADIUS_PX = 16;

export const BackButton: React.FC<BackButtonProps> = ({ to }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <GazeButton
      onClick={() => (to ? navigate(to) : navigate(-1))}
      width={BACK_BUTTON_SIZE_PX}
      height={BACK_BUTTON_SIZE_PX}
      isolado
      style={{
        borderRadius: BACK_BUTTON_RADIUS_PX,
        padding: '0.75rem',
        flexShrink: 0,
      }}
      aria-label={t('common.backAria')}
    >
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.4rem',
          fontSize: '0.95rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          lineHeight: 1,
        }}
      >
        <ArrowLeft size={32} strokeWidth={2.5} aria-hidden="true" />
        {t('common.back')}
      </span>
    </GazeButton>
  );
};

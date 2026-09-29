import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Crosshair, Info } from 'lucide-react';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useGaze } from '../../context/GazeContext';
import { getCalibrationTimestampMs } from '@tracker/calibration';
import { idadeEmTexto } from '../../idadeEmTexto';

/**
 * Atalho para calibrar o olhar, nas Configurações.
 *
 * O cartão do menu diz "Ajustes e calibração", o README lista "o botão manual
 * em Configurações" entre os caminhos para recalibrar, e o teste de precisão
 * daqui responde "Calibre primeiro" — mas a tela não tinha como calibrar. O
 * cuidador procurava, não achava, e voltava ao menu atrás do "Calibrar" miúdo
 * do cabeçalho.
 */
export const AtalhoDeCalibracao: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { calibration } = useGaze();

  const emUso = calibration.isCalibrated();

  return (
    <section
      aria-labelledby="atalho-calibracao-title"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1.5rem',
        borderRadius: '1.25rem',
        background: 'var(--color-card-bg)',
        border: '1px solid var(--color-card-border)',
      }}
    >
      <h2
        id="atalho-calibracao-title"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          margin: 0,
          fontSize: '1.2rem',
          fontWeight: 800,
          color: 'var(--color-text-base)',
        }}
      >
        <Crosshair size={20} color="var(--color-primary)" aria-hidden="true" />
        {t('calib.atalho.title')}
      </h2>

      <p style={{ margin: 0, fontSize: '0.98rem', color: 'var(--color-text-base)', opacity: 0.85 }}>
        {emUso
          ? t('calib.atalho.emUso', { idade: idadeEmTexto(getCalibrationTimestampMs()) })
          : t('calib.atalho.sem')}
      </p>

      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
        <Info size={16} color="var(--color-primary)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 3 }} />
        <span style={{ fontSize: '0.86rem', lineHeight: 1.5, opacity: 0.75, color: 'var(--color-text-base)' }}>
          {t('calib.atalho.why')}
        </span>
      </div>

      <PrimaryButton type="button" onClick={() => navigate('/calibration-check')} style={{ alignSelf: 'flex-start' }}>
        {t('calib.atalho.button')}
      </PrimaryButton>
    </section>
  );
};

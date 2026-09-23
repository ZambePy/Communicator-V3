import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Crosshair, CloudOff, RefreshCw } from 'lucide-react';
import { getCalibrationTimestampMs } from '@tracker/calibration';
import { useLicense } from '../../context/LicenseContext';
import { idadeEmTexto } from '../../idadeEmTexto';

/**
 * Faixa de estado do menu principal.
 *
 * O menu é a tela do **paciente** — é dali que ele fala, escreve e pede ajuda.
 * Encher de informação atrapalha exatamente quem a tela existe para servir.
 * Então só entra o que muda uma decisão do cuidador:
 *
 *  - **quando a calibração foi feita.** Uma de duas semanas atrás explica um
 *    dia ruim de precisão, e nada além da data denuncia isso.
 *  - **se a licença está em tolerância offline.** Vira bloqueio em alguns dias,
 *    e o cuidador precisa saber antes — não no dia em que trava. O
 *    `GraceBanner` já avisa no topo, mas ele some entre telas; aqui fica.
 *
 * Sem `aria-live`: um leitor de tela relendo "calibração de hoje" a cada render
 * competiria com a comunicação, que é o propósito da tela.
 */
export const EstadoDaSessao: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { status, lastVerifiedAt } = useLicense();

  const carimbo = getCalibrationTimestampMs();
  const temCalibracao = carimbo !== null && Number.isFinite(carimbo);

  const dataDaVerificacao =
    lastVerifiedAt !== null && lastVerifiedAt !== undefined
      ? new Date(lastVerifiedAt).toLocaleDateString(i18n.language, {
          day: 'numeric',
          month: 'long',
        })
      : '—';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        // 0,5rem (era 1,5rem): a altura que o botão abaixo ganhou sai daqui,
        // e a faixa inteira continua com os mesmos ~60 px — a grade da Home
        // não perde espaço (ver `responsividade.test`).
        marginBottom: '0.5rem',
        fontSize: '0.9rem',
        fontWeight: 600,
        color: 'var(--color-text-muted)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Crosshair size={15} color="var(--color-primary)" aria-hidden="true" />
        {temCalibracao
          ? t('sessao.calibracao', { idade: idadeEmTexto(carimbo) })
          : t('sessao.semCalibracao')}
      </span>

      {/* Disponível mesmo sem calibração — é justamente o caso em que mais
          importa que o caminho de volta exista. */}
      <button
        type="button"
        onClick={() => navigate('/calibration-check')}
        data-dwell-ms="2500"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          // 52 px, o piso de alvo de olhar do app. Era 36 px (2,25rem): o único
          // caminho para recalibrar a partir da Home era um alvo que o
          // tremor vertical do olhar tirava do lugar antes de o dwell fechar.
          minHeight: 52,
          padding: '0.35rem 1.25rem',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--state-hover-border)',
          background: 'var(--state-active-bg)',
          color: 'var(--color-primary)',
          fontSize: '0.95rem',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        <RefreshCw size={16} aria-hidden="true" />
        {temCalibracao ? t('sessao.recalibrar') : t('sessao.calibrar')}
      </button>

      {status === 'grace' && (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.3rem 0.75rem',
            borderRadius: '999px',
            background: 'var(--tint-warn-bg)',
            border: '1px solid var(--tint-warn-border)',
            color: 'var(--tint-warn-text)',
            fontSize: '0.82rem',
            fontWeight: 600,
          }}
        >
          <CloudOff size={14} aria-hidden="true" />
          {t('sessao.graceCurto', { data: dataDaVerificacao })}
        </span>
      )}
    </div>
  );
};

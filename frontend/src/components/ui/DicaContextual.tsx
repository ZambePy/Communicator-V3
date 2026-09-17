import React from 'react';
import { useTranslation } from 'react-i18next';
import { Lightbulb } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { GazeButton } from './GazeButton';

/**
 * Dica contextual: UMA linha de orientação na primeira entrada em um módulo,
 * com um "Entendi" acionável pelo olhar. Dispensada, não volta — a lista de
 * ids vistos vive em `settings.dicasVistas`.
 *
 * Um componente só, em vez de uma faixa por tela: o texto vem do i18n pela
 * chave `dicas.<id>`, e a regra de "mostrar uma vez" mora aqui.
 */

export type IdDaDica = 'comunicacao' | 'computador' | 'pictogramas' | 'jogos' | 'conversa';

export const DicaContextual: React.FC<{ id: IdDaDica }> = ({ id }) => {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();

  // Defensivo de propósito: configurações antigas no disco chegam sem o
  // campo até a primeira gravação.
  const vistas = settings.dicasVistas ?? [];
  if (vistas.includes(id)) return null;

  const entendi = () => {
    updateSettings({ dicasVistas: [...vistas, id] });
  };

  return (
    <div
      role="note"
      data-testid={`dica-${id}`}
      className="animate-fade-in-up"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.75rem 0.75rem 0.75rem 1.25rem',
        borderRadius: '1.25rem',
        background: 'var(--tint-info-bg)',
        border: '1px solid var(--tint-info-border)',
        marginBottom: '1rem',
      }}
    >
      <Lightbulb
        size={24}
        color="var(--tint-info-text)"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      />
      <p
        style={{
          flex: 1,
          margin: 0,
          fontSize: '1.05rem',
          lineHeight: 1.45,
          color: 'var(--color-text-base)',
        }}
      >
        {t(`dicas.${id}`)}
      </p>
      <GazeButton
        onClick={entendi}
        height={64}
        width={150}
        isolado
        style={{ borderRadius: '1rem', fontSize: '1.05rem', flexShrink: 0 }}
      >
        {t('dicas.entendi')}
      </GazeButton>
    </div>
  );
};

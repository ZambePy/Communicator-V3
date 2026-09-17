import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { supportedLngs, type SupportedLng } from '../../i18n';

interface LanguageSwitcherProps {
  compact?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ compact }) => {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? 'pt-BR') as SupportedLng;

  return (
    <div
      role="group"
      aria-label={t('settings.language.title')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: compact ? '0.35rem 0.5rem' : '0.5rem 0.75rem',
        background: 'var(--color-card-bg)',
        borderRadius: '999px',
        border: '1px solid var(--color-card-border)',
      }}
    >
      <Globe size={compact ? 16 : 18} color="var(--color-text-muted)" aria-hidden="true" />
      {supportedLngs.map((lng) => {
        const active = current === lng;
        return (
          <button
            key={lng}
            type="button"
            onClick={() => i18n.changeLanguage(lng)}
            aria-pressed={active}
            aria-label={t(`settings.language.${lng}`)}
            style={{
              padding: compact ? '0.25rem 0.5rem' : '0.35rem 0.75rem',
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
              background: active ? 'var(--color-primary)' : 'transparent',
              color: active ? 'white' : 'var(--color-text-base)',
              fontWeight: 700,
              fontSize: compact ? '0.75rem' : '0.85rem',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {lng === 'pt-BR' ? 'PT' : 'EN'}
          </button>
        );
      })}
    </div>
  );
};

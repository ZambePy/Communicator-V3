import React from 'react';
import { BackButton } from './BackButton';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  showBack?: boolean;
}

/**
 * Cabeçalho de página fora do `GazePageLayout` (telas do cuidador e o modo
 * Computador). Mesma gramática do cabeçalho canônico: Voltar quadrado à
 * esquerda, título em display, uma linha de apoio abaixo.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  actions,
  showBack = true,
}) => (
  // `reserva-emergencia`: este cabeçalho vai até a borda direita, onde a
  // Emergência (fixa, global) fica. A classe só age quando o botão está lá.
  <header
    className="reserva-emergencia"
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 'var(--space-4)',
      marginBottom: 'var(--space-6)',
      paddingBottom: 'var(--space-4)',
      borderBottom: '1px solid var(--color-card-border)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', minWidth: 0 }}>
      {showBack && <BackButton />}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {icon && (
            <div
              aria-hidden="true"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
          )}
          <h1 className="t-h1" style={{ margin: 0, color: 'var(--color-text-base)' }}>
            {title}
          </h1>
        </div>
        {subtitle && (
          <p
            className="t-body"
            style={{
              margin: '0.35rem 0 0 0',
              color: 'var(--color-text-muted)',
              maxWidth: '70ch',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {actions && <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>{actions}</div>}
  </header>
);

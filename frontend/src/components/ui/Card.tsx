import React from 'react';

interface CardProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  color?: string;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Cartão de ação do cuidador (mouse). Para alvos de olhar use `GazeButton`.
 */
export const Card: React.FC<CardProps> = ({
  icon,
  label,
  sublabel,
  color = 'var(--color-primary)',
  onClick,
  disabled,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="action-card glass-card"
    style={{
      background: 'var(--color-card-bg)',
      border: '1px solid var(--color-card-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-6) var(--space-5)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 'var(--space-4)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 'var(--state-disabled-opacity)' : 1,
      width: '100%',
      position: 'relative',
      color: 'var(--color-text-base)',
      boxShadow: 'var(--shadow-1)',
    }}
  >
    <div
      aria-hidden="true"
      style={{
        width: 64,
        height: 64,
        borderRadius: 'var(--radius-md)',
        background: 'color-mix(in oklab, ' + color + ' 12%, transparent)',
        border: '1px solid color-mix(in oklab, ' + color + ' 28%, transparent)',
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon}
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
      <span className="t-h3" style={{ textAlign: 'center' }}>
        {label}
      </span>
      {sublabel && (
        <span className="t-caption" style={{ textAlign: 'center' }}>
          {sublabel}
        </span>
      )}
    </div>
  </button>
);

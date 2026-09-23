import React from 'react';

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  fullWidth?: boolean;
}

/**
 * Botão do CUIDADOR (mouse e teclado). Não é alvo de olhar: não tem mínimo de
 * 5° nem anel de dwell. O visual mora em `index.css` (`.btn`), com os tokens
 * de estado — hover, foco, ativo e desabilitado — que valem nos dois temas.
 */
export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  variant = 'primary',
  fullWidth,
  className = '',
  children,
  disabled,
  ...rest
}) => {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={`btn btn--${variant} ${fullWidth ? 'btn--full' : ''} ${className}`.trim()}
    >
      {children}
    </button>
  );
};

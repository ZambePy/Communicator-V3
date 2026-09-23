import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, LogOut } from 'lucide-react';
import { BackButton } from './BackButton';
import { hoverAndFocusBackground } from './hoverFocus';
import { useAuth } from '../../context/AuthContext';

interface CaregiverPageLayoutProps {
  children: React.ReactNode;
  title: string;
}

/**
 * Moldura das telas do CUIDADOR (mouse e teclado).
 *
 * Tinha `#0f172a` cravado: o cuidador clicava em "Modo Claro" e a tela onde
 * clicou não mudava de cor. Agora segue os tokens do tema — os dois temas
 * ficam bons aqui, e o seletor volta a descrever o que faz.
 */
export const CaregiverPageLayout: React.FC<CaregiverPageLayoutProps> = ({ children, title }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/menu');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--page-bg)',
        color: 'var(--color-text-base)',
        fontFamily: 'var(--font-body)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Cabeçalho do Cuidador */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: '1rem 2.5rem',
          borderBottom: '1px solid var(--color-card-border)',
          background: 'var(--color-card-bg)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', minWidth: 0 }}>
          <BackButton to="/menu" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
            <span
              className="t-overline"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Lock size={13} color="var(--color-accent)" aria-hidden="true" /> Área do Cuidador
            </span>
            <span
              className="t-h2"
              style={{
                color: 'var(--color-text-base)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="btn btn--secondary"
          style={{ flexShrink: 0 }}
          {...hoverAndFocusBackground('var(--color-card-bg)', 'var(--tint-danger-bg)')}
        >
          <LogOut size={16} aria-hidden="true" /> Encerrar Acesso
        </button>
      </header>

      {/* Área de Conteúdo Principal */}
      <div
        style={{
          flex: 1,
          padding: '2.5rem 2.5rem 4rem 2.5rem',
          maxWidth: '1200px',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </div>
    </div>
  );
};

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon } from 'lucide-react';
import { GazeButton } from '../../components/ui/GazeButton';

export const RestScreen: React.FC = () => {
  const navigate = useNavigate();

  return (
    <main
      role="main"
      aria-labelledby="rest-title"
      className="tela-de-descanso"
      style={{
        width: '100%',
        height: '100vh',
        background: '#020617', // Fundo ultra-escuro (Slate-950) para descanso do olhar
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2.5rem',
        overflow: 'hidden',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          textAlign: 'center',
          maxWidth: '500px',
          animation: 'fadeIn 0.6s ease-out',
        }}
      >
        <div
          style={{
            width: '90px',
            height: '90px',
            borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '2px solid rgba(59, 130, 246, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#3b82f6',
            boxShadow: '0 0 40px rgba(59, 130, 246, 0.1)',
            marginBottom: '1rem',
          }}
        >
          {/* Sem `animate-float`: movimento contínuo ao lado do único alvo da
              tela puxa o olhar para fora dele. */}
          <Moon size={44} aria-hidden="true" />
        </div>

        <h1
          id="rest-title"
          className="t-display"
          style={{ margin: 0, color: '#f1f5f9' }}
        >
          Modo Descanso
        </h1>
        <p
          className="t-body-lg"
          style={{ opacity: 0.7, margin: 0, fontWeight: 500 }}
        >
          O rastreamento ocular de ações foi pausado.
          <br />
          Olhe fixamente para o botão abaixo para acordar.
        </p>
      </div>

      {/* Único alvo da tela: 320×200 fica acima do mínimo nos dois eixos e
          `isolado` estende a zona — não há vizinho para roubar. */}
      <GazeButton
        onClick={() => navigate('/menu')}
        width={320}
        height={200}
        isolado
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: '2px solid rgba(255, 255, 255, 0.14)',
          borderRadius: 'var(--radius-xl)',
          color: '#ffffff',
          boxShadow: 'none',
        }}
        data-dwell-ms={3000} // Tempo absoluto customizado: 3.0s
      >
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.01em' }}>Acordar Tela (3s)</span>
          <span style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.6 }}>Fixe o olhar aqui por 3 segundos</span>
        </span>
      </GazeButton>
    </main>
  );
};

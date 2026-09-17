import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';
import { GazeButton } from '../components/ui/GazeButton';
import { PrimaryButton } from '../components/ui/PrimaryButton';

/**
 * Primeiro sucesso.
 *
 * Vem depois da calibração e do tutorial, na primeira vez: um único cartão em
 * destaque — Comunicação — para a pessoa selecionar pelo olhar. Ao abrir, o
 * módulo mostra uma vez "Você acabou de controlar o IrisFlow usando apenas o
 * olhar." (ver `useAvisoDePrimeiroSucesso`).
 *
 * A saída secundária ("ir para o menu") existe porque nenhuma tela deste
 * produto pode ter uma única porta: se o dwell no cartão não sair hoje, o
 * cuidador ainda leva ao menu com um clique.
 */

export const ESTADO_PRIMEIRO_SUCESSO = { primeiroSucesso: true } as const;

export const WelcomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <main
      role="main"
      aria-labelledby="welcome-title"
      style={{
        minHeight: '100vh',
        background: 'var(--settings-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2.5rem',
        padding: '2rem',
      }}
    >
      <div
        className="animate-fade-in-up"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.6rem',
          textAlign: 'center',
        }}
      >
        <h1
          id="welcome-title"
          style={{
            fontSize: '2.4rem',
            fontWeight: 800,
            margin: 0,
            color: 'var(--color-text-base)',
            lineHeight: 1.15,
          }}
        >
          {t('primeiroSucesso.title')}
        </h1>
        <p style={{ margin: 0, fontSize: '1.35rem', color: 'var(--color-text-muted)' }}>
          {t('primeiroSucesso.lead')}{' '}
          <strong style={{ color: 'var(--color-primary)' }}>{t('primeiroSucesso.alvo')}</strong>
        </p>
      </div>

      <GazeButton
        onClick={() => navigate('/phrases', { replace: true, state: ESTADO_PRIMEIRO_SUCESSO })}
        aria-label={t('primeiroSucesso.alvoAria')}
        width={360}
        height={300}
        isolado
        className="animate-scale-in primeiro-sucesso-alvo"
        style={{
          borderRadius: '1.6rem',
          background: 'var(--color-card-bg)',
          border: '2px solid var(--color-primary)',
          boxShadow: '0 0 0 8px rgba(27, 84, 168, 0.16), 0 16px 40px var(--color-card-shadow)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 96,
              height: 96,
              borderRadius: '50%',
              background: '#ff8a8a',
              color: '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
            }}
          >
            <MessageSquare size={50} />
          </span>
          <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--color-text-base)' }}>
            {t('primeiroSucesso.alvo')}
          </span>
          <span style={{ fontSize: '1.05rem', color: 'var(--color-text-muted)' }}>
            {t('primeiroSucesso.alvoDescricao')}
          </span>
        </div>
      </GazeButton>

      <PrimaryButton
        type="button"
        variant="ghost"
        onClick={() => navigate('/menu', { replace: true })}
        style={{ opacity: 0.8 }}
      >
        {t('primeiroSucesso.menu')}
      </PrimaryButton>
    </main>
  );
};

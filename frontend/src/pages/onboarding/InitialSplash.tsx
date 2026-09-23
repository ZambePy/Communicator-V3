import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye } from 'lucide-react';
import { useLicense } from '../../context/LicenseContext';
import { useAuth } from '../../context/AuthContext';
import { temConsentimentoValido } from '../../services/local/consent';
import { setDevMode } from '../../devMode';
import { haCalibracaoNoDisco } from '@tracker/calibration';
import { destinoDoBoot, INTRO_SEEN_KEY } from './bootDestination';

/**
 * Splash de abertura: verifica a licença e decide para onde ir.
 *
 * Deixou de ser uma tela de marketing com um botão "Vamos começar?" que pulava
 * direto para o tutorial — sem login, sem licença, sem perfil. Agora ela não
 * pede nada: só informa o que está fazendo e sai do caminho.
 *
 * A decisão de destino mora em `bootDestination`, testada isoladamente.
 */

/** Piso de exibição. Sem ele o splash pisca e some, o que lê como falha. */
const TEMPO_MINIMO_MS = 900;

const introFoiVisto = (): boolean => {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
};

export const InitialSplash: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status } = useLicense();
  const { currentProfile } = useAuth();
  const [logoQuebrada, setLogoQuebrada] = useState(false);
  const [pisoCumprido, setPisoCumprido] = useState(false);
  const montadoEm = useRef(Date.now());

  useEffect(() => {
    const restante = Math.max(0, TEMPO_MINIMO_MS - (Date.now() - montadoEm.current));
    const timer = setTimeout(() => setPisoCumprido(true), restante);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!pisoCumprido) return;
    const destino = destinoDoBoot({
      status,
      introVisto: introFoiVisto(),
      temConsentimento: temConsentimentoValido(),
      temPerfil: currentProfile !== null,
      // Lido do disco, não do engine: aqui o `init()` do rastreador pode nem
      // ter rodado, e `isCalibrated()` responderia "não" para quem tem
      // calibração — pulando a conferência na abertura em que ela serve.
      temCalibracao: haCalibracaoNoDisco(),
    });
    if (destino) navigate(destino, { replace: true });
  }, [pisoCumprido, status, currentProfile, navigate]);

  const entrarEmModoDev = () => {
    // Pelo módulo `devMode`, não gravando no sessionStorage à mão: o setter
    // dispara o evento que o `GazeContext` escuta para desligar o cursor de
    // gaze. Gravando direto, o cursor continuava ligado no modo desenvolvedor.
    setDevMode(true);
    navigate('/menu', { replace: true });
  };

  return (
    <main
      role="main"
      aria-labelledby="splash-title"
      style={{
        minHeight: '100vh',
        background: 'var(--page-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2.5rem',
        padding: '2rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        className="animate-fade-in-up"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          zIndex: 10,
        }}
      >
        {!logoQuebrada ? (
          <img
            src="/LOGO.png"
            alt="IrisFlow Communicator"
            style={{
              width: 300,
              height: 'auto',
              filter: 'drop-shadow(0 20px 40px rgba(27,84,168,0.18))',
            }}
            onError={() => setLogoQuebrada(true)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--color-primary)' }}>
            <Eye size={44} aria-hidden="true" />
            <span className="t-display">IrisFlow Communicator</span>
          </div>
        )}

        <h1
          id="splash-title"
          className="sr-only"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}
        >
          IrisFlow Communicator
        </h1>

        <div
          role="status"
          aria-live="polite"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 220,
              height: 4,
              borderRadius: 999,
              background: 'var(--color-card-border)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <div
              className="splash-barra"
              style={{
                position: 'absolute',
                inset: 0,
                width: '40%',
                borderRadius: 999,
                background: 'linear-gradient(90deg, var(--color-primary), var(--color-teal))',
              }}
            />
          </div>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
            {t('onboarding.splash.verifying')}
          </span>
        </div>
      </div>

      {/* Só no build de desenvolvimento: no instalador o atalho pularia
          licença, termo, perfil e calibração (ver `devMode.ts`). */}
      {import.meta.env.DEV && (
        <button
          type="button"
          onClick={entrarEmModoDev}
          style={{
            position: 'absolute',
            bottom: '1.5rem',
            right: '1.5rem',
            background: 'transparent',
            border: '1px solid var(--color-card-border)',
            color: 'var(--color-text-muted)',
            padding: '0.5rem 1.1rem',
            borderRadius: 'var(--radius-pill)',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            opacity: 0.7,
            zIndex: 20,
          }}
        >
          {t('onboarding.splash.devMode')}
        </button>
      )}

      <style>{`@keyframes splashSlide {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(250%); }
      }
      .splash-barra { animation: splashSlide 1.2s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .splash-barra { animation: none; width: 100%; opacity: 0.6; }
      }`}</style>
    </main>
  );
};

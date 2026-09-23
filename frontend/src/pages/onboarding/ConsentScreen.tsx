import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, MonitorSmartphone, Cloud } from 'lucide-react';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ProgressoDoOnboarding } from '../../components/ui/ProgressoDoOnboarding';
import { useLicense } from '../../context/LicenseContext';
import { aceitarConsentimento } from '../../services/local/consent';

/**
 * Termo de privacidade.
 *
 * Vem antes do cadastro do paciente de propósito: pedir nome, idade, condição
 * e foto de alguém com ELA para só então explicar o destino desses dados
 * inverte a ordem que importa.
 *
 * O texto é curto porque um termo longo não é lido — e um termo não lido é uma
 * assinatura sem consentimento.
 */
export const ConsentScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { license } = useLicense();
  const [aceito, setAceito] = useState(false);

  const confirmar = () => {
    if (!aceito) return;
    aceitarConsentimento(license?.account.email ?? '');
    navigate('/profiles', { replace: true });
  };

  return (
    <main
      role="main"
      aria-labelledby="consent-title"
      style={{
        minHeight: '100vh',
        background: 'var(--settings-bg)',
        backgroundImage: 'var(--page-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        padding: '2rem',
      }}
    >
      <ProgressoDoOnboarding atual="privacidade" />
      <div
        className="surface surface--elevated animate-scale-in"
        style={{
          padding: '2.75rem 2.5rem',
          borderRadius: 'var(--radius-xl)',
          width: '100%',
          maxWidth: 620,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.6rem',
            textAlign: 'center',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldCheck size={34} />
          </span>
          <h1 id="consent-title" className="t-h1" style={{ margin: 0, color: 'var(--color-text-base)' }}>
            {t('consent.title')}
          </h1>
          <p className="t-body" style={{ margin: 0, color: 'var(--color-text-muted)', maxWidth: '48ch' }}>
            {t('consent.lead')}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Bloco
            icone={<MonitorSmartphone size={22} color="var(--tint-ok-text)" aria-hidden="true" />}
            cor="var(--tint-ok-text)"
            fundo="var(--tint-ok-bg)"
            borda="var(--tint-ok-border)"
            titulo={t('consent.localTitle')}
            corpo={t('consent.localBody')}
          />
          <Bloco
            icone={<Cloud size={22} color="var(--tint-info-text)" aria-hidden="true" />}
            cor="var(--tint-info-text)"
            fundo="var(--tint-info-bg)"
            borda="var(--tint-info-border)"
            titulo={t('consent.remoteTitle')}
            corpo={t('consent.remoteBody')}
          />
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.85rem',
            padding: '1rem 1.15rem',
            borderRadius: 'var(--radius-md)',
            border: `2px solid ${aceito ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
            background: aceito ? 'var(--tint-info-bg)' : 'transparent',
            cursor: 'pointer',
            transition: 'border-color 0.2s, background 0.2s',
          }}
        >
          <input
            type="checkbox"
            checked={aceito}
            onChange={(e) => setAceito(e.target.checked)}
            style={{
              width: 22,
              height: 22,
              marginTop: 2,
              cursor: 'pointer',
              accentColor: 'var(--color-primary)',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '1rem',
              lineHeight: 1.5,
              color: 'var(--color-text-base)',
              fontWeight: 600,
            }}
          >
            {t('consent.checkbox')}
          </span>
        </label>

        <PrimaryButton
          type="button"
          fullWidth
          disabled={!aceito}
          onClick={confirmar}
          style={{ padding: '1rem', fontSize: '1.05rem' }}
        >
          {t('consent.continue')}
        </PrimaryButton>
      </div>
    </main>
  );
};

const Bloco: React.FC<{
  icone: React.ReactNode;
  cor: string;
  fundo: string;
  borda: string;
  titulo: string;
  corpo: string;
}> = ({ icone, cor, fundo, borda, titulo, corpo }) => (
  <div
    style={{
      display: 'flex',
      gap: '0.9rem',
      padding: '1.1rem 1.25rem',
      borderRadius: 'var(--radius-md)',
      background: fundo,
      border: `1px solid ${borda}`,
    }}
  >
    <div style={{ flexShrink: 0, marginTop: 2 }}>{icone}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <strong style={{ fontSize: '1rem', color: cor, fontWeight: 800 }}>{titulo}</strong>
      <span
        style={{
          fontSize: '0.95rem',
          lineHeight: 1.55,
          color: 'var(--color-text-base)',
          opacity: 0.85,
        }}
      >
        {corpo}
      </span>
    </div>
  </div>
);

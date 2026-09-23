import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, LogIn, AlertCircle, ExternalLink, Wrench } from 'lucide-react';
import { setDevMode } from '../../devMode';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ProgressoDoOnboarding } from '../../components/ui/ProgressoDoOnboarding';
import { useLicense } from '../../context/LicenseContext';
import { MANAGE_URL } from '../../services/license';
import type { LoginFailure } from '../../services/license';
import { cloudConfig } from '../../cloud/config';

/**
 * Login / ativação.
 *
 * Antes esta tela aceitava qualquer e-mail com qualquer senha não-vazia e
 * navegava para o tutorial: o único erro possível era "campo vazio".
 *
 * Agora cada motivo de recusa tem uma saída própria. Mostrar "algo deu errado"
 * nos seis casos deixaria o cuidador sem saber se o problema é a senha, o
 * cartão de crédito ou o Wi-Fi — e essa dúvida é exatamente a ligação de
 * suporte que a tela existe para evitar.
 */

// Endereço do site: `VITE_SITE_URL` do build (o domínio próprio, quando
// existir) ou o site oficial — `cloudConfig.siteUrl`. As rotas são as do site
// (`site/src/routes.ts`). O processo principal libera exatamente esse host
// para abrir no navegador do sistema (`src/electronSecurity.ts`).
const SITE = cloudConfig.siteUrl;
const RECUPERAR_URL = `${SITE}/recuperar-senha`;
const CRIAR_CONTA_URL = `${SITE}/cadastro`;

export const LoginScreen: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { entrar } = useLicense();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroDeCampo, setErroDeCampo] = useState<string | null>(null);
  const [falha, setFalha] = useState<LoginFailure | null>(null);
  const [horaDaTentativa, setHoraDaTentativa] = useState<string | null>(null);
  const [segundosRestantes, setSegundosRestantes] = useState(0);

  // Contagem regressiva do bloqueio por tentativas.
  useEffect(() => {
    if (segundosRestantes <= 0) return;
    const timer = setTimeout(() => setSegundosRestantes((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [segundosRestantes]);

  const bloqueado = segundosRestantes > 0;

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando || bloqueado) return;

    if (!email.trim() || !senha.trim()) {
      setFalha(null);
      setErroDeCampo(t('login.emptyFields'));
      return;
    }

    setErroDeCampo(null);
    setFalha(null);
    setEnviando(true);

    const r = await entrar(email, senha);

    setEnviando(false);
    setHoraDaTentativa(new Date().toLocaleTimeString());

    if (r.ok) {
      navigate('/activated', { replace: true });
      return;
    }

    if (r.reason === 'device-limit') {
      // A tela de ativação sabe apresentar a transferência; ela precisa do
      // `transferToken`, que só existe neste retorno.
      navigate('/activated', { state: { transferencia: r } });
      return;
    }

    if (r.reason === 'rate-limited') setSegundosRestantes(r.retryAfterSeconds);
    setFalha(r);
  };

  const mensagem = erroDeCampo ?? (falha ? t(`login.errors.${falha.reason}`) : null);

  return (
    <main
      role="main"
      aria-labelledby="login-title"
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
      <ProgressoDoOnboarding atual="conta" style={{ maxWidth: 470 }} />
      <div
        className="surface surface--elevated animate-scale-in"
        style={{
          padding: '2.75rem 2.5rem',
          borderRadius: 'var(--radius-xl)',
          width: '100%',
          maxWidth: 470,
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.6rem',
          }}
        >
          <img
            src="/LOGO.png"
            alt=""
            aria-hidden="true"
            style={{ width: 130, height: 'auto' }}
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
          <h1 id="login-title" className="t-h1" style={{ margin: 0, color: 'var(--color-text-base)' }}>
            {t('login.title')}
          </h1>
          <p className="t-body" style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            {t('login.subtitle')}
          </p>
        </div>

        <form
          onSubmit={submeter}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}
        >
          <Campo
            id="login-email"
            rotulo={t('login.email')}
            icone={<Mail color="var(--color-text-faint)" size={19} aria-hidden="true" />}
            tipo="email"
            valor={email}
            aoMudar={setEmail}
            placeholder={t('login.emailPlaceholder')}
            autoComplete="username"
          />
          <Campo
            id="login-password"
            rotulo={t('login.password')}
            icone={<Lock color="var(--color-text-faint)" size={19} aria-hidden="true" />}
            tipo="password"
            valor={senha}
            aoMudar={setSenha}
            placeholder="••••••••"
            autoComplete="current-password"
          />

          {mensagem && (
            <div
              role="alert"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                background: 'var(--tint-danger-bg)',
                border: '1px solid var(--tint-danger-border)',
                padding: '0.9rem 1rem',
                borderRadius: '0.9rem',
                color: 'var(--tint-danger-text)',
                fontSize: '0.92rem',
                lineHeight: 1.45,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'flex-start', gap: '0.55rem' }}>
                <AlertCircle
                  size={18}
                  color="var(--color-danger)"
                  style={{ flexShrink: 0, marginTop: 1 }}
                  aria-hidden="true"
                />
                <span>{mensagem}</span>
              </span>

              {falha?.reason === 'invalid-credentials' && (
                <LinkExterno href={RECUPERAR_URL} rotulo={t('login.forgot')} />
              )}

              {falha?.reason === 'no-subscription' && (
                <LinkExterno
                  href={falha.manageUrl || MANAGE_URL}
                  rotulo={t('login.cta.manage')}
                  mostrarUrl
                />
              )}

              {(falha?.reason === 'offline' || falha?.reason === 'server-down') &&
                horaDaTentativa && (
                  <span style={{ opacity: 0.85, fontSize: '0.85rem' }}>
                    {t('login.lastAttempt', { time: horaDaTentativa })}
                  </span>
                )}
            </div>
          )}

          <PrimaryButton
            type="submit"
            fullWidth
            disabled={enviando || bloqueado}
            aria-busy={enviando}
            style={{ marginTop: '0.25rem', padding: '0.95rem' }}
          >
            {bloqueado
              ? t('login.cta.retryIn', { seconds: segundosRestantes })
              : enviando
                ? t('login.submitting')
                : falha && falha.reason !== 'no-subscription'
                  ? t('login.cta.retry')
                  : t('login.submit')}
            {!enviando && !bloqueado && <LogIn size={19} aria-hidden="true" />}
          </PrimaryButton>
        </form>

        <div
          style={{
            textAlign: 'center',
            borderTop: '1px solid var(--color-card-border)',
            paddingTop: '1.25rem',
          }}
        >
          <LinkExterno href={CRIAR_CONTA_URL} rotulo={t('login.createAccount')} />
        </div>

        {/* Modo Desenvolvedor: o mesmo atalho do splash. Pula licença, termo,
            perfil e calibração e abre o menu para inspecionar o produto com
            mouse — o cursor de olhar e o dwell ficam desligados. É ferramenta
            de quem desenvolve: só existe no build de desenvolvimento, nunca no
            instalador (ver `devMode.ts`). */}
        {import.meta.env.DEV && (
          <button
            type="button"
            onClick={() => {
              setDevMode(true);
              navigate('/menu', { replace: true });
            }}
            aria-label={t('login.devMode')}
            style={{
              alignSelf: 'center',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'transparent',
              border: '1px solid var(--color-card-border)',
              color: 'var(--color-text-base)',
              padding: '0.4rem 0.9rem',
              borderRadius: '999px',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              opacity: 0.55,
            }}
          >
            <Wrench size={14} aria-hidden="true" /> {t('login.devMode')}
          </button>
        )}
      </div>
    </main>
  );
};

/**
 * Link para o site.
 *
 * No app empacotado nenhuma janela nova abre dentro do Electron: o processo
 * principal entrega o `target="_blank"` ao navegador do sistema
 * (`shell.openExternal`) quando o endereço é HTTPS de um host permitido —
 * o site da IrisFlow e o `VITE_SITE_URL` do build (`permitirAberturaExterna`
 * em src/electronSecurity.ts); fora da lista, o clique não faz nada. Com
 * `mostrarUrl`, a URL aparece também como texto selecionável, para quem
 * prefere abrir em outro aparelho.
 */
const LinkExterno: React.FC<{ href: string; rotulo: string; mostrarUrl?: boolean }> = ({
  href,
  rotulo,
  mostrarUrl,
}) => (
  <span style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        color: 'var(--color-primary)',
        fontWeight: 700,
        fontSize: '0.9rem',
      }}
    >
      {rotulo} <ExternalLink size={14} aria-hidden="true" />
    </a>
    {mostrarUrl && (
      <code
        style={{
          fontSize: '0.8rem',
          color: 'var(--color-text-muted)',
          background: 'var(--color-bg-sunken)',
          padding: '0.3rem 0.5rem',
          borderRadius: '0.4rem',
          userSelect: 'all',
          wordBreak: 'break-all',
        }}
      >
        {href}
      </code>
    )}
  </span>
);

const Campo: React.FC<{
  id: string;
  rotulo: string;
  icone: React.ReactNode;
  tipo: string;
  valor: string;
  aoMudar: (v: string) => void;
  placeholder: string;
  autoComplete: string;
}> = ({ id, rotulo, icone, tipo, valor, aoMudar, placeholder, autoComplete }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
    <label
      htmlFor={id}
      style={{ fontSize: '0.9rem', fontWeight: 700, opacity: 0.9, color: 'var(--color-text-base)' }}
    >
      {rotulo}
    </label>
    {/*
      Fundo, borda e raio vivem no PROPRIO input, nao numa div em volta.

      O `index.css` aplica `outline` + `box-shadow` de 6px em
      `input:focus-visible`. Com o visual na div externa e o input transparente
      por dentro, esse anel desenhava em volta do input INTERNO — dentro da
      caixa — e o campo aparecia partido em duas cores. Agora o anel coincide
      com a caixa que a pessoa enxerga.
    */}
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {icone}
      </span>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          background: 'var(--field-bg)',
          border: '1px solid var(--field-border)',
          borderRadius: '0.9rem',
          padding: '0.9rem 0.9rem 0.9rem 2.9rem',
          fontSize: '1rem',
          width: '100%',
          color: 'var(--color-text-base)',
        }}
      />
    </div>
  </div>
);

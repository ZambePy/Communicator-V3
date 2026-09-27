import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, AlertOctagon } from 'lucide-react';
import { useLicense } from '../context/LicenseContext';
import { cloudConfig } from '../cloud/config';

/**
 * O motivo do bloqueio da licença, na tela onde o bloqueio deixa as pessoas:
 * o login.
 *
 * O `LicenseContext` calcula `blockedReason` desde sempre, e nenhuma tela o
 * mostrava. A família que ficou uma semana sem internet via só "Entrar na sua
 * conta" — sem saber que bastava conectar o computador, nem que o botão de
 * Emergência continua tocando o alarme aqui.
 *
 * Painel no canto superior ESQUERDO, fora da coluna do login (centralizada,
 * 470 px) e longe da Emergência (canto direito). Não é alvo de olhar nem de
 * clique (`pointer-events: none`): é leitura.
 *
 * Também devolve a pessoa ao app quando a licença volta a valer: a
 * reverificação periódica do `LicenseContext` pode desbloquear com o paciente
 * parado no login, que não tem Voltar.
 */
export const AvisoDeBloqueio: React.FC = () => {
  const { t } = useTranslation();
  const { status, blockedReason } = useLicense();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const statusAnterior = useRef(status);
  useEffect(() => {
    const antes = statusAnterior.current;
    statusAnterior.current = status;
    if (antes === 'blocked' && (status === 'active' || status === 'grace') && pathname === '/login') {
      // O splash decide o destino (termo, perfil, retomada ou menu).
      navigate('/', { replace: true });
    }
  }, [status, pathname, navigate]);

  if (status !== 'blocked' || pathname !== '/login') return null;

  const motivo = blockedReason ?? 'desconhecido';
  const oQueFazer =
    motivo === 'grace-expired' || motivo === 'expired'
      ? t(`bloqueio.oQueFazer.${motivo}`)
      : t('bloqueio.oQueFazer.padrao');

  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="aviso-de-bloqueio"
      style={{
        position: 'fixed',
        top: 'var(--pagina-margem-topo)',
        left: 'var(--pagina-margem-x)',
        // O que sobra à esquerda da coluna do login, nunca menos de 240 px.
        width: 'max(240px, min(380px, calc((100vw - 470px) / 2 - 2 * var(--pagina-margem-x))))',
        zIndex: 900,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '1.1rem 1.25rem',
        borderRadius: '1.25rem',
        background: 'var(--tint-warn-bg)',
        border: '1px solid var(--tint-warn-border)',
        color: 'var(--color-text-base)',
        fontSize: '0.95rem',
        lineHeight: 1.5,
      }}
    >
      <strong style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--tint-warn-text)' }}>
        <Lock size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
        {t('bloqueio.titulo')}
      </strong>
      <span>{t(`bloqueio.motivo.${motivo}`, { dias: cloudConfig.carenciaOfflineDias })}</span>
      <span style={{ fontWeight: 700 }}>{oQueFazer}</span>
      <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
        <AlertOctagon size={18} color="var(--color-danger)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
        {t('bloqueio.emergencia')}
      </span>
    </aside>
  );
};

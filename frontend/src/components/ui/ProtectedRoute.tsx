import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { EstadoDoPortao } from './destinoDepoisDoPin';
import { useAuth } from '../../context/AuthContext';
import { useLicense } from '../../context/LicenseContext';
import { temConsentimentoValido } from '../../services/local/consent';
import { isDevMode } from '../../devMode';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireCaregiver?: boolean;
}

/**
 * Portão de entrada das rotas internas.
 *
 * A **ordem** das verificações é a parte que importa, e é o que os testes
 * prendem: mandar alguém sem licença direto para `/profiles` faria a pessoa
 * cadastrar um paciente inteiro — nome, idade, foto — para só então descobrir
 * que a assinatura não está ativa.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireCaregiver = false,
}) => {
  const { currentProfile, isCaregiver } = useAuth();
  const { status } = useLicense();
  const location = useLocation();

  // 1. Modo Desenvolvedor: atalho deliberado, mantido a pedido para inspecionar
  //    o produto sem refazer o fluxo. §9 do spec o registra como pendência de
  //    lançamento — ele pula licença, termo e perfil.
  if (isDevMode()) return <>{children}</>;

  // 2. A verificação ainda está em curso. Renderizar `<Navigate to="/login">`
  //    aqui expulsaria para o login todo mundo que tem licença válida, no
  //    intervalo de milissegundos antes da resposta.
  if (status === 'checking') {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--page-bg)',
          color: 'var(--color-text-muted)',
          fontSize: '1.1rem',
          fontWeight: 700,
        }}
      >
        Carregando…
      </div>
    );
  }

  // 3. Sem licença utilizável. `grace` passa: ficar sem comunicação porque a
  //    internet caiu é pior do que uma licença não reverificada.
  if (status === 'none' || status === 'blocked') return <Navigate to="/login" replace />;

  // 4. O termo explica o que acontece com os dados — vem antes de pedi-los.
  if (!temConsentimentoValido()) return <Navigate to="/consent" replace />;

  // 5. Sem paciente escolhido não há calibração nem vocabulário para carregar.
  if (!currentProfile) return <Navigate to="/profiles" replace />;

  // Rotas da área do cuidador com a área fechada: vão para Configurações, que
  // mostra o portão do PIN (o paciente sai dele pelo "Cancelar", ao alcance do
  // olhar). Antes nenhuma rota usava esta guarda, e /conta, /historico,
  // /relatorio, /settings/voice e /caregiver/guide abriam sem PIN. O destino
  // vai junto, para o PIN levar até ele (`useSeguirDepoisDoPin`).
  if (requireCaregiver && !isCaregiver) {
    const estado: EstadoDoPortao = { depoisDoPin: location.pathname + location.search };
    return <Navigate to="/settings" replace state={estado} />;
  }

  return <>{children}</>;
};

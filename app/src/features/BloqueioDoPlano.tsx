import React from 'react';
import { useRouter } from 'expo-router';
import { Card, EmptyState } from '@/components';
import { useApp } from '@/store/AppProvider';

/**
 * O que aparece no lugar de um recurso que o plano (ou o acesso) da conta não
 * inclui — a mesma regra do desktop, pela licença calculada no servidor. Usado
 * pela aba Relatórios e pelo relatório de uma sessão (que o Início abre).
 */
export function BloqueioDoPlano({ recurso = 'Relatórios' }: { recurso?: string }) {
  const router = useRouter();
  const { plan, license } = useApp();
  // Acesso encerrado (beta que terminou, avaliação vencida, assinatura
  // cancelada): dizer isso — "seu plano atual é o Beta" não explicava nada.
  const encerrado = Boolean(license && !license.allowed);
  const titulo = encerrado ? 'O acesso completo da conta terminou' : `${recurso} fazem parte do plano Completo`;
  const corpo = encerrado
    ? license?.reason === 'beta_encerrada'
      ? 'A beta terminou. Escolha um plano para voltar a ver o histórico e os relatórios de sessão.'
      : 'A assinatura não está ativa. Veja os planos para voltar a ver o histórico e os relatórios de sessão.'
    : `Seu plano atual é o ${plan?.name ?? 'Essencial'}. O Completo inclui o histórico de uso e os relatórios de sessão para a família.`;
  return (
    <Card>
      <EmptyState icon="lock-closed-outline" title={titulo} body={corpo} action={{ label: 'Ver planos', icon: 'sparkles-outline', onPress: () => router.push('/assinatura') }} compact />
    </Card>
  );
}

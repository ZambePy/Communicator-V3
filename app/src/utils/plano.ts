import { betaStatus, isBetaPlan, License, Plan, Subscription } from '@/data/types';
import { formatDate } from './format';

/**
 * O selo do plano no rodapé do Início. Na beta, a data e o estado vêm da
 * licença calculada pelo servidor (a mesma do desktop): antes o app mostrava
 * "acesso completo até" uma data já vencida, porque lia só a assinatura.
 */
export function rotuloDoPlano(plan: Pick<Plan, 'id' | 'name'>, subscription: Subscription | null, license: License | null): string {
  const beta = betaStatus(license);
  if (beta === 'encerrada') return 'Beta encerrada · veja os planos';
  if (beta === 'ativa') {
    const ate = license?.access_until ?? license?.next_charge_at ?? null;
    return ate ? `Beta · acesso completo até ${formatDate(ate)}` : 'Beta · acesso completo';
  }
  // Licença ainda não carregada: o que a assinatura diz, sem afirmar data vencida.
  if (isBetaPlan(plan, subscription) && subscription) {
    const vence = Date.parse(subscription.next_charge_at);
    return Number.isFinite(vence) && vence < Date.now() ? 'Beta' : `Beta · acesso completo até ${formatDate(subscription.next_charge_at)}`;
  }
  return `Plano ${plan.name}`;
}

/**
 * A segunda linha da beta em Ajustes → Conta, pela mesma regra: a licença do
 * servidor; sem ela, a assinatura — sem afirmar uma data já vencida.
 */
export function detalheDaBeta(license: License | null, subscription: Subscription | null): string | undefined {
  const estado = betaStatus(license);
  if (estado === 'encerrada') return 'Beta encerrada · veja os planos';
  if (estado === 'ativa') {
    const ate = license?.access_until ?? license?.next_charge_at ?? null;
    return ate ? `Acesso completo até ${formatDate(ate)}` : 'Acesso completo';
  }
  if (!subscription) return undefined;
  const vence = Date.parse(subscription.next_charge_at);
  return Number.isFinite(vence) && vence < Date.now() ? undefined : `Acesso completo até ${formatDate(subscription.next_charge_at)}`;
}

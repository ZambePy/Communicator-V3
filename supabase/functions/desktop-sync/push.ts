// Montagem do push do cuidador (API de push da Expo).
//
// Módulo sem APIs do Deno: é importado pela função e pelos testes
// (`deno test supabase/functions/desktop-sync/`).

export const TITULOS: Record<string, string> = {
  emergencia: '🚨 Pedido de socorro',
  ajuda: 'Pedido de ajuda',
  postura: 'Aviso de postura',
  fadiga: 'Sinal de fadiga',
  recalibracao: 'Recalibração recomendada',
  dispositivo: 'Problema no dispositivo',
};

/** Socorro e pedido de ajuda: exigem que alguém vá até o paciente agora. */
export function exigeAcao(kind: string): boolean {
  return kind === 'emergencia' || kind === 'ajuda';
}

export type MensagemDePush = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  interruptionLevel: 'time-sensitive' | 'active';
  channelId: 'emergencia' | 'default';
  data: { kind: string; beneficiary_id: string };
};

/**
 * Uma mensagem por celular da conta.
 *
 * `interruptionLevel: 'time-sensitive'` no socorro e no pedido de ajuda: no
 * iOS o aviso passa pelo modo Foco e pelo resumo agendado (vale com o
 * entitlement de Time Sensitive no app; sem ele o iOS trata como `active`).
 * No Android quem dá a prioridade é o canal `emergencia`, criado pelo app com
 * importância máxima. É a mesma prioridade do reenvio pelo escalonamento
 * (migração 20260927105153_escalonamento_reenvio).
 */
export function mensagensDePush(
  tokens: string[],
  kind: string,
  nome: string,
  corpo: string,
  beneficiaryId: string,
): MensagemDePush[] {
  const urgente = exigeAcao(kind);
  return tokens.map((to) => ({
    to,
    title: TITULOS[kind] ?? 'IrisFlow',
    body: `${nome}: ${corpo}`.slice(0, 180),
    sound: 'default',
    priority: 'high',
    interruptionLevel: urgente ? 'time-sensitive' : 'active',
    channelId: urgente ? 'emergencia' : 'default',
    data: { kind, beneficiary_id: beneficiaryId },
  }));
}

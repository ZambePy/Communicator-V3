import type { License, Plan, Subscription } from '@/data/types';
import { semOContato } from './contatos';
import { detalheDaBeta, rotuloDoPlano } from './plano';

const beta: Pick<Plan, 'id' | 'name'> = { id: 'beta', name: 'Beta' };
const assinaturaBeta = (next_charge_at: string) => ({ plan_id: 'beta', next_charge_at, status: 'ativa' }) as Subscription;
const licenca = (extra: Partial<License>): License =>
  ({ allowed: true, reason: 'beta', status: 'ativa', plan_id: 'beta', plan_name: 'Beta', trial_ends_at: null, next_charge_at: null, access_until: null, checked_at: '', features: { relatorios: true, multiplos_dispositivos: true, assistente: true, voz: true, lazer: true }, ...extra }) as License;

// APP-11: o selo "Beta · acesso completo até <data>" aparecia com a data já
// vencida — o app lia só a assinatura, não a licença do servidor.
describe('rotuloDoPlano / detalheDaBeta', () => {
  it('beta ativa: a data de acesso da licença do servidor', () => {
    const l = licenca({ access_until: '2027-03-15T00:00:00Z' });
    expect(rotuloDoPlano(beta, assinaturaBeta('2027-03-15T00:00:00Z'), l)).toMatch(/^Beta · acesso completo até \d{2}\/\d{2}\/2027$/);
    expect(detalheDaBeta(l, null)).toMatch(/^Acesso completo até \d{2}\/\d{2}\/2027$/);
  });

  it('beta encerrada pelo servidor: diz que terminou, sem data vencida', () => {
    const l = licenca({ allowed: false, reason: 'beta_encerrada', access_until: '2026-09-01T00:00:00Z' });
    expect(rotuloDoPlano(beta, assinaturaBeta('2026-09-01T00:00:00Z'), l)).toBe('Beta encerrada · veja os planos');
    expect(detalheDaBeta(l, null)).toBe('Beta encerrada · veja os planos');
  });

  it('licença ainda não carregada e data da assinatura vencida: não afirma a data', () => {
    expect(rotuloDoPlano(beta, assinaturaBeta('2026-09-01T00:00:00Z'), null)).toBe('Beta');
    expect(detalheDaBeta(null, assinaturaBeta('2026-09-01T00:00:00Z'))).toBeUndefined();
  });

  it('plano pago: o nome do plano', () => {
    expect(rotuloDoPlano({ id: 'completo', name: 'Completo' }, null, licenca({ plan_id: 'completo', reason: 'ativa' }))).toBe('Plano Completo');
  });
});

describe('semOContato', () => {
  it('tira só um contato igual (nome e telefone), mesmo com a lista reordenada por outro celular', () => {
    const a = { name: 'A', phone: '1' };
    const b = { name: 'B', phone: '2' };
    expect(semOContato([b, a, b], b)).toEqual([a, b]);
    expect(semOContato([a], { name: 'Z', phone: '9' })).toEqual([a]);
  });
});

/**
 * `isSessionLive` decide o que a Home chama de "sessão em andamento" e o que
 * Relatórios soma como uso. `derivePendingAlert` decide se o overlay de
 * socorro aparece ao abrir o app. Os dois são puros; os testes fixam a regra.
 */
import type { Device, HelpRequest, Session } from './types';
import { hasFatigueData, hasPostureData, isSessionLive } from './types';
import { derivePendingAlert } from '@/store/AppProvider';

// `derivePendingAlert` é puro; o mock só evita carregar o cliente Supabase junto com o AppProvider.
jest.mock('@/data/DataContext', () => ({ useData: () => ({}) }));

const AGORA = new Date('2026-09-10T12:00:00Z').getTime();

function device(extra: Partial<Device> = {}): Device {
  return {
    id: 'd1', beneficiary_id: 'b1', name: 'PC', os: 'windows', app_version: '1', last_seen_at: new Date(AGORA - 10_000).toISOString(),
    online: true, camera_ok: true, tracker_ok: true, calibrated: true, revoked_at: null, paired_at: null, hostname: null, ...extra,
  };
}

function session(extra: Partial<Session> = {}): Session {
  return {
    id: 's1', beneficiary_id: 'b1', device_id: 'd1', status: 'active', started_at: new Date(AGORA - 3_600_000).toISOString(), ended_at: null,
    calibration_error_px: null, calibration_error_deg: null, calibration_seconds: null, hit_rate_150px: null,
    posture_drift_px: 0, drift_kind: 'nenhum', blink_rate_bpm: null, fatigue: 'ok', dwell_ms: 1500, filter_preset: 'balanceado',
    utterances: 0, chars_typed: 0, help_requests: 0, modules_used: [], precision_px: null, precision_deg: null, hit_rate_100px: null,
    calibration_at: null, accuracy_report: null, app_version: null, ...extra,
  };
}

describe('isSessionLive', () => {
  it('ao vivo: não encerrada e o computador dela bateu há menos de 90 s', () => {
    expect(isSessionLive(session(), [device()], AGORA)).toBe(true);
  });
  it('órfã: status active mas o computador não bate há mais de 90 s', () => {
    expect(isSessionLive(session(), [device({ last_seen_at: new Date(AGORA - 91_000).toISOString() })], AGORA)).toBe(false);
  });
  it('encerrada, sem computador ou computador revogado: nunca ao vivo', () => {
    expect(isSessionLive(session({ status: 'ended' }), [device()], AGORA)).toBe(false);
    expect(isSessionLive(session({ device_id: 'outro' }), [device()], AGORA)).toBe(false);
    expect(isSessionLive(session(), [device({ revoked_at: 'x' })], AGORA)).toBe(false);
    expect(isSessionLive(null, [device()], AGORA)).toBe(false);
  });
});

describe('derivePendingAlert', () => {
  const h = (id: string, extra: Partial<HelpRequest> = {}): HelpRequest => ({
    id, beneficiary_id: 'b1', session_id: null, kind: 'emergencia', message: '', created_at: new Date(AGORA - 60_000).toISOString(),
    acknowledged_at: null, escalated_at: null, resolved_at: null, ...extra,
  });
  it('escolhe o pedido aberto mais recente ainda sem confirmação', () => {
    const lista = [h('velho', { created_at: new Date(AGORA - 120_000).toISOString() }), h('novo'), h('confirmado', { acknowledged_at: 'x' }), h('resolvido', { resolved_at: 'x' })];
    expect(derivePendingAlert(lista)?.id).toBe('novo');
  });
  it('null quando tudo está confirmado ou resolvido', () => {
    expect(derivePendingAlert([h('a', { acknowledged_at: 'x' }), h('b', { resolved_at: 'x' })])).toBeNull();
    expect(derivePendingAlert([])).toBeNull();
  });
});

describe('postura / fadiga só quando medidas', () => {
  it('defaults do banco (0, nenhum, ok, null) não contam como dado', () => {
    expect(hasPostureData(session())).toBe(false);
    expect(hasFatigueData(session())).toBe(false);
  });
  it('qualquer medida real conta', () => {
    expect(hasPostureData(session({ posture_drift_px: 12 }))).toBe(true);
    expect(hasPostureData(session({ drift_kind: 'lento' }))).toBe(true);
    expect(hasFatigueData(session({ blink_rate_bpm: 14 }))).toBe(true);
    expect(hasFatigueData(session({ fatigue: 'atencao' }))).toBe(true);
  });
});

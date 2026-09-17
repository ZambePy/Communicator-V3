/**
 * Provedor de produção sobre o projeto Supabase da IrisFlow (um banco para site,
 * desktop e este app; esquema em `../supabase/schema.sql`).
 *
 * Tabelas do site: profiles, beneficiaries, subscriptions, plans.
 * Tabelas criadas por `../supabase/migrations/20260904_caregiver_app.sql`:
 * devices, sessions, help_requests, messages, quick_phrases, patient_settings, push_tokens.
 * Da beta (`../supabase/migrations/20260915_beta.sql`): `plans.purchasable`, `beta_registrations`.
 *
 * Toda leitura passa por RLS: o cuidador só enxerga os beneficiários do próprio profile.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import {
  AccuracySummary,
  AuthUser,
  Beneficiary,
  BetaRegistration,
  DataProvider,
  Device,
  HelpRequest,
  Message,
  MessageKind,
  PatientSettings,
  Plan,
  Profile,
  QuickPhrase,
  RealtimeHandlers,
  Session,
  Subscription,
} from './types';

const DEFAULT_SETTINGS: Omit<PatientSettings, 'beneficiary_id' | 'updated_at'> = {
  dwell_ms: 1500,
  filter_preset: 'balanceado',
  keyboard_layout: 'frequencia',
  sensitivity: 5,
  voice: 'pt-BR padrão',
  emergency_timeout_s: 45,
  emergency_contacts: [],
};

export class SupabaseProvider implements DataProvider {
  readonly kind = 'supabase' as const;
  private sb = getSupabase();

  // ---------- auth ----------
  async getUser(): Promise<AuthUser | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  }
  async signIn(email: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.user) throw new Error(traduzErro(error?.message));
    return { id: data.user.id, email: data.user.email ?? '' };
  }
  async signOut() {
    await this.sb.auth.signOut();
  }
  onAuthChange(cb: (u: AuthUser | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      cb(u ? { id: u.id, email: u.email ?? '' } : null);
    });
    return () => data.subscription.unsubscribe();
  }
  async requestPasswordReset(email: string) {
    // Sem `redirectTo`: o destino do link (o `/nova-senha` do site) é a "Site URL"
    // configurada no painel do Supabase (Authentication → URL Configuration).
    // Manter isso fora do app evita um build por ambiente e uma URL divergente da do site.
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim().toLowerCase());
    if (!error) return;
    // O Supabase já responde 200 para e-mail desconhecido, justamente para não
    // revelar quem tem conta. Se alguma configuração fizer o erro vazar mesmo
    // assim, ele é silenciado aqui: a tela mostra a mesma mensagem neutra nos
    // dois casos, e este é o único lugar em que a distinção poderia escapar.
    if (/not found|não encontrado/i.test(error.message)) return;
    throw new Error(traduzErroReset(error.message));
  }

  // ---------- conta ----------
  async getProfile(): Promise<Profile> {
    const { data, error } = await this.sb.from('profiles').select('id, buyer_name, email, phone').single();
    if (error) throw error;
    return data as Profile;
  }
  async listBeneficiaries(): Promise<Beneficiary[]> {
    const { data, error } = await this.sb
      .from('beneficiaries')
      .select('id, profile_id, user_name, relation, condition, os, prescriber_name, prescriber_role')
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as Beneficiary[];
  }
  async getSubscription() {
    const { data, error } = await this.sb
      .from('subscriptions')
      .select('id, plan_id, status, price_brl, trial_ends_at, next_charge_at, plans(id, name, price_brl, trial_days, purchasable)')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { plans, ...subscription } = data as unknown as Subscription & { plans: Plan };
    return { subscription, plan: plans };
  }
  async getBetaRegistration(): Promise<BetaRegistration | null> {
    // RLS: `beta_registrations_select_own` — só a linha do próprio profile.
    const { data, error } = await this.sb
      .from('beta_registrations')
      .select('wants_caregiver_app, feedback_consent, downloaded_at, registered_at')
      .maybeSingle();
    if (error) throw error;
    return data ? (data as BetaRegistration) : null;
  }

  // ---------- dispositivo e sessão ----------
  async listDevices(beneficiaryId: string): Promise<Device[]> {
    const { data, error } = await this.sb
      .from('devices')
      .select('*')
      .eq('beneficiary_id', beneficiaryId)
      .order('paired_at', { ascending: false });
    if (error) throw error;
    // Ativos primeiro; revogados ficam no fim como histórico.
    return (data ?? []).map(mapDevice).sort((a, b) => Number(Boolean(a.revoked_at)) - Number(Boolean(b.revoked_at)));
  }
  async revokeDevice(deviceId: string) {
    const { error } = await this.sb.rpc('revoke_device', { p_device_id: deviceId });
    if (error) throw error;
  }
  async getCurrentSession(beneficiaryId: string) {
    const { data, error } = await this.sb
      .from('sessions')
      .select('*')
      .eq('beneficiary_id', beneficiaryId)
      .neq('status', 'ended')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? mapSession(data) : null;
  }
  async listSessions(beneficiaryId: string, limit = 30) {
    const { data, error } = await this.sb
      .from('sessions')
      .select('*')
      .eq('beneficiary_id', beneficiaryId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapSession);
  }
  async getSession(sessionId: string) {
    const { data, error } = await this.sb.from('sessions').select('*').eq('id', sessionId).maybeSingle();
    if (error) throw error;
    return data ? mapSession(data) : null;
  }

  // ---------- alertas ----------
  async listHelpRequests(beneficiaryId: string): Promise<HelpRequest[]> {
    const { data, error } = await this.sb
      .from('help_requests')
      .select('*')
      .eq('beneficiary_id', beneficiaryId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as HelpRequest[];
  }
  async acknowledgeHelpRequest(id: string) {
    const { error } = await this.sb
      .from('help_requests')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', id)
      .is('acknowledged_at', null);
    if (error) throw error;
  }
  async resolveHelpRequest(id: string) {
    const now = new Date().toISOString();
    const { error } = await this.sb.from('help_requests').update({ resolved_at: now }).eq('id', id);
    if (error) throw error;
    // Segundo UPDATE (reconhecimento implícito): o erro sobe igual ao do primeiro.
    // Engolir aqui fazia a tela dizer "resolvido" mesmo sem nada ter gravado.
    await this.acknowledgeHelpRequest(id);
  }

  // ---------- conversa ----------
  async listMessages(beneficiaryId: string): Promise<Message[]> {
    const { data, error } = await this.sb
      .from('messages')
      .select('*')
      .eq('beneficiary_id', beneficiaryId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as Message[];
  }
  async sendMessage(beneficiaryId: string, text: string, kind: MessageKind = 'texto'): Promise<Message> {
    const { data, error } = await this.sb
      .from('messages')
      .insert({ beneficiary_id: beneficiaryId, sender: 'cuidador', kind, text })
      .select('*')
      .single();
    if (error) throw error;
    return data as Message;
  }
  async markMessagesRead(beneficiaryId: string) {
    await this.sb
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('beneficiary_id', beneficiaryId)
      .eq('sender', 'paciente')
      .is('read_at', null);
  }

  // ---------- frases rápidas ----------
  async listQuickPhrases(beneficiaryId: string): Promise<QuickPhrase[]> {
    const { data, error } = await this.sb
      .from('quick_phrases')
      .select('*')
      .eq('beneficiary_id', beneficiaryId)
      .order('position');
    if (error) throw error;
    return (data ?? []) as QuickPhrase[];
  }
  async saveQuickPhrase(p: Omit<QuickPhrase, 'id'> & { id?: string }): Promise<QuickPhrase> {
    const { data, error } = await this.sb.from('quick_phrases').upsert(p).select('*').single();
    if (error) throw error;
    return data as QuickPhrase;
  }
  async deleteQuickPhrase(id: string) {
    const { error } = await this.sb.from('quick_phrases').delete().eq('id', id);
    if (error) throw error;
  }

  // ---------- ajustes remotos ----------
  async getSettings(beneficiaryId: string): Promise<PatientSettings> {
    const { data, error } = await this.sb.from('patient_settings').select('*').eq('beneficiary_id', beneficiaryId).maybeSingle();
    if (error) throw error;
    if (data) return data as PatientSettings;
    return { beneficiary_id: beneficiaryId, updated_at: new Date().toISOString(), ...DEFAULT_SETTINGS };
  }
  /**
   * Cria a linha de ajustes se ela ainda não existir, com o que a tela mostra hoje
   * (o mesmo que `getSettings` devolve: a linha salva ou os padrões).
   *
   * Motivo: o `voice.status` da Edge Function faz UPDATE, não upsert — sem linha ele
   * devolve `stored: false` e o rótulo da voz em uso no computador se perde. Chamado na
   * primeira abertura dos Ajustes, para que o rótulo passe a ser gravado desde então.
   */
  async ensureSettings(beneficiaryId: string, current?: Partial<PatientSettings>): Promise<PatientSettings> {
    const { data, error } = await this.sb.from('patient_settings').select('*').eq('beneficiary_id', beneficiaryId).maybeSingle();
    if (error) throw error;
    if (data) return data as PatientSettings;
    const row: PatientSettings = {
      ...DEFAULT_SETTINGS,
      ...current,
      beneficiary_id: beneficiaryId,
      updated_at: new Date().toISOString(),
    };
    const { data: created, error: upsertError } = await this.sb.from('patient_settings').upsert(row).select('*').single();
    if (upsertError) throw upsertError;
    return created as PatientSettings;
  }
  async updateSettings(beneficiaryId: string, patch: Partial<PatientSettings>): Promise<PatientSettings> {
    const current = await this.getSettings(beneficiaryId);
    const next = { ...current, ...patch, beneficiary_id: beneficiaryId, updated_at: new Date().toISOString() };
    const { data, error } = await this.sb.from('patient_settings').upsert(next).select('*').single();
    if (error) throw error;
    return data as PatientSettings;
  }

  // ---------- tempo real ----------
  subscribe(beneficiaryId: string, handlers: RealtimeHandlers) {
    const filter = `beneficiary_id=eq.${beneficiaryId}`;
    const channel: RealtimeChannel = this.sb
      .channel(`caregiver:${beneficiaryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter }, (p) => {
        if (p.new && 'id' in p.new) handlers.onMessage?.(p.new as Message);
      })
      // '*' e não só INSERT: o escalonamento é um UPDATE feito pelo servidor
      // (`escalated_at`), e o reconhecimento feito em outro celular também.
      // A tabela está na publicação `supabase_realtime` com REPLICA IDENTITY FULL
      // (migração 20260904), então `p.new` traz a linha inteira nos dois eventos.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests', filter }, (p) => {
        if (p.new && 'id' in p.new) handlers.onHelpRequest?.(p.new as HelpRequest);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter }, (p) => {
        if (p.new && 'id' in p.new) handlers.onSession?.(mapSession(p.new));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter }, (p) => {
        if (p.new && 'id' in p.new) handlers.onDevice?.(mapDevice(p.new));
      })
      .subscribe();
    return () => {
      this.sb.removeChannel(channel);
    };
  }

  async registerPushToken(token: string) {
    const user = await this.getUser();
    if (!user) return;
    await this.sb.from('push_tokens').upsert({ profile_id: user.id, token, platform: 'expo' }, { onConflict: 'token' });
  }
}

// ---------- mapeadores ----------
// Exportados para os testes unitários (supabaseProvider.test.ts); o app usa só a classe.
export type Row = Record<string, unknown>;

export function mapDevice(r: Row): Device {
  const lastSeen = String(r.last_seen_at ?? new Date(0).toISOString());
  const revoked = (r.revoked_at as string | null) ?? null;
  // heartbeat de 30 s no desktop; um computador revogado nunca conta como online
  const online = !revoked && Date.now() - new Date(lastSeen).getTime() < 90_000;
  return {
    id: String(r.id),
    beneficiary_id: String(r.beneficiary_id),
    name: String(r.name ?? 'Computador'),
    os: (r.os as Device['os']) ?? 'windows',
    app_version: String(r.app_version ?? ''),
    last_seen_at: lastSeen,
    online,
    camera_ok: Boolean(r.camera_ok),
    tracker_ok: Boolean(r.tracker_ok),
    calibrated: Boolean(r.calibrated),
    revoked_at: revoked,
    paired_at: (r.paired_at as string | null) ?? null,
    hostname: (r.hostname as string | null) ?? null,
  };
}

export function mapSession(r: Row): Session {
  return {
    id: String(r.id),
    beneficiary_id: String(r.beneficiary_id),
    device_id: String(r.device_id ?? ''),
    status: (r.status as Session['status']) ?? 'ended',
    started_at: String(r.started_at),
    ended_at: (r.ended_at as string | null) ?? null,
    calibration_error_px: numOrNull(r.calibration_error_px),
    calibration_error_deg: numOrNull(r.calibration_error_deg),
    calibration_seconds: numOrNull(r.calibration_seconds),
    hit_rate_150px: numOrNull(r.hit_rate_150px),
    posture_drift_px: Number(r.posture_drift_px ?? 0),
    drift_kind: (r.drift_kind as Session['drift_kind']) ?? 'nenhum',
    blink_rate_bpm: numOrNull(r.blink_rate_bpm),
    fatigue: (r.fatigue as Session['fatigue']) ?? 'ok',
    dwell_ms: (Number(r.dwell_ms ?? 1500) as Session['dwell_ms']) ?? 1500,
    filter_preset: (r.filter_preset as Session['filter_preset']) ?? 'balanceado',
    utterances: Number(r.utterances ?? 0),
    chars_typed: Number(r.chars_typed ?? 0),
    help_requests: Number(r.help_requests ?? 0),
    modules_used: Array.isArray(r.modules_used) ? (r.modules_used as string[]) : [],
    precision_px: numOrNull(r.precision_px),
    precision_deg: numOrNull(r.precision_deg),
    hit_rate_100px: numOrNull(r.hit_rate_100px),
    calibration_at: (r.calibration_at as string | null) ?? null,
    accuracy_report: r.accuracy_report && typeof r.accuracy_report === 'object' ? (r.accuracy_report as AccuracySummary) : null,
    app_version: (r.app_version as string | null) ?? null,
  };
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function traduzErro(msg?: string) {
  if (!msg) return 'Não foi possível entrar. Tente novamente.';
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.';
  if (/network/i.test(msg)) return 'Sem conexão. Verifique sua internet.';
  return msg;
}

/** Só as falhas que de fato acontecem no `resetPasswordForEmail`: limite de envio, rede, e-mail malformado. */
function traduzErroReset(msg?: string) {
  if (!msg) return 'Não foi possível pedir o link agora. Tente novamente.';
  if (/rate limit|too many/i.test(msg)) return 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.';
  if (/invalid|unable to validate/i.test(msg)) return 'Confira o e-mail digitado.';
  if (/network/i.test(msg)) return 'Sem conexão. Verifique sua internet.';
  return msg;
}

/**
 * Modelo de domínio do app do cuidador.
 *
 * As entidades Profile, Beneficiary, Subscription e Plan espelham o schema do site
 * (`../supabase/migrations/20260923022346_schema_base.sql`: public.profiles, public.beneficiaries, public.subscriptions,
 * public.plans). As demais entidades são criadas por `../supabase/migrations/`.
 */

export type Relation = 'conjuge' | 'filho' | 'pai-mae' | 'irmao' | 'cuidador' | 'proprio' | 'outro';
export type Condition = 'ela' | 'tetraplegia' | 'pc' | 'avc' | 'distrofia' | 'outra' | 'prefiro-nao';
export type DesktopOS = 'windows' | 'macos' | 'linux' | 'nao-sei';
export type SubscriptionStatus = 'avaliacao' | 'ativa' | 'cancelada' | 'inadimplente' | 'encerrada';
/**
 * `beta` é o plano do programa beta fechado (README da raiz, seção "Conta IrisFlow e nuvem"): R$ 0, sem cobrança,
 * assinatura 'ativa' com `next_charge_at` = fim da beta ("acesso até").
 */
export type PlanId = 'essencial' | 'completo' | 'voz' | 'beta' | string;

/** Identifica o plano beta a partir do que `getSubscription()` devolve. */
export function isBetaPlan(plan: Pick<Plan, 'id'> | null | undefined, subscription?: Pick<Subscription, 'plan_id'> | null): boolean {
  return plan?.id === 'beta' || subscription?.plan_id === 'beta';
}

export interface Profile {
  id: string;
  buyer_name: string;
  email: string;
  phone: string | null;
}

export interface Beneficiary {
  id: string;
  profile_id: string;
  user_name: string;
  relation: Relation;
  condition: Condition;
  os: DesktopOS;
  prescriber_name: string | null;
  prescriber_role: string | null;
}

export interface Plan {
  id: PlanId;
  name: string;
  price_brl: number;
  trial_days: number;
  /** false = não pode ser contratado (todos durante a beta). Coluna da migração 20260923022616_beta. */
  purchasable?: boolean;
}

export interface Subscription {
  id: string;
  plan_id: PlanId;
  status: SubscriptionStatus;
  price_brl: number;
  trial_ends_at: string;
  next_charge_at: string;
}

/**
 * Inscrição no programa beta (`beta_registrations`, select próprio). Só existe para
 * contas criadas pela página /beta do site; contas antigas com plano pago não têm.
 */
export interface BetaRegistration {
  wants_caregiver_app: boolean;
  feedback_consent: boolean;
  downloaded_at: string | null;
  registered_at: string;
}

export interface Device {
  id: string;
  beneficiary_id: string;
  name: string;
  os: 'windows' | 'macos' | 'linux';
  app_version: string;
  last_seen_at: string;
  online: boolean;
  camera_ok: boolean;
  tracker_ok: boolean;
  calibrated: boolean;
  /** Quando o cuidador desvinculou o computador (site ou app). Null = ativo. */
  revoked_at: string | null;
  paired_at: string | null;
  hostname: string | null;
}

/**
 * Resumo do teste de precisão que o desktop grava em `sessions.accuracy_report`.
 * Só agregados (nunca amostras). Espelha `resumoDoRelatorio()` no desktop
 * (`../frontend/src/cloud/sessao.ts`) — se um lado mudar, mude o outro.
 */
export interface AccuracySummary {
  meanErrorPx: number | null;
  meanErrorDeg: number | null;
  medianErrorPx: number | null;
  p90ErrorPx: number | null;
  precisionPx: number | null;
  precisionDeg: number | null;
  hitRate100: number | null;
  hitRate150: number | null;
  minTargetPx: number | null;
  minTargetDeg: number | null;
  measuredDistanceCm: number | null;
  pointsMeasured: number;
  pointsTotal: number;
  score: string;
  conditions: { lighting?: string; glasses?: boolean; headMovement?: string; screenInches?: number; distanceCm?: number } | null;
}

export type SessionStatus = 'calibrating' | 'active' | 'paused' | 'ended';
export type FilterPreset = 'estavel' | 'balanceado' | 'responsivo';
export type DwellMs = 800 | 1500 | 2500;
export type KeyboardLayout = 'frequencia' | 'alfabetico' | 'qwerty';
export type FatigueLevel = 'ok' | 'atencao' | 'alta';
export type DriftKind = 'nenhum' | 'lento' | 'erratico';

export interface Session {
  id: string;
  beneficiary_id: string;
  device_id: string;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  calibration_error_px: number | null;
  calibration_error_deg: number | null;
  calibration_seconds: number | null;
  hit_rate_150px: number | null; // 0..1
  posture_drift_px: number;
  drift_kind: DriftKind;
  blink_rate_bpm: number | null;
  fatigue: FatigueLevel;
  dwell_ms: DwellMs;
  filter_preset: FilterPreset;
  utterances: number; // frases vocalizadas
  chars_typed: number;
  help_requests: number;
  modules_used: string[];
  // Preenchidos pelo desktop ao fim do teste de precisão (migração 20260923022507_integracao_ecossistema).
  precision_px: number | null;
  precision_deg: number | null;
  hit_rate_100px: number | null;
  calibration_at: string | null;
  accuracy_report: AccuracySummary | null;
  app_version: string | null;
}

export type HelpKind = 'ajuda' | 'emergencia' | 'postura' | 'fadiga' | 'recalibracao' | 'dispositivo';

export interface HelpRequest {
  id: string;
  beneficiary_id: string;
  session_id: string | null;
  kind: HelpKind;
  message: string;
  /**
   * Quando o paciente pediu. Um pedido que esperou na fila offline do desktop
   * chega depois com o horário real: a Edge Function desconta da hora do
   * servidor o atraso medido no computador (até 24 h), o que também anula um
   * relógio errado no PC.
   */
  created_at: string;
  /**
   * Quando o servidor recebeu o pedido. É daqui que conta o prazo de
   * escalonamento — um pedido atrasado não é escalado no mesmo minuto em que
   * chega. Ausente nos bancos sem a coluna: aí vale `created_at`.
   */
  received_at?: string | null;
  acknowledged_at: string | null;
  /**
   * Gravado pelo SERVIDOR (função agendada no Supabase, roda a cada minuto): para
   * `emergencia`/`ajuda` sem reconhecimento nem resolução, quando
   * `received_at + patient_settings.emergency_timeout_s` (padrão 45 s) já passou,
   * ele grava `escalated_at = now()`, insere uma mensagem de sistema na conversa
   * e reenvia o push para TODOS os celulares do cuidador.
   *
   * Preenchido = "o prazo passou e o servidor notificou de novo". NÃO significa que
   * um contato humano foi telefonado — ligar continua sendo ação do cuidador no app.
   */
  escalated_at: string | null;
  resolved_at: string | null;
}

export type MessageSender = 'paciente' | 'cuidador';
export type MessageKind = 'texto' | 'frase' | 'pictograma' | 'simnao' | 'sistema';

export interface Message {
  id: string;
  beneficiary_id: string;
  sender: MessageSender;
  kind: MessageKind;
  text: string;
  created_at: string;
  read_at: string | null;
  spoken: boolean; // vocalizado na tela do paciente
}

export interface QuickPhrase {
  id: string;
  beneficiary_id: string;
  text: string;
  category: 'necessidades' | 'conforto' | 'social' | 'saude' | 'outra';
  position: number;
}

export interface EmergencyContact {
  name: string;
  phone: string;
}

/**
 * Ajuste remoto. Os campos de rastreamento são `| null` de propósito: "não
 * definido pelo cuidador" (o computador segue com o valor local) é diferente
 * de "1500 ms". Hoje o banco ainda preenche defaults NOT NULL; a migração
 * proposta no relatório torna essas colunas nulas por padrão.
 */
export interface PatientSettings {
  beneficiary_id: string;
  dwell_ms: DwellMs | null;
  filter_preset: FilterPreset | null;
  keyboard_layout: KeyboardLayout | null;
  sensitivity: number | null; // 1..10
  voice: string;
  emergency_timeout_s: number;
  emergency_contacts: EmergencyContact[];
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface RealtimeHandlers {
  onMessage?: (m: Message) => void;
  onHelpRequest?: (h: HelpRequest) => void;
  onSession?: (s: Session) => void;
  onDevice?: (d: Device) => void;
}

/**
 * Contrato único da camada de dados, implementado por SupabaseProvider. Os testes
 * substituem o cliente Supabase (ou este contrato inteiro) por falsos locais ao teste.
 */
export interface DataProvider {
  // auth
  getUser(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  onAuthChange(cb: (u: AuthUser | null) => void): () => void;
  /**
   * Pede ao Supabase o e-mail de redefinição de senha. Resolve SEM dizer se a
   * conta existe (a tela mostra uma mensagem neutra) e rejeita só por falhas
   * reais — rede, limite de envios. A senha nova é definida no site (`/nova-senha`),
   * para onde o link do e-mail aponta; a URL é configurada no painel do Supabase.
   */
  requestPasswordReset(email: string): Promise<void>;

  // conta
  getProfile(): Promise<Profile>;
  listBeneficiaries(): Promise<Beneficiary[]>;
  getSubscription(): Promise<{ subscription: Subscription; plan: Plan } | null>;
  /** Inscrição na beta da conta logada; null para contas fora do programa (plano pago antigo). */
  getBetaRegistration(): Promise<BetaRegistration | null>;

  // dispositivo e sessão
  listDevices(beneficiaryId: string): Promise<Device[]>;
  /** Desvincula um computador: a chave dele deixa de valer na Edge Function. */
  revokeDevice(deviceId: string): Promise<void>;
  getCurrentSession(beneficiaryId: string): Promise<Session | null>;
  listSessions(beneficiaryId: string, limit?: number): Promise<Session[]>;
  getSession(sessionId: string): Promise<Session | null>;

  // alertas
  listHelpRequests(beneficiaryId: string): Promise<HelpRequest[]>;
  acknowledgeHelpRequest(id: string): Promise<void>;
  resolveHelpRequest(id: string): Promise<void>;

  // conversa
  listMessages(beneficiaryId: string): Promise<Message[]>;
  sendMessage(beneficiaryId: string, text: string, kind?: MessageKind): Promise<Message>;
  markMessagesRead(beneficiaryId: string): Promise<void>;

  // frases rápidas (exibidas na tela do paciente)
  listQuickPhrases(beneficiaryId: string): Promise<QuickPhrase[]>;
  saveQuickPhrase(p: Omit<QuickPhrase, 'id'> & { id?: string }): Promise<QuickPhrase>;
  deleteQuickPhrase(id: string): Promise<void>;

  // ajuste remoto de parâmetros
  /** `null` enquanto o cuidador nunca salvou um ajuste (sem linha em `patient_settings`). */
  getSettings(beneficiaryId: string): Promise<PatientSettings | null>;
  /** Upsert parcial: só os campos do `patch` são gravados; a linha nasce na primeira gravação. */
  updateSettings(beneficiaryId: string, patch: Partial<PatientSettings>): Promise<PatientSettings>;

  // tempo real
  subscribe(beneficiaryId: string, handlers: RealtimeHandlers): () => void;

  // push
  /** Rejeita quando o token não foi gravado (sem sessão, RLS, rede). */
  registerPushToken(token: string): Promise<void>;
}

/**
 * Sessão "ao vivo" de verdade: não encerrada E com o computador dela dando
 * heartbeat há menos de 90 s (`devices.last_seen_at`; o desktop bate a cada
 * 30 s). `sessions` não tem coluna de heartbeat própria — `updated_at` só
 * muda em calibração e encerramento —, então a vida da sessão é a do
 * dispositivo. Uma linha `active` cujo computador sumiu (queda de energia,
 * fechamento sem `pagehide`) é órfã: não conta como sessão nem em relatório.
 */
export function isSessionLive(session: Session | null | undefined, devices: Device[], now = Date.now()): boolean {
  if (!session || session.status === 'ended') return false;
  const device = devices.find((d) => d.id === session.device_id);
  if (!device || device.revoked_at) return false;
  return now - new Date(device.last_seen_at).getTime() < 90_000;
}

/** Postura só é um dado quando o desktop mediu algo (o banco tem default 0/'nenhum'). */
export function hasPostureData(s: Pick<Session, 'posture_drift_px' | 'drift_kind'>): boolean {
  return s.posture_drift_px > 0 || s.drift_kind !== 'nenhum';
}

/** Fadiga depende da taxa de piscadas; sem ela o rótulo 'ok' é só o default do banco. */
export function hasFatigueData(s: Pick<Session, 'blink_rate_bpm' | 'fatigue'>): boolean {
  return s.blink_rate_bpm != null || s.fatigue !== 'ok';
}

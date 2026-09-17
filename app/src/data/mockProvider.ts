/**
 * Provedor de demonstração: roda sem rede, simula um paciente ativo no desktop IrisFlow
 * (mensagens, pedidos de ajuda, métricas de sessão) para que o app possa ser avaliado
 * antes da integração com o Supabase.
 */
import {
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

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const daysAgo = (d: number, h = 0) => new Date(Date.now() - d * 86_400_000 - h * 3_600_000).toISOString();
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

const PROFILE_ID = 'demo-profile';
const BENEFICIARY_ID = 'demo-beneficiary';
const DEVICE_ID = 'demo-device';

export class MockProvider implements DataProvider {
  readonly kind = 'mock' as const;

  private user: AuthUser | null = null;
  private authListeners = new Set<(u: AuthUser | null) => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];

  private profile: Profile = {
    id: PROFILE_ID,
    buyer_name: 'Mariana Souza',
    email: 'mariana@exemplo.com',
    phone: '11987654321',
  };

  private beneficiaries: Beneficiary[] = [
    {
      id: BENEFICIARY_ID,
      profile_id: PROFILE_ID,
      user_name: 'Carlos Souza',
      relation: 'conjuge',
      condition: 'ela',
      os: 'windows',
      prescriber_name: 'Dra. Renata Lima',
      prescriber_role: 'Fonoaudióloga',
    },
  ];

  // A demonstração espelha o produto real: conta inscrita na beta fechada
  // (`../docs/BETA.md`) — plano `beta`, sem cobrança, acesso até o fim do programa.
  private plan: Plan = { id: 'beta', name: 'Beta', price_brl: 0, trial_days: 0, purchasable: false };
  private subscription: Subscription = {
    id: 'demo-sub',
    plan_id: 'beta',
    status: 'ativa',
    price_brl: 0,
    trial_ends_at: daysAgo(20),
    // `next_charge_at` na beta é o "acesso até": ~6 meses a partir de agora.
    next_charge_at: new Date(Date.now() + 182 * 86_400_000).toISOString(),
  };
  private betaRegistration: BetaRegistration = {
    wants_caregiver_app: true,
    feedback_consent: true,
    downloaded_at: daysAgo(19),
    registered_at: daysAgo(20),
  };

  private devices: Device[] = [
    {
      id: DEVICE_ID,
      beneficiary_id: BENEFICIARY_ID,
      name: 'Notebook da sala',
      os: 'windows',
      app_version: '1.4.2',
      last_seen_at: new Date().toISOString(),
      online: true,
      camera_ok: true,
      tracker_ok: true,
      calibrated: true,
      revoked_at: null,
      paired_at: daysAgo(12),
      hostname: 'DESKTOP-SALA',
    },
  ];

  private currentSession: Session = {
    id: 'sess-live',
    beneficiary_id: BENEFICIARY_ID,
    device_id: DEVICE_ID,
    status: 'active',
    started_at: minutesAgo(42),
    ended_at: null,
    calibration_error_px: 61,
    calibration_error_deg: 0.95,
    calibration_seconds: 24,
    hit_rate_150px: 0.96,
    posture_drift_px: 18,
    drift_kind: 'nenhum',
    blink_rate_bpm: 14,
    fatigue: 'ok',
    dwell_ms: 1500,
    filter_preset: 'balanceado',
    utterances: 23,
    chars_typed: 412,
    help_requests: 1,
    modules_used: ['Comunicação', 'Lazer'],
    precision_px: 34,
    precision_deg: 0.52,
    hit_rate_100px: 0.88,
    calibration_at: minutesAgo(41),
    accuracy_report: {
      meanErrorPx: 61, meanErrorDeg: 0.95, medianErrorPx: 55, p90ErrorPx: 98,
      precisionPx: 34, precisionDeg: 0.52, hitRate100: 0.88, hitRate150: 0.96,
      minTargetPx: 258, minTargetDeg: 4.0, measuredDistanceCm: 61,
      pointsMeasured: 13, pointsTotal: 13, score: 'Bom',
      conditions: { lighting: 'boa', glasses: false, headMovement: 'parada', screenInches: 23.6, distanceCm: 60 },
    },
    app_version: '1.4.2',

  };

  private sessions: Session[] = [
    this.currentSession,
    mkSession('sess-1', daysAgo(1, 3), 58, 0.9, 0.97, 22, 'nenhum', 'ok', 31, 640, 0),
    mkSession('sess-2', daysAgo(2, 2), 74, 1.2, 0.91, 27, 'lento', 'atencao', 18, 380, 1),
    mkSession('sess-3', daysAgo(3, 5), 66, 1.0, 0.94, 25, 'nenhum', 'ok', 27, 510, 0),
    mkSession('sess-4', daysAgo(4, 1), 92, 1.5, 0.86, 29, 'erratico', 'alta', 11, 190, 2),
    mkSession('sess-5', daysAgo(5, 4), 63, 0.98, 0.95, 21, 'nenhum', 'ok', 29, 560, 0),
    mkSession('sess-6', daysAgo(6, 2), 70, 1.1, 0.93, 24, 'lento', 'ok', 22, 430, 0),
  ];

  private helpRequests: HelpRequest[] = [
    {
      id: 'hr-1',
      beneficiary_id: BENEFICIARY_ID,
      session_id: 'sess-live',
      kind: 'postura',
      message: 'Desvio postural lento detectado (62 px). Reapoiar a nuca pode resolver.',
      created_at: minutesAgo(18),
      acknowledged_at: minutesAgo(17),
      escalated_at: null,
      resolved_at: minutesAgo(16),
    },
    {
      id: 'hr-2',
      beneficiary_id: BENEFICIARY_ID,
      session_id: 'sess-2',
      kind: 'ajuda',
      message: 'Carlos pediu ajuda pela célula fixa de socorro.',
      created_at: daysAgo(2, 1),
      acknowledged_at: daysAgo(2, 1),
      escalated_at: null,
      resolved_at: daysAgo(2, 1),
    },
    {
      id: 'hr-3',
      beneficiary_id: BENEFICIARY_ID,
      session_id: 'sess-4',
      kind: 'recalibracao',
      message: 'Desvio errático acima de 60 px: recomenda-se recalibrar.',
      created_at: daysAgo(4, 1),
      acknowledged_at: daysAgo(4, 1),
      escalated_at: null,
      resolved_at: daysAgo(4, 1),
    },
  ];

  private messages: Message[] = [
    msg('paciente', 'frase', 'Bom dia! Dormi bem.', 41, true),
    msg('cuidador', 'texto', 'Que bom, amor. Já preparo o café. Quer assistir alguma coisa?', 40, true),
    msg('paciente', 'simnao', 'Sim', 39, true),
    msg('paciente', 'texto', 'Notícias e depois o jogo de memória', 38, true),
    msg('cuidador', 'texto', 'Combinado. Vou deixar a janela aberta, está fresco hoje.', 37, true),
    msg('paciente', 'pictograma', '🌡️ Estou com frio', 12, true),
    msg('cuidador', 'texto', 'Já trago a manta. Dois minutinhos.', 11, true),
    msg('paciente', 'frase', 'Obrigado ❤️', 9, true),
  ];

  private phrases: QuickPhrase[] = [
    { id: 'qp1', beneficiary_id: BENEFICIARY_ID, text: 'Estou com sede', category: 'necessidades', position: 0 },
    { id: 'qp2', beneficiary_id: BENEFICIARY_ID, text: 'Preciso mudar de posição', category: 'conforto', position: 1 },
    { id: 'qp3', beneficiary_id: BENEFICIARY_ID, text: 'Estou com dor', category: 'saude', position: 2 },
    { id: 'qp4', beneficiary_id: BENEFICIARY_ID, text: 'Quero descansar', category: 'conforto', position: 3 },
    { id: 'qp5', beneficiary_id: BENEFICIARY_ID, text: 'Chame a Mariana', category: 'necessidades', position: 4 },
    { id: 'qp6', beneficiary_id: BENEFICIARY_ID, text: 'Obrigado, eu te amo', category: 'social', position: 5 },
  ];

  private settings: PatientSettings = {
    beneficiary_id: BENEFICIARY_ID,
    dwell_ms: 1500,
    filter_preset: 'balanceado',
    keyboard_layout: 'frequencia',
    sensitivity: 6,
    voice: 'Francisca (pt-BR)',
    emergency_timeout_s: 45,
    emergency_contacts: [
      { name: 'Mariana (esposa)', phone: '11987654321' },
      { name: 'Lucas (filho)', phone: '11912345678' },
    ],
    updated_at: daysAgo(3),
  };

  // ---------- auth ----------
  async getUser() {
    await delay(100);
    return this.user;
  }
  async signIn(email: string) {
    await delay(700);
    this.user = { id: PROFILE_ID, email: email || this.profile.email };
    this.authListeners.forEach((l) => l(this.user));
    return this.user;
  }
  async signOut() {
    this.user = null;
    this.authListeners.forEach((l) => l(null));
  }
  onAuthChange(cb: (u: AuthUser | null) => void) {
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }
  /** Demo: não há e-mail para mandar. Só espera, como a rede esperaria, e resolve. */
  async requestPasswordReset(_email: string) {
    await delay(600);
  }

  // ---------- conta ----------
  async getProfile() {
    await delay();
    return this.profile;
  }
  async listBeneficiaries() {
    await delay();
    return this.beneficiaries;
  }
  async getSubscription() {
    await delay();
    return { subscription: this.subscription, plan: this.plan };
  }
  async getBetaRegistration() {
    await delay();
    return this.betaRegistration;
  }

  // ---------- dispositivo e sessão ----------
  async listDevices() {
    await delay();
    return this.devices;
  }
  async revokeDevice(deviceId: string) {
    await delay();
    this.devices = this.devices.map((d) => (d.id === deviceId ? { ...d, revoked_at: new Date().toISOString(), online: false } : d));
  }
  async getCurrentSession() {
    await delay();
    return this.currentSession.status === 'ended' ? null : this.currentSession;
  }
  async listSessions(_b: string, limit = 30) {
    await delay();
    return this.sessions.slice(0, limit);
  }
  async getSession(id: string) {
    await delay();
    return this.sessions.find((s) => s.id === id) ?? null;
  }

  // ---------- alertas ----------
  async listHelpRequests() {
    await delay();
    return [...this.helpRequests].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async acknowledgeHelpRequest(id: string) {
    const h = this.helpRequests.find((x) => x.id === id);
    if (h && !h.acknowledged_at) h.acknowledged_at = new Date().toISOString();
  }
  async resolveHelpRequest(id: string) {
    const h = this.helpRequests.find((x) => x.id === id);
    if (h) {
      h.acknowledged_at ??= new Date().toISOString();
      h.resolved_at = new Date().toISOString();
    }
  }

  // ---------- conversa ----------
  async listMessages() {
    await delay();
    return [...this.messages];
  }
  async sendMessage(_b: string, text: string, kind: MessageKind = 'texto') {
    const m = msg('cuidador', kind, text, 0, false);
    this.messages.push(m);
    // simula o desktop vocalizando a mensagem para o paciente
    this.later(900, () => {
      m.spoken = true;
      m.read_at = new Date().toISOString();
      this.emit('onMessage', { ...m });
    });
    return m;
  }
  async markMessagesRead() {
    const now = new Date().toISOString();
    this.messages.forEach((m) => {
      if (m.sender === 'paciente' && !m.read_at) m.read_at = now;
    });
  }

  // ---------- frases ----------
  async listQuickPhrases() {
    await delay();
    return [...this.phrases].sort((a, b) => a.position - b.position);
  }
  async saveQuickPhrase(p: Omit<QuickPhrase, 'id'> & { id?: string }) {
    if (p.id) {
      const i = this.phrases.findIndex((x) => x.id === p.id);
      const merged = { ...this.phrases[i], ...p, id: p.id } as QuickPhrase;
      this.phrases[i] = merged;
      return merged;
    }
    const created: QuickPhrase = { ...p, id: uid() };
    this.phrases.push(created);
    return created;
  }
  async deleteQuickPhrase(id: string) {
    this.phrases = this.phrases.filter((p) => p.id !== id);
  }

  // ---------- ajustes ----------
  async getSettings() {
    await delay();
    return this.settings;
  }
  /** Na demonstração a linha sempre "existe" — só devolve os ajustes em memória. */
  async ensureSettings(_b: string, _current?: Partial<PatientSettings>) {
    await delay(120);
    return this.settings;
  }
  async updateSettings(_b: string, patch: Partial<PatientSettings>) {
    await delay(300);
    this.settings = { ...this.settings, ...patch, updated_at: new Date().toISOString() };
    if (patch.dwell_ms) this.currentSession.dwell_ms = patch.dwell_ms;
    if (patch.filter_preset) this.currentSession.filter_preset = patch.filter_preset;
    return this.settings;
  }

  // ---------- tempo real (simulação) ----------
  private handlers: RealtimeHandlers[] = [];

  subscribe(_b: string, handlers: RealtimeHandlers) {
    this.handlers.push(handlers);
    if (this.handlers.length === 1) this.startSimulation();
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handlers);
      if (this.handlers.length === 0) this.stopSimulation();
    };
  }

  async registerPushToken() {
    /* demo: nada a fazer */
  }

  private emit<K extends keyof RealtimeHandlers>(key: K, payload: Parameters<NonNullable<RealtimeHandlers[K]>>[0]) {
    this.handlers.forEach((h) => {
      const fn = h[key] as ((p: typeof payload) => void) | undefined;
      fn?.(payload);
    });
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(fn, ms);
    this.timers.push(t);
  }

  private startSimulation() {
    const script: { at: number; run: () => void }[] = [
      {
        at: 8_000,
        run: () => {
          const m = msg('paciente', 'frase', 'Estou com sede', 0, false);
          this.messages.push(m);
          this.emit('onMessage', m);
        },
      },
      {
        at: 20_000,
        run: () => {
          this.currentSession = { ...this.currentSession, utterances: this.currentSession.utterances + 1, chars_typed: this.currentSession.chars_typed + 14 };
          this.sessions[0] = this.currentSession;
          this.emit('onSession', this.currentSession);
        },
      },
      {
        at: 34_000,
        run: () => {
          const h: HelpRequest = {
            id: uid(),
            beneficiary_id: BENEFICIARY_ID,
            session_id: this.currentSession.id,
            kind: 'emergencia',
            message: 'Carlos acionou o pedido de socorro na tela.',
            created_at: new Date().toISOString(),
            acknowledged_at: null,
            escalated_at: null,
            resolved_at: null,
          };
          this.helpRequests.unshift(h);
          this.currentSession = { ...this.currentSession, help_requests: this.currentSession.help_requests + 1 };
          this.emit('onHelpRequest', h);

          // Simula a função agendada do servidor: passado `emergency_timeout_s`
          // sem reconhecimento nem resolução, grava `escalated_at`, deixa uma
          // mensagem de sistema na conversa e reemite o pedido (no Supabase isso
          // chega como UPDATE pelo realtime, mais um push). Ninguém é telefonado.
          const timeoutS = this.settings.emergency_timeout_s;
          this.later(timeoutS * 1000, () => {
            const atual = this.helpRequests.find((x) => x.id === h.id);
            if (!atual || atual.acknowledged_at || atual.resolved_at || atual.escalated_at) return;
            atual.escalated_at = new Date().toISOString();
            const aviso = msg('paciente', 'sistema', `Ninguém confirmou o pedido de socorro em ${timeoutS} s.`, 0, true);
            this.messages.push(aviso);
            this.emit('onMessage', aviso);
            this.emit('onHelpRequest', { ...atual });
          });
        },
      },
      {
        at: 75_000,
        run: () => {
          this.currentSession = { ...this.currentSession, posture_drift_px: 64, drift_kind: 'lento', fatigue: 'atencao', blink_rate_bpm: 21 };
          this.sessions[0] = this.currentSession;
          this.emit('onSession', this.currentSession);
          const h: HelpRequest = {
            id: uid(),
            beneficiary_id: BENEFICIARY_ID,
            session_id: this.currentSession.id,
            kind: 'postura',
            message: 'Desvio postural lento (64 px). Reapoiar a nuca costuma resolver.',
            created_at: new Date().toISOString(),
            acknowledged_at: null,
            escalated_at: null,
            resolved_at: null,
          };
          this.helpRequests.unshift(h);
          this.emit('onHelpRequest', h);
        },
      },
      {
        at: 110_000,
        run: () => {
          const m = msg('paciente', 'texto', 'Pode colocar as notícias? Obrigado', 0, false);
          this.messages.push(m);
          this.emit('onMessage', m);
        },
      },
    ];
    script.forEach((s) => this.later(s.at, s.run));
  }

  private stopSimulation() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

function msg(sender: Message['sender'], kind: MessageKind, text: string, minAgo: number, read: boolean): Message {
  return {
    id: uid(),
    beneficiary_id: BENEFICIARY_ID,
    sender,
    kind,
    text,
    created_at: minutesAgo(minAgo),
    read_at: read ? minutesAgo(Math.max(minAgo - 1, 0)) : null,
    spoken: sender === 'cuidador' ? read : true,
  };
}

function mkSession(
  id: string,
  startedAt: string,
  errPx: number,
  errDeg: number,
  hit: number,
  calibS: number,
  drift: Session['drift_kind'],
  fatigue: Session['fatigue'],
  utter: number,
  chars: number,
  help: number,
): Session {
  const durationMin = 35 + Math.round(Math.random() * 50);
  return {
    id,
    beneficiary_id: BENEFICIARY_ID,
    device_id: DEVICE_ID,
    status: 'ended',
    started_at: startedAt,
    ended_at: new Date(new Date(startedAt).getTime() + durationMin * 60_000).toISOString(),
    calibration_error_px: errPx,
    calibration_error_deg: errDeg,
    calibration_seconds: calibS,
    hit_rate_150px: hit,
    posture_drift_px: drift === 'nenhum' ? 12 : drift === 'lento' ? 58 : 81,
    drift_kind: drift,
    blink_rate_bpm: fatigue === 'ok' ? 14 : fatigue === 'atencao' ? 20 : 26,
    fatigue,
    dwell_ms: 1500,
    filter_preset: 'balanceado',
    utterances: utter,
    chars_typed: chars,
    help_requests: help,
    modules_used: help > 1 ? ['Comunicação', 'Emergência'] : ['Comunicação', 'Lazer', 'Computador'],
    precision_px: Math.round(errPx * 0.55),
    precision_deg: Math.round(errDeg * 0.55 * 100) / 100,
    hit_rate_100px: Math.max(0, Math.round((hit - 0.08) * 100) / 100),
    calibration_at: startedAt,
    accuracy_report: null,
    app_version: '1.4.2',
  };
}

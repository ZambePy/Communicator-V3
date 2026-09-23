import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '@/data/DataContext';
import type { FalhaPush } from '@/hooks/usePushNotifications';
import { haptics } from '@/lib/haptics';
import {
  AuthUser,
  Beneficiary,
  Device,
  HelpRequest,
  isSessionLive,
  Message,
  MessageKind,
  PatientSettings,
  Plan,
  Profile,
  Session,
  Subscription,
} from '@/data/types';

interface AppState {
  ready: boolean;
  user: AuthUser | null;
  profile: Profile | null;
  beneficiaries: Beneficiary[];
  patient: Beneficiary | null;
  subscription: Subscription | null;
  plan: Plan | null;
  devices: Device[];
  /** Sessão AO VIVO (não encerrada e com heartbeat do computador). Órfãs viram null. */
  session: Session | null;
  helpRequests: HelpRequest[];
  messages: Message[];
  /** `null` = o cuidador nunca salvou um ajuste remoto (sem linha no banco). */
  settings: PatientSettings | null;
  unreadCount: number;
  pendingAlert: HelpRequest | null;
  loading: boolean;
  /** Primeira carga do paciente selecionado concluída (para os esqueletos das telas). */
  patientLoaded: boolean;
  error: string | null;
  /** Por que o registro do push falhou nesta execução; null = registrado ou não tentado. */
  pushError: FalhaPush | null;
}

interface AppActions {
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Pede o e-mail de redefinição de senha. Resolve sem revelar se a conta existe. */
  requestPasswordReset(email: string): Promise<void>;
  selectPatient(id: string): void;
  refresh(): Promise<void>;
  /** Limpa o banner de erro global sem recarregar. */
  clearError(): void;
  /** Registrado pelo hook de push; a tela de Alertas mostra o que fazer. */
  reportPushError(falha: FalhaPush | null): void;
  sendMessage(text: string, kind?: MessageKind): Promise<void>;
  markRead(): Promise<void>;
  acknowledgeAlert(id: string): Promise<void>;
  resolveAlert(id: string): Promise<void>;
  dismissPendingAlert(): void;
  /** Otimista: a tela muda na hora e volta ao valor anterior se o banco recusar. */
  updateSettings(patch: Partial<PatientSettings>): Promise<void>;
  /** Desvincula um computador; a partir daí o desktop precisa entrar de novo com e-mail e senha. */
  revokeDevice(id: string): Promise<void>;
  /** Recursos que dependem do plano (Quadro 9 do plano de negócios). */
  can(feature: 'relatorios' | 'lazer' | 'assistente' | 'voz' | 'multiplos_dispositivos'): boolean;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

/** Reavalia `online` dos computadores a partir de `last_seen_at` — o valor mapeado envelhece. */
function refreshDeviceLiveness(devices: Device[], now: number): Device[] {
  let changed = false;
  const next = devices.map((d) => {
    const online = !d.revoked_at && now - new Date(d.last_seen_at).getTime() < 90_000;
    if (online === d.online) return d;
    changed = true;
    return { ...d, online };
  });
  return changed ? next : devices;
}

/**
 * O pedido que deve ocupar a tela ao abrir o app: o mais recente ainda aberto
 * e sem confirmação. Sem isto, um socorro acionado com o app fechado (push
 * tocado, ou app aberto minutos depois) ficava só na lista de Alertas.
 */
export function derivePendingAlert(helpRequests: HelpRequest[]): HelpRequest | null {
  const abertos = helpRequests.filter((h) => !h.resolved_at && !h.acknowledged_at);
  if (abertos.length === 0) return null;
  return [...abertos].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const data = useData();
  const [state, setState] = useState<AppState>({
    ready: false,
    user: null,
    profile: null,
    beneficiaries: [],
    patient: null,
    subscription: null,
    plan: null,
    devices: [],
    session: null,
    helpRequests: [],
    messages: [],
    settings: null,
    unreadCount: 0,
    pendingAlert: null,
    loading: false,
    patientLoaded: false,
    error: null,
    pushError: null,
  });
  const patch = useCallback((p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  }, []);

  // ----- bootstrap de autenticação -----
  useEffect(() => {
    let mounted = true;
    data
      .getUser()
      .then((u) => {
        if (mounted) patch({ user: u, ready: true });
      })
      .catch((e: unknown) => {
        // Sem este catch o app travava para sempre: `ready` só virava true
        // dentro do then, e uma falha do SecureStore (storage bloqueado,
        // sessão corrompida, keychain indisponível) deixava a tela branca, sem
        // erro e sem saída. Seguir como deslogado dá uma saída de verdade — o
        // login — e a mensagem fica guardada para a tela mostrar.
        if (!mounted) return;
        patch({
          user: null,
          ready: true,
          error: e instanceof Error ? e.message : 'Não foi possível ler a sessão guardada neste aparelho.',
        });
      });
    const off = data.onAuthChange((u) => patch({ user: u }));
    return () => {
      mounted = false;
      off();
    };
  }, [data, patch]);

  // ----- carga da conta ao autenticar -----
  const loadAccount = useCallback(async () => {
    patch({ loading: true, error: null });
    try {
      const [profile, beneficiaries, sub] = await Promise.all([data.getProfile(), data.listBeneficiaries(), data.getSubscription()]);
      patch((s) => ({
        profile,
        beneficiaries,
        patient: s.patient && beneficiaries.some((b) => b.id === s.patient?.id) ? s.patient : beneficiaries[0] ?? null,
        subscription: sub?.subscription ?? null,
        plan: sub?.plan ?? null,
        loading: false,
      }));
    } catch (e) {
      patch({ loading: false, error: (e as Error).message });
    }
  }, [data, patch]);

  useEffect(() => {
    if (state.user) loadAccount();
    else
      patch({
        profile: null,
        beneficiaries: [],
        patient: null,
        subscription: null,
        plan: null,
        devices: [],
        session: null,
        helpRequests: [],
        messages: [],
        settings: null,
        unreadCount: 0,
        pendingAlert: null,
        patientLoaded: false,
      });
  }, [state.user, loadAccount, patch]);

  // ----- carga do paciente selecionado -----
  const patientId = state.patient?.id ?? null;
  const loadPatient = useCallback(async () => {
    if (!patientId) return;
    try {
      const [devices, current, helpRequests, messages, settings] = await Promise.all([
        data.listDevices(patientId),
        data.getCurrentSession(patientId),
        data.listHelpRequests(patientId),
        data.listMessages(patientId),
        data.getSettings(patientId),
      ]);
      const session = isSessionLive(current, devices) ? current : null;
      patch((s) => ({
        devices,
        session,
        helpRequests,
        messages,
        settings,
        unreadCount: messages.filter((m) => m.sender === 'paciente' && !m.read_at).length,
        // Não troca um alerta já em tela; só preenche quando não há nenhum.
        pendingAlert: s.pendingAlert ?? derivePendingAlert(helpRequests),
        patientLoaded: true,
        error: null,
      }));
    } catch (e) {
      patch({ error: (e as Error).message, patientLoaded: true });
    }
  }, [data, patientId, patch]);

  useEffect(() => {
    patch({ patientLoaded: false });
    loadPatient();
  }, [loadPatient, patch]);

  // Espelho dos ajustes correntes para o rollback otimista (o updater do
  // setState roda depois, não dá para capturar o valor anterior dentro dele).
  const settingsRef = useRef<PatientSettings | null>(null);
  useEffect(() => {
    settingsRef.current = state.settings;
  }, [state.settings]);

  // Reavalia a cada 30 s: um computador que parou de bater deixa de ser
  // "online" e a sessão dele deixa de ser "ao vivo" — sem esperar um evento.
  useEffect(() => {
    if (!patientId) return;
    const t = setInterval(() => {
      patch((s) => {
        const now = Date.now();
        const devices = refreshDeviceLiveness(s.devices, now);
        const session = isSessionLive(s.session, devices, now) ? s.session : null;
        if (devices === s.devices && session === s.session) return {};
        return { devices, session };
      });
    }, 30_000);
    return () => clearInterval(t);
  }, [patientId, patch]);

  // ----- tempo real -----
  const pendingRef = useRef<HelpRequest | null>(null);
  useEffect(() => {
    if (!patientId) return;
    const off = data.subscribe(patientId, {
      onMessage: (m) =>
        patch((s) => {
          const exists = s.messages.some((x) => x.id === m.id);
          const messages = exists ? s.messages.map((x) => (x.id === m.id ? m : x)) : [...s.messages, m];
          if (!exists && m.sender === 'paciente') haptics.sucesso();
          return { messages, unreadCount: messages.filter((x) => x.sender === 'paciente' && !x.read_at).length };
        }),
      // Chega tanto no INSERT (pedido novo) quanto no UPDATE — o escalonamento
      // gravado pelo servidor (`escalated_at`), ou o reconhecimento/resolução
      // feito em outro celular da mesma conta. Só o INSERT vira alerta novo;
      // o UPDATE substitui a linha e, se for o alerta em tela, atualiza-o também,
      // porque o servidor é a fonte da verdade sobre o prazo.
      onHelpRequest: (h) =>
        patch((s) => {
          const exists = s.helpRequests.some((x) => x.id === h.id);
          if (!exists) {
            const urgent = h.kind === 'emergencia' || h.kind === 'ajuda';
            if (urgent) haptics.erro();
            else haptics.aviso();
            pendingRef.current = h;
            return { helpRequests: [h, ...s.helpRequests], pendingAlert: h };
          }
          const helpRequests = s.helpRequests.map((x) => (x.id === h.id ? h : x));
          if (s.pendingAlert?.id !== h.id) return { helpRequests };
          // Escalou agora (o prazo passou sem ninguém confirmar): vibra de novo,
          // como o push que o servidor reenviou — mas sem trocar o alerta em tela.
          if (h.escalated_at && !s.pendingAlert.escalated_at) {
            haptics.erro();
          }
          // Resolvido em outro aparelho: o overlay não tem mais o que pedir.
          return { helpRequests, pendingAlert: h.resolved_at ? null : h };
        }),
      onSession: (sess) =>
        patch((s) => ({ session: isSessionLive(sess, s.devices) ? sess : null })),
      // INSERT (computador recém-pareado pelo desktop) entra na lista; UPDATE substitui.
      onDevice: (d) =>
        patch((s) => {
          const devices = s.devices.some((x) => x.id === d.id) ? s.devices.map((x) => (x.id === d.id ? d : x)) : [d, ...s.devices];
          return { devices, session: isSessionLive(s.session, devices) ? s.session : null };
        }),
    });
    return off;
  }, [data, patientId, patch]);

  // ----- ações -----
  const actions = useMemo<AppActions>(
    () => ({
      async signIn(email, password) {
        patch({ error: null });
        const u = await data.signIn(email, password);
        haptics.sucesso();
        patch({ user: u });
      },
      async signOut() {
        await data.signOut();
        patch({ user: null, pushError: null });
      },
      async requestPasswordReset(email) {
        await data.requestPasswordReset(email);
      },
      selectPatient(id) {
        patch((s) => ({ patient: s.beneficiaries.find((b) => b.id === id) ?? s.patient }));
      },
      async refresh() {
        await Promise.all([loadAccount(), loadPatient()]);
      },
      clearError() {
        patch({ error: null });
      },
      reportPushError(falha) {
        patch({ pushError: falha });
      },
      async sendMessage(text, kind = 'texto') {
        if (!patientId) return;
        const m = await data.sendMessage(patientId, text, kind);
        haptics.toque();
        patch((s) => ({ messages: s.messages.some((x) => x.id === m.id) ? s.messages : [...s.messages, m] }));
      },
      async markRead() {
        if (!patientId) return;
        await data.markMessagesRead(patientId);
        patch((s) => ({
          messages: s.messages.map((m) => (m.sender === 'paciente' && !m.read_at ? { ...m, read_at: new Date().toISOString() } : m)),
          unreadCount: 0,
        }));
      },
      async acknowledgeAlert(id) {
        await data.acknowledgeHelpRequest(id);
        haptics.sucesso();
        const now = new Date().toISOString();
        patch((s) => ({
          helpRequests: s.helpRequests.map((h) => (h.id === id && !h.acknowledged_at ? { ...h, acknowledged_at: now } : h)),
          pendingAlert: s.pendingAlert?.id === id ? { ...s.pendingAlert, acknowledged_at: now } : s.pendingAlert,
        }));
      },
      async resolveAlert(id) {
        await data.resolveHelpRequest(id);
        haptics.sucesso();
        const now = new Date().toISOString();
        patch((s) => ({
          helpRequests: s.helpRequests.map((h) => (h.id === id ? { ...h, acknowledged_at: h.acknowledged_at ?? now, resolved_at: now } : h)),
          pendingAlert: s.pendingAlert?.id === id ? null : s.pendingAlert,
        }));
      },
      dismissPendingAlert() {
        patch({ pendingAlert: null });
      },
      async updateSettings(p) {
        if (!patientId) return;
        // Otimista: o controle muda na hora. Se o banco recusar, volta ao
        // que valia antes e o erro sobe para a tela explicar.
        const anterior = settingsRef.current;
        patch((s) => {
          const base: PatientSettings = s.settings ?? {
            beneficiary_id: patientId,
            dwell_ms: null,
            filter_preset: null,
            keyboard_layout: null,
            sensitivity: null,
            voice: 'pt-BR padrão',
            emergency_timeout_s: 45,
            emergency_contacts: [],
            updated_at: new Date().toISOString(),
          };
          return { settings: { ...base, ...p } };
        });
        try {
          const settings = await data.updateSettings(patientId, p);
          haptics.sucesso();
          patch({ settings });
        } catch (e) {
          patch({ settings: anterior });
          throw e;
        }
      },
      async revokeDevice(id) {
        if (!patientId) return;
        await data.revokeDevice(id);
        const devices = await data.listDevices(patientId);
        haptics.aviso();
        patch((s) => ({ devices, session: isSessionLive(s.session, devices) ? s.session : null }));
      },
      can(feature) {
        const planId = state.plan?.id ?? 'essencial';
        // Beta libera tudo (rank 3), como `license_for_profile()` (migração 20260923022616_beta.sql).
        const rank = planId === 'voz' || planId === 'beta' ? 3 : planId === 'completo' ? 2 : 1;
        switch (feature) {
          case 'relatorios':
          case 'lazer':
          case 'assistente':
          case 'multiplos_dispositivos':
            return rank >= 2;
          case 'voz':
            return rank >= 3;
          default:
            return true;
        }
      },
    }),
    [data, patch, patientId, loadAccount, loadPatient, state.plan?.id],
  );

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp deve ser usado dentro de AppProvider');
  return ctx;
}

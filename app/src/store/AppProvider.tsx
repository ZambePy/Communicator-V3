import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useData } from '@/data/DataContext';
import {
  AuthUser,
  Beneficiary,
  Device,
  HelpRequest,
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
  session: Session | null;
  helpRequests: HelpRequest[];
  messages: Message[];
  settings: PatientSettings | null;
  unreadCount: number;
  pendingAlert: HelpRequest | null;
  isDemo: boolean;
  loading: boolean;
  error: string | null;
}

interface AppActions {
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Pede o e-mail de redefinição de senha. Resolve sem revelar se a conta existe. */
  requestPasswordReset(email: string): Promise<void>;
  selectPatient(id: string): void;
  refresh(): Promise<void>;
  sendMessage(text: string, kind?: MessageKind): Promise<void>;
  markRead(): Promise<void>;
  acknowledgeAlert(id: string): Promise<void>;
  resolveAlert(id: string): Promise<void>;
  dismissPendingAlert(): void;
  updateSettings(patch: Partial<PatientSettings>): Promise<void>;
  /**
   * Cria a linha de ajustes do paciente se ela ainda não existir (primeira abertura de Ajustes).
   * Sem essa linha o `voice.status` do desktop responde `stored: false` e o rótulo da voz se perde.
   */
  ensureSettings(): Promise<void>;
  /** Desvincula um computador; a partir daí o desktop precisa entrar de novo com e-mail e senha. */
  revokeDevice(id: string): Promise<void>;
  /** Recursos que dependem do plano (Quadro 9 do plano de negócios). */
  can(feature: 'relatorios' | 'lazer' | 'assistente' | 'voz' | 'multiplos_dispositivos'): boolean;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

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
    isDemo: data.kind === 'mock',
    loading: false,
    error: null,
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
      });
  }, [state.user, loadAccount, patch]);

  // ----- carga do paciente selecionado -----
  const patientId = state.patient?.id ?? null;
  const loadPatient = useCallback(async () => {
    if (!patientId) return;
    try {
      const [devices, session, helpRequests, messages, settings] = await Promise.all([
        data.listDevices(patientId),
        data.getCurrentSession(patientId),
        data.listHelpRequests(patientId),
        data.listMessages(patientId),
        data.getSettings(patientId),
      ]);
      patch({
        devices,
        session,
        helpRequests,
        messages,
        settings,
        unreadCount: messages.filter((m) => m.sender === 'paciente' && !m.read_at).length,
      });
    } catch (e) {
      patch({ error: (e as Error).message });
    }
  }, [data, patientId, patch]);

  useEffect(() => {
    loadPatient();
  }, [loadPatient]);

  // Espelha os ajustes correntes para `ensureSettings` sem recriar as ações a cada edição.
  const settingsRef = useRef<PatientSettings | null>(null);
  useEffect(() => {
    settingsRef.current = state.settings;
  }, [state.settings]);

  // ----- tempo real -----
  const pendingRef = useRef<HelpRequest | null>(null);
  useEffect(() => {
    if (!patientId) return;
    const off = data.subscribe(patientId, {
      onMessage: (m) =>
        patch((s) => {
          const exists = s.messages.some((x) => x.id === m.id);
          const messages = exists ? s.messages.map((x) => (x.id === m.id ? m : x)) : [...s.messages, m];
          if (!exists && m.sender === 'paciente') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
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
            Haptics.notificationAsync(urgent ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
            pendingRef.current = h;
            return { helpRequests: [h, ...s.helpRequests], pendingAlert: h };
          }
          const helpRequests = s.helpRequests.map((x) => (x.id === h.id ? h : x));
          if (s.pendingAlert?.id !== h.id) return { helpRequests };
          // Escalou agora (o prazo passou sem ninguém confirmar): vibra de novo,
          // como o push que o servidor reenviou — mas sem trocar o alerta em tela.
          if (h.escalated_at && !s.pendingAlert.escalated_at) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
          }
          // Resolvido em outro aparelho: o overlay não tem mais o que pedir.
          return { helpRequests, pendingAlert: h.resolved_at ? null : h };
        }),
      onSession: (sess) => patch({ session: sess.status === 'ended' ? null : sess }),
      // INSERT (computador recém-pareado pelo desktop) entra na lista; UPDATE substitui.
      onDevice: (d) =>
        patch((s) => ({
          devices: s.devices.some((x) => x.id === d.id) ? s.devices.map((x) => (x.id === d.id ? d : x)) : [d, ...s.devices],
        })),
    });
    return off;
  }, [data, patientId, patch]);

  // ----- ações -----
  const actions = useMemo<AppActions>(
    () => ({
      async signIn(email, password) {
        patch({ error: null });
        const u = await data.signIn(email, password);
        patch({ user: u });
      },
      async signOut() {
        await data.signOut();
        patch({ user: null });
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
      async sendMessage(text, kind = 'texto') {
        if (!patientId) return;
        const m = await data.sendMessage(patientId, text, kind);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
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
        const now = new Date().toISOString();
        patch((s) => ({
          helpRequests: s.helpRequests.map((h) => (h.id === id && !h.acknowledged_at ? { ...h, acknowledged_at: now } : h)),
          pendingAlert: s.pendingAlert?.id === id ? { ...s.pendingAlert, acknowledged_at: now } : s.pendingAlert,
        }));
      },
      async resolveAlert(id) {
        await data.resolveHelpRequest(id);
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
        const settings = await data.updateSettings(patientId, p);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        patch({ settings });
      },
      async ensureSettings() {
        if (!patientId) return;
        // Sem háptico e sem "Salvando…": é uma garantia silenciosa, não uma edição do cuidador.
        const settings = await data.ensureSettings(patientId, settingsRef.current ?? undefined);
        patch({ settings });
      },
      async revokeDevice(id) {
        if (!patientId) return;
        await data.revokeDevice(id);
        const devices = await data.listDevices(patientId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        patch({ devices });
      },
      can(feature) {
        const planId = state.plan?.id ?? 'essencial';
        // Beta libera tudo (rank 3), como `license_for_profile()` em ../docs/BETA.md.
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

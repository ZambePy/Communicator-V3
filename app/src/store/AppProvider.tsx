import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as EstadoDoApp } from 'react-native';
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
  /**
   * A conta (perfil, pacientes, assinatura) já carregou ao menos uma vez nesta
   * sessão. Com ela carregada e sem paciente, as abas mostram o que fazer em
   * vez de esqueletos para sempre.
   */
  accountLoaded: boolean;
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
 * Janela em que um pedido sem confirmação ainda é "agora": a mesma da função
 * agendada que reenvia o alerta (migração 20260924020011_help_requests_received_at,
 * 6 h a partir de `received_at`). Mais antigo que isso, fica só na lista de
 * Alertas — sem esta janela, cada vez que o app abria, um socorro de dias
 * atrás (atendido pessoalmente, sem tocar no celular) voltava em tela cheia,
 * vibrando, como se fosse agora.
 */
export const JANELA_DO_ALERTA_MS = 6 * 60 * 60_000;

const urgente = (h: HelpRequest) => h.kind === 'emergencia' || h.kind === 'ajuda';

/** Quanto um pedido pede a tela: socorro/ajuda sem resposta > aviso sem resposta > já confirmado > nada. */
function pesoDoAlerta(h: HelpRequest | null): number {
  if (!h || h.resolved_at) return 0;
  if (h.acknowledged_at) return 1;
  return urgente(h) ? 3 : 2;
}

/**
 * O pedido que deve ocupar a tela ao abrir o app (ou ao recarregar): entre os
 * abertos, sem confirmação e dentro da janela, socorro/ajuda antes de aviso e,
 * entre iguais, o mais recente. Sem isto, um socorro acionado com o app
 * fechado (push tocado, ou app aberto minutos depois) ficava só na lista.
 */
export function derivePendingAlert(helpRequests: HelpRequest[], agoraMs: number = Date.now()): HelpRequest | null {
  const abertos = helpRequests.filter((h) => {
    if (h.resolved_at || h.acknowledged_at) return false;
    const recebido = Date.parse(h.received_at ?? h.created_at);
    return !Number.isFinite(recebido) || agoraMs - recebido <= JANELA_DO_ALERTA_MS;
  });
  if (abertos.length === 0) return null;
  return [...abertos].sort((a, b) => pesoDoAlerta(b) - pesoDoAlerta(a) || b.created_at.localeCompare(a.created_at))[0];
}

/**
 * Qual pedido fica na tela quando chega `candidato` (pedido novo, atualização
 * de um pedido, ou o resultado de `derivePendingAlert` numa recarga).
 *
 * - O mesmo pedido: a versão nova substitui (resolvido → sai da tela).
 * - Outro pedido: entra só se pede MAIS atenção que o da tela. Um aviso de
 *   postura não cobre um socorro sem resposta; um socorro novo cobre um
 *   pedido já confirmado. Empate fica com o da tela — o alerta não troca
 *   debaixo do dedo de quem está respondendo.
 * - Sem nada na tela, um pedido já confirmado (por outro celular) não abre
 *   alerta nenhum.
 */
export function escolherAlerta(atual: HelpRequest | null, candidato: HelpRequest | null): HelpRequest | null {
  const vivo = atual && !atual.resolved_at ? atual : null;
  if (!candidato) return vivo;
  if (vivo && candidato.id === vivo.id) return candidato.resolved_at ? null : candidato;
  if (!vivo) return pesoDoAlerta(candidato) >= 2 ? candidato : null;
  return pesoDoAlerta(candidato) > pesoDoAlerta(vivo) ? candidato : vivo;
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
    accountLoaded: false,
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
        accountLoaded: true,
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
        accountLoaded: false,
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
        // O alerta em tela ganha a versão atual do banco (confirmado ou
        // resolvido em outro celular enquanto este estava sem conexão) e cede
        // o lugar a um pedido que peça mais atenção — antes ele ficava, e um
        // socorro novo esperava atrás de um aviso já confirmado.
        pendingAlert: escolherAlerta(
          s.pendingAlert ? helpRequests.find((h) => h.id === s.pendingAlert?.id) ?? s.pendingAlert : null,
          derivePendingAlert(helpRequests),
        ),
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

  // Voltou para a frente (celular desbloqueado, app reaberto pelo ícone):
  // recarrega. Com o app suspenso o tempo real cai, e o que chegou nesse
  // intervalo — um socorro inclusive — não seria reenviado.
  useEffect(() => {
    if (!patientId) return;
    const sub = EstadoDoApp.addEventListener('change', (estado) => {
      if (estado === 'active') void loadPatient();
    });
    return () => sub.remove();
  }, [patientId, loadPatient]);

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
            // Um aviso (postura, fadiga...) não cobre um socorro sem resposta.
            return { helpRequests: [h, ...s.helpRequests], pendingAlert: escolherAlerta(s.pendingAlert, h) };
          }
          const helpRequests = s.helpRequests.map((x) => (x.id === h.id ? h : x));
          if (s.pendingAlert?.id !== h.id) {
            // Outro pedido mudou — escalou sem resposta, por exemplo: se agora
            // pede mais atenção que o da tela, ele entra.
            const proximo = escolherAlerta(s.pendingAlert, h);
            if (proximo?.id === h.id && h.escalated_at) haptics.erro();
            return { helpRequests, pendingAlert: proximo };
          }
          // Escalou agora (o prazo passou sem ninguém confirmar): vibra de novo,
          // como o push que o servidor reenviou — mas sem trocar o alerta em tela.
          if (h.escalated_at && !s.pendingAlert.escalated_at) {
            haptics.erro();
          }
          // Resolvido em outro aparelho: o overlay não tem mais o que pedir — e
          // o próximo pedido aberto, se houver, assume a tela.
          return { helpRequests, pendingAlert: h.resolved_at ? derivePendingAlert(helpRequests) : h };
        }),
      onSession: (sess) =>
        patch((s) => ({ session: isSessionLive(sess, s.devices) ? sess : null })),
      // INSERT (computador recém-pareado pelo desktop) entra na lista; UPDATE substitui.
      onDevice: (d) =>
        patch((s) => {
          const devices = s.devices.some((x) => x.id === d.id) ? s.devices.map((x) => (x.id === d.id ? d : x)) : [d, ...s.devices];
          return { devices, session: isSessionLive(s.session, devices) ? s.session : null };
        }),
      // Inscrição (re)confirmada: recarrega o que pode ter chegado com o canal fora.
      onSubscribed: () => void loadPatient(),
    });
    return off;
  }, [data, patientId, patch, loadPatient]);

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
        patch((s) => {
          const helpRequests = s.helpRequests.map((h) => (h.id === id && !h.acknowledged_at ? { ...h, acknowledged_at: now } : h));
          if (s.pendingAlert?.id !== id) return { helpRequests };
          // Confirmado: se há OUTRO socorro/ajuda aberto sem resposta, ele
          // assume a tela; senão fica o "Confirmado às …" deste (um aviso de
          // postura não interrompe quem acabou de responder a um socorro).
          const proximo = derivePendingAlert(helpRequests);
          const confirmado = { ...s.pendingAlert, acknowledged_at: now };
          return { helpRequests, pendingAlert: proximo && pesoDoAlerta(proximo) === 3 ? proximo : confirmado };
        });
      },
      async resolveAlert(id) {
        await data.resolveHelpRequest(id);
        haptics.sucesso();
        const now = new Date().toISOString();
        patch((s) => {
          const helpRequests = s.helpRequests.map((h) => (h.id === id ? { ...h, acknowledged_at: h.acknowledged_at ?? now, resolved_at: now } : h));
          return { helpRequests, pendingAlert: s.pendingAlert?.id === id ? derivePendingAlert(helpRequests) : s.pendingAlert };
        });
      },
      dismissPendingAlert() {
        // "Ver depois" de um pedido já confirmado: outro aberto sem resposta,
        // se houver, assume a tela.
        patch((s) => ({ pendingAlert: derivePendingAlert(s.helpRequests.filter((h) => h.id !== s.pendingAlert?.id)) }));
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

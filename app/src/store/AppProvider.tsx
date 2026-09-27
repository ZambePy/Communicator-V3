import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as EstadoDoApp } from 'react-native';
import { useData } from '@/data/DataContext';
import { obterTokenDoAparelho, type FalhaPush } from '@/hooks/usePushNotifications';
import { haptics } from '@/lib/haptics';
import {
  AuthUser,
  Beneficiary,
  Device,
  ehConflitoDeAjustes,
  HelpRequest,
  isSessionLive,
  License,
  LicenseFeature,
  licenseAllows,
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
  /** Licença calculada pelo servidor (`desktop_license()`); null enquanto não carregou. */
  license: License | null;
  devices: Device[];
  /** Sessão AO VIVO (não encerrada e com heartbeat do computador). Órfãs viram null. */
  session: Session | null;
  helpRequests: HelpRequest[];
  messages: Message[];
  /** `null` = o cuidador nunca salvou um ajuste remoto (sem linha no banco). */
  settings: PatientSettings | null;
  unreadCount: number;
  pendingAlert: HelpRequest | null;
  /** Chave (`chaveDoAlerta`) do alerta que o cuidador minimizou; ver `pendingAlertMinimized`. */
  minimizedAlertKey: string | null;
  loading: boolean;
  /**
   * A lista de pacientes da conta já carregou ao menos uma vez nesta sessão.
   * Com ela carregada e sem paciente, as abas mostram o que fazer em vez de
   * esqueletos para sempre.
   */
  accountLoaded: boolean;
  /**
   * A tentativa de carregar os dados do paciente terminou — com sucesso ou não
   * (inclusive quando nem a conta carregou). Só decide entre esqueleto e
   * conteúdo; se os dados valem, quem diz é `patientVerified`.
   */
  patientLoaded: boolean;
  /**
   * A última carga dos dados do paciente (alertas, conversa, computador,
   * ajustes) deu certo. É o que autoriza uma tela a afirmar "tudo tranquilo",
   * "ainda sem mensagens" ou "nenhum computador" — a string `error` não serve
   * para isso: o cuidador a apaga ao fechar o aviso.
   */
  patientVerified: boolean;
  error: string | null;
  /** Por que o registro do push falhou nesta execução; null = registrado ou não tentado. */
  pushError: FalhaPush | null;
}

type MudancaDeAjustes = Partial<PatientSettings> | ((atual: PatientSettings | null) => Partial<PatientSettings>);

interface AppActions {
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Pede o e-mail de redefinição de senha. Resolve sem revelar se a conta existe. */
  requestPasswordReset(email: string): Promise<void>;
  selectPatient(id: string): void;
  refresh(): Promise<void>;
  /** Fecha o aviso global. As novas tentativas seguem; ele volta só depois de um sucesso e uma nova falha. */
  clearError(): void;
  /** Registrado pelo hook de push; a tela de Alertas mostra o que fazer. */
  reportPushError(falha: FalhaPush | null): void;
  /** Rejeita quando nada foi enviado (inclusive se a conta ainda não carregou). */
  sendMessage(text: string, kind?: MessageKind): Promise<void>;
  markRead(): Promise<void>;
  acknowledgeAlert(id: string): Promise<void>;
  resolveAlert(id: string): Promise<void>;
  dismissPendingAlert(): void;
  /** Voltar (ou "Minimizar") num alerta sem resposta: sai da tela cheia e fica um aviso no topo. */
  minimizePendingAlert(): void;
  /** Volta o alerta minimizado para a tela cheia. */
  restorePendingAlert(): void;
  /**
   * Otimista: a tela muda na hora e volta ao que vale no servidor se o banco
   * recusar. Aceita uma função sobre os ajustes atuais do servidor — é ela que
   * é reaplicada quando outro celular gravou antes (adicionar/remover um
   * contato sem perder o que o outro fez). Gravações entram em fila.
   */
  updateSettings(mudanca: MudancaDeAjustes): Promise<void>;
  /** Desvincula um computador; a partir daí o desktop precisa entrar de novo com e-mail e senha. */
  revokeDevice(id: string): Promise<void>;
  /** Recursos do plano, pela licença do servidor (a mesma do desktop). */
  can(feature: LicenseFeature): boolean;
}

const AppContext = createContext<(AppState & AppActions & { pendingAlertMinimized: boolean }) | null>(null);

/** Por que uma ação não fez nada: sem paciente carregado não há onde gravar. */
export const SEM_CONTA = 'A conta ainda não carregou neste celular, então nada foi enviado nem salvo. Tente de novo em instantes.';

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

/**
 * Identidade do alerta para "minimizado": o pedido E o seu escalonamento. Um
 * pedido novo — ou o mesmo pedido escalado, quando o servidor acabou de
 * reenviar o push a todos os celulares — volta a ocupar a tela.
 */
export function chaveDoAlerta(h: HelpRequest): string {
  return `${h.id}:${h.escalated_at ?? ''}`;
}

/**
 * Qual sessão alimenta o Início quando chega um evento de `sessions`: a atual
 * (atualizada, ou encerrada → nenhuma) ou uma MAIS NOVA e viva. Evento de uma
 * sessão anterior — o heartbeat de uma sessão que sobrou de um travamento, um
 * `session.end` atrasado da fila offline — não troca a sessão ao vivo.
 */
export function escolherSessao(atual: Session | null, recebida: Session, devices: Device[], agora = Date.now()): Session | null {
  if (atual && recebida.id === atual.id) return isSessionLive(recebida, devices, agora) ? recebida : null;
  if (recebida.status === 'ended' || !isSessionLive(recebida, devices, agora)) return atual;
  if (atual && Date.parse(recebida.started_at) <= Date.parse(atual.started_at)) return atual;
  return recebida;
}

/**
 * Insere (ou atualiza) mantendo a ordem por `created_at`. Uma mensagem que
 * esperou na fila offline do computador chega pelo tempo real DEPOIS das de
 * hoje com o horário real (de ontem, até 24 h antes): anexada no fim, ela
 * aparecia abaixo das novas, com um segundo rótulo "ontem".
 */
export function inserirMensagem(lista: Message[], m: Message): Message[] {
  if (lista.some((x) => x.id === m.id)) return lista.map((x) => (x.id === m.id ? m : x));
  const t = Date.parse(m.created_at);
  let i = lista.length;
  while (i > 0 && Date.parse(lista[i - 1].created_at) > t) i -= 1;
  return [...lista.slice(0, i), m, ...lista.slice(i)];
}

/**
 * Entre a versão dos ajustes que o app tem e a que chegou do servidor, a mais
 * recente pelo `updated_at` (carimbado pelo banco). Evita que uma recarga ou um
 * evento atrasado volte a tela para um estado anterior ao da última gravação.
 */
export function ajustesMaisRecentes(atual: PatientSettings | null, recebido: PatientSettings | null): PatientSettings | null {
  if (!recebido) return atual && atual.beneficiary_id ? atual : null;
  if (!atual || atual.beneficiary_id !== recebido.beneficiary_id) return recebido;
  const a = Date.parse(atual.updated_at);
  const r = Date.parse(recebido.updated_at);
  if (!Number.isFinite(a) || !Number.isFinite(r)) return recebido;
  return r >= a ? recebido : atual;
}

/**
 * Espera antes da n-ésima nova tentativa: 2 s, 4 s, 8 s… até 30 s. Sem
 * detector de conectividade no app, é esse teto que decide quanto o cuidador
 * espera depois de a rede voltar — por isso curto: cada tentativa é barata.
 */
export function esperaDaTentativa(n: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(1, n));
}

/**
 * Roda `carregar` agora e, enquanto ele devolver `false` (ou rejeitar), de novo
 * com espera crescente — e na hora em que o app volta para a frente, que é
 * quando a rede costuma ter voltado (não há detector de conectividade no app).
 * Com `sempreAoVoltar`, recarrega ao voltar para a frente mesmo sem falha.
 * Devolve a limpeza do efeito.
 */
export function comNovasTentativas(carregar: () => Promise<boolean>, opcoes: { sempreAoVoltar?: boolean } = {}): () => void {
  let vivo = true;
  let emAndamento = false;
  let falhas = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tentar = async () => {
    if (!vivo || emAndamento) return;
    if (timer) clearTimeout(timer);
    timer = undefined;
    emAndamento = true;
    const ok = await carregar().catch(() => false);
    emAndamento = false;
    if (!vivo) return;
    if (ok) {
      falhas = 0;
      return;
    }
    falhas += 1;
    timer = setTimeout(() => void tentar(), esperaDaTentativa(falhas));
  };
  void tentar();
  const sub = EstadoDoApp.addEventListener('change', (estado) => {
    if (estado !== 'active') return;
    if (!opcoes.sempreAoVoltar && !timer) return;
    falhas = 0;
    void tentar();
  });
  return () => {
    vivo = false;
    if (timer) clearTimeout(timer);
    sub.remove();
  };
}

/** O que cada plano inclui (Quadro 9 do plano de negócios), só para quando a licença do servidor ainda não carregou. */
export function planoPermite(planId: string | null, feature: LicenseFeature): boolean {
  const rank = planId === 'voz' || planId === 'beta' ? 3 : planId === 'completo' ? 2 : 1;
  return feature === 'voz' ? rank >= 3 : rank >= 2;
}

function motivo(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Falha ao carregar.';
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
    license: null,
    devices: [],
    session: null,
    helpRequests: [],
    messages: [],
    settings: null,
    unreadCount: 0,
    pendingAlert: null,
    minimizedAlertKey: null,
    loading: false,
    accountLoaded: false,
    patientLoaded: false,
    patientVerified: false,
    error: null,
    pushError: null,
  });
  const patch = useCallback((p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    setState((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) }));
  }, []);

  // Quem está logado e qual paciente está na tela AGORA: uma carga ou gravação
  // que termina depois de o cuidador sair (ou trocar de paciente) é descartada
  // — senão o erro dela aparecia na tela de login, e os dados, na conta seguinte.
  // Declarados antes dos outros efeitos: rodam primeiro em cada commit.
  const usuarioAtual = useRef<string | null>(null);
  const pacienteAtual = useRef<string | null>(null);
  useEffect(() => {
    usuarioAtual.current = state.user?.id ?? null;
  }, [state.user]);

  // ----- aviso global de falha -----
  // Conta e paciente falham (e se recuperam) separadamente; o aviso mostra a
  // primeira falha em aberto. Fechado pelo cuidador, fica fechado enquanto as
  // novas tentativas seguem falhando — senão reapareceria a cada tentativa.
  const falhas = useRef<{ conta: string | null; paciente: string | null; dispensado: boolean }>({ conta: null, paciente: null, dispensado: false });
  /** Renovações do token com carga falhando: cada uma dispara nova tentativa na hora. */
  const [renovacoes, setRenovacoes] = useState(0);
  /**
   * O último usuário definido — já no instante em que é definido, sem esperar
   * o render (vários eventos do auth chegam juntos na abertura). `undefined`
   * = ainda nenhum.
   */
  const usuarioVisto = useRef<AuthUser | null | undefined>(undefined);
  const definirUsuario = useCallback(
    (u: AuthUser | null) => {
      usuarioVisto.current = u;
      patch({ user: u });
    },
    [patch],
  );
  const mostrarFalha = useCallback(() => {
    const f = falhas.current;
    const atual = f.conta ?? f.paciente;
    if (!atual) f.dispensado = false;
    patch({ error: atual && !f.dispensado ? atual : null });
  }, [patch]);

  // ----- bootstrap de autenticação -----
  useEffect(() => {
    let mounted = true;
    data
      .getUser()
      .then((u) => {
        if (!mounted) return;
        // Um evento do auth pode ter chegado antes (login concluído, saída):
        // ele vale mais que a leitura da sessão guardada.
        if (usuarioVisto.current === undefined) definirUsuario(u);
        patch({ ready: true });
      })
      .catch((e: unknown) => {
        // Sem este catch o app travava para sempre: `ready` só virava true
        // dentro do then, e uma falha do SecureStore (storage bloqueado,
        // sessão corrompida, keychain indisponível) deixava a tela branca, sem
        // erro e sem saída. Seguir como deslogado dá uma saída de verdade — o
        // login — e a mensagem fica guardada para a tela mostrar.
        if (!mounted) return;
        if (usuarioVisto.current === undefined) definirUsuario(null);
        patch({
          ready: true,
          error: e instanceof Error ? e.message : 'Não foi possível ler a sessão guardada neste aparelho.',
        });
      });
    const off = data.onAuthChange((u) => {
      // Mesmo usuário (a sessão inicial, cada renovação do token): o objeto
      // fica o mesmo — senão toda renovação recarregava a conta e o paciente
      // em dobro. Mas se há carga falhando (abertura sem internet), a
      // renovação é justamente o sinal de que a rede voltou: tenta já.
      const atual = usuarioVisto.current;
      if (u && atual && u.id === atual.id && u.email === atual.email) {
        if (falhas.current.conta || falhas.current.paciente) setRenovacoes((n) => n + 1);
        return;
      }
      definirUsuario(u);
    });
    return () => {
      mounted = false;
      off();
    };
  }, [data, patch, definirUsuario]);

  // Saída feita sem rede: o token de push daquela conta ainda precisa sair do
  // banco (senão este celular segue recebendo os socorros dela). Tenta ao
  // abrir o app e depois de cada saída, com espera crescente e sempre que o
  // app volta para a frente.
  const [saidas, setSaidas] = useState(0);
  useEffect(() => comNovasTentativas(() => data.concluirSaidaPendente()), [data, saidas]);

  // ----- carga da conta ao autenticar -----
  // Devolve `true` só quando tudo carregou. Pacientes, perfil e licença são
  // independentes: a falha de um não segura os outros — em especial, o
  // paciente (e com ele o tempo real e os alertas) entra assim que a lista
  // dele carrega, mesmo que o perfil ou o plano ainda estejam falhando.
  const loadAccount = useCallback(async (): Promise<boolean> => {
    const quem = usuarioAtual.current;
    const descartada = () => usuarioAtual.current !== quem;
    patch({ loading: true });
    const semPaciente = { patientLoaded: true, patientVerified: false };
    try {
      await data.garantirSessao();
    } catch (e) {
      if (descartada()) return true;
      falhas.current.conta = motivo(e);
      patch((s) => ({ loading: false, ...(s.patient ? {} : semPaciente) }));
      mostrarFalha();
      return false;
    }
    const [ben, perfil, licenca, assinatura] = await Promise.allSettled([data.listBeneficiaries(), data.getProfile(), data.getLicense(), data.getSubscription()]);
    if (descartada()) return true;
    patch((s) => {
      const p: Partial<AppState> = { loading: false };
      if (ben.status === 'fulfilled') {
        const lista = ben.value;
        p.beneficiaries = lista;
        p.patient = s.patient && lista.some((b) => b.id === s.patient?.id) ? s.patient : lista[0] ?? null;
        p.accountLoaded = true;
      } else if (!s.patient) Object.assign(p, semPaciente);
      if (perfil.status === 'fulfilled') p.profile = perfil.value;
      if (licenca.status === 'fulfilled') p.license = licenca.value;
      if (assinatura.status === 'fulfilled') {
        p.subscription = assinatura.value?.subscription ?? null;
        p.plan = assinatura.value?.plan ?? null;
      }
      return p;
    });
    const falha = [ben, perfil, licenca, assinatura].find((r): r is PromiseRejectedResult => r.status === 'rejected');
    falhas.current.conta = falha ? motivo(falha.reason) : null;
    mostrarFalha();
    return !falha;
  }, [data, patch, mostrarFalha]);

  // Sem conta carregada nada funciona — nem o tempo real, que depende do
  // paciente. Antes era uma tentativa só: com a rede instável na abertura o
  // app ficava sem tempo real até o cuidador puxar para atualizar. Agora tenta
  // de novo com espera crescente, ao voltar para a frente e quando o token é
  // renovado com a carga falhando (a rede voltou depois de uma abertura sem
  // internet): recarrega na hora.
  useEffect(() => {
    if (!state.user) return;
    return comNovasTentativas(loadAccount);
  }, [state.user, loadAccount, renovacoes]);

  useEffect(() => {
    if (state.user) return;
    // Saiu da conta: nada da conta anterior sobrevive — nem o erro dela, que
    // aparecia em vermelho na tela de login ("Sem internet…") com a rede boa.
    falhas.current = { conta: null, paciente: null, dispensado: false };
    patch({
      profile: null,
      beneficiaries: [],
      patient: null,
      subscription: null,
      plan: null,
      license: null,
      devices: [],
      session: null,
      helpRequests: [],
      messages: [],
      settings: null,
      unreadCount: 0,
      pendingAlert: null,
      minimizedAlertKey: null,
      accountLoaded: false,
      patientLoaded: false,
      patientVerified: false,
      error: null,
    });
  }, [state.user, patch]);

  // Espelho dos ajustes que o SERVIDOR confirmou (carga, gravação, tempo
  // real) — base das gravações e destino do rollback. O estado da tela pode
  // ter um valor otimista por cima.
  const ajustesDoServidor = useRef<PatientSettings | null>(null);
  const filaDeAjustes = useRef<Promise<unknown>>(Promise.resolve());

  // ----- carga do paciente selecionado -----
  const patientId = state.patient?.id ?? null;
  const loadPatient = useCallback(async (): Promise<boolean> => {
    if (!patientId) return true;
    const descartada = () => pacienteAtual.current !== patientId || !usuarioAtual.current;
    try {
      // Sem sessão válida as leituras seriam anônimas e voltariam vazias.
      await data.garantirSessao();
      const [devices, current, helpRequests, messages, settings] = await Promise.all([
        data.listDevices(patientId),
        data.getCurrentSession(patientId),
        data.listHelpRequests(patientId),
        data.listMessages(patientId),
        data.getSettings(patientId),
      ]);
      if (descartada()) return true;
      const session = isSessionLive(current, devices) ? current : null;
      const ajustes = ajustesMaisRecentes(ajustesDoServidor.current?.beneficiary_id === patientId ? ajustesDoServidor.current : null, settings);
      ajustesDoServidor.current = ajustes;
      patch((s) => ({
        devices,
        session,
        helpRequests,
        messages,
        settings: ajustes,
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
        patientVerified: true,
      }));
      falhas.current.paciente = null;
      mostrarFalha();
      return true;
    } catch (e) {
      if (descartada()) return true;
      falhas.current.paciente = motivo(e);
      patch({ patientLoaded: true, patientVerified: false });
      mostrarFalha();
      return false;
    }
  }, [data, patientId, patch, mostrarFalha]);

  // Paciente novo: esqueletos até a primeira carga, e a base dos ajustes
  // recomeça. Depois, carrega com novas tentativas e sempre que o app volta
  // para a frente — com o app suspenso o tempo real cai, e o que chegou nesse
  // intervalo (um socorro inclusive) não seria reenviado. Também quando o
  // token é renovado com a carga falhando: uma carga que rodou sem sessão
  // válida é refeita assim que ela volta.
  const logado = Boolean(state.user);
  useEffect(() => {
    if (pacienteAtual.current !== patientId) {
      pacienteAtual.current = patientId;
      ajustesDoServidor.current = null;
      filaDeAjustes.current = Promise.resolve();
      falhas.current.paciente = null;
      patch({ patientLoaded: false, patientVerified: false });
    }
    if (!patientId || !logado) return;
    return comNovasTentativas(loadPatient, { sempreAoVoltar: true });
  }, [patientId, loadPatient, patch, logado, renovacoes]);

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

  // A sessão ao vivo encerrou: pode haver outra aberta (mais antiga, de outro
  // computador); quem decide qual é a atual é o servidor.
  const sessaoRef = useRef<Session | null>(null);
  useEffect(() => {
    sessaoRef.current = state.session;
  }, [state.session]);
  const recarregarSessao = useCallback(async () => {
    if (!patientId) return;
    try {
      const atual = await data.getCurrentSession(patientId);
      patch((s) => ({ session: atual && isSessionLive(atual, s.devices) ? atual : null }));
    } catch {
      // Sem rede: fica "sem sessão" até a próxima carga.
    }
  }, [data, patientId, patch]);

  // ----- tempo real -----
  useEffect(() => {
    if (!patientId) return;
    const off = data.subscribe(patientId, {
      onMessage: (m) =>
        patch((s) => {
          const exists = s.messages.some((x) => x.id === m.id);
          const messages = inserirMensagem(s.messages, m);
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
            if (urgente(h)) haptics.erro();
            else haptics.aviso();
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
      onSession: (sess) => {
        // A sessão ao vivo encerrou: recarrega a atual pelo servidor.
        if (sessaoRef.current?.id === sess.id && sess.status === 'ended') void recarregarSessao();
        patch((s) => ({ session: escolherSessao(s.session, sess, s.devices) }));
      },
      // INSERT (computador recém-pareado pelo desktop) entra na lista; UPDATE substitui.
      onDevice: (d) =>
        patch((s) => {
          const devices = s.devices.some((x) => x.id === d.id) ? s.devices.map((x) => (x.id === d.id ? d : x)) : [d, ...s.devices];
          return { devices, session: isSessionLive(s.session, devices) ? s.session : null };
        }),
      // Outro celular (ou o computador) gravou os ajustes: a tela acompanha.
      onSettings: (linha) => {
        const maisNova = ajustesMaisRecentes(ajustesDoServidor.current, linha);
        if (maisNova === ajustesDoServidor.current) return;
        ajustesDoServidor.current = maisNova;
        patch({ settings: maisNova });
      },
      // Inscrição (re)confirmada: recarrega o que pode ter chegado com o canal fora.
      onSubscribed: () => void loadPatient(),
    });
    return off;
  }, [data, patientId, patch, loadPatient, recarregarSessao]);

  /**
   * Uma gravação de ajustes, já na vez dela na fila: calcula a mudança sobre o
   * que o servidor confirmou, mostra na hora e grava. Se outro celular (ou o
   * computador) gravou antes, recarrega e REAPLICA a mudança sobre a versão
   * nova — adicionar um contato continua adicionando, sem apagar o do outro.
   */
  const gravarAjustes = useCallback(
    async (id: string, calcular: (atual: PatientSettings | null) => Partial<PatientSettings>) => {
      const padrao: PatientSettings = {
        beneficiary_id: id,
        dwell_ms: null,
        filter_preset: null,
        keyboard_layout: null,
        sensitivity: null,
        voice: 'pt-BR padrão',
        emergency_timeout_s: 45,
        emergency_contacts: [],
        updated_at: '',
      };
      // Terminou depois de o cuidador sair ou trocar de paciente: não toca a tela.
      const outro = () => pacienteAtual.current !== id;
      let base = ajustesDoServidor.current;
      for (let tentativa = 1; ; tentativa++) {
        const mudanca = calcular(base);
        patch({ settings: { ...(base ?? padrao), ...mudanca } });
        try {
          const salvo = await data.updateSettings(id, mudanca, base ? base.updated_at : null);
          if (outro()) return;
          ajustesDoServidor.current = ajustesMaisRecentes(ajustesDoServidor.current, salvo);
          patch({ settings: ajustesDoServidor.current });
          haptics.sucesso();
          return;
        } catch (e) {
          let erro = e;
          if (ehConflitoDeAjustes(e) && tentativa < 3 && !outro()) {
            try {
              base = await data.getSettings(id);
              if (outro()) return;
              ajustesDoServidor.current = base;
              continue;
            } catch (e2) {
              erro = e2;
            }
          }
          if (outro()) throw erro;
          // Volta ao que vale no servidor e deixa a tela explicar.
          patch({ settings: ajustesDoServidor.current });
          throw erro;
        }
      }
    },
    [data, patch],
  );

  // ----- ações -----
  const actions = useMemo<AppActions>(
    () => ({
      async signIn(email, password) {
        patch({ error: null });
        const u = await data.signIn(email, password);
        haptics.sucesso();
        definirUsuario(u);
      },
      async signOut() {
        // O token do aparelho obtido AGORA (não só o registrado nesta execução):
        // ele deixa de receber os alertas desta conta. Sem rede, a remoção fica
        // pendente e é concluída quando a rede voltar.
        const token = await obterTokenDoAparelho();
        try {
          await data.signOut(token);
        } catch (e) {
          // A tela sai da conta de qualquer jeito: foi o que o cuidador pediu.
          console.warn('[IrisFlow Cuidador] saída concluída com falha:', motivo(e));
        } finally {
          definirUsuario(null);
          patch({ pushError: null });
          setSaidas((n) => n + 1);
        }
      },
      async requestPasswordReset(email) {
        await data.requestPasswordReset(email);
      },
      selectPatient(id) {
        patch((s) => ({ patient: s.beneficiaries.find((b) => b.id === id) ?? s.patient }));
      },
      async refresh() {
        falhas.current.dispensado = false;
        await Promise.all([loadAccount(), loadPatient()]);
      },
      clearError() {
        falhas.current.dispensado = true;
        patch({ error: null });
      },
      reportPushError(falha) {
        patch({ pushError: falha });
      },
      async sendMessage(text, kind = 'texto') {
        if (!patientId) throw new Error(SEM_CONTA);
        const m = await data.sendMessage(patientId, text, kind);
        haptics.toque();
        patch((s) => ({ messages: inserirMensagem(s.messages, m) }));
      },
      async markRead() {
        if (!patientId) throw new Error(SEM_CONTA);
        // Só o que o banco marcou muda na tela (e só depois de marcar).
        const marcadas = await data.markMessagesRead(patientId);
        if (marcadas.length === 0) return;
        const lidas = new Map(marcadas.map((m) => [m.id, m.read_at]));
        patch((s) => {
          const messages = s.messages.map((m) => (lidas.has(m.id) && !m.read_at ? { ...m, read_at: lidas.get(m.id) ?? new Date().toISOString() } : m));
          return { messages, unreadCount: messages.filter((m) => m.sender === 'paciente' && !m.read_at).length };
        });
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
      minimizePendingAlert() {
        patch((s) => ({ minimizedAlertKey: s.pendingAlert ? chaveDoAlerta(s.pendingAlert) : null }));
      },
      restorePendingAlert() {
        patch({ minimizedAlertKey: null });
      },
      async updateSettings(mudanca) {
        const id = patientId;
        if (!id) throw new Error(SEM_CONTA);
        const calcular = typeof mudanca === 'function' ? mudanca : () => mudanca;
        // Uma de cada vez: toques rápidos no prazo gravavam 60, 75 e 90 em
        // paralelo e, com latências diferentes, o banco ficava com 60.
        const vez = filaDeAjustes.current.catch(() => undefined).then(() => gravarAjustes(id, calcular));
        filaDeAjustes.current = vez;
        return vez;
      },
      async revokeDevice(id) {
        if (!patientId) throw new Error(SEM_CONTA);
        await data.revokeDevice(id);
        haptics.aviso();
        // Desvinculado. Atualiza a lista na hora; se a releitura falhar, a
        // tela não pode dizer "não foi possível desvincular" — já foi.
        const agora = new Date().toISOString();
        patch((s) => {
          const devices = s.devices.map((d) => (d.id === id ? { ...d, revoked_at: d.revoked_at ?? agora, online: false } : d));
          return { devices, session: isSessionLive(s.session, devices) ? s.session : null };
        });
        try {
          const devices = await data.listDevices(patientId);
          patch((s) => ({ devices, session: isSessionLive(s.session, devices) ? s.session : null }));
        } catch {
          // A próxima carga traz a lista do servidor.
        }
      },
      can(feature) {
        // A licença calculada pelo servidor decide (a mesma do desktop e do
        // site: beta encerrada ou avaliação vencida não liberam nada). Sem ela
        // carregada — a função falhou e a nova tentativa ainda não voltou —,
        // vale o plano da assinatura, para não trancar à toa o que a conta paga.
        if (state.license) return licenseAllows(state.license, feature);
        return planoPermite(state.plan?.id ?? null, feature);
      },
    }),
    [data, patch, definirUsuario, patientId, loadAccount, loadPatient, gravarAjustes, state.license, state.plan?.id],
  );

  const pendingAlertMinimized = Boolean(state.pendingAlert && state.minimizedAlertKey === chaveDoAlerta(state.pendingAlert));
  const value = useMemo(() => ({ ...state, ...actions, pendingAlertMinimized }), [state, actions, pendingAlertMinimized]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp deve ser usado dentro de AppProvider');
  return ctx;
}

/**
 * Provedor de produção sobre o projeto Supabase da IrisFlow (um banco para site,
 * desktop e este app; esquema nas migrações de `../supabase/migrations/`).
 *
 * Tabelas do site: profiles, beneficiaries, subscriptions, plans.
 * Tabelas criadas por `../supabase/migrations/20260923022425_caregiver_app.sql`:
 * devices, sessions, help_requests, messages, quick_phrases, patient_settings, push_tokens.
 * Da beta (`../supabase/migrations/20260923022616_beta.sql`): `plans.purchasable`, `beta_registrations`.
 *
 * Toda leitura passa por RLS: o cuidador só enxerga os beneficiários do próprio profile.
 */
import { isAuthRetryableFetchError, type PostgrestError, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { siteRoute } from '@/lib/config';
import { secureStorage } from '@/lib/secureStorage';
import { apagarSessaoGuardada, criarClienteIsolado, getSupabase, lerSessaoGuardada } from '@/lib/supabase';
import {
  AccuracySummary,
  AuthUser,
  Beneficiary,
  BetaRegistration,
  ConflitoDeAjustes,
  DataProvider,
  Device,
  HelpRequest,
  License,
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

/** Último token de push que ESTE aparelho registrou — sobrevive ao fechamento do app. */
const CHAVE_TOKEN_REGISTRADO = 'irisflow.push.token-registrado';
/** Remoções de token que ficaram para depois (saída sem rede), com a credencial da conta que saiu. */
const CHAVE_SAIDA_PENDENTE = 'irisflow.push.saida-pendente';

interface SaidaPendente {
  tokens: string[];
  refresh_token: string;
}

/** O pedido não é visível para a conta logada (a RLS nega o UPDATE com 0 linhas, sem erro). */
const PEDIDO_INACESSIVEL = 'Este pedido não está acessível para a conta deste celular.';

/** Função RPC ausente no banco (migração ainda não aplicada): PGRST202, HTTP 404. */
function funcaoAusente(error: Pick<PostgrestError, 'code' | 'message'>, status?: number): boolean {
  return error.code === 'PGRST202' || status === 404 || /could not find the function/i.test(error.message ?? '');
}

/** Tópico único por assinatura: o realtime-js reaproveita um canal de mesmo nome ainda saindo, e o `subscribe()` dele não faz nada. */
let assinaturas = 0;

/** Quanto a saída espera o servidor (remoção do token, encerramento da sessão) antes de seguir sem ele. */
export const PRAZO_DA_SAIDA_MS = 5_000;

/** Um só cliente descartável para as saídas pendentes (sem sessão guardada, sem renovação automática). */
let isoladoCache: SupabaseClient | null = null;
function clienteIsolado(): SupabaseClient {
  isoladoCache ??= criarClienteIsolado();
  return isoladoCache;
}

export class SupabaseProvider implements DataProvider {
  private sb = getSupabase();
  /** Token Expo Push registrado nesta execução (o último de qualquer execução fica em `CHAVE_TOKEN_REGISTRADO`). */
  private pushToken: string | null = null;

  // ---------- auth ----------
  async getUser(): Promise<AuthUser | null> {
    const { data, error } = await this.sb.auth.getSession();
    const u = data.session?.user;
    if (u) return { id: u.id, email: u.email ?? '' };
    // Sem rede para renovar um token vencido o supabase-js responde "sem
    // sessão" com um erro de rede — mas a sessão continua guardada, e ele a
    // renova sozinho quando a rede voltar. Isso não é sair da conta: o cuidador
    // continua logado (as cargas avisam "sem internet") em vez de cair nas
    // boas-vindas achando que foi deslogado.
    if (error && isAuthRetryableFetchError(error)) {
      const guardada = await lerSessaoGuardada();
      if (guardada?.user?.id) return { id: guardada.user.id, email: guardada.user.email ?? '' };
    }
    return null;
  }
  async garantirSessao() {
    const { data, error } = await this.sb.auth.getSession();
    if (data.session) return;
    // Sem sessão o PostgREST responderia como ANÔNIMO — listas vazias, sem
    // erro. Melhor falhar como falha de conexão (a carga tenta de novo).
    if (error && isAuthRetryableFetchError(error)) throw new Error('Sem conexão para renovar o acesso à conta.');
    throw new Error('Sua sessão expirou. Entre de novo para continuar.');
  }
  async signIn(email: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.user) throw new Error(traduzErro(error?.message));
    return { id: data.user.id, email: data.user.email ?? '' };
  }
  async signOut(pushToken?: string | null) {
    // Antes de derrubar a sessão (a remoção exige auth.uid()): este celular
    // deixa de receber os alertas desta conta. Vale o token obtido agora e o
    // último registrado AQUI em qualquer execução — o registro desta execução
    // pode ter falhado e o de uma abertura anterior ter dado certo.
    const guardado = await secureStorage.getItem(CHAVE_TOKEN_REGISTRADO).catch(() => null);
    const tokens = [...new Set([pushToken, this.pushToken, guardado].filter((t): t is string => Boolean(t)))];
    // A credencial para concluir depois vem do armazenamento, sem rede: pedir
    // a sessão ao supabase-js com o token vencido e sem internet espera ~30 s.
    const credencial = (await lerSessaoGuardada())?.refresh_token ?? null;
    // Sem rede, cada chamada pode esperar a renovação do token: a saída não
    // fica presa — o que não coube no prazo vira remoção pendente.
    const pendentes = tokens.length ? await comPrazo(removerTodos(this.sb, tokens), PRAZO_DA_SAIDA_MS, tokens) : [];
    if (pendentes.length && credencial) {
      // `concluirSaidaPendente` termina a remoção quando a rede voltar — o
      // celular não pode seguir recebendo os socorros de uma conta da qual saiu.
      await this.gravarSaidasPendentes([...(await this.lerSaidasPendentes()), { tokens: pendentes, refresh_token: credencial }]);
    }
    this.pushToken = null;
    await secureStorage.removeItem(CHAVE_TOKEN_REGISTRADO).catch(() => undefined);
    // `local`: sai só DESTE celular. O padrão do supabase-js é `global`, que
    // revoga a sessão da conta em todo lugar — e a conta é da família: sair
    // num celular derrubava o app dos outros cuidadores (e o alarme de
    // socorro com ele) e a escuta do computador do paciente.
    const { error } = await comPrazo(
      this.sb.auth.signOut({ scope: 'local' }).catch((e: unknown) => ({ error: e })),
      PRAZO_DA_SAIDA_MS,
      { error: new Error('Sem resposta do servidor ao sair.') },
    );
    // Sem rede e com o token vencido o supabase-js devolve o erro SEM apagar a
    // sessão guardada: a tela mostrava as boas-vindas e, na abertura seguinte,
    // o cuidador estava logado de novo.
    if (error) await apagarSessaoGuardada();
  }
  onAuthChange(cb: (u: AuthUser | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((evento, session) => {
      const u = session?.user;
      if (u) cb({ id: u.id, email: u.email ?? '' });
      // Só a saída explícita tira o cuidador da conta. O INITIAL_SESSION também
      // chega sem sessão quando a renovação falhou por falta de rede — a sessão
      // continua guardada e `getUser` já decidiu o estado inicial.
      else if (evento === 'SIGNED_OUT') cb(null);
    });
    return () => data.subscription.unsubscribe();
  }
  async concluirSaidaPendente(): Promise<boolean> {
    const pendentes = await this.lerSaidasPendentes();
    if (pendentes.length === 0) return true;
    const restantes: SaidaPendente[] = [];
    for (const p of pendentes) {
      const r = await this.concluirSaida(p);
      if (r) restantes.push(r);
    }
    await this.gravarSaidasPendentes(restantes);
    return restantes.length === 0;
  }
  /** Conclui uma saída pendente; devolve o que ainda falta (com a credencial renovada) ou `null`. */
  private async concluirSaida(p: SaidaPendente): Promise<SaidaPendente | null> {
    // Um token registrado de novo NESTE aparelho (outra conta entrou e o
    // registro o transferiu) não é removido: agora ele é da conta logada.
    const registrado = await secureStorage.getItem(CHAVE_TOKEN_REGISTRADO).catch(() => null);
    const tokens = p.tokens.filter((t) => t !== registrado && t !== this.pushToken);
    if (tokens.length === 0) return null;
    const isolado = clienteIsolado();
    const { data, error } = await isolado.auth.refreshSession({ refresh_token: p.refresh_token });
    if (error || !data.session) {
      // Rede: tenta de novo depois. Credencial recusada (sessão revogada,
      // senha trocada): daqui não há mais como remover — o próximo registro
      // neste aparelho transfere o token para a conta que entrar.
      if (error && isAuthRetryableFetchError(error)) return { tokens, refresh_token: p.refresh_token };
      console.warn('[IrisFlow Cuidador] saída pendente abandonada: credencial recusada.', error?.message);
      return null;
    }
    // O refresh token gira a cada renovação: o próximo passo usa o novo.
    const atual: SaidaPendente = { tokens, refresh_token: data.session.refresh_token };
    for (const token of tokens) {
      try {
        await removerToken(isolado, token);
        atual.tokens = atual.tokens.filter((t) => t !== token);
      } catch {
        return atual;
      }
    }
    // Com rede de novo, encerra no servidor a sessão da conta que saiu.
    await isolado.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return null;
  }
  private async lerSaidasPendentes(): Promise<SaidaPendente[]> {
    try {
      const bruto = await secureStorage.getItem(CHAVE_SAIDA_PENDENTE);
      const lista = bruto ? (JSON.parse(bruto) as SaidaPendente[]) : [];
      return Array.isArray(lista) ? lista.filter((p) => p && Array.isArray(p.tokens) && typeof p.refresh_token === 'string') : [];
    } catch {
      return [];
    }
  }
  private async gravarSaidasPendentes(lista: SaidaPendente[]) {
    if (lista.length === 0) await secureStorage.removeItem(CHAVE_SAIDA_PENDENTE).catch(() => undefined);
    else await secureStorage.setItem(CHAVE_SAIDA_PENDENTE, JSON.stringify(lista)).catch(() => undefined);
  }
  async requestPasswordReset(email: string) {
    // O link do e-mail leva à página do site onde se define a senha nova — a
    // mesma que o "esqueci a senha" do próprio site usa. Sem `redirectTo`, o
    // Supabase mandava para a "Site URL" do painel (a página inicial), e quem
    // abria o link não via onde trocar a senha. A URL precisa estar em
    // Authentication → URL Configuration → Redirect URLs; se não estiver, o
    // Supabase cai na Site URL e o site encaminha o evento de recuperação
    // para /nova-senha de qualquer página.
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: siteRoute('/nova-senha'),
    });
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
  async getLicense(): Promise<License> {
    // A mesma função que o desktop chama no login e o site na Conta: a regra
    // de acesso mora no banco (`license_for_profile`), não aqui.
    const { data, error } = await this.sb.rpc('desktop_license');
    if (error) throw error;
    return data as License;
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
    // `acknowledged_by` = quem confirmou (auth.uid()): com mais de um celular
    // na conta, o histórico diz qual cuidador viu o pedido.
    const user = await this.getUser();
    const { data, error } = await this.sb
      .from('help_requests')
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user?.id ?? null })
      .eq('id', id)
      .is('acknowledged_at', null)
      .select('id');
    if (error) throw error;
    if (data?.length) return;
    // Nenhuma linha: ou outro celular já confirmou (tudo certo), ou a RLS negou
    // em silêncio (UPDATE 0, sem erro) — e a tela diria "confirmado" sem nada
    // gravado. Só a releitura diz qual dos dois.
    const { data: linha, error: erroDaLeitura } = await this.sb.from('help_requests').select('acknowledged_at').eq('id', id).maybeSingle();
    if (erroDaLeitura) throw erroDaLeitura;
    if (!(linha as { acknowledged_at?: string | null } | null)?.acknowledged_at) throw new Error(PEDIDO_INACESSIVEL);
  }
  async resolveHelpRequest(id: string) {
    const now = new Date().toISOString();
    const { data, error } = await this.sb.from('help_requests').update({ resolved_at: now }).eq('id', id).select('id');
    if (error) throw error;
    // UPDATE 0 sem erro = a RLS negou: nada foi resolvido.
    if (!data?.length) throw new Error(PEDIDO_INACESSIVEL);
    // Segundo UPDATE (reconhecimento implícito): o erro sobe igual ao do primeiro.
    // Engolir aqui fazia a tela dizer "resolvido" mesmo sem nada ter gravado.
    await this.acknowledgeHelpRequest(id);
  }

  // ---------- conversa ----------
  async listMessages(beneficiaryId: string): Promise<Message[]> {
    // As 200 MAIS RECENTES (desc + limit), devolvidas em ordem cronológica.
    // Com `asc + limit` vinham as 200 mais antigas: numa conversa longa a
    // tela mostrava só o passado e as mensagens novas nunca apareciam.
    const { data, error } = await this.sb
      .from('messages')
      .select('*')
      .eq('beneficiary_id', beneficiaryId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return ((data ?? []) as Message[]).reverse();
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
    // Devolve as linhas que o banco marcou: a tela só muda o que de fato foi
    // gravado (antes o erro era ignorado e o selo sumia sem nada no banco).
    const { data, error } = await this.sb
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('beneficiary_id', beneficiaryId)
      .eq('sender', 'paciente')
      .is('read_at', null)
      .select('id, read_at');
    if (error) throw error;
    return (data ?? []) as Pick<Message, 'id' | 'read_at'>[];
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
  /**
   * A linha de ajustes, ou `null` se o cuidador nunca salvou nada. Sem linha
   * NÃO se inventam padrões: o computador do paciente segue com o que foi
   * configurado localmente, e a tela diz "ainda não sincronizado".
   */
  async getSettings(beneficiaryId: string): Promise<PatientSettings | null> {
    const { data, error } = await this.sb.from('patient_settings').select('*').eq('beneficiary_id', beneficiaryId).maybeSingle();
    if (error) throw error;
    return data ? (data as PatientSettings) : null;
  }
  /**
   * Gravação PARCIAL: só as colunas alteradas vão no payload — o desktop, que
   * assina `patient_settings`, não recebe padrões que ninguém pediu (antes a
   * primeira gravação mandava a linha inteira e sobrescrevia o dwell local).
   *
   * Com concorrência otimista: dois celulares (ou o computador, que grava o
   * rótulo da voz) não se sobrescrevem mais. Antes o app gravava a lista de
   * contatos inteira calculada do estado local, e um contato adicionado no
   * outro celular sumia sem aviso.
   *   - sem linha lida (`lidoEm` null): INSERT puro — se alguém criou a linha
   *     depois da leitura, a chave primária recusa (23505);
   *   - com linha: UPDATE só se `updated_at` (carimbado pelo gatilho a cada
   *     gravação) ainda é o lido — nenhuma linha afetada = alguém gravou antes.
   * Nos dois casos sobe `ConflitoDeAjustes` sem gravar nada.
   */
  async updateSettings(beneficiaryId: string, patch: Partial<PatientSettings>, lidoEm: string | null): Promise<PatientSettings> {
    const { beneficiary_id: _b, updated_at: _u, ...campos } = patch;
    if (lidoEm === null) {
      const { data, error } = await this.sb.from('patient_settings').insert({ ...campos, beneficiary_id: beneficiaryId }).select('*').single();
      if (error?.code === '23505') throw new ConflitoDeAjustes();
      if (error) throw error;
      return data as PatientSettings;
    }
    const { data, error } = await this.sb
      .from('patient_settings')
      .update(campos)
      .eq('beneficiary_id', beneficiaryId)
      .eq('updated_at', lidoEm)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ConflitoDeAjustes();
    return data as PatientSettings;
  }

  // ---------- tempo real ----------
  subscribe(beneficiaryId: string, handlers: RealtimeHandlers) {
    const filter = `beneficiary_id=eq.${beneficiaryId}`;
    assinaturas += 1;
    const channel: RealtimeChannel = this.sb
      .channel(`caregiver:${beneficiaryId}:${Date.now()}-${assinaturas}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter }, (p) => {
        if (p.new && 'id' in p.new) handlers.onMessage?.(p.new as Message);
      })
      // '*' e não só INSERT: o escalonamento é um UPDATE feito pelo servidor
      // (`escalated_at`), e o reconhecimento feito em outro celular também.
      // A tabela está na publicação `supabase_realtime` com REPLICA IDENTITY FULL
      // (migração 20260923022425_caregiver_app), então `p.new` traz a linha inteira nos dois eventos.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'help_requests', filter }, (p) => {
        if (p.new && 'id' in p.new) handlers.onHelpRequest?.(p.new as HelpRequest);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter }, (p) => {
        if (p.new && 'id' in p.new) handlers.onSession?.(mapSession(p.new));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'devices', filter }, (p) => {
        if (p.new && 'id' in p.new) handlers.onDevice?.(mapDevice(p.new));
      })
      // Ajustes gravados em outro celular (contatos de emergência, prazo) ou
      // pelo computador (rótulo da voz): sem isto cada celular mostrava a sua
      // lista até recarregar. Também está na publicação desde a migração do app.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_settings', filter }, (p) => {
        if (p.new && 'beneficiary_id' in p.new) handlers.onSettings?.(p.new as PatientSettings);
      })
      // A cada inscrição confirmada — a primeira e as que o cliente refaz
      // sozinho depois de a conexão cair (celular bloqueado, troca de rede) —
      // quem chama recarrega: o tempo real não reenvia o que chegou enquanto
      // o canal estava fora, e um socorro nesse intervalo ficaria invisível.
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') handlers.onSubscribed?.();
      });
    return () => {
      this.sb.removeChannel(channel);
    };
  }

  async registerPushToken(token: string) {
    const user = await this.getUser();
    if (!user) throw new Error('Sem sessão: o token de push não foi registrado.');
    // RPC `registrar_push_token` (security definer): o aparelho passa a
    // pertencer à conta logada nele. O upsert direto era recusado pela RLS
    // quando o token ainda era de outra conta (quem saiu sem rede, ou a conta
    // anterior do mesmo celular) — e o celular seguia recebendo os socorros
    // da conta antiga, não os da nova. Banco sem a função: o upsert de antes.
    // O erro SOBE: quem chama decide o que mostrar; aqui só o registro.
    const { error, status } = await this.sb.rpc('registrar_push_token', { p_token: token, p_platform: 'expo' });
    let falha: { message: string } | null = error;
    if (error && funcaoAusente(error, status)) {
      const r = await this.sb.from('push_tokens').upsert({ profile_id: user.id, token, platform: 'expo' }, { onConflict: 'token' });
      falha = r.error;
    }
    if (falha) {
      console.warn('[IrisFlow Cuidador] falha ao registrar o token de push:', falha.message);
      throw new Error(traduzErroPush(falha.message));
    }
    this.pushToken = token;
    await secureStorage.setItem(CHAVE_TOKEN_REGISTRADO, token).catch(() => undefined);
  }
}

/** Cada token que não saiu (a primeira falha interrompe: sem rede, as outras também falhariam). */
async function removerTodos(sb: SupabaseClient, tokens: string[]): Promise<string[]> {
  for (let i = 0; i < tokens.length; i++) {
    try {
      await removerToken(sb, tokens[i]);
    } catch (e) {
      console.warn('[IrisFlow Cuidador] token de push não removido ao sair:', (e as Error)?.message);
      return tokens.slice(i);
    }
  }
  return [];
}

/** `promessa`, ou `seEsgotar` se ela não resolver em `ms`. Nunca rejeita por causa do prazo. */
function comPrazo<T>(promessa: Promise<T>, ms: number, seEsgotar: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(seEsgotar), ms);
  });
  return Promise.race([promessa, prazo]).finally(() => clearTimeout(timer));
}

/** Tira o token da tabela: RPC `remover_push_token`; num banco sem a função, o DELETE de antes (sob RLS). */
async function removerToken(sb: SupabaseClient, token: string): Promise<void> {
  const { error, status } = await sb.rpc('remover_push_token', { p_token: token });
  if (!error) return;
  if (!funcaoAusente(error, status)) throw error;
  const r = await sb.from('push_tokens').delete().eq('token', token);
  if (r.error) throw r.error;
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

function traduzErroPush(msg: string) {
  if (/network|fetch/i.test(msg)) return 'Sem conexão ao registrar o celular para receber alertas.';
  if (/permission|policy|row-level/i.test(msg)) return 'O servidor recusou o registro deste celular para alertas.';
  return `Falha ao registrar este celular para alertas: ${msg}`;
}

/**
 * Só as falhas que de fato acontecem no `resetPasswordForEmail`: intervalo
 * mínimo entre dois links para o mesmo e-mail, limite de envio, falha do
 * servidor de e-mail, rede, e-mail malformado.
 */
function traduzErroReset(msg?: string) {
  if (!msg) return 'Não foi possível pedir o link agora. Tente novamente.';
  // "For security purposes, you can only request this after 60 seconds." — o
  // "Enviar o link de novo" logo depois de um envio cai aqui.
  const espera = msg.match(/only request this after (\d+) seconds?/i);
  if (espera) return `Aguarde ${espera[1]} segundos antes de pedir outro link.`;
  if (/rate limit|too many/i.test(msg)) return 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.';
  if (/error sending/i.test(msg)) return 'Não conseguimos enviar o e-mail agora. Tente de novo mais tarde ou escreva para irisflowteam@gmail.com.';
  if (/invalid|unable to validate/i.test(msg)) return 'Confira o e-mail digitado.';
  if (/network/i.test(msg)) return 'Sem conexão. Verifique sua internet.';
  return msg;
}

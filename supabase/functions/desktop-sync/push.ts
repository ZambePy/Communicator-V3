// Montagem do push do cuidador (API de push da Expo).
//
// Módulo sem APIs do Deno: é importado pela função e pelos testes
// (`deno test supabase/functions/desktop-sync/`).

export const TITULOS: Record<string, string> = {
  emergencia: '🚨 Pedido de socorro',
  ajuda: 'Pedido de ajuda',
  postura: 'Aviso de postura',
  fadiga: 'Sinal de fadiga',
  recalibracao: 'Recalibração recomendada',
  dispositivo: 'Problema no dispositivo',
};

/** Socorro e pedido de ajuda: exigem que alguém vá até o paciente agora. */
export function exigeAcao(kind: string): boolean {
  return kind === 'emergencia' || kind === 'ajuda';
}

/**
 * Tipos que vão por push. Além do socorro e da ajuda, o `dispositivo`
 * (19/10/2026): o computador avisa quando o rastreamento está com um problema
 * que persiste (rosto fora da câmera, câmera parada) — o paciente pode estar
 * sem como pedir nada, e o cuidador só ficava sabendo se abrisse o app. Vai no
 * canal comum, sem furar o modo Foco: é aviso, não socorro. Postura, fadiga e
 * recalibração continuam só no histórico (chegam pelo realtime).
 */
export function avisaPorPush(kind: string): boolean {
  return exigeAcao(kind) || kind === 'dispositivo';
}

export type MensagemDePush = {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  interruptionLevel: 'time-sensitive' | 'active';
  channelId: 'emergencia' | 'default';
  /** `help_request_id`: o app do cuidador abre ESTE pedido e não duplica o alarme. */
  data: { kind: string; beneficiary_id: string; help_request_id?: string };
};

/**
 * Uma mensagem por celular da conta.
 *
 * `interruptionLevel: 'time-sensitive'` no socorro e no pedido de ajuda: no
 * iOS o aviso passa pelo modo Foco e pelo resumo agendado (vale com o
 * entitlement de Time Sensitive no app; sem ele o iOS trata como `active`).
 * No Android quem dá a prioridade é o canal `emergencia`, criado pelo app com
 * importância máxima. É a mesma prioridade do reenvio pelo escalonamento
 * (migração 20260927105153_escalonamento_reenvio).
 */
export function mensagensDePush(
  tokens: string[],
  kind: string,
  nome: string,
  corpo: string,
  beneficiaryId: string,
  helpRequestId?: string,
): MensagemDePush[] {
  const urgente = exigeAcao(kind);
  return tokens.map((to) => ({
    to,
    title: TITULOS[kind] ?? 'IrisFlow',
    body: `${nome}: ${corpo}`.slice(0, 180),
    sound: 'default',
    priority: 'high',
    interruptionLevel: urgente ? 'time-sensitive' : 'active',
    channelId: urgente ? 'emergencia' : 'default',
    data: helpRequestId
      ? { kind, beneficiary_id: beneficiaryId, help_request_id: helpRequestId }
      : { kind, beneficiary_id: beneficiaryId },
  }));
}

/** O `push` da resposta de `help.create`, como o computador o lê. */
export type PushDaResposta = { avisados: number; recusados: number; motivos: string[] };

/**
 * O `push` da resposta de um REENVIO (`repetido`): o mesmo pedido chegou de
 * novo — a resposta do primeiro envio se perdeu e a fila do computador
 * reenviou. O reenvio não manda outro push (seria o segundo alarme no celular
 * para o mesmo pedido), e o resultado do push do primeiro envio não fica
 * gravado no banco (não há coluna para isso, e nesta revisão não entra
 * migração nova).
 *
 * Antes a resposta voltava sem o campo, e o computador lia "o celular do
 * cuidador foi avisado" — sem ninguém saber (revisão de UX de 19/10/2026).
 * Agora diz só o que dá para saber AGORA:
 *  - `celulares === 0`: a conta não tem nenhum celular cadastrado, então
 *    nenhum aviso pode ter chegado (`avisados: 0`, motivo `sem_celular`);
 *  - com celular cadastrado, ou se a consulta falhou (`null`): não se sabe
 *    se o primeiro push foi aceito → `null`. O computador trata como "gravado,
 *    sem confirmação do push" e liga o alarme local no prazo de quem não foi
 *    avisado (`push_incerto` em frontend/src/cloud/eventos.ts);
 *  - tipo que não vai por push: `undefined` (a resposta segue sem o campo).
 */
export function pushDoReenvio(kind: string, celulares: number | null): PushDaResposta | null | undefined {
  if (!avisaPorPush(kind)) return undefined;
  if (celulares === 0) return { avisados: 0, recusados: 0, motivos: ['sem_celular'] };
  return null;
}

/** O que a Expo respondeu ao envio, por celular. */
export interface ResumoDoPush {
  /** Celulares cujo aviso a Expo aceitou. */
  avisados: number;
  /** Celulares cujo aviso a Expo recusou. */
  recusados: number;
  /** Motivos das recusas, sem repetição (ex. `DeviceNotRegistered`, `InvalidCredentials`). */
  motivos: string[];
  /** Tokens que a Expo diz que não existem mais: saem da tabela. */
  tokensInvalidos: string[];
}

/**
 * Lê a resposta da API de push da Expo (`{ data: [ticket...] }`, um ticket por
 * mensagem, na mesma ordem; ou `{ errors: [...] }` quando o pedido inteiro foi
 * recusado).
 *
 * Antes a resposta era ignorada: com o FCM sem credencial (o caso de hoje) a
 * Expo responde 200 com tickets de erro, a função dizia "ok" e o computador
 * mostrava "o celular do cuidador foi avisado" — sem nenhum celular avisado.
 * Erro de entrega que só aparece depois (no recibo) não está aqui; ver o
 * relatório de 19/10/2026.
 */
export function resumoDosTickets(tokens: string[], resposta: unknown, httpOk = true): ResumoDoPush {
  const motivos = new Set<string>();
  const tokensInvalidos: string[] = [];
  const corpo = (resposta ?? {}) as { data?: unknown; errors?: Array<{ code?: string; message?: string }> };
  const tickets = Array.isArray(corpo.data) ? corpo.data as Array<{ status?: string; message?: string; details?: { error?: string } }> : null;
  if (!httpOk || !tickets) {
    for (const e of corpo.errors ?? []) motivos.add(e.code ?? e.message ?? 'erro');
    if (motivos.size === 0) motivos.add(httpOk ? 'resposta_inesperada' : 'http');
    return { avisados: 0, recusados: tokens.length, motivos: [...motivos], tokensInvalidos };
  }
  let avisados = 0;
  let recusados = 0;
  tokens.forEach((token, i) => {
    const t = tickets[i];
    if (t && t.status === 'ok') {
      avisados++;
      return;
    }
    recusados++;
    const motivo = t?.details?.error ?? t?.message ?? 'sem_ticket';
    motivos.add(motivo);
    if (motivo === 'DeviceNotRegistered') tokensInvalidos.push(token);
  });
  return { avisados, recusados, motivos: [...motivos], tokensInvalidos };
}

// ---------------------------------------------------------------------------
// Quem avisar (revisão final de 22/10/2026, R3)
// ---------------------------------------------------------------------------

type ErroDeLeitura = { message: string; code?: string | null };
type Leitura<T> = { data: T | null; error: ErroDeLeitura | null };

export interface DependenciasDosCelulares {
  /** `beneficiaries` do paciente (`profile_id` e `user_name`); `data: null` e sem erro = não existe. */
  beneficiario(): PromiseLike<Leitura<{ profile_id: string; user_name: string }>>;
  /** `push_tokens` do perfil dono da conta. */
  tokens(profileId: string): PromiseLike<Leitura<Array<{ token: string }>>>;
  /** Pausa antes da segunda tentativa (os testes passam uma que não espera). */
  esperar?(ms: number): Promise<void>;
}

export type CelularesParaAvisar =
  | { tipo: 'ok'; nome: string; tokens: string[] }
  /** O banco respondeu: não há quem avisar. */
  | { tipo: 'nenhum'; motivo: 'sem_beneficiario' | 'sem_celular' }
  /** O banco NÃO respondeu (nem na segunda tentativa): não se sabe se há quem avisar. */
  | { tipo: 'erro'; mensagem: string };

const PAUSA_ANTES_DA_SEGUNDA_LEITURA_MS = 250;

/**
 * Uma leitura do banco, com UMA segunda tentativa se falhar (erro ou exceção).
 * "Não achou" não é falha: volta de primeira, com `data: null` e sem erro.
 */
async function lerDuasVezes<T>(ler: () => PromiseLike<Leitura<T>>, esperar: (ms: number) => Promise<void>): Promise<Leitura<T>> {
  const tentar = async (): Promise<Leitura<T>> => {
    try {
      return await ler();
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  };
  const primeira = await tentar();
  if (!primeira.error) return primeira;
  await esperar(PAUSA_ANTES_DA_SEGUNDA_LEITURA_MS);
  return tentar();
}

/**
 * Os celulares da conta do paciente, para o push do socorro e da ajuda.
 *
 * Antes as duas leituras ignoravam o `error`: um soluço do banco virava "sem
 * celular" — sem uma linha de log e sem segunda tentativa, e o push do pedido
 * só saía pelo escalonamento, 45 s depois. Agora a leitura que falha tem uma
 * segunda tentativa, e se falhar de novo volta `erro` (a função loga e o
 * computador, que só lê `avisados === 0`, liga o alarme local na hora).
 */
export async function celularesParaAvisar(dep: DependenciasDosCelulares): Promise<CelularesParaAvisar> {
  const esperar = dep.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const ben = await lerDuasVezes(() => dep.beneficiario(), esperar);
  if (ben.error) return { tipo: 'erro', mensagem: ben.error.message };
  if (!ben.data) return { tipo: 'nenhum', motivo: 'sem_beneficiario' };
  const { profile_id: perfil, user_name: nome } = ben.data;
  const celulares = await lerDuasVezes(() => dep.tokens(perfil), esperar);
  if (celulares.error) return { tipo: 'erro', mensagem: celulares.error.message };
  const tokens = (celulares.data ?? []).map((t) => t.token);
  if (!tokens.length) return { tipo: 'nenhum', motivo: 'sem_celular' };
  return { tipo: 'ok', nome, tokens };
}

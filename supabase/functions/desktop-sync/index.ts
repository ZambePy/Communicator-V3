// Edge Function `desktop-sync`
//
// É por aqui que o app DESKTOP escreve no banco. Ele não usa a sessão do
// usuário para escrever: usa a chave do computador (`x-device-key`), gerada
// por `pair_device()` no login e guardada com safeStorage. Assim o servidor
// sabe QUAL computador e QUAL paciente estão falando, força `sender =
// 'paciente'` nas mensagens e dispara o push do cuidador — nada disso poderia
// ser confiado ao cliente.
//
// Deploy:   supabase functions deploy desktop-sync
//           (verify_jwt fica desligado em supabase/config.toml: o desktop se
//            autentica pela chave do computador. Ele também manda o JWT anônimo
//            no header, então funciona nos dois modos.)
// Segredos: SUPABASE_SERVICE_ROLE_KEY (já existe no projeto); EXPO_ACCESS_TOKEN
//           é opcional (push autenticado).
//
// Contrato (POST JSON { action, ...payload }) — espelhado em
// frontend/src/cloud/desktopSync.ts (raiz do monorepo).
//
// Horário do evento: session.end, calibration.result, message.send,
// message.spoken e help.create podem trazer `occurred_at` (ISO), o instante em
// que aconteceram no computador, e `sent_at`, o relógio do computador no
// envio. Um evento que esperou na fila offline é gravado com a hora do
// servidor menos o atraso medido no computador (sent_at − occurred_at), o
// que cancela relógio errado; só com occurred_at, vale a janela plausível
// (ver ./horario.ts). Sem os campos — desktops antigos — ou fora dos limites,
// vale a hora do servidor.
//
//   heartbeat          { app_version, camera_ok, tracker_ok, calibrated, session_id? }
//                      → { ok, pending_messages, sessao_aberta?, reconhecimentos }
//                      (`reconhecimentos`: confirmações do cuidador das últimas
//                       6 h, socorro e ajuda — reserva do realtime, 19/10/2026)
//                      (também carimba sessions.last_heartbeat_at — migração
//                       20260923022642_sessoes_orfas: só da `session_id` enviada;
//                       com `session_id: null`, de nenhuma; sem o campo (desktops
//                       antigos), de todas as abertas deste computador — ver
//                       sessoesDoHeartbeat em ./respostas.ts. `sessao_aberta` diz
//                       se a `session_id` enviada ainda está aberta — o job de
//                       sessões órfãs pode tê-la encerrado)
//   session.upsert     { session: { id?, status, dwell_ms, filter_preset, ... } } → { ok, id }
//   session.end        { session_id, utterances?, chars_typed?, modules_used?, occurred_at?, sent_at? } → { ok }
//   calibration.result { session_id?, calibration: {...}, report: {...}, occurred_at?, sent_at? } → { ok, id }
//   message.send       { id?, text, kind, occurred_at?, sent_at? }  → { ok, id }   (sender = paciente)
//                      (`id`: UUID gerado no computador; um reenvio com o mesmo id
//                       não grava a mensagem duas vezes)
//   message.spoken     { message_id, occurred_at?, sent_at? }  → { ok }       (msg do cuidador vocalizada)
//   messages.pending   {}                            → { messages } (do cuidador, ainda não faladas)
//   help.create        { id?, kind, message, session_id, occurred_at?, sent_at? } → { ok, id, push? }   + push
//                      (`push`: { avisados, recusados, motivos } nos tipos que vão
//                       por push — socorro, ajuda e dispositivo; 19/10/2026)
//                      (`id`: UUID gerado no computador; um reenvio com o mesmo id
//                       não cria outro pedido nem outro push → { ok, id,
//                       repetido: true, push? } — `push` com `avisados: 0` se a
//                       conta não tem celular cadastrado, `null` se não dá para
//                       saber se o push do primeiro envio foi aceito (ele não
//                       fica gravado); revisão de UX de 19/10/2026)
//                      (`dispositivo` e `ajuda` passam pelo limite do banco, por
//                       computador e sob trava — registrar_aviso_com_limite,
//                       21/10/2026: dispositivo, o mesmo texto no máximo a cada
//                       15 min e 4 por hora; ajuda, 6 a cada 10 min. Acima disso
//                       → { ok, limitado, push: { avisados: 0, motivos: ['limite'] } },
//                       sem gravar nem mandar push — o computador mostra "nenhum
//                       celular avisado". O socorro NUNCA é limitado. Ver ./limites.ts)
//   voice.status       { voice }                     → { ok, stored }  (rótulo da voz em uso)
//   report.send        { report, motivo?, resumo? }     → { ok, stored }  (opt-in; só números)
//   settings.get       {}                            → { settings, phrases }
//   device.info        {}                            → { device, beneficiary, license, devices_active }
//   pairing.create     {}                            → { ok, id, codigo, expira_em, restante_s, validade_s }
//                      (código do QR que conecta o celular do cuidador sem senha,
//                       19/10/2026: vale 3 min e uma vez só; o banco guarda só o
//                       hash — migração 20261019200000_pareamento_do_celular.
//                       429 `limite` (5 em 10 min, com `tente_em`), 409
//                       `email_nao_confirmado`)
//   pairing.status     { id }                        → { ok, estado, restante_s?, usado_em?, conectado_em? }
//                      (`estado`: aguardando | usado | conectado | vencido |
//                       cancelado | desconhecido — ver ./pareamento.ts)
//   pairing.cancel     { id }                        → { ok }  (a tela do QR fechou: o código para de valer)
//
// Erros: 401/403 só quando a chave não existe ou foi revogada — o desktop
// apaga o vínculo e a fila ao receber. Falha do banco ao CONFERIR a chave é
// 503, nunca 401. Erro do banco numa escrita é 400 só quando o conteúdo é
// inválido (ver ./respostas.ts); o resto é 503, e o desktop reenvia.
//
// O renderer do Electron roda em `file://` (origem "null") e manda um header
// customizado, então o navegador faz preflight: CORS liberado abaixo.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corpoDoPedido, horarioDoEvento } from './horario.ts';
import { pedidoComLimite, registroComIntervalo } from './limites.ts';
import { avisaPorPush, celularesParaAvisar, mensagensDePush, pushDoReenvio, resumoDosTickets, TITULOS, type ResumoDoPush } from './push.ts';
import { avisoDeDispositivoExcedido, idDoCliente, sessoesDoHeartbeat, statusDoErroDoBanco } from './respostas.ts';
import { estadoDoPareamento, respostaDaCriacao } from './pareamento.ts';
import { gerarCodigo, hashDoCodigo } from './codigoDoCelular.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/** Log do limite de avisos: uma linha por motivo a cada minuto (ver ./limites.ts). */
const logDoLimite = registroComIntervalo(60_000, (linha) => console.warn(`[desktop-sync] ${linha}`));

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, x-device-key, authorization, apikey',
  'access-control-allow-methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

/** Resposta para um erro do banco: 400 se o conteúdo é inválido, 503 se é passageiro. */
function erroDoBanco(erro: { message: string; code?: string | null }) {
  return json({ error: erro.message }, statusDoErroDoBanco(erro));
}

/** O push não pode segurar a resposta: o desktop desiste em 10 s e reenviaria o pedido. */
const PRAZO_DO_PUSH_MS = 6_000;

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const HELP_KINDS = new Set(Object.keys(TITULOS));
const MSG_KINDS = new Set(['texto', 'frase', 'pictograma', 'simnao', 'sistema']);
const SESSION_STATUS = new Set(['calibrating', 'active', 'paused', 'ended']);

// Colunas de `sessions` que o desktop pode escrever. Tudo fora daqui é
// descartado — o banco tem colunas de controle (beneficiary_id, device_id,
// help_requests via trigger) que o cliente não decide.
const SESSION_FIELDS = new Set([
  'status', 'started_at', 'ended_at',
  'calibration_error_px', 'calibration_error_deg', 'calibration_seconds', 'calibration_at',
  'hit_rate_150px', 'hit_rate_100px', 'precision_px', 'precision_deg', 'accuracy_report',
  'posture_drift_px', 'drift_kind', 'blink_rate_bpm', 'fatigue',
  'dwell_ms', 'filter_preset', 'utterances', 'chars_typed', 'modules_used',
  'capture_conditions', 'app_version',
]);

function pickSession(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input ?? {})) if (SESSION_FIELDS.has(k) && v !== undefined) out[k] = v;
  if (out.status !== undefined && !SESSION_STATUS.has(String(out.status))) delete out.status;
  return out;
}

/**
 * Avisa os celulares da conta. Devolve quantos a Expo aceitou e quantos
 * recusou (com os motivos), para o computador dizer a verdade na tela de
 * emergência — "o celular do cuidador foi avisado" só quando foi — e ligar o
 * alarme local na hora quando nenhum celular foi avisado. Tokens que a Expo diz
 * que não existem mais (`DeviceNotRegistered`) saem da tabela.
 */
async function notifyCaregiver(beneficiaryId: string, kind: string, body: string, helpRequestId?: string): Promise<ResumoDoPush> {
  const nenhum = (motivo: string): ResumoDoPush => ({ avisados: 0, recusados: 0, motivos: [motivo], tokensInvalidos: [] });
  // Falha de leitura do banco não é "sem celular" (revisão final de 22/10/2026):
  // tem uma segunda tentativa e, se persistir, aparece no log da função. O
  // computador liga o alarme local (avisados 0) e o escalonamento reenvia.
  const celulares = await celularesParaAvisar({
    beneficiario: () => supabase.from('beneficiaries').select('profile_id, user_name').eq('id', beneficiaryId).maybeSingle(),
    tokens: (perfil) => supabase.from('push_tokens').select('token').eq('profile_id', perfil),
  });
  if (celulares.tipo === 'erro') {
    console.error('[desktop-sync] não deu para ler os celulares da conta; o escalonamento reenvia', celulares.mensagem);
    return nenhum('erro_banco');
  }
  if (celulares.tipo === 'nenhum') return nenhum(celulares.motivo);
  const { nome, tokens } = celulares;
  const messages = mensagensDePush(tokens, kind, nome, body, beneficiaryId, helpRequestId);
  let resumo: ResumoDoPush;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}),
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(PRAZO_DO_PUSH_MS),
    });
    let corpo: unknown = null;
    try { corpo = await res.json(); } catch { /* sem corpo */ }
    resumo = resumoDosTickets(tokens, corpo, res.ok);
  } catch (e) {
    // O alerta já está no banco (e chega por realtime); o push é o segundo canal.
    console.error('[desktop-sync] push falhou', e);
    return { avisados: 0, recusados: tokens.length, motivos: ['rede'], tokensInvalidos: [] };
  }
  if (resumo.recusados) {
    // Nos logs da função: é aqui que aparece "InvalidCredentials" quando o
    // FCM (Android) ainda não foi configurado no EAS.
    console.error(`[desktop-sync] push recusado para ${resumo.recusados} celular(es): ${resumo.motivos.join(', ')}`);
  }
  if (resumo.tokensInvalidos.length) {
    const { error } = await supabase.from('push_tokens').delete().in('token', resumo.tokensInvalidos);
    if (error) console.error('[desktop-sync] tokens inválidos não removidos', error.message);
  }
  return resumo;
}

/**
 * Quantos celulares a conta do paciente tem cadastrados agora (`push_tokens`).
 * `null` se não deu para conferir — quem lê trata como "não se sabe".
 */
async function celularesDaConta(beneficiaryId: string): Promise<number | null> {
  const { data: ben, error } = await supabase.from('beneficiaries').select('profile_id').eq('id', beneficiaryId).maybeSingle();
  if (error || !ben?.profile_id) return null;
  const { count, error: erroDosTokens } = await supabase
    .from('push_tokens').select('token', { count: 'exact', head: true }).eq('profile_id', ben.profile_id);
  if (erroDosTokens || typeof count !== 'number') return null;
  return count;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const key = req.headers.get('x-device-key');
  if (!key) return json({ error: 'unauthorized' }, 401);

  const { data: device, error: erroDaChave } = await supabase
    .from('devices')
    .select('id, beneficiary_id, name, os, app_version, revoked_at')
    .eq('device_key_hash', await sha256(key))
    .maybeSingle();
  // Sem isto, uma falha do banco ao conferir a chave virava "chave
  // desconhecida" (401): o desktop apagava o vínculo, a licença e a fila
  // offline — pedidos de socorro inclusive — e caía no login.
  if (erroDaChave) return json({ error: 'servico_indisponivel' }, 503);
  if (!device) return json({ error: 'unauthorized' }, 401);
  if (device.revoked_at) return json({ error: 'device_revoked' }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'json inválido' }, 400);
  }
  const b = device.beneficiary_id as string;
  const agora = new Date();
  const now = agora.toISOString();
  // Quando o evento aconteceu no computador (fila offline), se plausível.
  const quando = horarioDoEvento(body.occurred_at, body.sent_at, agora);

  switch (body.action) {
    case 'heartbeat': {
      const { app_version, camera_ok, tracker_ok, calibrated } = body;
      await supabase.from('devices').update({
        last_seen_at: now,
        ...(typeof app_version === 'string' ? { app_version } : {}),
        camera_ok: Boolean(camera_ok),
        tracker_ok: Boolean(tracker_ok),
        calibrated: Boolean(calibrated),
      }).eq('id', device.id);
      // O carimbo de vida é o que impede o job `encerrar_sessoes_orfas`
      // (migração 20260923022642_sessoes_orfas) de fechar a sessão. Só a sessão
      // que o desktop diz ter aberta o recebe — uma largada aberta (o app
      // fechou sem `session.end`) deixa de ser mantida viva e o job a encerra.
      // Desktops antigos não mandam `session_id`: para eles continuam todas as
      // abertas deste computador (ver sessoesDoHeartbeat em ./respostas.ts).
      // O erro é ignorado de propósito: se a coluna ainda não existir
      // (migração não aplicada), o heartbeat continua respondendo e o job
      // usa `updated_at` como reserva.
      const alvo = sessoesDoHeartbeat(body);
      // A sessão que o desktop acha que está aberta ainda está? Depois de uns
      // minutos sem rede, o job de sessões órfãs a encerra; sem esta resposta
      // o desktop seguia mandando contadores para uma sessão encerrada e o
      // celular mostrava o paciente como desconectado enquanto ele usava o app.
      let sessaoAberta: boolean | undefined;
      if (alvo.tipo === 'nenhuma') {
        // `session_id` com algo que não é UUID não é sessão nenhuma.
        if (typeof body.session_id === 'string') sessaoAberta = false;
      } else {
        let carimbo = supabase.from('sessions')
          .update({ last_heartbeat_at: now })
          .eq('device_id', device.id).neq('status', 'ended');
        if (alvo.tipo === 'uma') carimbo = carimbo.eq('id', alvo.id);
        const { data: abertas, error: erroDasSessoes } = await carimbo.select('id');
        if (alvo.tipo === 'uma' && !erroDasSessoes) sessaoAberta = (abertas ?? []).some((s) => s.id === alvo.id);
      }
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('beneficiary_id', b).eq('sender', 'cuidador').eq('spoken', false);
      // Confirmações recentes do cuidador (socorro e ajuda), a reserva do
      // realtime: com o websocket bloqueado (rede de hospital, proxy) o
      // computador só ficava sabendo do "Estou indo" por ali, e o alarme
      // continuava tocando. Erro aqui não derruba o heartbeat.
      const { data: reconhecimentos } = await supabase
        .from('help_requests')
        .select('id, kind, created_at, acknowledged_at, resolved_at')
        .eq('beneficiary_id', b)
        .in('kind', ['emergencia', 'ajuda'])
        .not('acknowledged_at', 'is', null)
        .gt('acknowledged_at', new Date(agora.getTime() - 6 * 3600_000).toISOString())
        .order('acknowledged_at', { ascending: false })
        .limit(5);
      return json({ ok: true, pending_messages: count ?? 0, sessao_aberta: sessaoAberta, reconhecimentos: reconhecimentos ?? [] });
    }

    case 'session.upsert': {
      const input = (body.session ?? {}) as Record<string, unknown>;
      const campos = pickSession(input);
      if (typeof input.id === 'string') {
        // Atualização SEMPRE escopada ao beneficiário da chave: um upsert com
        // id arbitrário poderia "adotar" a sessão de outra conta.
        const { data, error } = await supabase.from('sessions')
          .update({ ...campos, device_id: device.id })
          .eq('id', input.id).eq('beneficiary_id', b)
          .select('id').maybeSingle();
        if (error) return erroDoBanco(error);
        if (!data) return json({ error: 'sessão não encontrada' }, 404);
        return json({ ok: true, id: data.id });
      }
      const { data, error } = await supabase.from('sessions')
        .insert({ ...campos, beneficiary_id: b, device_id: device.id })
        .select('id').single();
      if (error) return erroDoBanco(error);
      return json({ ok: true, id: data.id });
    }

    case 'session.end': {
      if (typeof body.session_id !== 'string') return json({ error: 'session_id obrigatório' }, 400);
      const patch = { ...pickSession(body as Record<string, unknown>), status: 'ended', ended_at: quando };
      delete (patch as Record<string, unknown>).started_at;
      // Idempotente: fila offline + keepalive ao fechar podem mandar duas vezes.
      const { error } = await supabase.from('sessions').update(patch)
        .eq('id', body.session_id).eq('beneficiary_id', b).neq('status', 'ended');
      if (error) return erroDoBanco(error);
      return json({ ok: true });
    }

    case 'calibration.result': {
      // O desktop manda o resumo da calibração + teste de precisão. Se já há
      // sessão aberta, atualiza; senão abre uma (status active) — o relatório
      // nunca fica órfão.
      const cal = (body.calibration ?? {}) as Record<string, unknown>;
      const report = body.report && typeof body.report === 'object' ? body.report : null;
      const patch: Record<string, unknown> = {
        ...pickSession(cal),
        calibration_at: quando,
        accuracy_report: report,
        status: 'active',
      };
      if (typeof body.session_id === 'string') {
        const { error } = await supabase.from('sessions').update(patch).eq('id', body.session_id).eq('beneficiary_id', b);
        if (error) return erroDoBanco(error);
        await supabase.from('devices').update({ calibrated: true, last_seen_at: now }).eq('id', device.id);
        return json({ ok: true, id: body.session_id });
      }
      const { data, error } = await supabase
        .from('sessions')
        .insert({ ...patch, beneficiary_id: b, device_id: device.id })
        .select('id').single();
      if (error) return erroDoBanco(error);
      await supabase.from('devices').update({ calibrated: true, last_seen_at: now }).eq('id', device.id);
      return json({ ok: true, id: data.id });
    }

    case 'message.send': {
      const text = String(body.text ?? '').trim().slice(0, 2000);
      if (!text) return json({ error: 'texto vazio' }, 400);
      const kind = MSG_KINDS.has(String(body.kind)) ? String(body.kind) : 'texto';
      const linha = { beneficiary_id: b, sender: 'paciente', kind, text, spoken: true, created_at: quando };
      const idMensagem = idDoCliente(body.id);
      if (idMensagem) {
        // Id escolhido no computador (como no help.create): um reenvio da fila
        // offline depois de uma resposta perdida encontra a mensagem que já
        // existe, e o cuidador não a recebe duas vezes.
        const { data: gravada, error } = await supabase
          .from('messages')
          .upsert({ id: idMensagem, ...linha }, { onConflict: 'id', ignoreDuplicates: true })
          .select('id');
        if (error) return erroDoBanco(error);
        if (gravada?.length) return json({ ok: true, id: gravada[0].id });
        const { data: existente, error: erroDaBusca } = await supabase
          .from('messages').select('beneficiary_id').eq('id', idMensagem).maybeSingle();
        if (erroDaBusca) return erroDoBanco(erroDaBusca);
        if (existente?.beneficiary_id === b) return json({ ok: true, id: idMensagem, repetido: true });
        // Id já usado por OUTRO paciente (cliente adulterado): grava com id do servidor.
      }
      const { data, error } = await supabase.from('messages').insert(linha).select('id').single();
      if (error) return erroDoBanco(error);
      return json({ ok: true, id: data.id });
    }

    case 'message.spoken': {
      if (typeof body.message_id !== 'string') return json({ error: 'message_id obrigatório' }, 400);
      // O erro volta ao computador (revisão final de 22/10/2026): com `ok` mesmo
      // sem gravar, a mensagem seguia "não falada" no banco — o cuidador a via
      // sem voz para sempre e o computador a falava de novo na volta. Com 503 a
      // fila offline reenvia a marcação.
      const { error } = await supabase.from('messages')
        .update({ spoken: true, read_at: quando })
        .eq('id', body.message_id).eq('beneficiary_id', b);
      if (error) return erroDoBanco(error);
      return json({ ok: true });
    }

    case 'messages.pending': {
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender, kind, text, created_at, spoken, read_at, beneficiary_id')
        .eq('beneficiary_id', b).eq('sender', 'cuidador').eq('spoken', false)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) return erroDoBanco(error);
      return json({ messages: data ?? [] });
    }

    case 'help.create': {
      const kind = HELP_KINDS.has(String(body.kind)) ? String(body.kind) : 'ajuda';
      const message = String(body.message ?? '').slice(0, 500);
      // session_id só é aceito se for uma sessão DESTE beneficiário (o trigger
      // incrementa o contador da sessão apontada).
      let sessionId: string | null = null;
      if (typeof body.session_id === 'string') {
        const { data: sess } = await supabase.from('sessions').select('id')
          .eq('id', body.session_id).eq('beneficiary_id', b).maybeSingle();
        sessionId = sess?.id ?? null;
      }
      // Ajuda e aviso de dispositivo passam pelo limite atômico do banco, por
      // computador (decisão 2 da rodada 3, 21/10/2026 — ver ./limites.ts). O
      // socorro NUNCA: volta como 'direto' e segue o caminho de sempre, abaixo.
      const comLimite = await pedidoComLimite(
        { deviceId: device.id, kind, message, sessionId, quando, id: idDoCliente(body.id), agora },
        {
          registrar: async (args) => {
            const { data, error } = await supabase.rpc('registrar_aviso_com_limite', args);
            return { data, error };
          },
          avisar: (k, corpo, id) => notifyCaregiver(b, k, corpo, id),
          celulares: () => celularesDaConta(b),
          registrarLog: (chave, linha) => logDoLimite(chave, linha, Date.now()),
        },
      );
      if (comLimite.tipo === 'resposta') return json(comLimite.corpo, comLimite.status);
      // Daqui em diante: o socorro (e postura, fadiga, recalibração), ou um
      // aviso cuja função de limite ainda não existe no banco (migração
      // 20261021120000 não aplicada) — este segue como antes da rodada 3.
      //
      // created_at = quando aconteceu (a fila offline pode entregar horas
      // depois); received_at, a chegada, é o default do banco e é dela que o
      // prazo de escalonamento conta.
      // Aviso de dispositivo (o olhar parou e o problema durou), só sem a
      // função do banco: o limite antigo, por consulta — ver
      // avisoDeDispositivoExcedido. Erro na consulta não bloqueia o aviso
      // (falha aberta: é um aviso de cuidado).
      if (kind === 'dispositivo') {
        const { data: recentes, error: erroDoLimite } = await supabase
          .from('help_requests')
          .select('message, received_at')
          .eq('beneficiary_id', b)
          .eq('kind', 'dispositivo')
          .gt('received_at', new Date(agora.getTime() - 60 * 60_000).toISOString())
          .order('received_at', { ascending: false })
          .limit(10);
        if (!erroDoLimite && avisoDeDispositivoExcedido(recentes ?? [], message, agora.getTime())) {
          console.warn('[desktop-sync] aviso de dispositivo acima do limite: descartado sem push');
          return json({ ok: true, limitado: true });
        }
      }
      const linha = { beneficiary_id: b, kind, message, session_id: sessionId, created_at: quando };
      let id: string | null = null;
      const idPedido = idDoCliente(body.id);
      if (idPedido) {
        // Id escolhido no computador: um reenvio do mesmo pedido (a resposta
        // anterior se perdeu no caminho) encontra a linha que já existe e para
        // aqui — sem segunda linha, sem segundo push e sem um escalonamento
        // falso depois de o cuidador já ter confirmado o primeiro.
        const { data: gravado, error } = await supabase
          .from('help_requests')
          .upsert({ id: idPedido, ...linha }, { onConflict: 'id', ignoreDuplicates: true })
          .select('id');
        if (error) return erroDoBanco(error);
        if (gravado?.length) {
          id = gravado[0].id as string;
        } else {
          const { data: existente, error: erroDaBusca } = await supabase
            .from('help_requests').select('beneficiary_id, kind').eq('id', idPedido).maybeSingle();
          if (erroDaBusca) return erroDoBanco(erroDaBusca);
          if (existente?.beneficiary_id === b) {
            // O reenvio diz o que se sabe do push (revisão de UX de 19/10/2026):
            // sem o campo, o computador afirmava "o celular do cuidador foi
            // avisado". Ver pushDoReenvio em ./push.ts.
            const kindGravado = String(existente.kind ?? kind);
            const push = pushDoReenvio(kindGravado, avisaPorPush(kindGravado) ? await celularesDaConta(b) : null);
            return json({ ok: true, id: idPedido, repetido: true, ...(push !== undefined ? { push } : {}) });
          }
          // Id já usado por OUTRO paciente (um UUID aleatório não repete; seria
          // um cliente adulterado): o pedido é gravado com id do servidor.
        }
      }
      if (!id) {
        const { data, error } = await supabase.from('help_requests').insert(linha).select('id').single();
        if (error) return erroDoBanco(error);
        id = data.id as string;
      }
      // Push no socorro, na ajuda e no aviso de dispositivo; os outros avisos de
      // sistema chegam pelo realtime e ficam no histórico de alertas. Um pedido
      // que chega atrasado diz a hora em que foi feito, para não passar por novo.
      if (avisaPorPush(kind)) {
        const push = await notifyCaregiver(b, kind, corpoDoPedido(message, quando, agora), id);
        // `push` diz ao computador se algum celular foi avisado (ver
        // frontend/src/cloud/eventos.ts → `sem_push`).
        return json({ ok: true, id, push: { avisados: push.avisados, recusados: push.recusados, motivos: push.motivos } });
      }
      return json({ ok: true, id });
    }

    case 'voice.status': {
      // Rótulo da voz em uso no desktop ("Voz clonada (local)" / "pt-BR padrão").
      // Só texto: o áudio de referência e o modelo nunca saem do computador.
      if (typeof body.voice !== 'string' || body.voice.length > 60) return json({ error: 'voice obrigatório' }, 400);
      // UPSERT só do rótulo. Isto era UPDATE porque criar a linha a preenchia
      // com os defaults do servidor (dwell 1500, filtro balanceado), que o
      // desktop aplicava por cima do que o paciente tinha localmente — e sem
      // linha o rótulo da voz se perdia até o cuidador salvar algum ajuste.
      // Desde a migração 20260923022651_patient_settings_nulos as colunas de
      // rastreamento não têm default: a linha nasce com tudo NULL exceto a
      // voz, o desktop ignora campos nulos, e o rótulo pega sempre.
      // `stored` continua no contrato (o desktop o lê); agora é sempre true
      // quando não há erro.
      const { error } = await supabase.from('patient_settings')
        .upsert({ beneficiary_id: b, voice: body.voice, updated_at: now }, { onConflict: 'beneficiary_id' })
        .select('beneficiary_id').maybeSingle();
      if (error) return erroDoBanco(error);
      return json({ ok: true, stored: true });
    }

    case 'report.send': {
      // Relatório de suporte (opt-in no desktop). Só números e erros; a
      // função não tem como saber se o cliente cumpriu isso, então ela impõe
      // o que consegue: tamanho máximo, sem campos de texto livre além dos
      // erros truncados, e nunca ecoa o conteúdo de volta.
      const relatorio = body.report;
      if (!relatorio || typeof relatorio !== 'object') return json({ error: 'report obrigatório' }, 400);
      const bruto = JSON.stringify(relatorio);
      if (bruto.length > 64_000) return json({ error: 'relatório grande demais' }, 413);
      const motivo = body.motivo === 'manual' ? 'manual' : 'erro';
      const resumo = String(body.resumo ?? '').slice(0, 200);
      const versao = typeof (relatorio as Record<string, unknown>).aplicativo === 'object'
        ? String(((relatorio as Record<string, Record<string, unknown>>).aplicativo?.versao) ?? '').slice(0, 40)
        : null;
      // Anti-inundação: no máximo 20 relatórios por hora por computador. Um app
      // em loop de erro mandaria centenas — e o vigésimo já diz tudo.
      const { count } = await supabase
        .from('support_reports')
        .select('id', { count: 'exact', head: true })
        .eq('device_id', device.id)
        .gte('created_at', new Date(Date.now() - 3600_000).toISOString());
      if ((count ?? 0) >= 20) return json({ ok: true, stored: false, motivo: 'limite' });
      const { error } = await supabase.from('support_reports').insert({
        beneficiary_id: b, device_id: device.id, app_version: versao || null,
        motivo, resumo, relatorio,
      });
      if (error) return erroDoBanco(error);
      return json({ ok: true, stored: true });
    }

    case 'settings.get': {
      const [{ data: settings }, { data: phrases }] = await Promise.all([
        supabase.from('patient_settings').select('*').eq('beneficiary_id', b).maybeSingle(),
        supabase.from('quick_phrases').select('*').eq('beneficiary_id', b).order('position'),
      ]);
      return json({ settings, phrases: phrases ?? [] });
    }

    case 'device.info': {
      // Também é a verificação periódica da licença do desktop: com a chave do
      // computador ele descobre se a assinatura ainda libera o app, sem
      // precisar de sessão de usuário (license_for_profile, service_role).
      const { data: ben } = await supabase.from('beneficiaries').select('id, user_name, profile_id').eq('id', b).single();
      let license: unknown = null;
      if (ben?.profile_id) {
        const { data: lic, error } = await supabase.rpc('license_for_profile', { p_profile: ben.profile_id });
        if (!error) license = lic;
      }
      const { count } = await supabase
        .from('devices')
        .select('id', { count: 'exact', head: true })
        .eq('beneficiary_id', b).is('revoked_at', null);
      return json({
        device: { id: device.id, name: device.name, os: device.os, app_version: device.app_version },
        beneficiary: ben ? { id: ben.id, user_name: ben.user_name } : null,
        license,
        devices_active: count ?? 0,
      });
    }

    case 'pairing.create': {
      // Código do QR que conecta o celular do cuidador (pedido de 19/10/2026).
      // Sorteado AQUI; o banco recebe só o hash. O código volta uma vez, nesta
      // resposta, para o computador desenhar o QR — e não entra em log nenhum.
      // Limite, validade, "um ativo por computador" e conta sem e-mail
      // confirmado ficam no banco (criar_codigo_de_pareamento).
      const codigo = gerarCodigo();
      const { data, error } = await supabase.rpc('criar_codigo_de_pareamento', {
        p_device_id: device.id,
        p_token_hash: await hashDoCodigo(codigo),
      });
      if (error) return erroDoBanco(error);
      const criacao = respostaDaCriacao(data, agora.getTime());
      if (criacao.status !== 200) return json(criacao.corpo, criacao.status);
      return new Response(JSON.stringify({ ...criacao.corpo, codigo }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS },
      });
    }

    case 'pairing.status': {
      // O computador pergunta a cada poucos segundos, enquanto mostra o QR, se
      // um celular já usou o código — e se ele confirmou que entrou.
      const id = idDoCliente(body.id);
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const { data, error } = await supabase.from('pareamentos_de_celular')
        .select('id, expira_em, usado_em, conectado_em, cancelado_em')
        .eq('id', id).eq('device_id', device.id)
        .maybeSingle();
      if (error) return erroDoBanco(error);
      return json({ ok: true, ...estadoDoPareamento(data, agora.getTime()) });
    }

    case 'pairing.cancel': {
      // A tela do QR fechou (ou o cuidador desistiu): uma foto do QR tirada
      // antes para de valer na hora, sem esperar os 3 minutos.
      const id = idDoCliente(body.id);
      if (!id) return json({ error: 'id obrigatório' }, 400);
      const { error } = await supabase.from('pareamentos_de_celular')
        .update({ cancelado_em: now })
        .eq('id', id).eq('device_id', device.id)
        .is('usado_em', null).is('cancelado_em', null);
      if (error) return erroDoBanco(error);
      return json({ ok: true });
    }

    default:
      return json({ error: 'ação desconhecida' }, 400);
  }
});

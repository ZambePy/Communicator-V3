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
//   heartbeat          { app_version, camera_ok, tracker_ok, calibrated }
//                      → { ok, pending_messages }
//                      (também carimba sessions.last_heartbeat_at das sessões
//                       abertas deste computador — migração 20260923022642_sessoes_orfas)
//   session.upsert     { session: { id?, status, dwell_ms, filter_preset, ... } } → { ok, id }
//   session.end        { session_id, utterances?, chars_typed?, modules_used?, occurred_at?, sent_at? } → { ok }
//   calibration.result { session_id?, calibration: {...}, report: {...}, occurred_at?, sent_at? } → { ok, id }
//   message.send       { text, kind, occurred_at?, sent_at? }  → { ok, id }   (sender = paciente)
//   message.spoken     { message_id, occurred_at?, sent_at? }  → { ok }       (msg do cuidador vocalizada)
//   messages.pending   {}                            → { messages } (do cuidador, ainda não faladas)
//   help.create        { kind, message, session_id, occurred_at?, sent_at? } → { ok, id }   + push
//   voice.status       { voice }                     → { ok, stored }  (rótulo da voz em uso)
//   report.send        { report, motivo?, resumo? }     → { ok, stored }  (opt-in; só números)
//   settings.get       {}                            → { settings, phrases }
//   device.info        {}                            → { device, beneficiary, license, devices_active }
//
// O renderer do Electron roda em `file://` (origem "null") e manda um header
// customizado, então o navegador faz preflight: CORS liberado abaixo.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { chegouComAtraso, horaDeBrasilia, horarioDoEvento } from './horario.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

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

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TITULOS: Record<string, string> = {
  emergencia: '🚨 Pedido de socorro',
  ajuda: 'Pedido de ajuda',
  postura: 'Aviso de postura',
  fadiga: 'Sinal de fadiga',
  recalibracao: 'Recalibração recomendada',
  dispositivo: 'Problema no dispositivo',
};

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

async function notifyCaregiver(beneficiaryId: string, kind: string, body: string) {
  const { data: ben } = await supabase.from('beneficiaries').select('profile_id, user_name').eq('id', beneficiaryId).single();
  if (!ben) return;
  const { data: tokens } = await supabase.from('push_tokens').select('token').eq('profile_id', ben.profile_id);
  if (!tokens?.length) return;
  const messages = tokens.map((t) => ({
    to: t.token,
    title: TITULOS[kind] ?? 'IrisFlow',
    body: `${ben.user_name}: ${body}`.slice(0, 180),
    sound: 'default',
    priority: 'high',
    channelId: kind === 'emergencia' || kind === 'ajuda' ? 'emergencia' : 'default',
    data: { kind, beneficiary_id: beneficiaryId },
  }));
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}),
      },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    // O alerta já está no banco (e chega por realtime); o push é o segundo canal.
    console.error('[desktop-sync] push falhou', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const key = req.headers.get('x-device-key');
  if (!key) return json({ error: 'unauthorized' }, 401);

  const { data: device } = await supabase
    .from('devices')
    .select('id, beneficiary_id, name, os, app_version, revoked_at')
    .eq('device_key_hash', await sha256(key))
    .maybeSingle();
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
      // Sessões abertas DESTE computador ganham o carimbo de vida. É o que
      // permite ao job `encerrar_sessoes_orfas` (migração 20260923022642_sessoes_orfas) fechar
      // sessões cujo desktop sumiu sem mandar `session.end`. O heartbeat não
      // sabe o id da sessão — e não precisa: o vínculo é pelo device_id.
      // O erro é ignorado de propósito: se a coluna ainda não existir
      // (migração não aplicada), o heartbeat continua respondendo e o job
      // usa `updated_at` como reserva.
      await supabase.from('sessions')
        .update({ last_heartbeat_at: now })
        .eq('device_id', device.id).neq('status', 'ended');
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('beneficiary_id', b).eq('sender', 'cuidador').eq('spoken', false);
      return json({ ok: true, pending_messages: count ?? 0 });
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
        if (error) return json({ error: error.message }, 400);
        if (!data) return json({ error: 'sessão não encontrada' }, 404);
        return json({ ok: true, id: data.id });
      }
      const { data, error } = await supabase.from('sessions')
        .insert({ ...campos, beneficiary_id: b, device_id: device.id })
        .select('id').single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, id: data.id });
    }

    case 'session.end': {
      if (typeof body.session_id !== 'string') return json({ error: 'session_id obrigatório' }, 400);
      const patch = { ...pickSession(body as Record<string, unknown>), status: 'ended', ended_at: quando };
      delete (patch as Record<string, unknown>).started_at;
      // Idempotente: fila offline + keepalive ao fechar podem mandar duas vezes.
      const { error } = await supabase.from('sessions').update(patch)
        .eq('id', body.session_id).eq('beneficiary_id', b).neq('status', 'ended');
      if (error) return json({ error: error.message }, 400);
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
        if (error) return json({ error: error.message }, 400);
        await supabase.from('devices').update({ calibrated: true, last_seen_at: now }).eq('id', device.id);
        return json({ ok: true, id: body.session_id });
      }
      const { data, error } = await supabase
        .from('sessions')
        .insert({ ...patch, beneficiary_id: b, device_id: device.id })
        .select('id').single();
      if (error) return json({ error: error.message }, 400);
      await supabase.from('devices').update({ calibrated: true, last_seen_at: now }).eq('id', device.id);
      return json({ ok: true, id: data.id });
    }

    case 'message.send': {
      const text = String(body.text ?? '').trim().slice(0, 2000);
      if (!text) return json({ error: 'texto vazio' }, 400);
      const kind = MSG_KINDS.has(String(body.kind)) ? String(body.kind) : 'texto';
      const { data, error } = await supabase
        .from('messages')
        .insert({ beneficiary_id: b, sender: 'paciente', kind, text, spoken: true, created_at: quando })
        .select('id').single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, id: data.id });
    }

    case 'message.spoken': {
      if (typeof body.message_id !== 'string') return json({ error: 'message_id obrigatório' }, 400);
      await supabase.from('messages')
        .update({ spoken: true, read_at: quando })
        .eq('id', body.message_id).eq('beneficiary_id', b);
      return json({ ok: true });
    }

    case 'messages.pending': {
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender, kind, text, created_at, spoken, read_at, beneficiary_id')
        .eq('beneficiary_id', b).eq('sender', 'cuidador').eq('spoken', false)
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) return json({ error: error.message }, 400);
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
      const { data, error } = await supabase
        .from('help_requests')
        // created_at = quando aconteceu (a fila offline pode entregar horas
        // depois); received_at, a chegada, é o default do banco e é dela que o
        // prazo de escalonamento conta.
        .insert({ beneficiary_id: b, kind, message, session_id: sessionId, created_at: quando })
        .select('id').single();
      if (error) return json({ error: error.message }, 400);
      // Push só nos tipos que exigem ação imediata; avisos de sistema chegam
      // pelo realtime e ficam no histórico de alertas. Um pedido que chega
      // atrasado diz a hora em que foi feito, para não passar por novo.
      if (kind === 'emergencia' || kind === 'ajuda') {
        const corpo = chegouComAtraso(quando, agora)
          ? [message, `pedido às ${horaDeBrasilia(quando)}, chegou com atraso`].filter(Boolean).join(' — ')
          : message;
        await notifyCaregiver(b, kind, corpo);
      }
      return json({ ok: true, id: data.id });
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
      if (error) return json({ error: error.message }, 500);
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
      if (error) return json({ error: error.message }, 400);
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

    default:
      return json({ error: 'ação desconhecida' }, 400);
  }
});

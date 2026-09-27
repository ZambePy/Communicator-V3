-- Cenário da beta, rodado por scripts/db-local-test.sh depois das migrações.
-- Cada bloco termina num `raise exception` se o resultado não for o esperado.
\set ON_ERROR_STOP on

-- 1. Planos: nenhum comprável; beta ativo e de graça.
do $$
declare v int;
begin
  select count(*) into v from public.plans where purchasable;
  if v <> 0 then raise exception 'ainda há % plano(s) compráveis', v; end if;
  perform 1 from public.plans where id = 'beta' and active and price_brl = 0;
  if not found then raise exception 'plano beta não existe'; end if;
end $$;

-- 2. Usuário nasce no Auth → profile pelo gatilho.
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'ana@exemplo.com', '{"buyer_name":"Ana Souza"}');
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- 3. Fluxo pago recusado durante a beta.
do $$
begin
  begin
    perform public.complete_registration('11999990000', '52998224725', 'Pedro Souza',
      'filho', 'ela', 'windows', null, null, false, 'completo');
    raise exception 'complete_registration deveria ter recusado';
  exception when others then
    if sqlerrm not like '%indisponível durante a beta%' then raise; end if;
  end;
end $$;

-- 4. Inscrição na beta SEM CPF.
do $$
declare r jsonb; s record; p record;
begin
  r := public.complete_beta_registration(
    p_phone => '11999990000', p_user_name => 'Pedro Souza', p_relation => 'filho',
    p_condition => 'ela', p_os => 'windows', p_document => '',
    p_wants_caregiver_app => true, p_feedback_consent => true, p_how_found => 'indicação');
  if r->>'subscription_id' is null then raise exception 'sem subscription_id'; end if;
  select * into s from public.subscriptions where id = (r->>'subscription_id')::uuid;
  if s.plan_id <> 'beta' or s.status <> 'ativa' or s.price_brl <> 0 then
    raise exception 'assinatura beta errada: % % %', s.plan_id, s.status, s.price_brl;
  end if;
  if s.next_charge_at <> (select ends_at from public.beta_program) then
    raise exception 'next_charge_at deveria ser o fim da beta';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if p.document is not null then raise exception 'CPF deveria ser null'; end if;
  perform 1 from public.beta_registrations where profile_id = auth.uid() and wants_caregiver_app;
  if not found then raise exception 'beta_registrations não gravou'; end if;
end $$;

-- 5. Licença: beta liberada, todos os recursos.
do $$
declare l jsonb;
begin
  l := public.desktop_license();
  if not (l->>'allowed')::boolean or l->>'reason' <> 'beta' or l->>'plan_id' <> 'beta' then
    raise exception 'licença beta errada: %', l;
  end if;
  if not (l->'features'->>'voz')::boolean or not (l->'features'->>'multiplos_dispositivos')::boolean
     or not coalesce((l->'features'->>'lazer')::boolean, false) then
    raise exception 'features da beta deveriam estar todos true: %', l->'features';
  end if;
  if l->'beneficiary'->>'user_name' <> 'Pedro Souza' then raise exception 'beneficiário errado'; end if;
end $$;

-- 6. my_account (o que o site lê) e app (subscriptions + plans).
do $$
declare r record;
begin
  select * into r from public.my_account;
  if r.plan_id <> 'beta' or r.status <> 'ativa' or r.price_brl <> 0 then
    raise exception 'my_account: % % %', r.plan_id, r.status, r.price_brl;
  end if;
end $$;

-- 7. Dois computadores pareados; nenhum revogado (beta = sem limite).
do $$
declare b uuid; a jsonb; c jsonb;
begin
  select id into b from public.beneficiaries where profile_id = auth.uid();
  a := public.pair_device(b, 'Notebook', 'windows', '1.0.0-beta.1', 'maq-1');
  c := public.pair_device(b, 'PC da sala', 'windows', '1.0.0-beta.1', 'maq-2');
  if jsonb_array_length(c->'revoked_device_ids') <> 0 then
    raise exception 'a beta não deveria revogar computadores: %', c;
  end if;
  if (select count(*) from public.devices where beneficiary_id = b and revoked_at is null) <> 2 then
    raise exception 'esperava 2 computadores ativos';
  end if;
end $$;

-- 7.1 Novo login no MESMO computador (mesmo id local): substitui o vínculo
--     dele em vez de acumular; o outro computador não é tocado; sem id
--     local (desktop antigo) nada é revogado. (migração 20260924022100_pair_device_mesmo_computador)
do $$
declare b uuid; antigo uuid; outro uuid; novo jsonb; sem_id jsonb;
begin
  select id into b from public.beneficiaries where profile_id = auth.uid();
  select id into antigo from public.devices where beneficiary_id = b and hostname = 'maq-1' and revoked_at is null;
  select id into outro from public.devices where beneficiary_id = b and hostname = 'maq-2' and revoked_at is null;
  novo := public.pair_device(b, 'Notebook', 'windows', '1.0.0-beta.2', 'maq-1');
  if (select revoked_at from public.devices where id = antigo) is null then
    raise exception 'o vínculo anterior do mesmo computador deveria ter sido revogado';
  end if;
  if (select revoked_at from public.devices where id = outro) is not null then
    raise exception 'o outro computador não deveria ter sido revogado';
  end if;
  if novo->'revoked_device_ids' <> to_jsonb(array[antigo]) then
    raise exception 'revoked_device_ids deveria listar só o vínculo antigo deste computador: %', novo;
  end if;
  if (select count(*) from public.devices where beneficiary_id = b and revoked_at is null) <> 2 then
    raise exception 'esperava continuar com 2 computadores ativos (maq-1 novo + maq-2)';
  end if;
  sem_id := public.pair_device(b, 'Antigo', 'windows', '0.9.0', null);
  if jsonb_array_length(sem_id->'revoked_device_ids') <> 0 then
    raise exception 'sem id local nada deveria ser revogado: %', sem_id;
  end if;
  -- não deixa lixo para os blocos seguintes
  update public.devices set revoked_at = now() where id = (sem_id->>'device_id')::uuid;
end $$;

-- 8. Download marcado uma vez só.
do $$
begin
  if not public.mark_beta_download('windows') then raise exception 'mark_beta_download falhou'; end if;
  perform public.mark_beta_download('linux');
  perform 1 from public.beta_registrations where profile_id = auth.uid() and downloaded_os = 'windows';
  if not found then raise exception 'downloaded_os deveria continuar windows'; end if;
end $$;

-- 9. Repetir a inscrição não duplica nem estoura.
do $$
declare r jsonb;
begin
  r := public.complete_beta_registration('11999990000', 'Pedro Souza', 'filho', 'ela', 'windows', '529.982.247-25');
  if (select count(*) from public.subscriptions where profile_id = auth.uid()) <> 1 then
    raise exception 'assinatura duplicada';
  end if;
  if (select document from public.profiles where id = auth.uid()) <> '52998224725' then
    raise exception 'CPF informado depois deveria ter sido gravado';
  end if;
end $$;

-- 10. Beta encerrada: licença bloqueia com o motivo certo.
update public.subscriptions set next_charge_at = now() - interval '1 day' where profile_id = auth.uid();
do $$
declare l jsonb;
begin
  l := public.desktop_license();
  if (l->>'allowed')::boolean or l->>'reason' <> 'beta_encerrada' then
    raise exception 'licença deveria bloquear com beta_encerrada: %', l;
  end if;
end $$;

-- 11. Inscrições fechadas: recusa.
update public.beta_program set open = false;
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'bia@exemplo.com');
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  begin
    perform public.complete_beta_registration('11', 'Bia', 'proprio', 'avc', 'linux');
    raise exception 'deveria recusar com inscrições fechadas';
  exception when others then
    if sqlerrm not like '%fechadas%' then raise; end if;
  end;
end $$;

-- 12. Anon lê beta_program (com a data do lançamento, que o site usa para
--     travar o download até o dia) e plans (RLS), não lê beta_registrations.
reset request.jwt.claim.sub;
set role anon;
select open, current_version, launch_at from public.beta_program;
select id, purchasable from public.plans order by 1;
do $$
begin
  if (select count(*) from public.beta_registrations) <> 0 then
    raise exception 'anon não deveria enxergar beta_registrations';
  end if;
  if (select launch_at from public.beta_program) <> '2026-11-10 00:00:00-03'::timestamptz then
    raise exception 'launch_at deveria nascer em 10/11/2026 00:00 (Brasília)';
  end if;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- 13. Migrações de 22/09/2026
-- ---------------------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- 13.1 support_reports: a service_role grava (como a Edge Function), o dono lê, anon não.
do $$
declare b uuid; d uuid;
begin
  select id into b from public.beneficiaries where profile_id = auth.uid();
  select id into d from public.devices where beneficiary_id = b order by paired_at limit 1;
  insert into public.support_reports (beneficiary_id, device_id, app_version, motivo, resumo, relatorio)
  values (b, d, '1.0.0-beta.1', 'manual', 'teste', '{"aplicativo":{"versao":"1.0.0-beta.1"},"erros":[]}'::jsonb);
  if (select count(*) from public.support_reports where beneficiary_id = b) <> 1 then
    raise exception 'support_reports não gravou';
  end if;
end $$;
set role authenticated;
do $$
begin
  if (select count(*) from public.support_reports) <> 1 then
    raise exception 'o dono deveria ler o próprio relatório';
  end if;
  begin
    insert into public.support_reports (beneficiary_id, relatorio)
    values ((select beneficiary_id from public.support_reports limit 1), '{}'::jsonb);
    raise exception 'authenticated não deveria inserir em support_reports';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role anon;
do $$
begin
  begin
    perform 1 from public.support_reports;
    raise exception 'anon não deveria ler support_reports';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 13.2 Sessões órfãs: sem heartbeat há > 5 min → ended, ended_at = último sinal.
do $$
declare b uuid; d uuid; s_viva uuid; s_orfa uuid; n int; r record;
begin
  select id into b from public.beneficiaries where profile_id = auth.uid();
  select id into d from public.devices where beneficiary_id = b order by paired_at limit 1;

  insert into public.sessions (beneficiary_id, device_id, status) values (b, d, 'active') returning id into s_viva;
  insert into public.sessions (beneficiary_id, device_id, status) values (b, d, 'active') returning id into s_orfa;
  if (select last_heartbeat_at from public.sessions where id = s_viva) is null then
    raise exception 'last_heartbeat_at deveria nascer preenchida';
  end if;

  -- Simula o heartbeat da Edge Function (update escopado ao computador).
  update public.sessions set last_heartbeat_at = now() where device_id = d and status <> 'ended';

  -- Envelhece só a órfã (o gatilho carimba now() em qualquer update de sessão aberta,
  -- então desliga-se o gatilho para forjar o passado).
  alter table public.sessions disable trigger sessions_heartbeat_touch;
  update public.sessions set last_heartbeat_at = now() - interval '6 minutes' where id = s_orfa;
  alter table public.sessions enable trigger sessions_heartbeat_touch;

  n := public.encerrar_sessoes_orfas();
  if n <> 1 then raise exception 'esperava encerrar 1 sessão, encerrou %', n; end if;

  select * into r from public.sessions where id = s_orfa;
  if r.status <> 'ended' or r.ended_at is null or r.ended_at > now() - interval '5 minutes' then
    raise exception 'sessão órfã não foi encerrada direito: % %', r.status, r.ended_at;
  end if;
  if (select status from public.sessions where id = s_viva) <> 'active' then
    raise exception 'a sessão viva não deveria ter sido encerrada';
  end if;

  -- Reabertura (rede voltou, desktop reenviou o upsert): ended_at limpa, heartbeat carimba.
  update public.sessions set status = 'active' where id = s_orfa;
  select * into r from public.sessions where id = s_orfa;
  if r.ended_at is not null or r.last_heartbeat_at < now() - interval '1 minute' then
    raise exception 'reabertura deveria limpar ended_at e carimbar heartbeat';
  end if;

  -- Segunda rodada: nada a encerrar.
  if public.encerrar_sessoes_orfas() <> 0 then raise exception 'não havia mais órfãs'; end if;

  if not exists (select 1 from cron.job where jobname = 'encerrar-sessoes-orfas') then
    raise exception 'job do pg_cron não foi agendado';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 14. patient_settings sem padrões de rastreamento (20260923022651)
--     A linha pode nascer só com o paciente (é o que a desktop-sync faz no
--     voice.status): rastreamento NULL = "o cuidador não definiu", e o prazo
--     de emergência continua com o padrão real de 45 s.
-- ---------------------------------------------------------------------
do $$
declare b uuid; ps record;
begin
  select id into b from public.beneficiaries where profile_id = auth.uid();
  insert into public.patient_settings (beneficiary_id) values (b);
  select * into ps from public.patient_settings where beneficiary_id = b;
  if ps.dwell_ms is not null or ps.filter_preset is not null or ps.keyboard_layout is not null or ps.sensitivity is not null then
    raise exception 'rastreamento deveria nascer NULL: % % % %', ps.dwell_ms, ps.filter_preset, ps.keyboard_layout, ps.sensitivity;
  end if;
  if ps.emergency_timeout_s <> 45 or ps.voice <> 'pt-BR padrão' or ps.emergency_contacts <> '[]'::jsonb then
    raise exception 'padrões reais de patient_settings mudaram: % % %', ps.emergency_timeout_s, ps.voice, ps.emergency_contacts;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 15. Telefone opcional na inscrição (20260923022800; contrato de apagar
--     em 20260927105038_apelido_e_pesquisa). Vazio não quebra o CHECK de
--     profiles.phone; null MANTÉM o número (é o que o site manda para campo
--     vazio) e '' ou só espaços APAGAM (campo esvaziado na edição).
-- ---------------------------------------------------------------------
update public.beta_program set open = true;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  perform public.complete_beta_registration('', 'Bia Lima', 'proprio', 'avc', 'linux');
  if (select phone from public.profiles where id = auth.uid()) is not null then
    raise exception 'telefone vazio deveria ficar NULL';
  end if;
  perform public.complete_beta_registration('(11) 98888-7777', 'Bia Lima', 'proprio', 'avc', 'linux');
  perform public.complete_beta_registration(null, 'Bia Lima', 'proprio', 'avc', 'linux');
  if (select phone from public.profiles where id = auth.uid()) <> '(11) 98888-7777' then
    raise exception 'refazer a inscrição sem telefone (null) não pode apagar o número já gravado';
  end if;
  perform public.complete_beta_registration('   ', 'Bia Lima', 'proprio', 'avc', 'linux');
  if (select phone from public.profiles where id = auth.uid()) is not null then
    raise exception 'campo esvaziado (só espaços) deveria apagar o telefone';
  end if;
end $$;
update public.beta_program set open = false;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------
-- 16. Escalonamento de emergência (20260923022524 + 20260924020011_help_requests_received_at)
--     Com o pg_net de mentira: o que teria sido enviado fica em net.chamadas.
--     O prazo conta da CHEGADA (received_at), não de quando o pedido
--     aconteceu no computador (created_at) — um socorro que esperou na fila
--     offline não pode ser escalado antes de o cuidador conseguir responder.
-- ---------------------------------------------------------------------
do $$
declare
  b uuid; b_sem_token uuid; hr uuid; atrasado uuid; visto uuid; velho uuid; sem_token uuid;
  n int; chamadas_antes int; texto text;
begin
  select id into b from public.beneficiaries where profile_id = auth.uid();
  select id into b_sem_token from public.beneficiaries where profile_id = '22222222-2222-2222-2222-222222222222';
  insert into public.push_tokens (token, profile_id) values ('ExponentPushToken[teste-1]', auth.uid());

  -- received_at nasce sozinha e não pode ser nula
  insert into public.help_requests (beneficiary_id, kind, message) values (b, 'ajuda', 'x') returning id into hr;
  if (select received_at from public.help_requests where id = hr) is null
     or (select received_at from public.help_requests where id = hr) < now() - interval '1 minute' then
    raise exception 'received_at deveria nascer com now()';
  end if;
  delete from public.help_requests where id = hr;

  -- (a) chegou há 2 min e ninguém confirmou: escala, avisa na conversa e manda push
  insert into public.help_requests (beneficiary_id, kind, message, created_at, received_at)
  values (b, 'emergencia', 'Dor', now() - interval '2 minutes', now() - interval '2 minutes') returning id into hr;
  -- (b) aconteceu há 30 min, mas chegou agora (fila offline): ainda dentro do prazo
  insert into public.help_requests (beneficiary_id, kind, message, created_at)
  values (b, 'emergencia', 'Falta de ar', now() - interval '30 minutes') returning id into atrasado;
  -- (c) já confirmado: não escala
  insert into public.help_requests (beneficiary_id, kind, message, created_at, received_at, acknowledged_at)
  values (b, 'ajuda', 'Água', now() - interval '5 minutes', now() - interval '5 minutes', now() - interval '4 minutes') returning id into visto;
  -- (d) chegou há mais de 6 h: não escala retroativamente
  insert into public.help_requests (beneficiary_id, kind, message, created_at, received_at)
  values (b, 'ajuda', 'Antigo', now() - interval '7 hours', now() - interval '7 hours') returning id into velho;
  -- (e) conta sem celular cadastrado: escala, mas não afirma que reenviou
  insert into public.help_requests (beneficiary_id, kind, message, created_at, received_at)
  values (b_sem_token, 'emergencia', 'Dor', now() - interval '2 minutes', now() - interval '2 minutes') returning id into sem_token;

  select count(*) into chamadas_antes from net.chamadas;
  n := public.escalar_pedidos_de_ajuda();
  if n <> 2 then raise exception 'esperava escalar 2 pedidos (a, e), escalou %', n; end if;
  if (select escalated_at from public.help_requests where id = hr) is null then raise exception '(a) não escalou'; end if;
  if (select escalated_at from public.help_requests where id = atrasado) is not null then
    raise exception '(b) socorro atrasado foi escalado antes do prazo contado da chegada';
  end if;
  if (select escalated_at from public.help_requests where id = visto) is not null then raise exception '(c) confirmado escalou'; end if;
  if (select escalated_at from public.help_requests where id = velho) is not null then raise exception '(d) antigo escalou'; end if;

  select text into texto from public.messages where beneficiary_id = b and sender = 'cuidador' and kind = 'sistema' order by created_at desc limit 1;
  if texto is distinct from 'Ninguém confirmou o pedido de socorro em 45 s. O alerta foi reenviado a todos os celulares.' then
    raise exception '(a) mensagem de sistema inesperada: %', texto;
  end if;
  select text into texto from public.messages where beneficiary_id = b_sem_token and sender = 'cuidador' and kind = 'sistema' order by created_at desc limit 1;
  if texto is distinct from 'Ninguém confirmou o pedido de socorro em 45 s. Não há celular cadastrado para receber o aviso.' then
    raise exception '(e) sem celular, a mensagem não pode dizer que reenviou: %', texto;
  end if;
  if (select count(*) from net.chamadas) <> chamadas_antes + 1 then
    raise exception 'esperava 1 push (só a conta com token), houve %', (select count(*) from net.chamadas) - chamadas_antes;
  end if;
  if not exists (
    select 1 from net.chamadas c, jsonb_array_elements(c.body) m
     where c.url = 'https://exp.host/--/api/v2/push/send'
       and m->>'to' = 'ExponentPushToken[teste-1]'
       and m->'data'->>'escalated' = 'true'
       and m->>'body' = 'Pedro Souza pediu socorro e ninguém confirmou em 45 s.'
  ) then
    raise exception 'push do escalonamento com destino ou texto errado: %', (select body from net.chamadas order by id desc limit 1);
  end if;

  -- segunda rodada: nada novo a escalar
  if public.escalar_pedidos_de_ajuda() <> 0 then raise exception 'escalou de novo o que já estava escalado'; end if;

  -- o atrasado escala quando o prazo passa a contar da chegada
  update public.help_requests set received_at = now() - interval '2 minutes' where id = atrasado;
  if public.escalar_pedidos_de_ajuda() <> 1 then raise exception '(b) deveria escalar depois do prazo'; end if;

  if not exists (select 1 from cron.job where jobname = 'escalar-pedidos-de-ajuda' and schedule = '* * * * *') then
    raise exception 'job escalar-pedidos-de-ajuda não foi agendado';
  end if;
end $$;

-- Lazer e bem-estar por plano (27/09): features.lazer a partir do Completo.
insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777771', 'essencial@exemplo.com'),
  ('77777777-7777-7777-7777-777777777772', 'completo@exemplo.com');
insert into public.subscriptions (profile_id, plan_id, status, price_brl, trial_ends_at, next_charge_at) values
  ('77777777-7777-7777-7777-777777777771', 'essencial', 'ativa', 249, now(), now() + interval '30 days'),
  ('77777777-7777-7777-7777-777777777772', 'completo', 'ativa', 399, now(), now() + interval '30 days');

do $$
declare e jsonb; c jsonb;
begin
  e := public.license_for_profile('77777777-7777-7777-7777-777777777771') -> 'features';
  c := public.license_for_profile('77777777-7777-7777-7777-777777777772') -> 'features';
  if (e->>'lazer')::boolean is distinct from false then raise exception 'Essencial não inclui Lazer: %', e; end if;
  if (c->>'lazer')::boolean is distinct from true then raise exception 'Completo inclui Lazer: %', c; end if;
  if (c->>'voz')::boolean is distinct from false then raise exception 'Completo não inclui a voz personalizada: %', c; end if;
  if (e->>'relatorios')::boolean is distinct from false or (c->>'relatorios')::boolean is distinct from true then
    raise exception 'relatórios fora da régua: % / %', e, c;
  end if;
end $$;

select 'Lazer por plano, 27/09: tudo certo' as resultado;

-- Código de 4 dígitos da confirmação (26/09). O GoTrue guarda em
-- confirmation_token o hash sha224(e-mail || código de 6), em hexadecimal
-- (com o prefixo "pkce_" no fluxo PKCE); o e-mail mostra os 4 primeiros
-- dígitos e confirmar_codigo devolve o hash para o verifyOtp.
insert into auth.users (email, confirmation_token, confirmation_sent_at) values
  ('codigo@exemplo.com', encode(extensions.digest('codigo@exemplo.com' || '482913', 'sha224'), 'hex'), now()),
  ('pkce@exemplo.com', 'pkce_' || encode(extensions.digest('pkce@exemplo.com' || '105277', 'sha224'), 'hex'), now());
insert into auth.users (email, confirmation_token, email_confirmed_at) values
  ('ja-confirmado@exemplo.com', encode(extensions.digest('ja-confirmado@exemplo.com' || '111111', 'sha224'), 'hex'), now());

do $$
declare
  esperado text := encode(extensions.digest('codigo@exemplo.com' || '482913', 'sha224'), 'hex');
  r text;
  i int;
begin
  if not has_function_privilege('anon', 'public.confirmar_codigo(text, text)', 'execute') then
    raise exception 'anon precisa poder chamar confirmar_codigo (o site chama sem sessão)';
  end if;
  if has_table_privilege('anon', 'public.tentativas_de_codigo', 'select')
     or has_table_privilege('authenticated', 'public.tentativas_de_codigo', 'select') then
    raise exception 'tentativas_de_codigo não pode ser legível pelo site';
  end if;

  -- errado conta uma tentativa; certo devolve o hash e zera a contagem
  if public.confirmar_codigo('codigo@exemplo.com', '4828') is not null then raise exception 'código errado foi aceito'; end if;
  if (select erros from public.tentativas_de_codigo where email = 'codigo@exemplo.com') <> 1 then
    raise exception 'o erro não foi contado';
  end if;
  r := public.confirmar_codigo('  Codigo@Exemplo.com ', '4829');
  if r is distinct from esperado then raise exception 'código certo não devolveu o hash (veio %)', r; end if;
  if exists (select 1 from public.tentativas_de_codigo where email = 'codigo@exemplo.com') then
    raise exception 'o acerto deveria apagar as tentativas';
  end if;

  -- PKCE: devolve o hash com o prefixo, como o Auth guardou
  r := public.confirmar_codigo('pkce@exemplo.com', '1052');
  if r is distinct from 'pkce_' || encode(extensions.digest('pkce@exemplo.com' || '105277', 'sha224'), 'hex') then
    raise exception 'PKCE: hash errado (veio %)', r;
  end if;

  -- e-mail já confirmado ou sem cadastro: a mesma resposta de código errado
  if public.confirmar_codigo('ja-confirmado@exemplo.com', '1111') is not null then raise exception 'e-mail já confirmado não pode receber hash'; end if;
  if public.confirmar_codigo('ninguem@exemplo.com', '1234') is not null then raise exception 'e-mail sem cadastro devolveu hash'; end if;

  -- entrada inválida é recusada antes de contar tentativa
  begin
    perform public.confirmar_codigo('codigo@exemplo.com', '12a4');
    raise exception 'código com letra deveria ser recusado';
  exception when sqlstate '22023' then null;
  end;

  -- dez erros em 24 h bloqueiam o código, até o certo
  for i in 1..10 loop
    if public.confirmar_codigo('codigo@exemplo.com', '0000') is not null then raise exception 'erro % aceito', i; end if;
  end loop;
  begin
    perform public.confirmar_codigo('codigo@exemplo.com', '4829');
    raise exception 'depois de 10 erros o código deveria estar bloqueado';
  exception when sqlstate 'P0429' then null;
  end;
end $$;

select 'código de confirmação, 26/09: tudo certo' as resultado;

-- =====================================================================
-- Revisão do banco de 27/09 (migrações 20260927104927 em diante). Cada bloco
-- falha com as 19 migrações anteriores e passa com as novas.
-- =====================================================================
reset role;
reset request.jwt.claim.sub;

-- 27/09-1. DB-1: em profiles o cliente só grava nome, telefone e novidades
--          (20260927104927_perfil_colunas_e_cadastro). O e-mail é o login e
--          o CPF é único: graváveis, viravam oráculo ("este e-mail/CPF tem
--          conta?") e o e-mail ocupado travava o cadastro de outra pessoa.
insert into auth.users (id, email) values ('a1a1a1a1-0000-4000-8000-000000000001', 'dono-perfil@exemplo.com');
set role authenticated;
set request.jwt.claim.sub = 'a1a1a1a1-0000-4000-8000-000000000001';
do $$
begin
  -- o que o /perfil do site faz continua funcionando
  update public.profiles set buyer_name = 'Dona Perfil', phone = '11987654321', newsletter = true where id = auth.uid();
  if not found then raise exception 'DB-1: o dono deveria continuar editando nome, telefone e novidades'; end if;
  begin
    update public.profiles set email = 'admin@irisflow.com' where id = auth.uid();
    raise exception 'DB-1: o cliente não pode trocar o e-mail do perfil';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set document = '52998224725' where id = auth.uid();
    raise exception 'DB-1: o cliente não pode gravar o CPF direto';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set created_at = now() - interval '1 year' where id = auth.uid();
    raise exception 'DB-1: o cliente não pode mexer em created_at';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- 27/09-2. DB-1 / N1 / N3: o cadastro no Auth não cai por causa do perfil.
do $$
declare
  v_velho uuid := 'a1a1a1a1-0000-4000-8000-000000000002';
  v_outro uuid := 'a1a1a1a1-0000-4000-8000-000000000003';
  v_novo  uuid;
begin
  -- (a) e-mail preso num perfil que não é o do login (cópia velha, ou gravado
  --     pelo cliente antes desta revisão): o cadastro de quem é dono dele passa,
  --     e o perfil velho volta para o e-mail do próprio login.
  insert into auth.users (id, email) values (v_velho, 'perfil-velho@exemplo.com');
  update public.profiles set email = 'ocupado@exemplo.com' where id = v_velho;   -- estado antigo, forjado como superusuário
  insert into auth.users (email) values ('ocupado@exemplo.com') returning id into v_novo;
  if (select email from public.profiles where id = v_novo) is distinct from 'ocupado@exemplo.com' then
    raise exception 'DB-1: o cadastro com e-mail preso em perfil velho deveria criar o perfil com esse e-mail';
  end if;
  if (select email from public.profiles where id = v_velho) is distinct from 'perfil-velho@exemplo.com' then
    raise exception 'DB-1: o perfil velho deveria voltar para o e-mail do próprio login';
  end if;

  -- (b) N1: a troca de e-mail no Auth leva o perfil junto, e o e-mail antigo
  --     fica livre para um cadastro novo.
  update auth.users set email = 'perfil-novo@exemplo.com' where id = v_velho;
  if (select email from public.profiles where id = v_velho) is distinct from 'perfil-novo@exemplo.com' then
    raise exception 'N1: o perfil deveria acompanhar a troca de e-mail do login';
  end if;
  insert into auth.users (email) values ('perfil-velho@exemplo.com') returning id into v_novo;
  if not exists (select 1 from public.profiles where id = v_novo and email = 'perfil-velho@exemplo.com') then
    raise exception 'N1: o e-mail antigo deveria servir para um cadastro novo';
  end if;

  -- (c) cadeia: o login do perfil que segura o e-mail também está ocupado por
  --     outra cópia velha — ele vai para o marcador e o cadastro passa.
  insert into auth.users (id, email) values (v_outro, 'outro-login@exemplo.com');
  update public.profiles set email = 'preso-2@exemplo.com' where id = v_velho;             -- login: perfil-novo@
  update public.profiles set email = 'perfil-novo@exemplo.com' where id = v_outro;         -- login: outro-login@
  insert into auth.users (email) values ('preso-2@exemplo.com') returning id into v_novo;
  if (select email from public.profiles where id = v_novo) is distinct from 'preso-2@exemplo.com'
     or (select email from public.profiles where id = v_velho) is distinct from v_velho::text || '@perfil-sem-email.invalid' then
    raise exception 'DB-1: na cadeia, o cadastro deveria passar e o perfil velho ir para o marcador: % / %',
      (select email from public.profiles where id = v_novo), (select email from public.profiles where id = v_velho);
  end if;

  -- (d) N3: metadado que não é booleano não derruba o cadastro; nome em branco
  --     cai para a parte local do e-mail; true continua valendo.
  insert into auth.users (email, raw_user_meta_data)
  values ('meta-estranho@exemplo.com', '{"newsletter":"sim","buyer_name":"   "}') returning id into v_novo;
  if (select newsletter from public.profiles where id = v_novo) is distinct from false
     or (select buyer_name from public.profiles where id = v_novo) is distinct from 'meta-estranho' then
    raise exception 'N3: metadado estranho deveria virar newsletter = false e o nome da parte local do e-mail';
  end if;
  insert into auth.users (email, raw_user_meta_data)
  values ('meta-true@exemplo.com', '{"newsletter":true,"buyer_name":"Nome Certo"}') returning id into v_novo;
  if (select newsletter from public.profiles where id = v_novo) is distinct from true
     or (select buyer_name from public.profiles where id = v_novo) is distinct from 'Nome Certo' then
    raise exception 'N3: newsletter = true e o nome informado deveriam continuar valendo';
  end if;
end $$;

select 'revisão de 27/09 (DB-1): tudo certo' as resultado;


-- 27/09-3. DB-2 / N4: na conversa e nos alertas o app do cuidador só escreve
--          o que é dele (20260927104942_mensagens_e_alertas_colunas).
reset role;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare b uuid; m_pac uuid; hr uuid;
begin
  select id into b from public.beneficiaries where profile_id = '11111111-1111-1111-1111-111111111111';
  insert into public.messages (beneficiary_id, sender, kind, text, spoken)
  values (b, 'paciente', 'texto', 'Quero água', true) returning id into m_pac;
  insert into public.help_requests (beneficiary_id, kind, message) values (b, 'ajuda', 'Água') returning id into hr;
  perform set_config('irisflow.teste_m_pac', m_pac::text, false);
  perform set_config('irisflow.teste_hr', hr::text, false);
end $$;
set role authenticated;
do $$
declare
  b     uuid := (select id from public.beneficiaries where profile_id = auth.uid());
  m_pac uuid := current_setting('irisflow.teste_m_pac')::uuid;
  hr    uuid := current_setting('irisflow.teste_hr')::uuid;
begin
  -- o que o app faz continua funcionando
  insert into public.messages (beneficiary_id, sender, kind, text) values (b, 'cuidador', 'texto', 'Já vou');
  update public.messages set read_at = now() where id = m_pac;
  if not found then raise exception 'DB-2: marcar como lida deveria continuar valendo'; end if;
  update public.help_requests set acknowledged_at = now(), acknowledged_by = auth.uid() where id = hr;
  if not found then raise exception 'DB-2: confirmar o alerta deveria continuar valendo'; end if;
  update public.help_requests set resolved_at = now() where id = hr;
  if not found then raise exception 'DB-2: resolver o alerta deveria continuar valendo'; end if;
  -- o resto não
  begin
    update public.messages set text = 'Não quero nada' where id = m_pac;
    raise exception 'DB-2: o cuidador não pode reescrever a fala do paciente';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.messages set sender = 'paciente', created_at = now() - interval '10 days'
     where beneficiary_id = b and sender = 'cuidador';
    raise exception 'DB-2: o cuidador não pode trocar remetente nem data';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.messages set spoken = false where id = m_pac;
    raise exception 'DB-2: o cuidador não pode fazer o computador falar de novo';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.help_requests set kind = 'postura', received_at = now() where id = hr;
    raise exception 'DB-2: o cuidador não pode adulterar o alerta';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.messages (beneficiary_id, sender, kind, text)
    values (b, 'cuidador', 'sistema', 'Ninguém confirmou o pedido de socorro em 45 s.');
    raise exception 'N4: o cuidador não pode inserir mensagem de sistema';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.messages (beneficiary_id, sender, kind, text, created_at)
    values (b, 'cuidador', 'texto', 'retrodatada', now() - interval '30 days');
    raise exception 'N4: o cuidador não pode escolher a data da mensagem';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 27/09-4. DB-3 / APP-3: o celular recebe os alertas da conta em que está
--          logado (20260927105017_push_tokens_da_conta).
insert into auth.users (id, email) values
  ('a1a1a1a1-0000-4000-8000-00000000000a', 'familia-a@exemplo.com'),
  ('a1a1a1a1-0000-4000-8000-00000000000b', 'familia-b@exemplo.com');
set role authenticated;
set request.jwt.claim.sub = 'a1a1a1a1-0000-4000-8000-00000000000a';
select public.registrar_push_token('ExponentPushToken[celular-reusado]');
set request.jwt.claim.sub = 'a1a1a1a1-0000-4000-8000-00000000000b';
do $$
begin
  -- o jeito antigo (upsert direto) continua barrado pela RLS...
  begin
    insert into public.push_tokens (token, profile_id) values ('ExponentPushToken[celular-reusado]', auth.uid())
    on conflict (token) do update set profile_id = excluded.profile_id;
    raise exception 'DB-3: esperava a recusa da RLS no upsert direto';
  exception when insufficient_privilege then null;
  end;
  -- ...e a RPC passa o aparelho para a conta logada
  perform public.registrar_push_token('ExponentPushToken[celular-reusado]', 'expo');
end $$;
reset role;
do $$
begin
  if (select profile_id from public.push_tokens where token = 'ExponentPushToken[celular-reusado]')
     is distinct from 'a1a1a1a1-0000-4000-8000-00000000000b' then
    raise exception 'DB-3: o token deveria ter passado para a conta B';
  end if;
  if has_function_privilege('anon', 'public.registrar_push_token(text, text)', 'execute')
     or has_function_privilege('anon', 'public.remover_push_token(text)', 'execute') then
    raise exception 'DB-3: anon não pode registrar nem remover token';
  end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = 'a1a1a1a1-0000-4000-8000-00000000000a';
select public.remover_push_token('ExponentPushToken[celular-reusado]');   -- não é mais da conta A: nada
reset role;
do $$
begin
  if not exists (select 1 from public.push_tokens where token = 'ExponentPushToken[celular-reusado]') then
    raise exception 'DB-3: a conta A não pode apagar o token da conta B';
  end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = 'a1a1a1a1-0000-4000-8000-00000000000b';
select public.remover_push_token('ExponentPushToken[celular-reusado]');
reset role;
do $$
begin
  if exists (select 1 from public.push_tokens where token = 'ExponentPushToken[celular-reusado]') then
    raise exception 'DB-3: a conta B deveria apagar o próprio token ao sair';
  end if;
end $$;

-- 27/09-5. SITE-1 e SITE-17: apelido de 2 letras; null mantém e '' apaga
--          (20260927105038_apelido_e_pesquisa).
update public.beta_program set open = true;
set role authenticated;
set request.jwt.claim.sub = 'a1a1a1a1-0000-4000-8000-00000000000b';
do $$
begin
  perform public.complete_beta_registration('11987654321', 'Vó', 'pai-mae', 'ela', 'windows', p_how_found => 'Instagram');
  if (select user_name from public.beneficiaries where profile_id = auth.uid()) is distinct from 'Vó' then
    raise exception 'SITE-1: o apelido "Vó" deveria ser aceito';
  end if;
  begin
    perform public.complete_beta_registration(null, 'V', 'pai-mae', 'ela', 'windows');
    raise exception 'SITE-1: uma letra só deveria ser recusada';
  exception when check_violation then null;
  end;
  -- null mantém telefone e "como conheceu"...
  perform public.complete_beta_registration(null, 'Vó', 'pai-mae', 'ela', 'windows', p_how_found => null);
  if (select phone from public.profiles where id = auth.uid()) is distinct from '11987654321'
     or (select how_found from public.beta_registrations where profile_id = auth.uid()) is distinct from 'Instagram' then
    raise exception 'SITE-17: null deveria manter o telefone e o "como conheceu"';
  end if;
  -- ...e '' apaga os dois
  perform public.complete_beta_registration('', 'Vó', 'pai-mae', 'ela', 'windows', p_how_found => '');
  if (select phone from public.profiles where id = auth.uid()) is not null
     or (select how_found from public.beta_registrations where profile_id = auth.uid()) is not null then
    raise exception 'SITE-17: campo esvaziado deveria apagar o telefone e o "como conheceu"';
  end if;
end $$;
reset role;
update public.beta_program set open = false;

-- 27/09-6. SITE-12: contato com limites contra abuso
--          (20260927105105_contato_com_limites).
set role anon;
insert into public.contact_messages (name, email, role, message, created_at, handled)
values ('Robô Teste', ' Robo@Exemplo.com ', 'outro', 'mensagem com mais de quinze letras', '2001-01-01', true);
reset role;
do $$
begin
  if not exists (select 1 from public.contact_messages where email = 'robo@exemplo.com') then
    raise exception 'SITE-12: o e-mail deveria ser guardado aparado e em minúsculas';
  end if;
  if exists (select 1 from public.contact_messages
              where email = 'robo@exemplo.com' and (handled or created_at < now() - interval '1 minute')) then
    raise exception 'SITE-12: created_at e handled são do servidor';
  end if;
end $$;
set role anon;
do $$
begin
  insert into public.contact_messages (name, email, role, message) values ('Robô Teste', 'robo@exemplo.com', 'outro', 'mensagem com mais de quinze letras');
  insert into public.contact_messages (name, email, role, message) values ('Robô Teste', 'robo@exemplo.com', 'outro', 'mensagem com mais de quinze letras');
  begin
    insert into public.contact_messages (name, email, role, message) values ('Robô Teste', 'robo@exemplo.com', 'outro', 'mensagem com mais de quinze letras');
    raise exception 'SITE-12: a 4ª mensagem do mesmo e-mail em 10 minutos deveria ser recusada';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'limite_de_contato' then raise; end if;
  end;
  begin
    insert into public.contact_messages (name, email, role, message) values
      ('Lote Um', 'lote1@exemplo.com', 'outro', 'mensagem com mais de quinze letras'),
      ('Lote Dois', 'lote2@exemplo.com', 'outro', 'mensagem com mais de quinze letras');
    raise exception 'SITE-12: insert em lote deveria ser recusado';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'limite_de_contato' then raise; end if;
  end;
end $$;
reset role;

-- 27/09-7. DB-5 / N8 / APP-5: reenvio do escalonamento, um pedido com erro não
--          trava os outros e o push de socorro com prioridade no iOS
--          (20260927105153_escalonamento_reenvio).
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
do $$
declare
  b uuid; hr uuid; antes bigint;
begin
  select id into b from public.beneficiaries where profile_id = auth.uid();
  -- escalado há 6 min e ainda sem confirmação: reenvia (1ª vez)
  insert into public.help_requests (beneficiary_id, kind, message, created_at, received_at, escalated_at, ultimo_aviso_em)
  values (b, 'emergencia', 'Dor', now() - interval '7 minutes', now() - interval '7 minutes',
          now() - interval '6 minutes', now() - interval '6 minutes') returning id into hr;
  select coalesce(max(id), 0) into antes from net.chamadas;
  if public.escalar_pedidos_de_ajuda() < 1 then raise exception 'DB-5: deveria reenviar o socorro sem confirmação'; end if;
  if (select reenvios from public.help_requests where id = hr) <> 1 then raise exception 'DB-5: reenvios deveria ser 1'; end if;
  if not exists (select 1 from public.messages
                  where beneficiary_id = b and kind = 'sistema'
                    and text = 'O pedido de socorro continua sem confirmação. O alerta foi reenviado a todos os celulares.') then
    raise exception 'DB-5: o reenvio deveria avisar na conversa';
  end if;
  if not exists (select 1 from net.chamadas c, jsonb_array_elements(c.body) m
                  where c.id > antes and m->>'title' = '🚨 Socorro ainda sem resposta'
                    and m->>'interruptionLevel' = 'time-sensitive' and m->>'channelId' = 'emergencia') then
    raise exception 'DB-5 / APP-5: push do reenvio com título ou prioridade errados: %',
      (select body from net.chamadas order by id desc limit 1);
  end if;
  -- logo em seguida, nada: 5 minutos entre um aviso e outro
  if public.escalar_pedidos_de_ajuda() <> 0 then raise exception 'DB-5: reenviou antes de 5 minutos'; end if;
  -- 2ª vez; depois, o teto de 2 reenvios
  update public.help_requests set ultimo_aviso_em = now() - interval '6 minutes' where id = hr;
  perform public.escalar_pedidos_de_ajuda();
  if (select reenvios from public.help_requests where id = hr) <> 2 then raise exception 'DB-5: reenvios deveria ser 2'; end if;
  update public.help_requests set ultimo_aviso_em = now() - interval '6 minutes' where id = hr;
  if public.escalar_pedidos_de_ajuda() <> 0 then raise exception 'DB-5: passou do teto de 2 reenvios'; end if;
  -- confirmado: nunca mais
  update public.help_requests set acknowledged_at = now(), reenvios = 0, ultimo_aviso_em = now() - interval '6 minutes' where id = hr;
  if public.escalar_pedidos_de_ajuda() <> 0 then raise exception 'DB-5: pedido confirmado não se reenvia'; end if;
end $$;

-- N8: o push de um pedido falha (rede fora), o de outro sai.
insert into auth.users (id, email) values ('a1a1a1a1-0000-4000-8000-00000000000c', 'familia-c@exemplo.com');
insert into public.beneficiaries (profile_id, user_name, relation, condition, os)
values ('a1a1a1a1-0000-4000-8000-00000000000c', 'Carla', 'filho', 'ela', 'windows');
insert into public.push_tokens (token, profile_id) values ('ExponentPushToken[falha]', 'a1a1a1a1-0000-4000-8000-00000000000c');
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language plpgsql as $$
declare v bigint;
begin
  if body::text like '%ExponentPushToken[falha]%' then raise exception 'rede fora (teste)'; end if;
  insert into net.chamadas (url, headers, body) values (url, headers, body) returning id into v;
  return v;
end;
$$;
do $$
declare
  b_ok uuid := (select id from public.beneficiaries where profile_id = '11111111-1111-1111-1111-111111111111');
  b_falha uuid := (select id from public.beneficiaries where profile_id = 'a1a1a1a1-0000-4000-8000-00000000000c');
  ok uuid; falha uuid; n int;
begin
  insert into public.help_requests (beneficiary_id, kind, message, created_at, received_at)
  values (b_falha, 'emergencia', 'Dor', now() - interval '2 minutes', now() - interval '2 minutes') returning id into falha;
  insert into public.help_requests (beneficiary_id, kind, message, created_at, received_at)
  values (b_ok, 'emergencia', 'Dor', now() - interval '2 minutes', now() - interval '2 minutes') returning id into ok;
  n := public.escalar_pedidos_de_ajuda();
  if (select escalated_at from public.help_requests where id = ok) is null then
    raise exception 'N8: o erro de um pedido não pode travar o escalonamento dos outros';
  end if;
  if (select escalated_at from public.help_requests where id = falha) is not null then
    raise exception 'N8: o pedido que falhou deveria ficar para a próxima passagem';
  end if;
  if n <> 1 then raise exception 'N8: esperava 1 pedido escalado, veio %', n; end if;
  delete from public.help_requests where id in (ok, falha);
end $$;
-- pg_net de mentira de volta ao original
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into net.chamadas (url, headers, body) values (url, headers, body) returning id
$$;
delete from public.push_tokens where token = 'ExponentPushToken[falha]';

select 'revisão de 27/09 (DB-2, DB-3, DB-5, SITE-1, SITE-12, SITE-17): tudo certo' as resultado;

select 'cenário da beta, 22/09 e 23/09: tudo certo' as resultado;

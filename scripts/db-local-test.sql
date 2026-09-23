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
  if not (l->'features'->>'voz')::boolean or not (l->'features'->>'multiplos_dispositivos')::boolean then
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
--     local (desktop antigo) nada é revogado. (migração 20260923150100_pair_device_mesmo_computador)
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

-- 12. Anon lê beta_program e plans (RLS), não lê beta_registrations.
reset request.jwt.claim.sub;
set role anon;
select open, current_version from public.beta_program;
select id, purchasable from public.plans order by 1;
do $$
begin
  if (select count(*) from public.beta_registrations) <> 0 then
    raise exception 'anon não deveria enxergar beta_registrations';
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
-- 15. Telefone opcional na inscrição (20260923022800)
--     Vazio não quebra o CHECK de profiles.phone e não apaga o que já havia.
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
  perform public.complete_beta_registration('   ', 'Bia Lima', 'proprio', 'avc', 'linux');
  if (select phone from public.profiles where id = auth.uid()) <> '(11) 98888-7777' then
    raise exception 'refazer a inscrição sem telefone não pode apagar o número já gravado';
  end if;
end $$;
update public.beta_program set open = false;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------
-- 16. Escalonamento de emergência (20260923022524 + 20260923150000_help_requests_received_at)
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

select 'cenário da beta, 22/09 e 23/09: tudo certo' as resultado;

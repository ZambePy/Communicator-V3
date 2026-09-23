-- Nome original: 20260915_beta.sql (escrita em 15/09/2026); renomeada para a versão 20260923022616, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — programa Beta (site ↔ app desktop ↔ app do cuidador)
--
-- Ordem de aplicação no projeto Supabase "Site Iris Flow":
--   1. supabase/migrations/20260923022346_schema_base.sql
--   2. supabase/migrations/20260923022425_caregiver_app.sql
--   3. supabase/migrations/20260923022507_integracao_ecossistema.sql
--   4. supabase/migrations/20260923022524_escalonamento_de_emergencia.sql
--   5. este arquivo
--
-- É idempotente: rodar de novo não quebra nem duplica.
--
-- O que muda com a beta:
--   • A COMPRA de planos fica indisponível. `plans.purchasable` é a chave:
--     `complete_registration` (o cadastro pago do site) recusa qualquer plano
--     com purchasable = false, e hoje TODOS ficam false. Reabrir vendas é um
--     UPDATE nesta coluna, sem nova migração.
--   • Existe um plano `beta` (R$ 0, sem cobrança) que só entra por
--     `complete_beta_registration()`. A assinatura nasce 'ativa' com
--     next_charge_at = fim do programa (tabela `beta_program`), então o
--     `my_account` do site, o `desktop_license()` do desktop e a leitura de
--     `subscriptions` do app do cuidador continuam funcionando sem mudar de
--     forma — só o valor muda.
--   • `beta_registrations` guarda o que é específico do programa: se a pessoa
--     quer o app do cuidador, quando baixou, se aceitou dar retorno. O CPF é
--     OPCIONAL aqui (na compra ele é obrigatório).
--   • `license_for_profile()` ganha o ramo `beta`: liberado até o fim do
--     programa, com todos os recursos (rank 3). Depois disso, `beta_encerrada`.
--   • `beta_program` (uma linha) diz se as inscrições estão abertas, até
--     quando o acesso vale e a versão atual do instalador. O site lê sem login.
--
-- Nenhuma das três aplicações tem gateway de pagamento ligado: o webhook
-- `payment-webhook` e `register_charge()` continuam existindo, mas nada os
-- chama enquanto `purchasable` for false em todos os planos.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. plans.purchasable — pode ser contratado pelo fluxo pago?
-- ---------------------------------------------------------------------
alter table public.plans
  add column if not exists purchasable boolean not null default true;

comment on column public.plans.purchasable is
  'false = o site mostra o plano como indisponível e complete_registration recusa. Durante a beta todos ficam false.';

insert into public.plans (id, name, price_brl, trial_days, active, purchasable) values
  ('beta', 'Beta', 0.00, 0, true, false)
on conflict (id) do update
  set name        = excluded.name,
      price_brl   = excluded.price_brl,
      trial_days  = excluded.trial_days,
      active      = true,
      purchasable = false;

-- A beta fecha a compra. Os planos continuam ATIVOS (o site exibe a grade
-- com preço, marcada como indisponível) — só não podem ser contratados.
update public.plans
   set purchasable = false
 where id in ('essencial', 'completo', 'voz');


-- ---------------------------------------------------------------------
-- 2. beta_program — estado do programa (uma linha só)
-- ---------------------------------------------------------------------
create table if not exists public.beta_program (
  id                 smallint primary key default 1 check (id = 1),
  open               boolean     not null default true,
  -- Até quando a licença de quem se inscreveu vale. Vira next_charge_at da
  -- assinatura beta; quem se inscreve depois de mudar isto pega o valor novo,
  -- quem já entrou mantém o que tinha (atualize subscriptions se quiser
  -- estender todo mundo).
  ends_at            timestamptz not null default '2027-03-31 23:59:59-03',
  max_registrations  integer     check (max_registrations is null or max_registrations > 0),
  current_version    text        not null default '1.0.0-beta.1',
  notes              text,
  updated_at         timestamptz not null default now()
);

insert into public.beta_program (id) values (1)
on conflict (id) do nothing;

alter table public.beta_program enable row level security;

drop policy if exists beta_program_public_read on public.beta_program;
create policy beta_program_public_read on public.beta_program
  for select to anon, authenticated using (true);

comment on table public.beta_program is
  'Uma linha. open = aceita inscrições; ends_at = fim do acesso beta; current_version = versão exibida na página /beta.';

-- No Supabase os privilégios padrão do schema public já dão isto; explícito
-- para o esquema funcionar igual num PostgreSQL sem esses padrões.
grant select on public.beta_program to anon, authenticated;
grant all on public.beta_program to service_role;


-- ---------------------------------------------------------------------
-- 3. beta_registrations — o que é só da beta
-- ---------------------------------------------------------------------
create table if not exists public.beta_registrations (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null unique references public.profiles (id) on delete cascade,
  -- Sistema do computador onde a pessoa vai instalar (espelha beneficiaries.os).
  os                  public.os_t not null,
  -- Quer o app do cuidador no celular além do desktop?
  wants_caregiver_app boolean not null default false,
  -- Aceitou ser contatada para dar retorno sobre a beta.
  feedback_consent    boolean not null default false,
  -- Como soube da IrisFlow (texto livre, opcional).
  how_found           text,
  -- Primeiro clique em "baixar", por sistema. Preenchido por mark_beta_download().
  downloaded_at       timestamptz,
  downloaded_os       public.release_os_t,
  registered_at       timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.beta_registrations enable row level security;

drop policy if exists beta_registrations_select_own on public.beta_registrations;
create policy beta_registrations_select_own on public.beta_registrations
  for select to authenticated
  using (profile_id = (select auth.uid()));

-- Escrita só pelas funções abaixo (security definer). Sem política de
-- insert/update para o cliente.

comment on table public.beta_registrations is
  'Inscrições no programa beta. O CPF, quando informado, fica em profiles.document (opcional na beta).';

grant select on public.beta_registrations to authenticated;
grant all on public.beta_registrations to service_role;

-- Só o fim das colunas: bump automático de updated_at, se o gatilho genérico
-- do schema existir (set_updated_at). Se não existir, não faz mal.
do $$ begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists beta_registrations_touch on public.beta_registrations;
    create trigger beta_registrations_touch
      before update on public.beta_registrations
      for each row execute function public.set_updated_at();
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 4. complete_beta_registration() — o cadastro da beta
--
-- Mesmo desenho de complete_registration (o usuário já existe no Auth e
-- está autenticado; os dados sensíveis entram aqui, não no signUp), com
-- três diferenças:
--   • CPF opcional (p_document pode vir null ou vazio);
--   • não escolhe plano: é sempre 'beta', status 'ativa', preço 0;
--   • grava a linha de beta_registrations.
--
-- Devolve JSON, não uuid, porque o site precisa do fim do programa para
-- mostrar "acesso até".
-- ---------------------------------------------------------------------
create or replace function public.complete_beta_registration(
  p_phone               text,
  p_user_name           text,
  p_relation            public.relation_t,
  p_condition           public.condition_t,
  p_os                  public.os_t,
  p_document            text    default null,
  p_wants_caregiver_app boolean default false,
  p_feedback_consent    boolean default false,
  p_how_found           text    default null,
  p_newsletter          boolean default false,
  p_prescriber_name     text    default null,
  p_prescriber_role     text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_prog  public.beta_program%rowtype;
  v_plan  public.plans%rowtype;
  v_sub   uuid;
  v_doc   text;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'complete_beta_registration: é preciso estar autenticado'
      using errcode = '28000';
  end if;

  select * into v_prog from public.beta_program where id = 1;
  if not found or not v_prog.open then
    raise exception 'As inscrições da beta estão fechadas no momento.'
      using errcode = 'P0001';
  end if;

  if v_prog.max_registrations is not null then
    select count(*) into v_count from public.beta_registrations;
    if v_count >= v_prog.max_registrations
       and not exists (select 1 from public.beta_registrations where profile_id = v_uid) then
      raise exception 'As vagas da beta acabaram. Deixe seu contato pelo site e avisamos quando abrir de novo.'
        using errcode = 'P0001';
    end if;
  end if;

  select * into v_plan from public.plans where id = 'beta' and active;
  if not found then
    raise exception 'complete_beta_registration: plano beta não existe ou está inativo'
      using errcode = '22023';
  end if;

  -- CPF opcional: só dígitos, ou null. O check de profiles.document exige 11
  -- dígitos quando não é null, então algo como "123" é recusado pelo banco —
  -- o site valida antes e só manda vazio ou CPF completo.
  v_doc := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');

  update public.profiles
     set phone      = p_phone,
         document   = coalesce(v_doc, document),
         newsletter = p_newsletter
   where id = v_uid;

  insert into public.beneficiaries
    (profile_id, user_name, relation, condition, os, prescriber_name, prescriber_role)
  values
    (v_uid, p_user_name, p_relation, p_condition, p_os,
     nullif(btrim(p_prescriber_name), ''), nullif(btrim(p_prescriber_role), ''))
  on conflict (profile_id) do update
    set user_name       = excluded.user_name,
        relation        = excluded.relation,
        condition       = excluded.condition,
        os              = excluded.os,
        prescriber_name = excluded.prescriber_name,
        prescriber_role = excluded.prescriber_role;

  -- Assinatura beta: 'ativa' desde já, sem avaliação e sem cobrança. O
  -- trial_ends_at é agora (não há trial) e next_charge_at é o fim do
  -- programa — é essa data que o desktop mostra como "válida até".
  insert into public.subscriptions
    (profile_id, plan_id, status, price_brl, trial_ends_at, next_charge_at)
  values
    (v_uid, v_plan.id, 'ativa', 0, now(), v_prog.ends_at)
  on conflict do nothing
  returning id into v_sub;

  -- Já tinha assinatura viva (por exemplo, criou a conta na época dos planos
  -- pagos): não estoura; devolve a existente. Quem quiser migrar para a beta
  -- resolve no painel do Supabase.
  if v_sub is null then
    select id into v_sub
      from public.subscriptions
     where profile_id = v_uid and status <> 'encerrada'
     limit 1;
  end if;

  insert into public.beta_registrations
    (profile_id, os, wants_caregiver_app, feedback_consent, how_found)
  values
    (v_uid, p_os, coalesce(p_wants_caregiver_app, false), coalesce(p_feedback_consent, false),
     nullif(btrim(p_how_found), ''))
  on conflict (profile_id) do update
    set os                  = excluded.os,
        wants_caregiver_app = excluded.wants_caregiver_app,
        feedback_consent    = excluded.feedback_consent,
        how_found           = coalesce(excluded.how_found, public.beta_registrations.how_found);

  return jsonb_build_object(
    'subscription_id', v_sub,
    'beta_ends_at',    v_prog.ends_at,
    'current_version', v_prog.current_version
  );
end;
$$;

revoke all on function public.complete_beta_registration(
  text, text, public.relation_t, public.condition_t, public.os_t,
  text, boolean, boolean, text, boolean, text, text) from public, anon;
grant execute on function public.complete_beta_registration(
  text, text, public.relation_t, public.condition_t, public.os_t,
  text, boolean, boolean, text, boolean, text, text) to authenticated;


-- 4.1 mark_beta_download() — registra o primeiro download (métrica da beta).
create or replace function public.mark_beta_download(p_os public.release_os_t)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'mark_beta_download: é preciso estar autenticado' using errcode = '28000';
  end if;
  update public.beta_registrations
     set downloaded_at = coalesce(downloaded_at, now()),
         downloaded_os = coalesce(downloaded_os, p_os)
   where profile_id = auth.uid()
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.mark_beta_download(public.release_os_t) from public, anon;
grant execute on function public.mark_beta_download(public.release_os_t) to authenticated;


-- ---------------------------------------------------------------------
-- 5. complete_registration() — o fluxo PAGO recusa plano não comprável
--
-- Corpo idêntico ao da 20260923022346_schema_base.sql, mais a checagem de `purchasable`. O
-- site já não chega aqui na beta (redireciona /cadastro para /beta), mas
-- a regra tem de estar no banco: alguém chamando a RPC à mão não pode
-- abrir uma avaliação de plano pago.
-- ---------------------------------------------------------------------
create or replace function public.complete_registration(
  p_phone           text,
  p_document        text,
  p_user_name       text,
  p_relation        public.relation_t,
  p_condition       public.condition_t,
  p_os              public.os_t,
  p_prescriber_name text    default null,
  p_prescriber_role text    default null,
  p_newsletter      boolean default false,
  p_plan_id         text    default 'completo'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_sub  uuid;
  v_doc  text;
begin
  if v_uid is null then
    raise exception 'complete_registration: é preciso estar autenticado'
      using errcode = '28000';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and active;
  if not found then
    raise exception 'complete_registration: plano % não existe ou está inativo', p_plan_id
      using errcode = '22023';
  end if;

  if not v_plan.purchasable then
    raise exception 'A contratação de planos está indisponível durante a beta. Inscreva-se em /beta.'
      using errcode = 'P0001';
  end if;

  v_doc := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');

  update public.profiles
     set phone      = p_phone,
         document   = v_doc,
         newsletter = p_newsletter
   where id = v_uid;

  insert into public.beneficiaries
    (profile_id, user_name, relation, condition, os, prescriber_name, prescriber_role)
  values
    (v_uid, p_user_name, p_relation, p_condition, p_os,
     nullif(btrim(p_prescriber_name), ''), nullif(btrim(p_prescriber_role), ''))
  on conflict (profile_id) do update
    set user_name       = excluded.user_name,
        relation        = excluded.relation,
        condition       = excluded.condition,
        os              = excluded.os,
        prescriber_name = excluded.prescriber_name,
        prescriber_role = excluded.prescriber_role;

  insert into public.subscriptions
    (profile_id, plan_id, status, price_brl, trial_ends_at, next_charge_at)
  values
    (v_uid, v_plan.id, 'avaliacao', v_plan.price_brl,
     now() + make_interval(days => v_plan.trial_days),
     now() + make_interval(days => v_plan.trial_days))
  on conflict do nothing
  returning id into v_sub;

  if v_sub is null then
    select id into v_sub
      from public.subscriptions
     where profile_id = v_uid and status <> 'encerrada'
     limit 1;
  end if;

  return v_sub;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. license_for_profile() — ramo beta
--
-- Mesma função da migração 20260923022507_integracao_ecossistema, com um caso a mais. A assinatura
-- beta tem status 'ativa' e plan_id 'beta'; sem este ramo ela seria
-- tratada como plano pago ativo (liberado para sempre, rank 1). Com ele:
--   beta  → liberado até next_charge_at (fim do programa), rank 3 (tudo)
--           depois disso: reason 'beta_encerrada', bloqueado
-- O JSON continua com as mesmas chaves; o desktop e o site só ganham um
-- valor novo em `reason`.
-- ---------------------------------------------------------------------
create or replace function public.license_for_profile(p_profile uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub   record;
  v_ben   record;
  v_rank  int;
  v_allowed boolean := false;
  v_reason  text := 'sem_assinatura';
  v_until   timestamptz := null;
begin
  select s.id, s.status, s.plan_id, p.name as plan_name, s.trial_ends_at,
         s.next_charge_at, s.canceled_at
    into v_sub
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
   where s.profile_id = p_profile
     and s.status <> 'encerrada'
   order by s.created_at desc
   limit 1;

  select b.id, b.user_name into v_ben
    from public.beneficiaries b
   where b.profile_id = p_profile
   order by b.created_at
   limit 1;

  if v_sub.id is not null then
    if v_sub.plan_id = 'beta' and v_sub.status in ('ativa', 'avaliacao') then
      v_until   := v_sub.next_charge_at;
      v_allowed := now() < v_until;
      v_reason  := case when v_allowed then 'beta' else 'beta_encerrada' end;
    else
      case v_sub.status
        when 'avaliacao' then
          v_until   := v_sub.trial_ends_at + interval '3 days';
          v_allowed := now() < v_until;
          v_reason  := case when v_allowed then 'avaliacao' else 'avaliacao_encerrada' end;
        when 'ativa' then
          v_until   := v_sub.next_charge_at + interval '7 days';
          v_allowed := true;
          v_reason  := 'ativa';
        when 'inadimplente' then
          v_until   := v_sub.next_charge_at + interval '7 days';
          v_allowed := now() < v_until;
          v_reason  := 'inadimplente';
        when 'cancelada' then
          v_until   := v_sub.next_charge_at;
          v_allowed := now() < v_until;
          v_reason  := 'cancelada';
        else
          v_allowed := false;
          v_reason  := 'sem_assinatura';
      end case;
    end if;
  end if;

  v_rank := case v_sub.plan_id
              when 'beta' then 3
              when 'voz' then 3
              when 'completo' then 2
              else 1
            end;

  return jsonb_build_object(
    'allowed',        v_allowed,
    'reason',         v_reason,
    'status',         v_sub.status,
    'plan_id',        v_sub.plan_id,
    'plan_name',      v_sub.plan_name,
    'trial_ends_at',  v_sub.trial_ends_at,
    'next_charge_at', v_sub.next_charge_at,
    'access_until',   v_until,
    'checked_at',     now(),
    'beneficiary',    case when v_ben.id is null then null
                           else jsonb_build_object('id', v_ben.id, 'user_name', v_ben.user_name) end,
    'features',       jsonb_build_object(
                        'relatorios',             v_rank >= 2,
                        'multiplos_dispositivos', v_rank >= 2,
                        'assistente',             v_rank >= 2,
                        'voz',                    v_rank >= 3)
  );
end;
$$;

revoke all on function public.license_for_profile(uuid) from public, anon, authenticated;
grant execute on function public.license_for_profile(uuid) to service_role;


-- ---------------------------------------------------------------------
-- 7. pair_device() — a beta libera vários computadores
--
-- A função original consulta o plano diretamente ('completo'/'voz' = sem
-- limite). Em vez de reescrevê-la, o ramo abaixo só amplia a lista:
-- 'beta' também não revoga os anteriores. (Corpo idêntico ao da migração
-- 20260923022507_integracao_ecossistema, exceto a lista.)
-- ---------------------------------------------------------------------
create or replace function public.pair_device(
  p_beneficiary_id uuid,
  p_name           text default 'Computador',
  p_os             public.release_os_t default 'windows',
  p_app_version    text default '',
  p_hostname       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_key     text;
  v_id      uuid;
  v_plan    text;
  v_revoked uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'pair_device: é preciso estar autenticado' using errcode = '28000';
  end if;
  if not public.is_my_beneficiary(p_beneficiary_id) then
    raise exception 'pair_device: beneficiário não pertence a esta conta' using errcode = '42501';
  end if;

  select plan_id into v_plan
    from public.subscriptions
   where profile_id = v_uid and status <> 'encerrada'
   order by created_at desc limit 1;

  if coalesce(v_plan, 'essencial') not in ('completo', 'voz', 'beta') then
    with r as (
      update public.devices
         set revoked_at = now()
       where beneficiary_id = p_beneficiary_id and revoked_at is null
      returning id
    )
    select coalesce(array_agg(id), '{}') into v_revoked from r;
  end if;

  v_key := encode(gen_random_bytes(32), 'hex');

  insert into public.devices
    (beneficiary_id, name, os, app_version, device_key_hash, hostname, paired_at, last_seen_at)
  values
    (p_beneficiary_id, coalesce(nullif(btrim(p_name), ''), 'Computador'), p_os,
     coalesce(p_app_version, ''), encode(digest(v_key, 'sha256'), 'hex'),
     nullif(btrim(p_hostname), ''), now(), now())
  returning id into v_id;

  return jsonb_build_object(
    'device_id',          v_id,
    'device_key',         v_key,
    'revoked_device_ids', to_jsonb(v_revoked)
  );
end;
$$;

revoke all on function public.pair_device(uuid, text, public.release_os_t, text, text) from public, anon;
grant execute on function public.pair_device(uuid, text, public.release_os_t, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 8. Cancelamento na beta
--
-- request_cancellation() marca 'cancelada' e o site promete acesso até
-- next_charge_at — que na beta é o fim do programa. Ou seja: cancelar a
-- beta não tira o acesso antes do fim, e é isso mesmo (não há cobrança a
-- evitar). O site esconde o botão para a beta; a função continua válida.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 9. Conferência rápida (opcional, rode à mão no SQL Editor)
--   select id, price_brl, active, purchasable from public.plans order by 1;
--   select * from public.beta_program;
-- ---------------------------------------------------------------------

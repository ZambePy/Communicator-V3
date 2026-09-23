-- Nome original: 20260923_telefone_opcional.sql (escrita em 23/09/2026); renomeada para a versão 20260923022800, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — telefone opcional durante a beta
--
-- O cadastro da beta passa a aceitar a inscrição sem telefone. As duas
-- RPCs que gravam `profiles.phone` tratam vazio como "não informado":
--
--   • complete_beta_registration: vazio/nulo MANTÉM o telefone que já
--     existir (quem refaz a inscrição sem digitar não perde o número);
--   • complete_registration (fluxo pago, fechado na beta): vazio vira NULL.
--
-- Sem isto, um '' chegava ao CHECK de `profiles.phone` (10–11 dígitos
-- quando não é NULL) e a inscrição inteira falhava.
--
-- Idempotente (create or replace, mesmas assinaturas).
-- =====================================================================

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
  v_tel   text;
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

  v_doc := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');
  v_tel := nullif(btrim(coalesce(p_phone, '')), '');

  update public.profiles
     set phone      = coalesce(v_tel, phone),
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

  insert into public.subscriptions
    (profile_id, plan_id, status, price_brl, trial_ends_at, next_charge_at)
  values
    (v_uid, v_plan.id, 'ativa', 0, now(), v_prog.ends_at)
  on conflict do nothing
  returning id into v_sub;

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
     set phone      = nullif(btrim(coalesce(p_phone, '')), ''),
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

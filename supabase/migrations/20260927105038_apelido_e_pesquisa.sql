-- =====================================================================
-- IrisFlow — apelido de 2 letras e "apagar" de verdade na edição da pesquisa
--
-- Revisão do banco de 27/09/2026 (auditoria SITE-1 e SITE-17). Idempotente.
--
-- 1. SITE-1. "Como essa pessoa gosta de ser chamada?" é um apelido: "Vó",
--    "Zé", "Lu". O site aceitava 2 letras, mas o CHECK de
--    beneficiaries.user_name exigia 3 — a inscrição não concluía, com um
--    erro técnico em inglês. Uma regra só: 2 letras ou mais, no banco e no
--    site (utils/validation.ts → APELIDO_MINIMO). Mesmo nome de constraint:
--    o site traduz o erro por ele.
--
-- 2. SITE-17. complete_beta_registration usava null para "manter" e o site
--    mandava null também para "apagar": esvaziar o telefone ou o "como
--    conheceu" na edição das respostas não apagava nada, e a tela dizia
--    "salvas". Agora:
--      • null        → mantém (é o que o site publicado manda para vazio);
--      • '' (ou só espaços) → apaga;
--      • texto       → grava.
--    O resto da função é o mesmo da migração 20260923022800_telefone_opcional.
-- =====================================================================

alter table public.beneficiaries drop constraint if exists beneficiaries_user_name_check;
alter table public.beneficiaries
  add constraint beneficiaries_user_name_check check (length(btrim(user_name)) >= 2);

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

  v_doc := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');

  update public.profiles
     set phone      = case
                        when p_phone is null then phone          -- mantém
                        else nullif(btrim(p_phone), '')          -- '' apaga
                      end,
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
        how_found           = case
                                when p_how_found is null then public.beta_registrations.how_found  -- mantém
                                else excluded.how_found                                           -- '' apaga
                              end;

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

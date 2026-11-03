-- =====================================================================
-- IrisFlow — licença `ativa` passa a vencer (03/11/2026, B20 / S1 da
-- limpeza de 02/11)
--
-- Idempotente. Roda DEPOIS de 20261021120000_endurecimento_rodada3. Aplicada em produção em 03/11/2026 pelo conector (versão 20261103085436).
--
-- O furo: request_cancellation → attach_payment_method('pix') →
-- reactivate_subscription punha a assinatura em `ativa` sem cobrança
-- nenhuma, e license_for_profile liberava `ativa` para sempre
-- (v_allowed := true). Dava para usar o app pago sem pagar.
--
-- 1. license_for_profile: `ativa` libera só até next_charge_at + 7 dias (a
--    mesma tolerância de `inadimplente`). Quem paga não sente: register_charge
--    empurra next_charge_at a cada cobrança paga. A beta não muda (ramo
--    próprio, até o fim da beta).
-- 2. reactivate_subscription: só volta para `ativa` se o período pago ainda
--    não acabou (next_charge_at > now()). Acabado, volta como `inadimplente`
--    e fica bloqueada até o webhook confirmar uma cobrança paga.
--
-- No dia desta migration, todas as assinaturas do projeto eram da beta
-- (`ativa` até 01/04/2027): ninguém perde acesso.
-- =====================================================================

create or replace function public.license_for_profile(p_profile uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
          -- Vence: sem cobrança paga que empurre next_charge_at, acaba nos 7 dias de tolerância.
          v_until   := v_sub.next_charge_at + interval '7 days';
          v_allowed := v_sub.next_charge_at is not null and now() < v_until;
          v_reason  := case when v_allowed then 'ativa' else 'inadimplente' end;
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
                        'lazer',                  v_rank >= 2,
                        'voz',                    v_rank >= 3)
  );
end;
$function$;

create or replace function public.reactivate_subscription()
 returns subscription_status_t
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_has_pm boolean;
  v_status public.subscription_status_t;
begin
  if v_uid is null then
    raise exception 'reactivate_subscription: é preciso estar autenticado'
      using errcode = '28000';
  end if;

  select exists (
    select 1 from public.payment_methods where profile_id = v_uid and is_default
  ) into v_has_pm;

  -- Só volta a `ativa` dentro do período já pago; passado dele, espera a cobrança.
  update public.subscriptions
     set status      = case
                         when not v_has_pm then 'avaliacao'
                         when next_charge_at > now() then 'ativa'
                         else 'inadimplente'
                       end::public.subscription_status_t,
         canceled_at = null
   where profile_id = v_uid
     and status = 'cancelada'
  returning status into v_status;

  if v_status is null then
    raise exception 'reactivate_subscription: nenhuma assinatura cancelada para reativar'
      using errcode = 'P0002';
  end if;

  return v_status;
end;
$function$;

-- =====================================================================
-- IrisFlow — Lazer e bem-estar separado por plano
--
-- A tabela de preços põe o módulo Lazer e bem-estar (jogos pelo olhar,
-- fotos, leituras e meditação) nos planos Completo e Voz. A licença passa a
-- dizer isso em `features.lazer`, com a mesma régua dos outros recursos:
-- Essencial = 1, Completo = 2, Voz e Beta = 3; `lazer` vale a partir do 2.
--
-- Só muda o objeto `features` de license_for_profile() (o corpo abaixo é o
-- da migração 20260923022616_beta, com a chave nova). desktop_license() e a
-- Edge Function desktop-sync repassam o objeto inteiro, então nada mais
-- precisa mudar no servidor. Versões do desktop que não conhecem a chave a
-- ignoram; o desktop novo trata a chave ausente como liberado (cache de uma
-- licença válida), como já faz com a voz e o assistente.
-- =====================================================================

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
                        'lazer',                  v_rank >= 2,
                        'voz',                    v_rank >= 3)
  );
end;
$$;

revoke all on function public.license_for_profile(uuid) from public, anon, authenticated;
grant execute on function public.license_for_profile(uuid) to service_role;

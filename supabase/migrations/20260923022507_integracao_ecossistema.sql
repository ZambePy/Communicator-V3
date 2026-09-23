-- Nome original: 20260908_integracao_ecossistema.sql (escrita em 08/09/2026); renomeada para a versão 20260923022507, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — integração do ecossistema (site ↔ app desktop ↔ app do cuidador)
--
-- Ordem de aplicação no projeto Supabase "Site Iris Flow":
--   1. supabase/migrations/20260923022346_schema_base.sql
--   2. supabase/migrations/20260923022425_caregiver_app.sql
--   3. este arquivo
--
-- É idempotente: rodar de novo não quebra nem duplica.
--
-- O que ele acrescenta:
--   • Colunas de precisão/relatório em `sessions` (o desktop grava o resultado
--     do teste de precisão; o app do cuidador exibe).
--   • Revogação de computadores em `devices` + índice pela chave.
--   • `desktop_license()`  — a regra ÚNICA de "esta conta pode usar o app?".
--     É o que faz o e-mail/senha do site valer como login do desktop, condicionado
--     ao pagamento. O site chama a mesma função para mostrar a situação na Conta.
--   • `pair_device()` / `revoke_device()` — vínculo de um computador ao
--     beneficiário. O desktop chama `pair_device` logo após o login; a chave que
--     volta é a credencial da Edge Function `desktop-sync` (só o hash fica aqui).
--   • `gateway_events` + `register_charge()` — o que o webhook do gateway de
--     pagamento precisa: idempotência por evento e a máquina de estados da
--     assinatura (paga → ativa, falhou/vencida → inadimplente) num lugar só.
-- =====================================================================

create extension if not exists pgcrypto;


-- ---------------------------------------------------------------------
-- 1. sessions — resultado da calibração e do teste de precisão
--
-- Os nomes seguem docs/MEDICOES.md do desktop: acurácia (calibration_error_*)
-- e precisão (precision_*) são métricas diferentes. `accuracy_report` guarda um
-- RESUMO do relatório (números agregados) — nunca amostras, landmarks ou
-- imagens. É o suficiente para o cuidador e para o prescritor.
-- ---------------------------------------------------------------------
alter table public.sessions
  add column if not exists precision_px    numeric(6,1),
  add column if not exists precision_deg   numeric(4,2),
  add column if not exists hit_rate_100px  numeric(4,3),
  add column if not exists calibration_at  timestamptz,
  add column if not exists accuracy_report jsonb,
  add column if not exists app_version     text;

do $$ begin
  alter table public.sessions
    add constraint sessions_hit_rate_100px_ck
    check (hit_rate_100px is null or (hit_rate_100px >= 0 and hit_rate_100px <= 1));
exception when duplicate_object then null; end $$;

comment on column public.sessions.precision_px is
  'Precisão (jitter RMS) em px, do teste de precisão do desktop. Não confundir com calibration_error_px (acurácia).';
comment on column public.sessions.accuracy_report is
  'Resumo agregado do relatório de precisão (meanErrorDeg, precisionDeg, hitRate, alvoMinimo, distância medida…). Sem dado bruto.';


-- ---------------------------------------------------------------------
-- 2. devices — revogação e busca pela chave
-- ---------------------------------------------------------------------
alter table public.devices
  add column if not exists paired_at  timestamptz not null default now(),
  add column if not exists revoked_at timestamptz,
  add column if not exists hostname   text;

create unique index if not exists devices_key_hash_uk
  on public.devices (device_key_hash);

comment on column public.devices.revoked_at is
  'Preenchido quando o cuidador desvincula o computador (site ou app). A Edge Function recusa a chave a partir daí.';


-- ---------------------------------------------------------------------
-- 3. desktop_license() — pode usar o aplicativo?
--
-- Uma única regra, no banco, lida pelo desktop no login e a cada abertura
-- (com carência offline do lado dele) e pelo site na página da Conta.
--
--   avaliacao     → liberado até trial_ends_at (+3 dias de tolerância)
--   ativa         → liberado; access_until = next_charge_at + 7 dias
--   inadimplente  → liberado por 7 dias após next_charge_at, depois bloqueia
--   cancelada     → liberado até next_charge_at (o site promete isso)
--   encerrada/nenhuma → bloqueado
--
-- O JSON é estável: mudar chave aqui exige mudar
-- `frontend/src/services/license/supabaseLicenseService.ts` no desktop e
-- `src/services/api.ts` no site.
-- ---------------------------------------------------------------------
-- 3.1 A regra em si, por perfil. Chamada por `desktop_license()` (usuário
--     logado) e pela Edge Function `desktop-sync` (service_role, a partir da
--     chave do computador) — os dois caminhos leem a MESMA função.
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

  v_rank := case v_sub.plan_id when 'voz' then 3 when 'completo' then 2 else 1 end;

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

-- 3.2 O que o usuário logado chama (desktop no login; site na /conta).
create or replace function public.desktop_license()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'desktop_license: é preciso estar autenticado' using errcode = '28000';
  end if;
  return public.license_for_profile(auth.uid());
end;
$$;

revoke all on function public.desktop_license() from public, anon;
grant execute on function public.desktop_license() to authenticated;


-- ---------------------------------------------------------------------
-- 4. pair_device() — vincula um computador ao beneficiário
--
-- Devolve a chave EM CLARO uma única vez; o banco guarda só o sha256. O
-- desktop a grava com `safeStorage` (DPAPI no Windows) e passa a mandá-la no
-- header `x-device-key` da Edge Function `desktop-sync`.
--
-- Plano Essencial permite um computador por vez: parear outro revoga os
-- anteriores (a lista volta em `revoked_device_ids`). Completo/Voz não têm
-- limite ("multiplos_dispositivos").
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

  if coalesce(v_plan, 'essencial') not in ('completo', 'voz') then
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


-- 4.1 revoke_device() — desvincular (site: página Conta; app: Ajustes)
create or replace function public.revoke_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    raise exception 'revoke_device: é preciso estar autenticado' using errcode = '28000';
  end if;
  update public.devices d
     set revoked_at = coalesce(d.revoked_at, now())
   where d.id = p_device_id
     and public.is_my_beneficiary(d.beneficiary_id)
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.revoke_device(uuid) from public, anon;
grant execute on function public.revoke_device(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 5. gateway_events — idempotência do webhook de pagamento
--
-- Só o service_role (Edge Function `payment-webhook`) escreve. RLS ligada
-- sem política = ninguém lê pelo cliente.
-- ---------------------------------------------------------------------
create table if not exists public.gateway_events (
  id           uuid primary key default gen_random_uuid(),
  gateway      text not null,
  event_id     text not null,
  event_type   text not null,
  payload      jsonb not null default '{}'::jsonb,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  error        text,
  unique (gateway, event_id)
);
alter table public.gateway_events enable row level security;
comment on table public.gateway_events is
  'Eventos recebidos do gateway de pagamento. A unicidade (gateway, event_id) impede processar duas vezes.';


-- ---------------------------------------------------------------------
-- 6. register_charge() — a máquina de estados da cobrança
--
-- Chamada pela Edge Function `payment-webhook` (service_role). Localiza a
-- assinatura pelo id do gateway ou pelo nosso id, grava/atualiza a cobrança e
-- move o status:
--   paga             → 'ativa', next_charge_at avança um período
--   falhou | vencida → 'inadimplente'
--   estornada        → 'inadimplente'
--   pendente         → não mexe no status
-- ---------------------------------------------------------------------
create or replace function public.register_charge(
  p_gateway                 text,
  p_gateway_charge_id       text,
  p_status                  public.charge_status_t,
  p_amount_brl              numeric,
  p_method                  public.payment_method_t default 'cartao',
  p_gateway_subscription_id text default null,
  p_subscription_id         uuid default null,
  p_due_at                  timestamptz default now(),
  p_paid_at                 timestamptz default null,
  p_pix_copy_paste          text default null,
  p_boleto_barcode          text default null,
  p_boleto_pdf_url          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub      public.subscriptions%rowtype;
  v_interval interval := interval '1 month';
  v_charge   uuid;
  v_new      public.subscription_status_t;
begin
  select * into v_sub
    from public.subscriptions s
   where (p_subscription_id is not null and s.id = p_subscription_id)
      or (p_gateway_subscription_id is not null
          and s.gateway_subscription_id = p_gateway_subscription_id)
   order by s.created_at desc
   limit 1;

  if v_sub.id is null then
    raise exception 'register_charge: assinatura não encontrada (%, %)',
      p_subscription_id, p_gateway_subscription_id using errcode = 'P0002';
  end if;

  if p_gateway_subscription_id is not null and v_sub.gateway_subscription_id is null then
    update public.subscriptions
       set gateway = p_gateway, gateway_subscription_id = p_gateway_subscription_id
     where id = v_sub.id;
  end if;

  insert into public.charges
    (subscription_id, profile_id, amount_brl, method, status, due_at, paid_at,
     gateway_charge_id, pix_copy_paste, boleto_barcode, boleto_pdf_url)
  values
    (v_sub.id, v_sub.profile_id, p_amount_brl, p_method, p_status, p_due_at,
     case when p_status = 'paga' then coalesce(p_paid_at, now()) end,
     p_gateway_charge_id, p_pix_copy_paste, p_boleto_barcode, p_boleto_pdf_url)
  on conflict (gateway_charge_id) do update
    set status  = excluded.status,
        paid_at = coalesce(excluded.paid_at, public.charges.paid_at),
        pix_copy_paste = coalesce(excluded.pix_copy_paste, public.charges.pix_copy_paste),
        boleto_barcode = coalesce(excluded.boleto_barcode, public.charges.boleto_barcode),
        boleto_pdf_url = coalesce(excluded.boleto_pdf_url, public.charges.boleto_pdf_url)
  returning id into v_charge;

  select case billing_interval when 'anual' then interval '1 year' else interval '1 month' end
    into v_interval
    from public.payment_methods
   where profile_id = v_sub.profile_id and is_default
   limit 1;
  v_interval := coalesce(v_interval, interval '1 month');

  if p_status = 'paga' then
    update public.subscriptions
       set status = 'ativa',
           canceled_at = null,
           next_charge_at = greatest(next_charge_at, coalesce(p_paid_at, now())) + v_interval
     where id = v_sub.id
       and status in ('avaliacao', 'ativa', 'inadimplente')
    returning status into v_new;
  elsif p_status in ('falhou', 'vencida', 'estornada') then
    update public.subscriptions
       set status = 'inadimplente'
     where id = v_sub.id
       and status in ('avaliacao', 'ativa', 'inadimplente')
    returning status into v_new;
  end if;

  return jsonb_build_object(
    'charge_id',       v_charge,
    'subscription_id', v_sub.id,
    'status',          coalesce(v_new, v_sub.status)
  );
end;
$$;

-- No Supabase os privilégios padrão do schema public dão EXECUTE a anon e
-- authenticated em toda função nova; "revoke from public" sozinho não tira
-- isso. Esta função só pode rodar com a service_role (webhook).
revoke all on function public.register_charge(
  text, text, public.charge_status_t, numeric, public.payment_method_t,
  text, uuid, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;
grant execute on function public.register_charge(
  text, text, public.charge_status_t, numeric, public.payment_method_t,
  text, uuid, timestamptz, timestamptz, text, text, text) to service_role;


-- ---------------------------------------------------------------------
-- 7. Políticas complementares e realtime
--
-- O dono da conta (auth.uid() = beneficiaries.profile_id) já lê `devices`,
-- `sessions`, `messages` etc. pelas políticas do app do cuidador. Aqui só
-- garantimos que `is_my_beneficiary` seja executável por quem precisa.
-- ---------------------------------------------------------------------
grant execute on function public.is_my_beneficiary(uuid) to authenticated;

-- O desktop assina `quick_phrases` para trocar as frases rápidas na hora em
-- que o cuidador edita; a migração do app do cuidador não a publicava.
do $$ begin
  alter publication supabase_realtime add table public.quick_phrases;
exception when duplicate_object then null; end $$;

-- As funções do site (20260923022346_schema_base.sql) só faziam "revoke from public", o que no
-- Supabase deixa `anon` com EXECUTE pelos privilégios padrão. Todas checam
-- auth.uid(), então o risco era só ruído — mas não há razão para anon
-- enxergá-las.
revoke all on function public.complete_registration(
  text, text, text, public.relation_t, public.condition_t, public.os_t,
  text, text, boolean, text) from anon;
revoke all on function public.attach_payment_method(
  public.payment_method_t, public.billing_interval_t, text, text, text, text) from anon;
revoke all on function public.request_cancellation() from anon;
revoke all on function public.reactivate_subscription() from anon;

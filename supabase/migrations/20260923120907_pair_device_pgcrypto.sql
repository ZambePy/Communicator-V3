-- Nome original: 20260923_pair_device_pgcrypto.sql (escrita em 23/09/2026); renomeada para a versão 20260923120907, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — pair_device() encontra o pgcrypto no Supabase
--
-- `pair_device` gera a chave do computador com gen_random_bytes() e grava o
-- hash com digest(), as duas do pgcrypto. No Supabase o pgcrypto mora no
-- schema `extensions`; a função fixava `search_path = public, pg_temp` e, por
-- isso, NÃO achava as funções: o pareamento do desktop falhava com
-- "function gen_random_bytes(integer) does not exist". O teste local não pegava
-- porque lá o pgcrypto fica em `public`.
--
-- Achado no teste de ponta a ponta de 23/09/2026 (SQL como o usuário, no
-- projeto real). Correção: `extensions` no search_path — o mesmo que
-- escalar_pedidos_de_ajuda() já faz, e que funciona nos dois ambientes (no
-- Postgres puro o nome resolve em `public`). O schema `extensions` não é
-- gravável por usuários, então não abre brecha na função security definer.
--
-- Corpo idêntico ao de 20260923022616_beta.sql, exceto o search_path. Idempotente.
-- =====================================================================

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
set search_path = public, extensions, pg_temp
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

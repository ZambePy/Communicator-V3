-- =====================================================================
-- IrisFlow — pair_device(): o mesmo computador substitui o próprio vínculo
--
-- APLICADA EM PRODUÇÃO em 24/09/2026, registrada no projeto como a versão
-- 20260924022100 (o nome do arquivo acompanha o histórico remoto, para o
-- `supabase db push` reconhecê-la). Idempotente.
--
-- O desktop manda o id local da máquina (gerado uma vez por instalação) em
-- `p_hostname`, justamente para o servidor reconhecer "este mesmo computador"
-- num novo login. Só que pair_device() nunca olhava para esse campo: nos
-- planos sem limite de computadores (completo, voz, beta) cada login no MESMO
-- PC criava mais uma linha ativa em `devices`, e a chave anterior continuava
-- válida para sempre — chaves órfãs acumuladas, cada uma capaz de gravar em
-- nome do paciente pela desktop-sync, e a contagem de "computadores ativos"
-- crescendo a cada login.
--
-- Agora, antes de gravar o vínculo novo, os vínculos ativos do mesmo paciente
-- com o mesmo id local são revogados (a chave antiga para de funcionar na
-- hora). Computadores diferentes continuam convivendo nos planos sem limite;
-- no Essencial nada muda (lá todos os outros já eram revogados). Os ids
-- revogados por este motivo também entram em `revoked_device_ids` — o nome
-- diz o que o campo é, e nenhum cliente o usa para mostrar "outro computador
-- desconectado".
--
-- Corpo idêntico ao de 20260923120907_pair_device_pgcrypto.sql, mais o bloco
-- "mesmo computador". Idempotente.
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
  v_uid       uuid := auth.uid();
  v_key       text;
  v_id        uuid;
  v_plan      text;
  v_revoked   uuid[] := '{}';
  v_mesmo_pc  uuid[] := '{}';
  v_host      text := nullif(btrim(p_hostname), '');
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

  -- Mesmo computador (mesmo id local): o vínculo anterior é substituído, não
  -- acumulado. Sem id local (desktops antigos), nada a comparar.
  if v_host is not null then
    with r as (
      update public.devices
         set revoked_at = now()
       where beneficiary_id = p_beneficiary_id
         and revoked_at is null
         and hostname = v_host
      returning id
    )
    select coalesce(array_agg(id), '{}') into v_mesmo_pc from r;
    v_revoked := v_revoked || v_mesmo_pc;
  end if;

  v_key := encode(gen_random_bytes(32), 'hex');

  insert into public.devices
    (beneficiary_id, name, os, app_version, device_key_hash, hostname, paired_at, last_seen_at)
  values
    (p_beneficiary_id, coalesce(nullif(btrim(p_name), ''), 'Computador'), p_os,
     coalesce(p_app_version, ''), encode(digest(v_key, 'sha256'), 'hex'),
     v_host, now(), now())
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

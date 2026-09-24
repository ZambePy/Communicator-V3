#!/usr/bin/env bash
# Aplica TODAS as migrações de supabase/migrations/ (em ordem, a base
# 20260923022346_schema_base.sql primeiro) num PostgreSQL local limpo, aplica
# tudo de novo (idempotência), roda o cenário de scripts/db-local-test.sql e,
# por fim, o supabase/seed.sql (duas vezes, conferindo a conta de teste).
# Serve para pegar erro de SQL ANTES de aplicar no projeto do Supabase.
#
# Uso:  PGURL='postgresql://postgres@localhost:5432/postgres' scripts/db-local-test.sh
#
# Precisa de um PostgreSQL 15+ acessível com um superusuário (Docker serve:
#   docker run --rm -d -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust --name pg postgres:16
# ) e do cliente `psql`. O script apaga e recria o banco `irisflow_beta_test`.
#
# O que o shim imita do Supabase:
#   - schema `auth`: `users` com as colunas que o GoTrue e o seed usam,
#     `identities` e `auth.uid()` (lido de `request.jwt.claim.sub`);
#   - papéis anon/authenticated/service_role e os privilégios padrão;
#   - publicação supabase_realtime;
#   - pgcrypto no schema `extensions` (como no Supabase — ver
#     20260923120907_pair_device_pgcrypto.sql);
#   - pg_cron e pg_net de mentira: `cron.schedule/unschedule` só registram o
#     agendamento em `cron.job`, e `net.http_post` só registra a chamada em
#     `net.chamadas`. As extensões em si não existem fora do Supabase, então
#     as linhas `create extension ... pg_cron/pg_net` saem na hora de aplicar.
#
# A ordem é a do nome (a versão no começo do arquivo), a mesma em que o
# `supabase db push` aplica — inclusive uma migração que ainda não tenha ido
# para produção (ver README → Supabase).
set -euo pipefail
cd "$(dirname "$0")/.."

PGURL="${PGURL:-postgresql://postgres@localhost:5432/postgres}"
DB="irisflow_beta_test"
ADMIN="${PGURL%/*}/postgres"

psql -q -v ON_ERROR_STOP=1 "$ADMIN" -c "drop database if exists $DB" -c "create database $DB"
URL="${PGURL%/*}/$DB"

# Como no Supabase: pgcrypto no schema `extensions`, e `extensions` no
# search_path padrão da sessão (mas NÃO no das funções security definer, que
# fixam o próprio). Com o pgcrypto em `public` este teste deixava passar o
# pair_device() que no projeto real falhava.
psql -q -v ON_ERROR_STOP=1 "$ADMIN" -c "alter database $DB set search_path = \"\$user\", public, extensions"
psql -q -v ON_ERROR_STOP=1 "$URL" <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;
-- Colunas que o GoTrue lê como texto (os *_token) têm default '' e não NULL,
-- como no Supabase; o seed as preenche do mesmo jeito.
create table auth.users (
  instance_id uuid,
  id uuid primary key default gen_random_uuid(),
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  confirmation_token text default '',
  recovery_token text default '',
  email_change_token_new text default '',
  email_change text default '',
  email_change_token_current text default '',
  phone_change text default '',
  phone_change_token text default '',
  reauthentication_token text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table auth.identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_id text not null,
  provider text not null,
  identity_data jsonb not null,
  last_sign_in_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (provider_id, provider)
);
-- auth.uid() lê a sessão simulada: `set request.jwt.claim.sub = '<uuid>'`.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin; exception when duplicate_object then null; end $$;
grant usage on schema public to anon, authenticated, service_role;
create publication supabase_realtime;
-- Privilégios padrão do Supabase: toda tabela nova em public é legível pelos
-- papéis (a RLS é quem filtra).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
-- pg_cron de mentira: só registra o que seria agendado.
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create function cron.schedule(jobname text, schedule text, command text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (jobname, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;
create function cron.unschedule(jobname text) returns boolean language sql as $$
  delete from cron.job where job.jobname = unschedule.jobname returning true
$$;
-- pg_net de mentira: mesma assinatura de net.http_post, nenhuma rede. Cada
-- chamada fica em net.chamadas para o cenário conferir o que teria saído.
create schema net;
create table net.chamadas (
  id bigserial primary key,
  url text not null,
  headers jsonb,
  body jsonb,
  feita_em timestamptz not null default now()
);
create function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint language sql as $$
  insert into net.chamadas (url, headers, body) values (url, headers, body) returning id
$$;
SQL

aplicar() {
  echo "== $1"
  # As extensões pg_cron e pg_net não existem fora do Supabase; o shim acima
  # cobre as funções que as migrações chamam.
  sed -e '/create extension if not exists pg_cron/d' \
      -e '/create extension if not exists pg_net/d' "$1" \
    | psql -q -v ON_ERROR_STOP=1 "$URL"
}

# Todas, na ordem do nome (LC_ALL=C, byte a byte: a versão numérica do
# começo do nome decide).
mapfile -t MIGRACOES < <(printf '%s\n' supabase/migrations/*.sql | LC_ALL=C sort)
if [ "${#MIGRACOES[@]}" -eq 0 ]; then
  echo "nenhuma migração em supabase/migrations/" >&2
  exit 1
fi

for f in "${MIGRACOES[@]}"; do
  aplicar "$f"
done

echo "== idempotência: aplicando todas as migrações de novo"
for f in "${MIGRACOES[@]}"; do
  aplicar "$f"
done

echo "== cenário (beta, 22/09 e 23/09)"
psql -v ON_ERROR_STOP=1 "$URL" -f scripts/db-local-test.sql

echo "== seed (duas vezes: tem de ser idempotente)"
psql -q -v ON_ERROR_STOP=1 "$URL" -f supabase/seed.sql
psql -q -v ON_ERROR_STOP=1 "$URL" -f supabase/seed.sql
psql -v ON_ERROR_STOP=1 "$URL" <<'SQL'
do $$
declare v_uid uuid; v_ben uuid; l jsonb; n int; ps record;
begin
  select count(*), min(id::text)::uuid into n, v_uid from auth.users where email = 'admin@irisflow.com';
  if n <> 1 then raise exception 'seed: esperava 1 usuário admin@irisflow.com, há %', n; end if;
  if (select count(*) from auth.identities where user_id = v_uid and provider = 'email') <> 1 then
    raise exception 'seed: identidade de e-mail ausente ou duplicada';
  end if;
  if (select encrypted_password from auth.users where id = v_uid) <> extensions.crypt('irisflow2026', (select encrypted_password from auth.users where id = v_uid)) then
    raise exception 'seed: a senha gravada não confere com irisflow2026';
  end if;
  if (select buyer_name from public.profiles where id = v_uid) <> 'Equipe IrisFlow' then
    raise exception 'seed: perfil sem o nome esperado';
  end if;
  select count(*), min(id::text)::uuid into n, v_ben from public.beneficiaries where profile_id = v_uid;
  if n <> 1 then raise exception 'seed: esperava 1 paciente, há %', n; end if;
  if (select count(*) from public.subscriptions where profile_id = v_uid and plan_id = 'beta' and status = 'ativa') <> 1 then
    raise exception 'seed: assinatura beta ausente ou duplicada';
  end if;
  if (select count(*) from public.beta_registrations where profile_id = v_uid) <> 1 then
    raise exception 'seed: inscrição na beta ausente';
  end if;
  select * into ps from public.patient_settings where beneficiary_id = v_ben;
  if ps.beneficiary_id is null or ps.dwell_ms is not null or ps.filter_preset is not null or ps.emergency_timeout_s <> 45 then
    raise exception 'seed: patient_settings deveria nascer só com o prazo padrão (45 s) e o resto nulo';
  end if;
  -- Nada fabricado: a conta nasce sem sessões, conversas nem alertas.
  if exists (select 1 from public.sessions where beneficiary_id = v_ben)
     or exists (select 1 from public.messages where beneficiary_id = v_ben)
     or exists (select 1 from public.help_requests where beneficiary_id = v_ben) then
    raise exception 'seed: a conta de teste não deveria ter dados de exemplo';
  end if;
  perform set_config('request.jwt.claim.sub', v_uid::text, true);
  l := public.desktop_license();
  if not (l->>'allowed')::boolean or l->>'reason' <> 'beta' then
    raise exception 'seed: licença da conta de teste deveria ser beta liberada: %', l;
  end if;
end $$;
select 'seed: conta de teste conferida' as resultado;

-- Conta de teste protegida (migração 20260924022108_conta_de_teste_protegida): trocar a
-- senha ou o e-mail é recusado; o resto da linha (o que o Auth grava a cada
-- login) passa; com a liberação explícita da equipe, a troca passa.
do $$
declare v_uid uuid; v_senha text;
begin
  select id, encrypted_password into v_uid, v_senha from auth.users where email = 'admin@irisflow.com';
  begin
    update auth.users set encrypted_password = extensions.crypt('outra', extensions.gen_salt('bf')) where id = v_uid;
    raise exception 'trocar a senha da conta de teste deveria ter sido recusado';
  exception when insufficient_privilege then null;
  end;
  begin
    update auth.users set email = 'outro@exemplo.com' where id = v_uid;
    raise exception 'trocar o e-mail da conta de teste deveria ter sido recusado';
  exception when insufficient_privilege then null;
  end;
  update auth.users set updated_at = now(), recovery_token = 'x' where id = v_uid;   -- login/recuperação continuam
  if (select encrypted_password from auth.users where id = v_uid) <> v_senha then
    raise exception 'a senha mudou sem liberação';
  end if;
  perform set_config('irisflow.liberar_conta_de_teste', 'on', true);
  update auth.users set encrypted_password = 'troca-liberada' where id = v_uid;        -- liberado: passa
  if (select encrypted_password from auth.users where id = v_uid) <> 'troca-liberada' then
    raise exception 'com a liberação explícita a troca deveria ter passado';
  end if;
  update auth.users set encrypted_password = v_senha where id = v_uid;                 -- devolve a original
  perform set_config('irisflow.liberar_conta_de_teste', '', true);
  -- outras contas não são afetadas
  update auth.users set encrypted_password = 'qualquer' where email <> 'admin@irisflow.com';
end $$;
select 'conta de teste protegida: conferida' as resultado;
SQL
echo "OK"

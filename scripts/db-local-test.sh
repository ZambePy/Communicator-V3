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
# ) e do cliente `psql`. O script apaga e recria o banco `irisflow_beta_test`
# (ou o de BANCO_DE_TESTE, para duas execuções no mesmo servidor não apagarem
# o banco uma da outra).
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
DB="${BANCO_DE_TESTE:-irisflow_beta_test}"
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
  confirmation_sent_at timestamptz,
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
-- Como no Supabase: os papéis enxergam o schema auth (para auth.uid() nas
-- políticas e nas consultas do próprio usuário), mas não as tabelas dele.
grant usage on schema auth to anon, authenticated, service_role;
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

echo "== cenário (beta, 22/09, 23/09 e código de confirmação, 26/09)"
psql -v ON_ERROR_STOP=1 "$URL" -f scripts/db-local-test.sql

echo "== rodada 3: search_path fixo também nas security definer que vierem (21/10/2026)"
# A migração 20261021120000 conserta TODA security definer do public sem
# pg_temp no fim do search_path, e mantém os outros esquemas da lista
# (pair_device e confirmar_codigo precisam de `extensions`). Três funções de
# mentira, uma de cada jeito, e um procedimento (ALTER FUNCTION recusaria e
# derrubaria a migração inteira); a migração aplicada de novo por cima deles.
psql -q -v ON_ERROR_STOP=1 "$URL" <<'SQL'
create function public.teste_sem_caminho() returns int language sql security definer as 'select 1';
create function public.teste_com_extensions() returns int language sql security definer
  set search_path = public, extensions as 'select 1';
create function public.teste_pg_temp_primeiro() returns int language sql security definer
  set search_path = pg_temp, public as 'select 1';
create procedure public.teste_procedimento(p_n int) language sql security definer as 'select 1';
SQL
aplicar supabase/migrations/20261021120000_endurecimento_rodada3.sql
psql -q -v ON_ERROR_STOP=1 "$URL" <<'SQL'
do $$
declare v text;
begin
  select string_agg(format('%s: %s', p.proname, array_to_string(p.proconfig, '; ')), ' | ' order by p.proname)
    into v
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname like 'teste\_%';
  if v is distinct from 'teste_com_extensions: search_path=public, extensions, pg_temp'
                        || ' | teste_pg_temp_primeiro: search_path=public, pg_temp'
                        || ' | teste_procedimento: search_path=public, pg_temp'
                        || ' | teste_sem_caminho: search_path=public, pg_temp' then
    raise exception 'search_path consertado errado: %', v;
  end if;
end $$;
drop function public.teste_sem_caminho();
drop function public.teste_com_extensions();
drop function public.teste_pg_temp_primeiro();
drop procedure public.teste_procedimento(int);
SQL

echo "== rodada 3: dois avisos ao mesmo tempo no limite — só um passa (21/10/2026)"
# Precisa de duas sessões. A sessão A grava o aviso que enche o limite e
# segura a transação aberta (pg_sleep) antes do commit; a B só começa quando
# A já gravou. Com o pg_advisory_xact_lock por computador, B espera A terminar
# e encontra o limite cheio; sem ele, B não enxerga a linha ainda não
# confirmada de A, conta uma a menos e passa também.
psql -q -v ON_ERROR_STOP=1 "$URL" <<'SQL'
insert into auth.users (id, email, email_confirmed_at)
values ('a6a6a6a6-0000-4000-8000-000000000001', 'familia-corrida@exemplo.com', now());
insert into public.beneficiaries (id, profile_id, user_name, relation, condition, os)
values ('a6a6a6a6-0000-4000-8000-0000000000b1', 'a6a6a6a6-0000-4000-8000-000000000001', 'Ana Corrida', 'filho', 'ela', 'windows');
insert into public.devices (id, beneficiary_id, name, device_key_hash) values
  ('a6a6a6a6-0000-4000-8000-0000000000d1', 'a6a6a6a6-0000-4000-8000-0000000000b1', 'PC da ajuda', repeat('c1', 32)),
  ('a6a6a6a6-0000-4000-8000-0000000000d2', 'a6a6a6a6-0000-4000-8000-0000000000b1', 'PC do aviso', repeat('c2', 32));
-- Cinco ajudas nos últimos 10 minutos: falta uma para o limite (6).
do $$
begin
  for i in 1..5 loop
    perform public.registrar_aviso_com_limite('a6a6a6a6-0000-4000-8000-0000000000d1', 'ajuda', 'antes ' || i, null, now());
  end loop;
end $$;
SQL

corrida() {
  local computador="$1" tipo="$2" texto="$3"
  local saida_a saida_b pid_a passaram n=0
  saida_a="$(mktemp)"
  saida_b="$(mktemp)"
  PGAPPNAME=corrida_a psql -X -q -At -v ON_ERROR_STOP=1 "$URL" >"$saida_a" <<SQL &
begin;
select public.registrar_aviso_com_limite('$computador', '$tipo', '$texto', null, now());
select pg_sleep(2);
commit;
SQL
  pid_a=$!
  # B só sai quando A já gravou e está segurando a transação.
  until [ "$(psql -X -At "$URL" -c "select count(*) from pg_stat_activity where application_name = 'corrida_a' and wait_event = 'PgSleep'")" = 1 ]; do
    n=$((n + 1))
    if [ "$n" -gt 100 ]; then
      echo "corrida ($tipo): a sessão A não chegou a gravar o aviso" >&2
      exit 1
    fi
    sleep 0.1
  done
  PGAPPNAME=corrida_b psql -X -q -At -v ON_ERROR_STOP=1 "$URL" >"$saida_b" \
    -c "select public.registrar_aviso_com_limite('$computador', '$tipo', '$texto', null, now())"
  wait "$pid_a"
  passaram="$(cat "$saida_a" "$saida_b" | grep -c '"ok": true' || true)"
  rm -f "$saida_a" "$saida_b"
  if [ "$passaram" != 1 ]; then
    echo "corrida ($tipo): duas chamadas ao mesmo tempo no limite — esperava 1 aceita, passaram $passaram" >&2
    exit 1
  fi
}
# Ajuda: a sexta, pedida duas vezes ao mesmo tempo.
corrida a6a6a6a6-0000-4000-8000-0000000000d1 ajuda 'a sexta, duas vezes'
# Aviso de dispositivo: o mesmo texto duas vezes ao mesmo tempo.
corrida a6a6a6a6-0000-4000-8000-0000000000d2 dispositivo 'A câmera parou'
psql -q -v ON_ERROR_STOP=1 "$URL" <<'SQL'
do $$
declare n_ajuda int; n_aviso int;
begin
  select count(*) into n_ajuda from public.help_requests
   where device_id = 'a6a6a6a6-0000-4000-8000-0000000000d1' and kind = 'ajuda';
  select count(*) into n_aviso from public.help_requests
   where device_id = 'a6a6a6a6-0000-4000-8000-0000000000d2' and kind = 'dispositivo';
  if n_ajuda <> 6 or n_aviso <> 1 then
    raise exception 'corrida: o banco deveria ter 6 ajudas e 1 aviso de dispositivo, tem % e %', n_ajuda, n_aviso;
  end if;
end $$;
SQL
echo "corrida: das duas chamadas ao mesmo tempo, só uma passou (ajuda e dispositivo)"

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

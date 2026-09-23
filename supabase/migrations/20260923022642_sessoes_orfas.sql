-- Nome original: 20260922_sessoes_orfas.sql (escrita em 22/09/2026); renomeada para a versão 20260923022642, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — sessões órfãs (`sessions.last_heartbeat_at` + pg_cron)
--
-- Ordem de aplicação no projeto Supabase "Site Iris Flow":
--   1. migrations/20260923022346_schema_base.sql
--   2. migrations/20260923022425_caregiver_app.sql
--   3. migrations/20260923022507_integracao_ecossistema.sql
--   4. migrations/20260923022524_escalonamento_de_emergencia.sql   (pg_cron)
--   5. migrations/20260923022616_beta.sql
--   6. migrations/20260923022634_support_reports.sql
--   7. este arquivo
--
-- É idempotente: rodar de novo não quebra nem duplica.
--
-- O problema: `sessions.status` só vira 'ended' quando o desktop manda
-- `session.end`. Se o computador desliga, a rede cai de vez ou o app é
-- morto, a sessão fica 'active' para sempre — e o app do cuidador mostra
-- "em sessão" para um paciente que já foi dormir.
--
-- A solução, em duas partes:
--   1. `sessions.last_heartbeat_at`: a Edge Function `desktop-sync` já
--      recebe um heartbeat a cada 30 s de cada computador; a partir desta
--      migração ela carimba as sessões abertas daquele computador (patch
--      no case 'heartbeat'). Um gatilho também carimba em qualquer UPDATE
--      vindo do desktop (upsert, calibração), então a coluna fica correta
--      mesmo antes de a função nova ser publicada.
--   2. Um job do pg_cron, a cada minuto (mesmo padrão da migração
--      20260923022524_escalonamento_de_emergencia), encerra as sessões sem heartbeat há mais de 5 minutos:
--      status = 'ended', ended_at = último heartbeat (não "agora": a
--      sessão acabou quando o app parou de dar sinal, não quando o
--      servidor percebeu).
--
-- Efeito colateral desejado: `sessions` está na publicação realtime com
-- replica identity full, então o app do cuidador vê a sessão encerrar na
-- hora, sem polling.
-- =====================================================================

create extension if not exists pg_cron;


-- ---------------------------------------------------------------------
-- 1. Coluna
-- ---------------------------------------------------------------------
alter table public.sessions
  add column if not exists last_heartbeat_at timestamptz;

comment on column public.sessions.last_heartbeat_at is
  'Último sinal de vida do computador para esta sessão (heartbeat de 30 s da Edge Function desktop-sync, ou qualquer update vindo do desktop). Sessões sem sinal há > 5 min são encerradas por pg_cron (encerrar_sessoes_orfas).';

-- Linhas antigas: o melhor palpite do último sinal é updated_at (o gatilho
-- sessions_touch o mantém) ou, na falta, started_at. Sessões já encerradas
-- ganham o valor também, sem efeito — o job só olha as abertas.
update public.sessions
   set last_heartbeat_at = coalesce(updated_at, started_at)
 where last_heartbeat_at is null;

alter table public.sessions
  alter column last_heartbeat_at set default now();

-- Só as sessões abertas interessam ao job; índice parcial, pequeno.
create index if not exists sessions_open_heartbeat_idx
  on public.sessions (last_heartbeat_at)
  where status <> 'ended';


-- ---------------------------------------------------------------------
-- 2. Gatilho: qualquer UPDATE numa sessão aberta é sinal de vida
--
-- Quem atualiza `sessions` é só a Edge Function (service_role): o app do
-- cuidador tem apenas SELECT pela RLS. Então um UPDATE que não seja o
-- próprio encerramento significa "o desktop falou agora".
--   • new.status <> 'ended'  → carimba last_heartbeat_at = now()
--   • sessão reaberta (old 'ended' → new aberta; acontece quando a rede
--     volta e o desktop reenvia o upsert da sessão que o job encerrou)
--     → limpa ended_at, senão a sessão fica "ativa e encerrada" ao mesmo tempo.
-- ---------------------------------------------------------------------
create or replace function public.sessions_heartbeat_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status <> 'ended' then
    new.last_heartbeat_at := now();
    if old.status = 'ended' then
      new.ended_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sessions_heartbeat_touch() from public, anon, authenticated;

drop trigger if exists sessions_heartbeat_touch on public.sessions;
create trigger sessions_heartbeat_touch
  before update on public.sessions
  for each row execute function public.sessions_heartbeat_touch();


-- ---------------------------------------------------------------------
-- 3. Job: encerra sessões sem heartbeat há mais de 5 minutos
--
-- Devolve quantas encerrou (aparece em cron.job_run_details). O
-- `for update skip locked` evita disputa com um upsert do desktop que
-- chegue no mesmo instante.
-- ---------------------------------------------------------------------
create or replace function public.encerrar_sessoes_orfas(p_limite interval default interval '5 minutes')
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer := 0;
begin
  with orfas as (
    select id, coalesce(last_heartbeat_at, updated_at, started_at) as ultimo_sinal
      from public.sessions
     where status <> 'ended'
       and coalesce(last_heartbeat_at, updated_at, started_at) < now() - p_limite
       for update skip locked
  ),
  encerradas as (
    update public.sessions s
       set status   = 'ended',
           ended_at = o.ultimo_sinal
      from orfas o
     where s.id = o.id
    returning s.id
  )
  select count(*) into n from encerradas;

  return n;
end;
$$;

revoke all on function public.encerrar_sessoes_orfas(interval) from public, anon, authenticated;

comment on function public.encerrar_sessoes_orfas(interval) is
  'Encerra sessões abertas sem heartbeat há mais que p_limite (padrão 5 min): status = ended, ended_at = último sinal. Rodada a cada minuto pelo pg_cron (job encerrar-sessoes-orfas).';

do $$
begin
  perform cron.unschedule('encerrar-sessoes-orfas');
exception when others then null;
end $$;

select cron.schedule('encerrar-sessoes-orfas', '* * * * *', $$select public.encerrar_sessoes_orfas()$$);


-- ---------------------------------------------------------------------
-- 4. Conferência rápida (opcional, rode à mão no SQL Editor)
--   select jobname, schedule, active from cron.job;
--   select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'encerrar-sessoes-orfas') order by start_time desc limit 5;
--   select id, status, started_at, last_heartbeat_at, ended_at from public.sessions order by started_at desc limit 10;
-- ---------------------------------------------------------------------

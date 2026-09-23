-- Nome original: 20260922_support_reports.sql (escrita em 22/09/2026); renomeada para a versão 20260923022634, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — relatórios de suporte do desktop (`support_reports`)
--
-- Ordem de aplicação no projeto Supabase "Site Iris Flow":
--   1. migrations/20260923022346_schema_base.sql
--   2. migrations/20260923022425_caregiver_app.sql
--   3. migrations/20260923022507_integracao_ecossistema.sql
--   4. migrations/20260923022524_escalonamento_de_emergencia.sql
--   5. migrations/20260923022616_beta.sql
--   6. este arquivo
--
-- É idempotente: rodar de novo não quebra nem duplica.
--
-- Por que existe: a Edge Function `desktop-sync` (ação `report.send`) já
-- insere em `public.support_reports` — e a tabela não existia em SQL nenhum.
-- Sem ela, todo envio de relatório (opt-in em Ajustes do desktop, ou
-- automático após uma falha) devolvia 400 "relation does not exist" e o
-- desktop entendia como erro definitivo.
--
-- As colunas seguem EXATAMENTE o que a função escreve
-- (functions/desktop-sync/index.ts, case 'report.send'):
--   beneficiary_id, device_id, app_version, motivo, resumo, relatorio
-- e o que ela lê para o limite anti-inundação: device_id + created_at.
--
-- Privacidade: `relatorio` é o JSON montado por `montarRelatorio()` no
-- desktop — só números, versões e erros truncados. Nunca frase do
-- paciente, imagem ou vetor de calibração; o teste dedicado do desktop
-- prova isso. Ainda assim a tabela é tratada como dado do beneficiário:
-- RLS ligada, leitura só pelo dono da conta, escrita só pela service_role.
-- =====================================================================

create extension if not exists pgcrypto;

do $$ begin
  create type public.support_report_reason_t as enum ('erro', 'manual');
exception when duplicate_object then null; end $$;

create table if not exists public.support_reports (
  id             uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references public.beneficiaries (id) on delete cascade,
  device_id      uuid references public.devices (id) on delete set null,
  app_version    text,
  -- 'erro'  = envio automático depois de uma falha no desktop
  -- 'manual' = botão "Enviar relatório" em Ajustes
  motivo         public.support_report_reason_t not null default 'erro',
  -- Uma linha de contexto (até 200 caracteres; a função já trunca).
  resumo         text not null default '' check (length(resumo) <= 200),
  -- O relatório em si. A função recusa acima de 64 000 caracteres; o CHECK
  -- é a rede de proteção para quem inserir por outro caminho.
  relatorio      jsonb not null check (length(relatorio::text) <= 200000),
  -- Preenchido pela equipe quando o relatório foi visto (painel do Supabase).
  handled_at     timestamptz,
  created_at     timestamptz not null default now()
);

comment on table public.support_reports is
  'Relatórios de suporte enviados pelo desktop (opt-in). Só números e erros — nunca conteúdo do paciente. Escrita apenas pela Edge Function desktop-sync (service_role).';
comment on column public.support_reports.motivo is
  'erro = automático após falha; manual = botão em Ajustes.';

-- Quem lê no painel do app do cuidador / site: por beneficiário, mais recente primeiro.
create index if not exists support_reports_beneficiary_created_idx
  on public.support_reports (beneficiary_id, created_at desc);

-- O limite de 20 relatórios/hora por computador consulta por device_id + created_at.
create index if not exists support_reports_device_created_idx
  on public.support_reports (device_id, created_at desc);

-- Fila da equipe de suporte: o que ainda não foi visto.
create index if not exists support_reports_pending_idx
  on public.support_reports (created_at desc) where handled_at is null;


-- ---------------------------------------------------------------------
-- RLS
--
-- • dono da conta (auth.uid() = beneficiaries.profile_id) lê os próprios;
-- • ninguém insere/atualiza/apaga pelo cliente — só a service_role da
--   Edge Function, que ignora a RLS. Sem política de insert para
--   anon/authenticated, a chave anônima não consegue gravar nada aqui.
-- ---------------------------------------------------------------------
alter table public.support_reports enable row level security;

drop policy if exists support_reports_select_own on public.support_reports;
create policy support_reports_select_own on public.support_reports
  for select to authenticated
  using (public.is_my_beneficiary(beneficiary_id));

-- No Supabase os privilégios padrão do schema public já concedem isto;
-- explícito para o esquema funcionar igual num PostgreSQL sem esses padrões.
grant select on public.support_reports to authenticated;
grant all on public.support_reports to service_role;
revoke insert, update, delete on public.support_reports from authenticated;
-- A chave anônima não tem nada a fazer aqui: nem ler.
revoke all on public.support_reports from anon;

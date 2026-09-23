-- Nome original: 20260923_endurecimento.sql (escrita em 23/09/2026); renomeada para a versão 20260923023354, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — endurecimento apontado pelo Security Advisor do Supabase
--
--   • search_path fixo nas funções de gatilho genéricas (lint 0011);
--   • funções de GATILHO não são RPC: ninguém precisa chamá-las pela API
--     (o gatilho dispara sem checar EXECUTE de quem fez o INSERT/UPDATE);
--   • is_my_beneficiary() só faz sentido para quem está logado: a chave
--     anônima não lê nenhuma tabela que dependa dela.
--
-- As RPCs security definer chamadas pelo site/desktop/app (complete_*,
-- pair_device, desktop_license…) continuam executáveis por `authenticated`
-- de propósito: todas checam auth.uid() e só agem sobre a própria conta.
-- `gateway_events` segue com RLS sem política: só a service_role escreve.
--
-- Idempotente.
-- =====================================================================

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.bump_session_help_count() from public, anon, authenticated;

revoke all on function public.is_my_beneficiary(uuid) from public, anon;
grant execute on function public.is_my_beneficiary(uuid) to authenticated;

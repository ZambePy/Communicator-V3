-- Nome original: 20260923_desempenho.sql (escrita em 23/09/2026); renomeada para a versão 20260923023639, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — ajustes apontados pelo Performance Advisor do Supabase
--
--   • push_tokens: auth.uid() dentro de (select …) para o Postgres avaliar
--     uma vez por consulta, e não uma vez por linha (lint 0003);
--   • índices nas chaves estrangeiras que têm caminho de consulta real:
--       - push_tokens.profile_id   → o escalonamento de emergência busca os
--                                    tokens do cuidador por profile_id;
--       - quick_phrases.beneficiary_id → o app lista as frases do paciente;
--       - sessions.device_id, help_requests.session_id,
--         help_requests.acknowledged_by, charges.subscription_id
--                                  → exclusões em cascata / SET NULL (sem o
--                                    índice, cada exclusão varre a tabela).
--     subscriptions.plan_id fica sem índice de propósito: `plans` tem
--     meia dúzia de linhas e nenhuma é apagada.
--
-- Idempotente.
-- =====================================================================

drop policy if exists "dono gerencia push_tokens" on public.push_tokens;
create policy "dono gerencia push_tokens" on public.push_tokens for all
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));

create index if not exists push_tokens_profile_idx        on public.push_tokens (profile_id);
create index if not exists quick_phrases_beneficiary_idx  on public.quick_phrases (beneficiary_id);
create index if not exists sessions_device_idx            on public.sessions (device_id);
create index if not exists help_requests_session_idx      on public.help_requests (session_id);
create index if not exists help_requests_ack_by_idx       on public.help_requests (acknowledged_by);
create index if not exists charges_subscription_idx       on public.charges (subscription_id);

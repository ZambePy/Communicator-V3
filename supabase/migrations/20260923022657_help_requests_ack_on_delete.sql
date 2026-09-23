-- Nome original: 20260923_help_requests_ack_on_delete.sql (escrita em 23/09/2026); renomeada para a versão 20260923022657, a registrada no histórico de migrações do projeto em produção.
-- help_requests.acknowledged_by: ON DELETE SET NULL.
--
-- A FK foi criada em 20260923022425_caregiver_app.sql sem ação de exclusão (NO
-- ACTION). Consequência: `delete from auth.users` — que cascateia para
-- `profiles` — FALHA para qualquer cuidador que já confirmou um pedido de
-- ajuda, e com ela falha a exclusão de conta prometida na política de
-- privacidade (prazo de 15 dias) e o caminho manual de exclusão.
--
-- O pedido de ajuda é do PACIENTE e continua existindo; só deixa de apontar
-- para quem confirmou. O horário da confirmação (`acknowledged_at`) fica.
--
-- Idempotente: descobre o nome real da constraint em vez de supor o nome
-- gerado pelo Postgres.

do $$
declare
  nome text;
begin
  select c.conname into nome
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.help_requests'::regclass
    and c.contype = 'f'
    and a.attname = 'acknowledged_by'
  limit 1;

  if nome is not null then
    execute format('alter table public.help_requests drop constraint %I', nome);
  end if;

  alter table public.help_requests
    add constraint help_requests_acknowledged_by_fkey
    foreign key (acknowledged_by) references public.profiles(id)
    on delete set null;
end
$$;

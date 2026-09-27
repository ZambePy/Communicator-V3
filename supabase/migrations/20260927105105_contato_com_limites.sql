-- =====================================================================
-- IrisFlow — formulário de contato com limites contra abuso
--
-- Revisão do banco de 27/09/2026 (auditoria SITE-12). Idempotente.
--
-- O problema. contact_messages aceita INSERT de qualquer visitante (política
-- `with check (true)`), sem limite: um único comando do PostgREST grava mil
-- linhas de 5.000 caracteres, e um robô enche o banco Free (500 MB) — o que
-- derruba o produto inteiro, inclusive o socorro. O visitante também escolhia
-- `created_at` e `handled`: com data no passado furaria qualquer limite por
-- janela de tempo, e com handled = true a mensagem sumia da fila da equipe.
--
-- O que muda:
--   • created_at e handled são do servidor (o gatilho sobrescreve), o e-mail
--     é guardado em minúsculas;
--   • no máximo 3 mensagens por e-mail a cada 10 minutos e 30 no total por
--     minuto (a caixa de entrada é lida por três pessoas; isto não barra
--     família nenhuma, e segura um robô);
--   • um comando que insere mais de uma linha é recusado inteiro.
-- O erro é sempre `limite_de_contato` (P0001), que o site traduz com o
-- e-mail da equipe como alternativa.
-- =====================================================================

create or replace function public.limitar_contato()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.created_at := now();
  new.handled    := false;
  new.email      := lower(btrim(new.email));

  if (select count(*) from public.contact_messages
       where email = new.email and created_at > now() - interval '10 minutes') >= 3
     or (select count(*) from public.contact_messages
          where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'limite_de_contato' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.limitar_contato() from public, anon, authenticated;

drop trigger if exists limitar_contato on public.contact_messages;
create trigger limitar_contato
  before insert on public.contact_messages
  for each row execute function public.limitar_contato();

-- Um envio do formulário é UMA linha; lote é robô.
create or replace function public.recusar_contato_em_lote()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select count(*) from novos) > 1 then
    raise exception 'limite_de_contato' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

revoke all on function public.recusar_contato_em_lote() from public, anon, authenticated;

drop trigger if exists recusar_contato_em_lote on public.contact_messages;
create trigger recusar_contato_em_lote
  after insert on public.contact_messages
  referencing new table as novos
  for each statement execute function public.recusar_contato_em_lote();

-- A contagem por e-mail e por minuto usa este índice.
create index if not exists contact_messages_email_created_idx
  on public.contact_messages (email, created_at desc);

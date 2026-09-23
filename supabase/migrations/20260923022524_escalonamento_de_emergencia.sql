-- Nome original: 20260910_escalonamento_de_emergencia.sql (escrita em 10/09/2026); renomeada para a versão 20260923022524, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — escalonamento de emergência (APLICADA no projeto real em 10/09/2026)
--
-- A coluna help_requests.escalated_at existia, o plano de negócios prometia o
-- escalonamento e o app do cuidador dizia que acontecia — e nada o fazia.
--
-- Semântica: para um pedido de socorro/ajuda sem confirmação além do prazo
-- (patient_settings.emergency_timeout_s, padrão 45 s), o servidor, a cada
-- minuto (pg_cron):
--   1. grava escalated_at = now();
--   2. registra uma mensagem de sistema na conversa;
--   3. reenvia push para TODOS os tokens do cuidador (pg_net, assíncrono).
-- Ele NÃO telefona para ninguém. Ligar continua sendo ato humano.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.escalar_pedidos_de_ajuda()
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r record;
  v_tokens jsonb;
  v_nome text;
  v_prazo integer;
  n integer := 0;
begin
  for r in
    select h.id, h.beneficiary_id, h.kind, h.created_at,
           coalesce(ps.emergency_timeout_s, 45) as prazo_s
      from public.help_requests h
      left join public.patient_settings ps on ps.beneficiary_id = h.beneficiary_id
     where h.kind in ('emergencia', 'ajuda')
       and h.acknowledged_at is null
       and h.resolved_at is null
       and h.escalated_at is null
       and h.created_at + make_interval(secs => coalesce(ps.emergency_timeout_s, 45)) < now()
       -- Pedidos muito antigos não são escalados retroativamente.
       and h.created_at > now() - interval '6 hours'
     for update of h skip locked
  loop
    v_prazo := r.prazo_s;

    update public.help_requests set escalated_at = now() where id = r.id;

    -- `spoken = true`: registro para o histórico do cuidador; o desktop já tem
    -- o próprio alarme local.
    insert into public.messages (beneficiary_id, sender, kind, text, spoken)
    values (
      r.beneficiary_id, 'cuidador', 'sistema',
      format('Ninguém confirmou o pedido de %s em %s s. O alerta foi reenviado a todos os celulares.',
             case when r.kind = 'emergencia' then 'socorro' else 'ajuda' end, v_prazo),
      true
    );

    select b.user_name, coalesce(jsonb_agg(t.token), '[]'::jsonb)
      into v_nome, v_tokens
      from public.beneficiaries b
      left join public.push_tokens t on t.profile_id = b.profile_id
     where b.id = r.beneficiary_id
     group by b.user_name;

    if jsonb_array_length(v_tokens) > 0 then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"content-type": "application/json"}'::jsonb,
        body := (
          select jsonb_agg(jsonb_build_object(
            'to', tok,
            'title', case when r.kind = 'emergencia' then '🚨 Socorro sem resposta' else 'Pedido de ajuda sem resposta' end,
            'body', format('%s pediu %s há %s s e ninguém confirmou.',
                           coalesce(v_nome, 'O paciente'),
                           case when r.kind = 'emergencia' then 'socorro' else 'ajuda' end,
                           v_prazo),
            'sound', 'default',
            'priority', 'high',
            'channelId', 'emergencia',
            'data', jsonb_build_object('kind', r.kind, 'beneficiary_id', r.beneficiary_id, 'escalated', true)
          ))
          from jsonb_array_elements_text(v_tokens) as tok
        )
      );
    end if;

    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.escalar_pedidos_de_ajuda() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('escalar-pedidos-de-ajuda');
exception when others then null;
end $$;

select cron.schedule('escalar-pedidos-de-ajuda', '* * * * *', $$select public.escalar_pedidos_de_ajuda()$$);

comment on function public.escalar_pedidos_de_ajuda() is
  'Escalonamento de emergência: a cada minuto marca escalated_at nos pedidos sem confirmação além do prazo, registra mensagem de sistema e reenvia push. Não telefona para ninguém.';

-- =====================================================================
-- IrisFlow — escalonamento: reenvio enquanto ninguém confirma, um pedido
-- com erro não trava os outros, e o push de socorro com prioridade no iOS
--
-- Revisão do banco de 27/09/2026 (auditoria DB-5, N8 e APP-5). Idempotente.
-- Mesma assinatura da função de 20260924020011_help_requests_received_at.
--
-- 1. Reenvio (DB-5). Um socorro escalado uma vez e nunca confirmado não
--    gerava segundo aviso. Agora, enquanto ninguém confirma nem resolve, o
--    aviso é reenviado mais DUAS vezes, com 5 minutos de intervalo (o
--    primeiro escalonamento continua no prazo de emergência da conta, contado
--    da chegada). Cada reenvio grava a mensagem de sistema e manda o push.
--    Pedidos que já estavam escalados antes desta migração não ganham reenvio
--    de surpresa (reenvios = 2 para eles).
--    A janela de 6 h continua: pedido que chegou há mais tempo não é escalado
--    nem reenviado (ela evita avisar de pedidos históricos quando o job volta
--    a rodar depois de parado).
--
-- 2. Um pedido com erro não trava os outros (N8). A passagem era uma
--    transação só: um erro num pedido (no net.http_post, por exemplo)
--    desfazia o escalonamento de TODOS naquele minuto — e, se o erro se
--    repetisse, nenhum escalava. Agora cada pedido roda numa subtransação; o
--    que falhar fica para a próxima passagem, com um aviso no log.
--
-- 3. Push de socorro no iOS (APP-5): `interruptionLevel: time-sensitive`
--    (a mesma prioridade que a desktop-sync passa a mandar no primeiro aviso).
--    No iOS ele só vale com o entitlement de Time Sensitive no app; no
--    Android o canal "emergencia" já vai com prioridade alta.
-- =====================================================================

alter table public.help_requests
  add column if not exists reenvios smallint not null default 0,
  add column if not exists ultimo_aviso_em timestamptz;

comment on column public.help_requests.reenvios is
  'Quantas vezes o aviso foi reenviado depois do primeiro escalonamento (no máximo 2).';
comment on column public.help_requests.ultimo_aviso_em is
  'Quando o último aviso de escalonamento (ou reenvio) saiu.';

-- Os já escalados antes desta migração não recebem reenvio.
update public.help_requests
   set reenvios = 2,
       ultimo_aviso_em = coalesce(ultimo_aviso_em, escalated_at)
 where escalated_at is not null
   and ultimo_aviso_em is null;

create or replace function public.escalar_pedidos_de_ajuda()
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  r        record;
  v_tokens jsonb;
  v_nome   text;
  v_pedido text;
  v_reenvio boolean;
  n        integer := 0;
begin
  for r in
    select h.id, h.beneficiary_id, h.kind, h.escalated_at, h.reenvios,
           coalesce(ps.emergency_timeout_s, 45) as prazo_s
      from public.help_requests h
      left join public.patient_settings ps on ps.beneficiary_id = h.beneficiary_id
     where h.kind in ('emergencia', 'ajuda')
       and h.acknowledged_at is null
       and h.resolved_at is null
       -- Pedidos que chegaram há muito tempo não são escalados retroativamente.
       and h.received_at > now() - interval '6 hours'
       and (
         -- primeiro escalonamento: o prazo da conta, contado da chegada
         (h.escalated_at is null
          and h.received_at + make_interval(secs => coalesce(ps.emergency_timeout_s, 45)) < now())
         or
         -- reenvio: até 2, com 5 minutos entre um aviso e outro
         (h.escalated_at is not null
          and h.reenvios < 2
          and coalesce(h.ultimo_aviso_em, h.escalated_at) < now() - interval '5 minutes')
       )
     for update of h skip locked
  loop
    begin
      v_reenvio := r.escalated_at is not null;
      v_pedido := case when r.kind = 'emergencia' then 'socorro' else 'ajuda' end;

      if v_reenvio then
        update public.help_requests
           set reenvios = reenvios + 1, ultimo_aviso_em = now()
         where id = r.id;
      else
        update public.help_requests
           set escalated_at = now(), ultimo_aviso_em = now()
         where id = r.id;
      end if;

      select b.user_name, coalesce(jsonb_agg(t.token) filter (where t.token is not null), '[]'::jsonb)
        into v_nome, v_tokens
        from public.beneficiaries b
        left join public.push_tokens t on t.profile_id = b.profile_id
       where b.id = r.beneficiary_id
       group by b.user_name;

      -- `spoken = true`: registro para o histórico do cuidador; o desktop já
      -- tem o próprio alarme local.
      insert into public.messages (beneficiary_id, sender, kind, text, spoken)
      values (
        r.beneficiary_id, 'cuidador', 'sistema',
        case
          when jsonb_array_length(coalesce(v_tokens, '[]'::jsonb)) = 0 then
            format('Ninguém confirmou o pedido de %s em %s s. Não há celular cadastrado para receber o aviso.', v_pedido, r.prazo_s)
          when v_reenvio then
            format('O pedido de %s continua sem confirmação. O alerta foi reenviado a todos os celulares.', v_pedido)
          else
            format('Ninguém confirmou o pedido de %s em %s s. O alerta foi reenviado a todos os celulares.', v_pedido, r.prazo_s)
        end,
        true
      );

      if jsonb_array_length(coalesce(v_tokens, '[]'::jsonb)) > 0 then
        perform net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"content-type": "application/json"}'::jsonb,
          body := (
            select jsonb_agg(jsonb_build_object(
              'to', tok,
              'title', case
                         when r.kind = 'emergencia' and v_reenvio then '🚨 Socorro ainda sem resposta'
                         when r.kind = 'emergencia' then '🚨 Socorro sem resposta'
                         else 'Pedido de ajuda sem resposta'
                       end,
              'body', case
                        when v_reenvio then format('%s pediu %s e ninguém confirmou ainda.', coalesce(v_nome, 'O paciente'), v_pedido)
                        else format('%s pediu %s e ninguém confirmou em %s s.', coalesce(v_nome, 'O paciente'), v_pedido, r.prazo_s)
                      end,
              'sound', 'default',
              'priority', 'high',
              'interruptionLevel', 'time-sensitive',
              'channelId', 'emergencia',
              'data', jsonb_build_object('kind', r.kind, 'beneficiary_id', r.beneficiary_id, 'escalated', true)
            ))
            from jsonb_array_elements_text(v_tokens) as tok
          )
        );
      end if;

      n := n + 1;
    exception when others then
      -- Fica para a próxima passagem (a subtransação desfez só este pedido).
      raise warning 'escalar_pedidos_de_ajuda: pedido % não escalado nesta passagem: %', r.id, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;

revoke all on function public.escalar_pedidos_de_ajuda() from public, anon, authenticated;

comment on function public.escalar_pedidos_de_ajuda() is
  'Escalonamento de emergência: a cada minuto marca escalated_at nos pedidos sem confirmação além do prazo (contado da chegada, received_at), registra mensagem de sistema e reenvia push; depois reenvia mais 2 vezes, de 5 em 5 minutos, enquanto ninguém confirma. Um pedido com erro não trava os outros. Não telefona para ninguém.';

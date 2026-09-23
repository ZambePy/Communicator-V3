-- =====================================================================
-- IrisFlow — help_requests.received_at: quando o SERVIDOR recebeu o pedido
--
-- AINDA NÃO APLICADA EM PRODUÇÃO (23/09/2026): a aplicação pelo assistente foi
-- barrada pela checagem de permissões. Aplique com `supabase db push` (a versão
-- do nome já está depois da última registrada no projeto) ou colando este
-- arquivo no SQL Editor — é idempotente. Ordem: 150000 → 150100 → 150200.
--
-- Por quê. A Edge Function `desktop-sync` passou a gravar em `created_at` o
-- horário em que o pedido de ajuda aconteceu no computador do paciente
-- (campos `occurred_at` e `sent_at`: hora do servidor menos o atraso medido
-- no computador, até 24 h). Assim um socorro que esperou na fila offline
-- aparece com a hora real, e não como se fosse novo.
--
-- Só que o prazo de escalonamento (`patient_settings.emergency_timeout_s`) é
-- o tempo que o CUIDADOR tem para responder, e ele só começa quando o pedido
-- chega. Contado de `created_at`, um socorro que chegasse 30 min atrasado
-- seria escalado no minuto seguinte, antes de alguém conseguir tocar em
-- "Estou indo!" — e o app do cuidador mostraria o prazo já estourado. Esta
-- coluna guarda a chegada; o escalonamento e o cronômetro do app contam dela.
--
-- A mesma função de escalonamento passa a dizer só o que fez: "reenviado a
-- todos os celulares" apenas quando havia celular para avisar, e o push não
-- afirma mais "pediu socorro há 45 s" para um pedido que aconteceu antes.
--
-- Linhas antigas: received_at = created_at (até aqui os dois eram o mesmo
-- instante). Idempotente.
--
-- Ordem: aplique ANTES de publicar a desktop-sync nova. A função não
-- escreve esta coluna (o default resolve), então a versão atual segue
-- funcionando; já a desktop-sync nova sem esta migração deixaria a função
-- de escalonamento antiga contando o prazo de `created_at`, e um socorro
-- que chegasse atrasado seria escalado no minuto seguinte.
-- =====================================================================

alter table public.help_requests
  add column if not exists received_at timestamptz;

update public.help_requests
   set received_at = created_at
 where received_at is null;

alter table public.help_requests
  alter column received_at set default now(),
  alter column received_at set not null;

comment on column public.help_requests.received_at is
  'Quando o servidor recebeu o pedido. created_at é quando ele aconteceu no computador do paciente (anterior, se esperou na fila offline). O prazo de escalonamento conta a partir daqui.';


-- ---------------------------------------------------------------------
-- Escalonamento contado da chegada.
--
-- Corpo igual ao de 20260923022524_escalonamento_de_emergencia.sql, exceto:
--   • prazo e janela de 6 h medidos em `received_at`;
--   • a mensagem de sistema só diz "reenviado" quando havia token de push;
--   • o texto do push não afirma "há N s" (o pedido pode ser anterior).
-- ---------------------------------------------------------------------
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
  v_pedido text;
  n integer := 0;
begin
  for r in
    select h.id, h.beneficiary_id, h.kind, h.created_at, h.received_at,
           coalesce(ps.emergency_timeout_s, 45) as prazo_s
      from public.help_requests h
      left join public.patient_settings ps on ps.beneficiary_id = h.beneficiary_id
     where h.kind in ('emergencia', 'ajuda')
       and h.acknowledged_at is null
       and h.resolved_at is null
       and h.escalated_at is null
       and h.received_at + make_interval(secs => coalesce(ps.emergency_timeout_s, 45)) < now()
       -- Pedidos que chegaram há muito tempo não são escalados retroativamente.
       and h.received_at > now() - interval '6 hours'
     for update of h skip locked
  loop
    v_prazo := r.prazo_s;
    v_pedido := case when r.kind = 'emergencia' then 'socorro' else 'ajuda' end;

    update public.help_requests set escalated_at = now() where id = r.id;

    select b.user_name, coalesce(jsonb_agg(t.token) filter (where t.token is not null), '[]'::jsonb)
      into v_nome, v_tokens
      from public.beneficiaries b
      left join public.push_tokens t on t.profile_id = b.profile_id
     where b.id = r.beneficiary_id
     group by b.user_name;

    -- `spoken = true`: registro para o histórico do cuidador; o desktop já tem
    -- o próprio alarme local.
    insert into public.messages (beneficiary_id, sender, kind, text, spoken)
    values (
      r.beneficiary_id, 'cuidador', 'sistema',
      case when jsonb_array_length(coalesce(v_tokens, '[]'::jsonb)) > 0
        then format('Ninguém confirmou o pedido de %s em %s s. O alerta foi reenviado a todos os celulares.', v_pedido, v_prazo)
        else format('Ninguém confirmou o pedido de %s em %s s. Não há celular cadastrado para receber o aviso.', v_pedido, v_prazo)
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
            'title', case when r.kind = 'emergencia' then '🚨 Socorro sem resposta' else 'Pedido de ajuda sem resposta' end,
            'body', format('%s pediu %s e ninguém confirmou em %s s.',
                           coalesce(v_nome, 'O paciente'), v_pedido, v_prazo),
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

comment on function public.escalar_pedidos_de_ajuda() is
  'Escalonamento de emergência: a cada minuto marca escalated_at nos pedidos sem confirmação além do prazo (contado da chegada, received_at), registra mensagem de sistema e reenvia push. Não telefona para ninguém.';

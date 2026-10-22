-- =====================================================================
-- IrisFlow — rodada 3 (21/10/2026): endurecimento das funções security
-- definer e limite atômico dos avisos do computador
--
-- Idempotente. Roda DEPOIS de 20261019200000_pareamento_do_celular. Aplique
-- ANTES de publicar a desktop-sync desta rodada; publicada antes, ela segue
-- o caminho antigo (sem o limite novo) e deixa uma linha no log — ver
-- supabase/functions/desktop-sync/limites.ts.
--
-- 1. search_path fixo, com pg_temp no FIM, em toda função security definer
--    do public. Fora da lista, o esquema temporário da sessão é lido ANTES do
--    public: uma tabela temporária com o nome de uma do public tomaria o
--    lugar dela dentro da função, que roda com os direitos do dono. Faltava em
--    is_my_beneficiary(uuid) e bump_session_help_count() (só `public`); as
--    duas escrevem os nomes com o esquema, então aqui é defesa em
--    profundidade. O bloco também conserta qualquer outra que exista no
--    projeto sem estar nestes arquivos, e mantém os outros esquemas da lista
--    (pair_device, confirmar_codigo e escalar_pedidos_de_ajuda precisam de
--    `extensions`).
--
-- 2. EXECUTE da chave anônima: nada a revogar. Das security definer, só
--    confirmar_codigo é executável por `anon`, e continua assim de propósito:
--    o site confere os 4 dígitos do e-mail ANTES de existir sessão
--    (site/src/services/api.ts → conferirCodigo, chamado por
--    components/beta/CodigoDeVerificacao.tsx). Sem o EXECUTE, nenhum cadastro
--    novo se confirmaria pelo código. Ela se protege sozinha: 10 erros por
--    e-mail em 24 h e a mesma resposta para "código errado" e "e-mail sem
--    cadastro". As executáveis por `authenticated` são as RPCs que o site, o
--    app e o computador chamam com a conta logada — e is_my_beneficiary, que
--    as políticas de RLS usam —; todas conferem auth.uid() e agem só na
--    própria conta. O teste local (scripts/db-local-test.sql, R3-1) falha se
--    outra security definer ficar executável pela chave anônima.
--
-- 3. Índice em subscriptions(plan_id): a chave estrangeira sem índice que o
--    Performance Advisor aponta. Em 20260923023639_desempenho ela ficou de
--    fora porque `plans` quase não muda; o índice é pequeno e tira o aviso.
--
-- 4. Limite atômico dos avisos (decisão 2 da rodada 3). Até aqui o limite do
--    aviso de dispositivo era uma consulta na desktop-sync seguida de um
--    INSERT: duas chamadas ao mesmo tempo contavam antes uma da outra e
--    passavam as duas — e uma chave tirada do computador mandaria push sem
--    fim para os celulares da família. registrar_aviso_com_limite() conta e
--    grava sob uma trava por computador (pg_advisory_xact_lock):
--      • `dispositivo`: o mesmo texto no máximo a cada 15 minutos e 4 por
--        hora;
--      • `ajuda`: 6 a cada 10 minutos;
--      • `emergencia`: NUNCA limitada (e a desktop-sync nem a manda por aqui).
--    Os limites são por computador: help_requests ganha `device_id`. As
--    janelas contam da CHEGADA (received_at): um pedido que esperou horas na
--    fila offline conta quando chega.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. search_path com pg_temp no fim
-- ---------------------------------------------------------------------
do $$
declare
  f       record;
  v_lista text;
begin
  for f in
    select p.oid,
           p.oid::regprocedure as assinatura,
           p.proname,
           (select substr(c, length('search_path=') + 1)
              from unnest(p.proconfig) c
             where c like 'search_path=%') as caminho
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosecdef
       and p.prokind in ('f', 'p')   -- função ou procedimento (ALTER ROUTINE serve para os dois)
       -- funções de extensão são do dono da extensão
       and not exists (select 1 from pg_depend d
                        where d.classid = 'pg_proc'::regclass
                          and d.objid = p.oid
                          and d.deptype = 'e')
  loop
    if f.caminho is null then
      v_lista := 'public, pg_temp';
    else
      -- Os esquemas que já estavam, na mesma ordem, sem pg_temp; pg_temp no fim.
      select coalesce(string_agg(s, ', ' order by i), '')
        into v_lista
        from unnest(regexp_split_to_array(f.caminho, '\s*,\s*')) with ordinality as t(s, i)
       where btrim(s, ' "') <> ''
         and lower(btrim(s, ' "')) <> 'pg_temp';
      v_lista := case when v_lista = '' then 'pg_temp' else v_lista || ', pg_temp' end;
      continue when v_lista = f.caminho;
    end if;
    begin
      execute format('alter routine public.%I(%s) set search_path = %s',
                     f.proname, pg_get_function_identity_arguments(f.oid), v_lista);
      raise notice 'search_path de %: % -> %', f.assinatura, coalesce(f.caminho, '(nenhum)'), v_lista;
    exception when insufficient_privilege then
      -- Não trava o resto da migração (o limite dos avisos vem abaixo); o
      -- aviso aparece na saída de quem aplicou.
      raise warning 'search_path de % não mudou: a função é de outro dono', f.assinatura;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Índice da chave estrangeira subscriptions.plan_id
-- ---------------------------------------------------------------------
create index if not exists subscriptions_plan_idx on public.subscriptions (plan_id);

-- ---------------------------------------------------------------------
-- 4. Limite atômico dos avisos
-- ---------------------------------------------------------------------
alter table public.help_requests
  add column if not exists device_id uuid references public.devices (id) on delete set null;

comment on column public.help_requests.device_id is
  'Computador que mandou o aviso (registrar_aviso_com_limite, desde 21/10/2026): os limites de ajuda e de aviso de dispositivo são por computador. Nulo nos pedidos anteriores e nos socorros, que não passam pelo limite.';

-- A contagem do limite (computador + tipo + chegada) e a exclusão em cascata
-- de um computador usam este índice.
create index if not exists help_requests_device_kind_received_idx
  on public.help_requests (device_id, kind, received_at desc);

-- registrar_aviso_com_limite — o computador manda um aviso (desktop-sync,
-- ação help.create, para `ajuda` e `dispositivo`).
--
-- `p_id`: o UUID que o computador escolheu para o pedido e mantém nos
-- reenvios da fila offline. Com ele, o reenvio de um pedido já gravado (a
-- resposta do primeiro envio se perdeu) devolve o MESMO pedido, sem segunda
-- linha nem "limite" — o pedido já está gravado. Id já usado por OUTRO
-- paciente (cliente adulterado) vira pedido novo, com id do servidor.
--
-- Resposta:
--   { ok: true, id }                         gravado
--   { ok: true, id, repetido: true, kind }   reenvio de um pedido já gravado
--                                            (`kind`: o tipo gravado)
--   { ok: false, motivo: 'limite' }          acima do limite: nada gravado
--   { ok: false, motivo: 'computador_desvinculado' }
--
-- security invoker: quem chama é a service_role (que já escreve em
-- help_requests); um EXECUTE dado por engano ao site ou ao app esbarraria na
-- RLS e nos grants de coluna, em vez de gravar pedidos em nome de qualquer
-- computador.
create or replace function public.registrar_aviso_com_limite(
  p_device_id  uuid,
  p_kind       text,
  p_message    text,
  p_session_id uuid,
  p_created_at timestamptz,
  p_id         uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_kind    public.help_kind_t := p_kind::public.help_kind_t;   -- tipo que não existe: 22P02
  v_msg     text := left(coalesce(p_message, ''), 500);
  v_ben     uuid;
  v_revog   timestamptz;
  v_dono    uuid;
  v_gravado public.help_kind_t;
  v_sessao  uuid;
  v_id      uuid;
begin
  if v_kind is null then
    raise exception 'registrar_aviso_com_limite: informe o tipo do aviso' using errcode = '22023';
  end if;

  select d.beneficiary_id, d.revoked_at into v_ben, v_revog
    from public.devices d
   where d.id = p_device_id;
  if v_ben is null or v_revog is not null then
    return jsonb_build_object('ok', false, 'motivo', 'computador_desvinculado');
  end if;

  -- Uma chamada de cada vez por computador nos tipos com limite. Sem a
  -- trava, a contagem abaixo não enxerga a linha que outra chamada gravou e
  -- ainda não confirmou, e as duas passam. O socorro não espera ninguém.
  if v_kind in ('ajuda', 'dispositivo') then
    perform pg_advisory_xact_lock(hashtextextended('aviso:' || p_device_id::text, 0));
  end if;

  -- Reenvio do mesmo pedido: antes do limite — ele já está gravado.
  if p_id is not null then
    select h.beneficiary_id, h.kind into v_dono, v_gravado
      from public.help_requests h
     where h.id = p_id;
    if v_dono = v_ben then
      return jsonb_build_object('ok', true, 'id', p_id, 'repetido', true, 'kind', v_gravado);
    end if;
  end if;

  if v_kind = 'ajuda'
     and (select count(*) from public.help_requests
           where device_id = p_device_id
             and kind = 'ajuda'
             and received_at > now() - interval '10 minutes') >= 6 then
    return jsonb_build_object('ok', false, 'motivo', 'limite');
  end if;

  if v_kind = 'dispositivo'
     and ((select count(*) from public.help_requests
            where device_id = p_device_id
              and kind = 'dispositivo'
              and received_at > now() - interval '1 hour') >= 4
          or exists (select 1 from public.help_requests
                      where device_id = p_device_id
                        and kind = 'dispositivo'
                        and message = v_msg
                        and received_at > now() - interval '15 minutes')) then
    return jsonb_build_object('ok', false, 'motivo', 'limite');
  end if;

  -- A sessão só vale se for deste paciente (o gatilho conta o pedido nela).
  if p_session_id is not null then
    select s.id into v_sessao
      from public.sessions s
     where s.id = p_session_id and s.beneficiary_id = v_ben;
  end if;

  insert into public.help_requests (id, beneficiary_id, device_id, kind, message, session_id, created_at)
  values (case when p_id is not null and v_dono is null then p_id else gen_random_uuid() end,
          v_ben, p_device_id, v_kind, v_msg, v_sessao, coalesce(p_created_at, now()))
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    -- O mesmo id gravado por outra chamada entre a busca e o INSERT (só num
    -- tipo sem trava, como o socorro): é o reenvio — ou, se for de outro
    -- paciente, o pedido ganha id do servidor.
    select h.beneficiary_id, h.kind into v_dono, v_gravado
      from public.help_requests h
     where h.id = p_id;
    if v_dono = v_ben then
      return jsonb_build_object('ok', true, 'id', p_id, 'repetido', true, 'kind', v_gravado);
    end if;
    insert into public.help_requests (beneficiary_id, device_id, kind, message, session_id, created_at)
    values (v_ben, p_device_id, v_kind, v_msg, v_sessao, coalesce(p_created_at, now()))
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

comment on function public.registrar_aviso_com_limite(uuid, text, text, uuid, timestamptz, uuid) is
  'Grava um aviso do computador com o limite por computador, sob trava (21/10/2026): dispositivo, o mesmo texto a cada 15 min e 4 por hora; ajuda, 6 a cada 10 min; emergencia nunca limitada. Só a service_role (desktop-sync).';

revoke all on function public.registrar_aviso_com_limite(uuid, text, text, uuid, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.registrar_aviso_com_limite(uuid, text, text, uuid, timestamptz, uuid)
  to service_role;

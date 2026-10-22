-- =====================================================================
-- IrisFlow — conectar o celular do cuidador por código QR
--
-- Pedido do dono de 19/10/2026: "conectar o celular do cuidador por QR code,
-- sem digitar código nem senha". Idempotente.
--
-- O caminho inteiro:
--   1. No computador do paciente (já vinculado por pair_device(), chave em
--      x-device-key), Configurações → "Mostrar o código". A Edge Function
--      desktop-sync (ação pairing.create) sorteia 32 bytes, grava AQUI só o
--      SHA-256 deles (criar_codigo_de_pareamento) e devolve o código ao
--      computador, que o desenha num QR com o endereço
--      https://irisflow.ia.br/parear#t=<código>.
--   2. O celular lê o QR com a câmera; a página /parear do site abre o app
--      (irisflow://parear?t=…). O app, depois de um toque do cuidador, manda o
--      código para a Edge Function parear-celular, que o troca — uma vez só —
--      por uma entrada na conta da família (usar_codigo_de_pareamento + link
--      mágico gerado dentro da função, com a service_role).
--   3. Já dentro da conta, o app avisa que entrou (confirmar_celular_conectado)
--      e o computador mostra "Celular conectado às HH:MM".
--
-- Por que cada regra:
--   • Só o hash do código fica no banco: quem ler a tabela (backup, painel,
--     registro de consultas lentas) não consegue entrar com o que leu.
--   • Validade de 3 minutos e uso único, marcados num UPDATE só: duas pessoas
--     com a mesma foto do QR não entram as duas — o segundo UPDATE espera o
--     primeiro e não encontra mais a linha "sem uso".
--   • Um código ativo por computador: gerar outro (ou fechar a tela) cancela o
--     anterior, e uma foto antiga do QR para de valer.
--   • No máximo 5 códigos por computador a cada 10 minutos.
--   • O código certo passa sempre; só a tentativa que FALHA conta e é barrada,
--     por endereço de rede guardado como HMAC (nunca o IP; IPv6 agrupado pelo
--     /64 na Edge Function): 10 a cada 10 minutos por endereço e 300 por minuto
--     no total. O código tem 256 bits — adivinhar é inviável de qualquer
--     jeito —; o limite segura quem tenta encher a tabela e o banco. Até a
--     revisão de segurança de 20/10/2026 o limite vinha ANTES do código, e 300
--     chutes por minuto, de endereços quaisquer, desligavam o QR de todas as
--     famílias.
--   • Conta sem e-mail confirmado não gera código nem entra: o link mágico
--     confirmaria o e-mail (o Auth faz isso ao verificar), sem a pessoa ter
--     provado que é dona dele.
--   • RLS ligada e nenhuma política; privilégios revogados de anon e
--     authenticated. Só as funções abaixo mexem nas tabelas: as duas primeiras
--     só pela service_role (Edge Functions); a confirmação, pelo próprio
--     celular já logado, e só no pareamento da conta dele.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Códigos de pareamento (um por QR mostrado)
-- ---------------------------------------------------------------------
create table if not exists public.pareamentos_de_celular (
  id             uuid primary key default gen_random_uuid(),
  device_id      uuid not null references public.devices (id) on delete cascade,
  beneficiary_id uuid not null references public.beneficiaries (id) on delete cascade,
  -- SHA-256 (hexadecimal) do código do QR. O código em si nunca é gravado.
  token_hash     text not null,
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null,
  -- O celular trocou o código pela entrada na conta (uso único).
  usado_em       timestamptz,
  -- O celular confirmou, já logado, que entrou (o computador mostra a hora).
  conectado_em   timestamptz,
  -- Outro código foi gerado no mesmo computador, ou a tela do QR fechou.
  cancelado_em   timestamptz,
  constraint pareamentos_de_celular_token_hash_uk unique (token_hash),
  constraint pareamentos_de_celular_token_hash_formato check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint pareamentos_de_celular_validade check (expira_em > criado_em and expira_em <= criado_em + interval '10 minutes')
);

comment on table public.pareamentos_de_celular is
  'Códigos QR que conectam o celular do cuidador sem senha (19/10/2026). Só o SHA-256 do código; 3 minutos; uso único. Escrita só pelas funções criar_codigo_de_pareamento, usar_codigo_de_pareamento e confirmar_celular_conectado.';

create index if not exists pareamentos_de_celular_device_idx
  on public.pareamentos_de_celular (device_id, criado_em desc);
create index if not exists pareamentos_de_celular_criado_idx
  on public.pareamentos_de_celular (criado_em);

-- ---------------------------------------------------------------------
-- 2. Tentativas de uso, por endereço de rede (HMAC do IP, nunca o IP)
-- ---------------------------------------------------------------------
create table if not exists public.tentativas_de_pareamento (
  id      bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  em      timestamptz not null default now()
);

comment on table public.tentativas_de_pareamento is
  'Tentativas que FALHARAM de usar um código de pareamento (Edge Function parear-celular), por HMAC do endereço de rede (IPv6 pelo /64). Guardadas por uma hora.';

create index if not exists tentativas_de_pareamento_ip_idx
  on public.tentativas_de_pareamento (ip_hash, em desc);
create index if not exists tentativas_de_pareamento_em_idx
  on public.tentativas_de_pareamento (em);

-- Ninguém lê nem escreve direto: nem a chave anônima, nem o usuário logado.
alter table public.pareamentos_de_celular enable row level security;
alter table public.tentativas_de_pareamento enable row level security;
revoke all on public.pareamentos_de_celular from public, anon, authenticated;
revoke all on public.tentativas_de_pareamento from public, anon, authenticated;
grant all on public.pareamentos_de_celular to service_role;
grant all on public.tentativas_de_pareamento to service_role;


-- ---------------------------------------------------------------------
-- 3. criar_codigo_de_pareamento — o computador pede um código
--
-- Chamada pela desktop-sync (ação pairing.create), que já conferiu a chave do
-- computador e sorteou o código; aqui chega só o hash. Resposta:
--   { ok: true, id, expira_em, validade_s }
--   { ok: false, motivo: 'limite', tente_em }       5 códigos em 10 minutos
--   { ok: false, motivo: 'email_nao_confirmado' }
--   { ok: false, motivo: 'computador_desvinculado' }
-- ---------------------------------------------------------------------
create or replace function public.criar_codigo_de_pareamento(p_device_id uuid, p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ben         uuid;
  v_revogado    timestamptz;
  v_confirmado  boolean;
  v_recentes    integer;
  v_mais_antigo timestamptz;
  v_id          uuid;
  v_expira      timestamptz := now() + interval '3 minutes';
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'criar_codigo_de_pareamento: hash inválido' using errcode = '22023';
  end if;

  -- Trava o computador: dois pedidos simultâneos dele passam um de cada vez,
  -- e o limite e o "um código ativo por vez" ficam exatos.
  select d.beneficiary_id, d.revoked_at into v_ben, v_revogado
    from public.devices d
   where d.id = p_device_id
   for update;
  if v_ben is null or v_revogado is not null then
    return jsonb_build_object('ok', false, 'motivo', 'computador_desvinculado');
  end if;

  select u.email_confirmed_at is not null into v_confirmado
    from public.beneficiaries b
    join auth.users u on u.id = b.profile_id
   where b.id = v_ben;
  if not coalesce(v_confirmado, false) then
    return jsonb_build_object('ok', false, 'motivo', 'email_nao_confirmado');
  end if;

  -- Faxina: com mais de um dia, um código não serve nem para o "conectado às".
  delete from public.pareamentos_de_celular where criado_em < now() - interval '1 day';

  select count(*), min(criado_em) into v_recentes, v_mais_antigo
    from public.pareamentos_de_celular
   where device_id = p_device_id
     and criado_em > now() - interval '10 minutes';
  if v_recentes >= 5 then
    return jsonb_build_object('ok', false, 'motivo', 'limite', 'tente_em', v_mais_antigo + interval '10 minutes');
  end if;

  -- Um código ativo por computador: o QR anterior para de valer.
  update public.pareamentos_de_celular
     set cancelado_em = now()
   where device_id = p_device_id
     and usado_em is null
     and cancelado_em is null
     and expira_em > now();

  insert into public.pareamentos_de_celular (device_id, beneficiary_id, token_hash, expira_em)
  values (p_device_id, v_ben, p_token_hash, v_expira)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'expira_em', v_expira, 'validade_s', 180);
end;
$$;

comment on function public.criar_codigo_de_pareamento(uuid, text) is
  'Grava o hash de um código QR novo do computador (3 minutos), cancelando o anterior. Só a service_role (desktop-sync).';

revoke all on function public.criar_codigo_de_pareamento(uuid, text) from public, anon, authenticated;
grant execute on function public.criar_codigo_de_pareamento(uuid, text) to service_role;


-- ---------------------------------------------------------------------
-- 4. usar_codigo_de_pareamento — o celular troca o código pela conta
--
-- Chamada pela Edge Function parear-celular. Marca o código como usado num
-- UPDATE só: existe, não venceu, não foi usado nem cancelado, e o computador
-- continua vinculado. Só se o UPDATE não achar o código a tentativa conta
-- (por HMAC do endereço) e passa pelos limites. Resposta:
--   { ok: true, pareamento_id, user_id, email, email_confirmado, paciente }
--   { ok: false, motivo: 'invalido' }   o MESMO para inexistente, vencido,
--                                       usado, cancelado e computador
--                                       desvinculado — a resposta não diz se
--                                       um código existe
--   { ok: false, motivo: 'limite' }     tentativa que falhou, com o limite
--                                       do endereço ou o global cheio
-- ---------------------------------------------------------------------
create or replace function public.usar_codigo_de_pareamento(p_token_hash text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_ben   uuid;
  v_user  uuid;
  v_email text;
  v_conf  boolean;
  v_nome  text;
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' or coalesce(p_ip_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'usar_codigo_de_pareamento: hash inválido' using errcode = '22023';
  end if;

  -- O código PRIMEIRO, antes de qualquer limite (revisão de segurança de
  -- 20/10/2026). Com o limite antes, 300 chutes por minuto, de endereços
  -- quaisquer, barravam também o código certo — o QR de TODAS as famílias
  -- parava. O código certo tem 256 bits: não precisa de limite. Uso único
  -- como sempre: um segundo pedido com o mesmo código espera o primeiro e não
  -- encontra mais a linha "sem uso".
  update public.pareamentos_de_celular p
     set usado_em = now()
   where p.token_hash = p_token_hash
     and p.usado_em is null
     and p.cancelado_em is null
     and p.expira_em > now()
     and exists (select 1 from public.devices d where d.id = p.device_id and d.revoked_at is null)
  returning p.id, p.beneficiary_id into v_id, v_ben;

  if v_id is null then
    -- Só a tentativa que FALHOU conta e é barrada. Uma de cada vez por
    -- endereço: pedidos simultâneos não furam o limite contando antes uns
    -- dos outros. (O código certo nem chega aqui: não espera ninguém.)
    perform pg_advisory_xact_lock(hashtextextended('pareamento:' || p_ip_hash, 0));

    delete from public.tentativas_de_pareamento where em < now() - interval '1 hour';

    -- Recusada pelo limite, a tentativa não é gravada: com o banco cheio de
    -- pedidos recusados, o limite global viraria um teto que nunca baixa.
    if (select count(*) from public.tentativas_de_pareamento
         where ip_hash = p_ip_hash and em > now() - interval '10 minutes') >= 10
       or (select count(*) from public.tentativas_de_pareamento
            where em > now() - interval '1 minute') >= 300 then
      return jsonb_build_object('ok', false, 'motivo', 'limite');
    end if;

    insert into public.tentativas_de_pareamento (ip_hash) values (p_ip_hash);
    return jsonb_build_object('ok', false, 'motivo', 'invalido');
  end if;

  select u.id, u.email, u.email_confirmed_at is not null, b.user_name
    into v_user, v_email, v_conf, v_nome
    from public.beneficiaries b
    join auth.users u on u.id = b.profile_id
   where b.id = v_ben;

  return jsonb_build_object(
    'ok', true,
    'pareamento_id', v_id,
    'user_id', v_user,
    'email', v_email,
    'email_confirmado', coalesce(v_conf, false),
    'paciente', v_nome
  );
end;
$$;

comment on function public.usar_codigo_de_pareamento(text, text) is
  'Marca o código QR como usado (uso único, 3 minutos) e devolve a conta para o link mágico. O código certo passa sempre; só a tentativa que falha conta (por HMAC do endereço) e é barrada pelos limites. Só a service_role (parear-celular).';

revoke all on function public.usar_codigo_de_pareamento(text, text) from public, anon, authenticated;
grant execute on function public.usar_codigo_de_pareamento(text, text) to service_role;


-- ---------------------------------------------------------------------
-- 5. confirmar_celular_conectado — o celular, já logado, avisa que entrou
--
-- O computador só diz "Celular conectado às HH:MM" depois disto; antes, diz
-- que o código foi usado (o que é verdade mesmo se a entrada falhar no fim).
-- Vale só para o pareamento da própria conta e até 10 minutos depois do uso.
-- ---------------------------------------------------------------------
create or replace function public.confirmar_celular_conectado(p_pareamento uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'confirmar_celular_conectado: é preciso estar autenticado' using errcode = '28000';
  end if;

  update public.pareamentos_de_celular p
     set conectado_em = now()
   where p.id = p_pareamento
     and p.usado_em is not null
     and p.conectado_em is null
     and p.usado_em > now() - interval '10 minutes'
     and public.is_my_beneficiary(p.beneficiary_id);
  return found;
end;
$$;

comment on function public.confirmar_celular_conectado(uuid) is
  'O celular que acabou de entrar pelo código QR confirma a entrada (o computador mostra a hora). Só no pareamento da própria conta.';

revoke all on function public.confirmar_celular_conectado(uuid) from public, anon;
grant execute on function public.confirmar_celular_conectado(uuid) to authenticated;

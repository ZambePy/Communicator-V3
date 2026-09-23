-- Nome original: supabase/schema.sql (esquema base do site, anterior às migrações de 04/09/2026); renomeada para a versão 20260923022346, a registrada no histórico de migrações do projeto em produção.
-- =====================================================================
-- IrisFlow — esquema do banco (Supabase / PostgreSQL)
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e execute uma vez.
-- Ele é idempotente: rodar de novo não quebra nada nem duplica dados.
--
-- O desenho segue o que o frontend já usa:
--   Profile   (src/context/AccountContext.tsx) -> profiles + beneficiaries
--   Payment   (idem)                           -> payment_methods
--   Account   (idem)                           -> subscriptions
--   formulário de contato (src/pages/Contato)  -> contact_messages
--   DOWNLOADS (src/services/api.ts)            -> app_releases
--
-- Duas decisões que valem ser lidas antes:
--
--   1. Os dados de "quem usa" ficam em uma tabela separada de "quem paga".
--      A condição (ELA, tetraplegia, AVC...) é dado pessoal sensível de
--      saúde pela LGPD, art. 5º, II. Separar deixa o controle de acesso
--      explícito em vez de diluído numa tabela só.
--
--   2. Nenhuma tabela aqui guarda número de cartão, validade ou CVV, e
--      nenhuma coluna comporta isso. O gateway tokeniza no navegador e o
--      banco recebe só o token, os quatro últimos dígitos e a bandeira.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. Extensões
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- Nada de citext: em vez de depender de uma extensão e do schema em que
-- ela cai, os e-mails entram sempre em minúsculas (é assim que o
-- auth.users já os guarda) e um CHECK garante isso.


-- ---------------------------------------------------------------------
-- 1. Tipos enumerados
--
-- Cada um espelha exatamente a lista de <option> do formulário
-- correspondente. Para acrescentar um valor depois:
--   alter type public.relation_t add value 'novo-valor';
-- ---------------------------------------------------------------------

do $$ begin
  -- src/pages/Cadastro.tsx, "Sua relação com ela"
  create type public.relation_t as enum
    ('conjuge', 'filho', 'pai-mae', 'irmao', 'cuidador', 'proprio', 'outro');
exception when duplicate_object then null; end $$;

do $$ begin
  -- src/pages/Cadastro.tsx, "Condição principal"
  create type public.condition_t as enum
    ('ela', 'tetraplegia', 'pc', 'avc', 'distrofia', 'outra', 'prefiro-nao');
exception when duplicate_object then null; end $$;

do $$ begin
  -- src/pages/Cadastro.tsx, sistema do computador
  create type public.os_t as enum ('windows', 'macos', 'linux', 'nao-sei');
exception when duplicate_object then null; end $$;

do $$ begin
  -- os três primeiros já existem no frontend; os dois últimos entram
  -- quando o gateway começa a reportar falha de pagamento
  create type public.subscription_status_t as enum
    ('avaliacao', 'ativa', 'cancelada', 'inadimplente', 'encerrada');
exception when duplicate_object then null; end $$;

do $$ begin
  -- src/pages/Pagamento.tsx
  create type public.payment_method_t as enum ('cartao', 'pix', 'boleto');
exception when duplicate_object then null; end $$;

do $$ begin
  -- o select "Cobrança" do checkout hoje manda 1 (mensal) ou 12 (anual).
  -- No banco isso vira nome, porque não são parcelas: é periodicidade.
  create type public.billing_interval_t as enum ('mensal', 'anual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.charge_status_t as enum
    ('pendente', 'paga', 'vencida', 'estornada', 'falhou');
exception when duplicate_object then null; end $$;

do $$ begin
  -- src/pages/Contato.tsx, "Você é"
  create type public.contact_role_t as enum
    ('familiar', 'usuario', 'profissional', 'clinica', 'imprensa', 'outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.release_os_t as enum ('windows', 'macos', 'linux');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- 2. plans — o preço deixa de ser constante no código
--
-- Hoje PLAN.price e PLAN.trialDays vivem em src/data/content.ts. Com o
-- banco no ar, esta tabela passa a ser a fonte da verdade da cobrança, e
-- content.ts fica só com o texto de venda.
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  id          text primary key,
  name        text          not null,
  price_brl   numeric(10,2) not null check (price_brl >= 0),
  trial_days  smallint      not null default 15 check (trial_days >= 0),
  active      boolean       not null default true,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

comment on table public.plans is
  'Planos de assinatura. price_brl está em reais, não em centavos.';

-- Três planos B2C, contratados pela família no site. Os ids batem com o
-- tipo PlanId em src/data/content.ts; alterar o preço aqui exige alterar
-- lá também para o catálogo continuar coerente com o que o banco cobra.
insert into public.plans (id, name, price_brl, trial_days) values
  ('essencial', 'Essencial', 249.00, 15),
  ('completo',  'Completo',  399.00, 15),
  ('voz',       'Voz',       649.00, 15)
on conflict (id) do update
  set name       = excluded.name,
      price_brl  = excluded.price_brl,
      trial_days = excluded.trial_days,
      active     = true;

-- O plano único original ('irisflow-mensal') fica inativo, mas continua
-- na tabela porque assinaturas antigas ainda o referenciam pela FK.
update public.plans set active = false
 where id = 'irisflow-mensal';


-- ---------------------------------------------------------------------
-- 3. profiles — quem paga
--
-- Um por usuário do Supabase Auth. A linha nasce sozinha pelo gatilho
-- on_auth_user_created, logo abaixo.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  -- sem mínimo de 3 aqui: o gatilho de signUp cai para a parte local do
  -- e-mail, que pode ser mais curta. "Nome e sobrenome" é validado no
  -- formulário e em complete_registration.
  buyer_name  text        not null check (length(btrim(buyer_name)) > 0),
  email       text        not null unique check (email = lower(email)),
  phone       text        check (phone is null or length(regexp_replace(phone, '\D', '', 'g')) between 10 and 11),
  document    text        unique check (document is null or document ~ '^[0-9]{11}$'),
  newsletter  boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.profiles.document is
  'CPF, somente dígitos. Guardado por exigência de nota fiscal da assinatura.';


-- ---------------------------------------------------------------------
-- 4. beneficiaries — quem usa
--
-- Tabela separada porque `condition` é dado sensível de saúde. Hoje é
-- uma linha por perfil (o índice único abaixo garante isso); se um dia
-- uma clínica precisar de vários pacientes por conta, basta remover o
-- índice.
-- ---------------------------------------------------------------------
create table if not exists public.beneficiaries (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  user_name        text not null check (length(btrim(user_name)) >= 3),
  relation         public.relation_t  not null,
  condition        public.condition_t not null,
  os               public.os_t        not null,
  prescriber_name  text,
  prescriber_role  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists beneficiaries_profile_uk
  on public.beneficiaries (profile_id);

comment on table public.beneficiaries is
  'Pessoa que opera a IrisFlow. Contém dado sensível de saúde (LGPD art. 5º, II).';


-- ---------------------------------------------------------------------
-- 5. subscriptions — o Account do frontend
--
-- price_brl é uma fotografia do preço no momento da contratação: se o
-- plano subir de preço, quem já assinou continua no valor acertado.
-- ---------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid not null references public.profiles (id) on delete cascade,
  plan_id                 text not null references public.plans (id),
  status                  public.subscription_status_t not null default 'avaliacao',
  price_brl               numeric(10,2) not null check (price_brl >= 0),
  trial_ends_at           timestamptz not null,
  next_charge_at          timestamptz not null,
  canceled_at             timestamptz,
  gateway                 text,
  gateway_customer_id     text,
  gateway_subscription_id text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  -- só exige a data quando o status é 'cancelada'. O contrário não vale:
  -- uma assinatura cancelada e depois encerrada mantém a data no histórico.
  constraint subscriptions_cancel_ck
    check (status <> 'cancelada' or canceled_at is not null)
);

-- Uma assinatura viva por perfil. Assinaturas encerradas ficam no
-- histórico e não disputam o índice.
create unique index if not exists subscriptions_active_uk
  on public.subscriptions (profile_id)
  where status <> 'encerrada';

create index if not exists subscriptions_next_charge_idx
  on public.subscriptions (next_charge_at)
  where status in ('avaliacao', 'ativa');


-- ---------------------------------------------------------------------
-- 6. payment_methods — o Payment do frontend
--
-- ATENÇÃO: não existe coluna para número de cartão, validade ou CVV, e
-- não deve passar a existir. O checkout tokeniza no navegador pelo SDK
-- do gateway (ver tokenizeCard em src/services/api.ts) e só o token
-- chega aqui.
-- ---------------------------------------------------------------------
create table if not exists public.payment_methods (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  method            public.payment_method_t   not null,
  billing_interval  public.billing_interval_t not null default 'mensal',
  card_last4        text check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  card_brand        text check (card_brand is null or card_brand in
                      ('Visa', 'Mastercard', 'American Express', 'Hipercard', 'Elo', 'Cartão')),
  holder            text,
  gateway_token     text,
  is_default        boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- cartão exige bandeira e os quatro últimos; Pix e boleto não têm nem um nem outro
  constraint payment_methods_cartao_ck check (
    case method
      when 'cartao' then card_last4 is not null and card_brand is not null
      else card_last4 is null and card_brand is null
    end
  )
);

create unique index if not exists payment_methods_default_uk
  on public.payment_methods (profile_id)
  where is_default;

comment on column public.payment_methods.card_last4 is
  'Somente os quatro últimos dígitos. A regex impede que um PAN inteiro caiba aqui.';


-- ---------------------------------------------------------------------
-- 7. charges — histórico de cobranças
--
-- O frontend ainda não mostra extrato, mas o webhook do gateway precisa
-- de onde escrever, e o painel da conta vai querer isso.
-- ---------------------------------------------------------------------
create table if not exists public.charges (
  id                uuid primary key default gen_random_uuid(),
  subscription_id   uuid not null references public.subscriptions (id) on delete cascade,
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  amount_brl        numeric(10,2) not null check (amount_brl >= 0),
  method            public.payment_method_t not null,
  status            public.charge_status_t  not null default 'pendente',
  due_at            timestamptz not null,
  paid_at           timestamptz,
  gateway_charge_id text unique,
  pix_copy_paste    text,
  boleto_barcode    text,
  boleto_pdf_url    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- idem: uma cobrança paga e depois estornada continua com paid_at
  constraint charges_paid_ck check (status <> 'paga' or paid_at is not null)
);

create index if not exists charges_profile_idx  on public.charges (profile_id, due_at desc);
create index if not exists charges_pending_idx  on public.charges (due_at) where status = 'pendente';


-- ---------------------------------------------------------------------
-- 8. contact_messages — formulário de /contato
--
-- Os CHECKs repetem a validação que o frontend já faz (nome com pelo
-- menos 3 caracteres, mensagem com pelo menos 15). Validação de cliente
-- é conveniência; a que vale é esta.
-- ---------------------------------------------------------------------
create table if not exists public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text   not null check (length(btrim(name)) between 3 and 120),
  email      text   not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  role       public.contact_role_t not null,
  message    text   not null check (length(btrim(message)) between 15 and 5000),
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_pending_idx
  on public.contact_messages (created_at desc) where not handled;


-- ---------------------------------------------------------------------
-- 9. app_releases — substitui o DOWNLOADS com '#' de api.ts
-- ---------------------------------------------------------------------
create table if not exists public.app_releases (
  id           uuid primary key default gen_random_uuid(),
  os           public.release_os_t not null,
  version      text not null,
  download_url text not null,
  notes        text,
  is_current   boolean not null default true,
  published_at timestamptz not null default now()
);

create unique index if not exists app_releases_current_uk
  on public.app_releases (os) where is_current;


-- ---------------------------------------------------------------------
-- 10. updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'plans', 'profiles', 'beneficiaries', 'subscriptions', 'payment_methods', 'charges'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 11. Criação do perfil junto com o usuário
--
-- Dispara no signUp. Só grava o que é inofensivo (nome e e-mail): o
-- resto do cadastro entra depois, por complete_registration, porque
-- raw_user_meta_data é escrito pelo próprio cliente e vai parar dentro
-- do JWT — não é lugar para CPF nem para condição de saúde.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, buyer_name, email, newsletter)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'buyer_name'), ''),
      split_part(new.email, '@', 1)
    ),
    lower(new.email),
    coalesce((new.raw_user_meta_data ->> 'newsletter')::boolean, false)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- 12. Funções chamadas pelo site (RPC)
--
-- Estado de cobrança não pode ser escrito direto pelo cliente, senão
-- qualquer um com a chave anônima marcaria a própria assinatura como
-- paga. Por isso as tabelas de assinatura e pagamento são somente
-- leitura na RLS, e toda mudança passa por estas funções.
-- ---------------------------------------------------------------------

-- 12.1 Fecha o cadastro e abre o período de avaliação.
--      Chamada depois do signUp, com o usuário já autenticado.
create or replace function public.complete_registration(
  p_phone           text,
  p_document        text,
  p_user_name       text,
  p_relation        public.relation_t,
  p_condition       public.condition_t,
  p_os              public.os_t,
  p_prescriber_name text    default null,
  p_prescriber_role text    default null,
  p_newsletter      boolean default false,
  p_plan_id         text    default 'completo'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_plan public.plans%rowtype;
  v_sub  uuid;
  v_doc  text;
begin
  if v_uid is null then
    raise exception 'complete_registration: é preciso estar autenticado'
      using errcode = '28000';
  end if;

  select * into v_plan from public.plans where id = p_plan_id and active;
  if not found then
    raise exception 'complete_registration: plano % não existe ou está inativo', p_plan_id
      using errcode = '22023';
  end if;

  v_doc := nullif(regexp_replace(coalesce(p_document, ''), '\D', '', 'g'), '');

  update public.profiles
     set phone      = p_phone,
         document   = v_doc,
         newsletter = p_newsletter
   where id = v_uid;

  insert into public.beneficiaries
    (profile_id, user_name, relation, condition, os, prescriber_name, prescriber_role)
  values
    (v_uid, p_user_name, p_relation, p_condition, p_os,
     nullif(btrim(p_prescriber_name), ''), nullif(btrim(p_prescriber_role), ''))
  on conflict (profile_id) do update
    set user_name       = excluded.user_name,
        relation        = excluded.relation,
        condition       = excluded.condition,
        os              = excluded.os,
        prescriber_name = excluded.prescriber_name,
        prescriber_role = excluded.prescriber_role;

  insert into public.subscriptions
    (profile_id, plan_id, status, price_brl, trial_ends_at, next_charge_at)
  values
    (v_uid, v_plan.id, 'avaliacao', v_plan.price_brl,
     now() + make_interval(days => v_plan.trial_days),
     now() + make_interval(days => v_plan.trial_days))
  on conflict do nothing
  returning id into v_sub;

  -- já existia uma assinatura viva: devolve ela em vez de estourar
  if v_sub is null then
    select id into v_sub
      from public.subscriptions
     where profile_id = v_uid and status <> 'encerrada'
     limit 1;
  end if;

  return v_sub;
end;
$$;


-- 12.2 Guarda a forma de pagamento escolhida no checkout.
--      p_gateway_token é o token devolvido pelo SDK no navegador.
create or replace function public.attach_payment_method(
  p_method           public.payment_method_t,
  p_billing_interval public.billing_interval_t default 'mensal',
  p_card_last4       text default null,
  p_card_brand       text default null,
  p_holder           text default null,
  p_gateway_token    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'attach_payment_method: é preciso estar autenticado'
      using errcode = '28000';
  end if;

  -- rede de proteção: se algum dia o frontend mandar o cartão inteiro
  -- por engano, a chamada falha aqui em vez de gravar
  if p_card_last4 is not null and p_card_last4 !~ '^[0-9]{4}$' then
    raise exception 'attach_payment_method: card_last4 deve ter exatamente 4 dígitos'
      using errcode = '22023';
  end if;

  update public.payment_methods
     set is_default = false
   where profile_id = v_uid and is_default;

  insert into public.payment_methods
    (profile_id, method, billing_interval, card_last4, card_brand, holder, gateway_token, is_default)
  values
    (v_uid, p_method, p_billing_interval,
     case when p_method = 'cartao' then p_card_last4 end,
     case when p_method = 'cartao' then coalesce(p_card_brand, 'Cartão') end,
     nullif(btrim(p_holder), ''), p_gateway_token, true)
  returning id into v_id;

  return v_id;
end;
$$;


-- 12.3 Cancelamento pedido pelo painel da conta.
create or replace function public.request_cancellation()
returns public.subscription_status_t
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_status public.subscription_status_t;
begin
  if v_uid is null then
    raise exception 'request_cancellation: é preciso estar autenticado'
      using errcode = '28000';
  end if;

  update public.subscriptions
     set status      = 'cancelada',
         canceled_at = now()
   where profile_id = v_uid
     and status in ('avaliacao', 'ativa', 'inadimplente')
  returning status into v_status;

  if v_status is null then
    raise exception 'request_cancellation: nenhuma assinatura ativa para cancelar'
      using errcode = 'P0002';
  end if;

  return v_status;
end;
$$;


-- 12.4 Reativação. Espelha a regra que o frontend já usa: volta para
--      'ativa' se houver forma de pagamento, senão para 'avaliacao'.
create or replace function public.reactivate_subscription()
returns public.subscription_status_t
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_has_pm boolean;
  v_status public.subscription_status_t;
begin
  if v_uid is null then
    raise exception 'reactivate_subscription: é preciso estar autenticado'
      using errcode = '28000';
  end if;

  select exists (
    select 1 from public.payment_methods where profile_id = v_uid and is_default
  ) into v_has_pm;

  update public.subscriptions
     set status      = case when v_has_pm then 'ativa' else 'avaliacao' end,
         canceled_at = null
   where profile_id = v_uid
     and status = 'cancelada'
  returning status into v_status;

  if v_status is null then
    raise exception 'reactivate_subscription: nenhuma assinatura cancelada para reativar'
      using errcode = 'P0002';
  end if;

  return v_status;
end;
$$;


-- ---------------------------------------------------------------------
-- 13. my_account — a leitura que o painel faz
--
-- security_invoker faz a view rodar com as permissões de quem consulta,
-- então a RLS das tabelas de baixo continua valendo. Sem isso, a view
-- devolveria a base inteira para qualquer usuário logado.
-- ---------------------------------------------------------------------
create or replace view public.my_account
with (security_invoker = true) as
select
  s.id             as subscription_id,
  p.id             as profile_id,
  p.buyer_name,
  p.email,
  p.phone,
  p.document,
  p.newsletter,
  b.user_name,
  b.relation,
  b.condition,
  b.os,
  b.prescriber_name,
  b.prescriber_role,
  s.status,
  s.plan_id,
  s.price_brl,
  s.trial_ends_at,
  s.next_charge_at,
  s.canceled_at,
  s.created_at,
  pm.method           as payment_method,
  pm.billing_interval,
  pm.card_last4,
  pm.card_brand,
  pm.holder
from public.profiles p
join public.subscriptions s
  on s.profile_id = p.id and s.status <> 'encerrada'
left join public.beneficiaries b
  on b.profile_id = p.id
left join public.payment_methods pm
  on pm.profile_id = p.id and pm.is_default;


-- ---------------------------------------------------------------------
-- 14. Row Level Security
--
-- Sem estas políticas, a chave anônima que vai no bundle do site dá
-- acesso de leitura e escrita a tudo. Elas não são opcionais.
-- ---------------------------------------------------------------------

alter table public.plans            enable row level security;
alter table public.profiles         enable row level security;
alter table public.beneficiaries    enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.payment_methods  enable row level security;
alter table public.charges          enable row level security;
alter table public.contact_messages enable row level security;
alter table public.app_releases     enable row level security;

-- plans e app_releases: catálogo público, leitura para todo mundo
drop policy if exists plans_public_read on public.plans;
create policy plans_public_read on public.plans
  for select to anon, authenticated using (active);

drop policy if exists app_releases_public_read on public.app_releases;
create policy app_releases_public_read on public.app_releases
  for select to anon, authenticated using (is_current);

-- profiles: cada um enxerga e edita o próprio
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- beneficiaries: idem, pelo dono do perfil
drop policy if exists beneficiaries_select_own on public.beneficiaries;
create policy beneficiaries_select_own on public.beneficiaries
  for select to authenticated using (profile_id = (select auth.uid()));

drop policy if exists beneficiaries_insert_own on public.beneficiaries;
create policy beneficiaries_insert_own on public.beneficiaries
  for insert to authenticated with check (profile_id = (select auth.uid()));

drop policy if exists beneficiaries_update_own on public.beneficiaries;
create policy beneficiaries_update_own on public.beneficiaries
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- subscriptions, payment_methods e charges: leitura apenas.
-- Escrita só pelas funções da seção 12 ou pelo service_role (webhook).
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (profile_id = (select auth.uid()));

drop policy if exists payment_methods_select_own on public.payment_methods;
create policy payment_methods_select_own on public.payment_methods
  for select to authenticated using (profile_id = (select auth.uid()));

drop policy if exists payment_methods_delete_own on public.payment_methods;
create policy payment_methods_delete_own on public.payment_methods
  for delete to authenticated using (profile_id = (select auth.uid()));

drop policy if exists charges_select_own on public.charges;
create policy charges_select_own on public.charges
  for select to authenticated using (profile_id = (select auth.uid()));

-- contact_messages: qualquer visitante escreve, ninguém lê pelo site.
-- A caixa de entrada é o painel do Supabase, que roda como service_role.
drop policy if exists contact_messages_insert_any on public.contact_messages;
create policy contact_messages_insert_any on public.contact_messages
  for insert to anon, authenticated with check (true);


-- ---------------------------------------------------------------------
-- 15. Permissões
--
-- As funções são security definer: quem pode executar precisa ser dito
-- na mão, e o public genérico fica de fora.
-- ---------------------------------------------------------------------
revoke all on function public.complete_registration(
  text, text, text, public.relation_t, public.condition_t, public.os_t,
  text, text, boolean, text) from public;
grant execute on function public.complete_registration(
  text, text, text, public.relation_t, public.condition_t, public.os_t,
  text, text, boolean, text) to authenticated;

revoke all on function public.attach_payment_method(
  public.payment_method_t, public.billing_interval_t, text, text, text, text) from public;
grant execute on function public.attach_payment_method(
  public.payment_method_t, public.billing_interval_t, text, text, text, text) to authenticated;

revoke all on function public.request_cancellation() from public;
grant execute on function public.request_cancellation() to authenticated;

revoke all on function public.reactivate_subscription() from public;
grant execute on function public.reactivate_subscription() to authenticated;

grant select on public.my_account to authenticated;


-- ---------------------------------------------------------------------
-- 16. Instaladores
--
-- Troque as URLs quando o build do Electron estiver publicado. Enquanto
-- estiverem em '#', o site mostra os botões de download sem destino,
-- exatamente como hoje.
-- ---------------------------------------------------------------------
insert into public.app_releases (os, version, download_url, is_current)
values
  ('windows', '0.1.0', '#', true),
  ('macos',   '0.1.0', '#', true),
  ('linux',   '0.1.0', '#', true)
on conflict do nothing;

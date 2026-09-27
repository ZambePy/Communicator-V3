-- =====================================================================
-- IrisFlow — confirmação do cadastro por código de 4 dígitos
--
-- O e-mail de confirmação (supabase/templates/confirmacao.html) mostra os
-- 4 primeiros dígitos do código de 6 que o Supabase Auth gera para cada
-- cadastro ({{ slice .Token 0 4 }}); o botão com o link continua lá, como
-- alternativa. O Auth só aceita códigos de 6 a 10 dígitos, então os 4 da
-- tela são conferidos aqui:
--
--   * o Auth guarda em auth.users.confirmation_token o hash
--     sha224(e-mail + código), em hexadecimal — o mesmo {{ .TokenHash }} do
--     link (com o prefixo "pkce_" quando o cadastro usa o fluxo PKCE);
--   * confirmar_codigo(e-mail, 4 dígitos) testa as 100 terminações possíveis
--     e, se uma delas bate, devolve esse hash;
--   * o site troca o hash por uma sessão com verifyOtp({ token_hash, type:
--     'email' }), exatamente como já faz com o link. Quem valida prazo e uso
--     único continua sendo o próprio Auth.
--
-- Contra tentativa e erro: 10 códigos errados por e-mail em 24 horas; depois
-- disso, o código fica bloqueado até o dia seguinte (o link do e-mail
-- continua valendo). Com 10 mil combinações, a chance de acertar no chute é
-- de 0,1 % por dia. A resposta é a mesma para "código errado" e para "e-mail
-- sem cadastro pendente", para não revelar quem tem conta.
--
-- Pré-requisito: "Email OTP Length" = 6 no painel (Authentication → Sign In /
-- Providers → Email), que é o padrão do Supabase.
-- =====================================================================

create table if not exists public.tentativas_de_codigo (
  email       text primary key,
  erros       integer     not null default 0,
  desde       timestamptz not null default now(),
  bloqueio_ate timestamptz
);

comment on table public.tentativas_de_codigo is
  'Códigos de confirmação errados por e-mail (confirmar_codigo). Só a função escreve aqui.';

-- Ninguém lê nem escreve direto: só a função security definer abaixo.
alter table public.tentativas_de_codigo enable row level security;
revoke all on public.tentativas_de_codigo from public, anon, authenticated;
grant all on public.tentativas_de_codigo to service_role;

create or replace function public.confirmar_codigo(p_email text, p_codigo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_hash   text;
  v_erros  integer;
  v_desde  timestamptz;
  v_bloq   timestamptz;
  v_tenta  text;
  s        integer;
begin
  if v_email = '' or coalesce(p_codigo, '') !~ '^[0-9]{4}$' then
    raise exception 'confirmar_codigo: informe o e-mail e os 4 dígitos' using errcode = '22023';
  end if;

  -- Faxina: tentativas de mais de um dia não contam mais.
  delete from public.tentativas_de_codigo where desde < now() - interval '1 day';

  select erros, desde, bloqueio_ate into v_erros, v_desde, v_bloq
    from public.tentativas_de_codigo
   where email = v_email
   for update;

  if v_bloq is not null and v_bloq > now() then
    raise exception 'confirmar_codigo: muitas tentativas' using errcode = 'P0429';
  end if;

  select u.confirmation_token into v_hash
    from auth.users u
   where u.email = v_email  -- o Auth guarda o e-mail em minúsculas
     and u.email_confirmed_at is null
     and coalesce(u.confirmation_token, '') <> ''
   order by u.confirmation_sent_at desc nulls last
   limit 1;

  if v_hash is not null then
    for s in 0..99 loop
      v_tenta := encode(digest(v_email || p_codigo || lpad(s::text, 2, '0'), 'sha224'), 'hex');
      if v_hash = v_tenta or v_hash = 'pkce_' || v_tenta then
        delete from public.tentativas_de_codigo where email = v_email;
        return v_hash;
      end if;
    end loop;
  end if;

  -- Errou (ou não há cadastro esperando confirmação com este e-mail).
  insert into public.tentativas_de_codigo as t (email, erros, desde)
  values (v_email, 1, now())
  on conflict (email) do update
     set erros = t.erros + 1,
         bloqueio_ate = case when t.erros + 1 >= 10 then t.desde + interval '1 day' else null end;

  return null;
end;
$$;

comment on function public.confirmar_codigo(text, text) is
  'Confere os 4 dígitos do e-mail de confirmação e devolve o token_hash para verifyOtp (ou null).';

revoke all on function public.confirmar_codigo(text, text) from public;
grant execute on function public.confirmar_codigo(text, text) to anon, authenticated;

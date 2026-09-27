-- =====================================================================
-- IrisFlow — perfil: o cliente só grava nome, telefone e novidades; e o
-- cadastro no Auth nunca cai por causa do perfil
--
-- Revisão do banco de 27/09/2026 (auditoria DB-1 e o mesmo defeito por
-- outros caminhos). Idempotente.
--
-- O problema. `profiles.email` e `profiles.document` são únicos, e o Supabase
-- dá a `authenticated` UPDATE em TODAS as colunas das tabelas de `public`; a
-- política `profiles_update_own` limita a linha, não a coluna. Com a chave
-- pública e o próprio login, qualquer conta:
--   • descobria se um e-mail ou um CPF tinha conta (o erro 23505 respondia
--     "sim"), justamente o que o site esconde no cadastro e no "esqueci a senha";
--   • ocupava no próprio perfil o e-mail de outra pessoa — e o cadastro real
--     dela falhava, porque handle_new_user() estourava na unicidade do e-mail
--     ("Database error saving new user" no Auth).
-- O mesmo travamento acontecia sem atacante nenhum: a troca de e-mail no Auth
-- (`updateUser({ email })` pela API, ou pelo painel) não chegava a `profiles`;
-- o /perfil mostrava o e-mail velho e ninguém mais conseguia se cadastrar com
-- ele. E um metadado `newsletter` que não fosse booleano ("sim") derrubava o
-- cadastro no cast.
--
-- O que muda:
--   1. UPDATE de `profiles` pelo cliente só em buyer_name, phone e newsletter —
--      exatamente o que o /perfil do site edita (o app só lê; o desktop não
--      toca). E-mail, CPF e datas mudam só pelas RPCs (security definer) e pelo
--      servidor. A política profiles_update_own continua igual.
--   2. liberar_email_de_perfis(): o e-mail do LOGIN (auth.users) é a fonte da
--      verdade. Um perfil que guarda um e-mail que não é mais o do próprio
--      login (cópia velha) devolve-o e volta para o do login — ou, se esse
--      também estiver ocupado, para um marcador único que nunca é entregue
--      (<id>@perfil-sem-email.invalid; ".invalid" é reservado, RFC 2606).
--   3. handle_new_user() libera o e-mail antes de criar o perfil, lê
--      `newsletter` sem cast que possa falhar e, se mesmo assim a unicidade
--      estourar (corrida, ou conta SSO com o mesmo e-mail — o projeto não usa
--      SSO), registra um aviso no log e deixa o cadastro no Auth seguir, em vez
--      de derrubá-lo. O CPF não entra aqui (só nas RPCs, com sessão).
--   4. Gatilho novo em auth.users: trocou o e-mail do login, o perfil acompanha.
--   5. Uma passada única alinha os perfis que já estejam com e-mail velho
--      (troca antiga no Auth, ou gravado pelo cliente antes desta migração).
--
-- Clientes: nenhum muda. O site grava só as três colunas liberadas (todas as
-- versões no histórico do git); o app e o desktop não escrevem em `profiles`.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. O que o cliente pode escrever em profiles
--
-- REVOKE no nível da tabela também tira os grants de coluna; o GRANT logo
-- depois os refaz — por isso rodar de novo dá o mesmo resultado. O gatilho
-- set_updated_at continua carimbando updated_at (gatilho não depende do
-- privilégio de quem fez o UPDATE).
-- ---------------------------------------------------------------------
revoke update on public.profiles from anon, authenticated;
grant update (buyer_name, phone, newsletter) on public.profiles to authenticated;


-- ---------------------------------------------------------------------
-- 2. liberar_email_de_perfis(e-mail, dono)
--
-- Tira `p_email` de qualquer perfil que não seja `p_dono` e que só o tenha
-- como cópia velha. Quem ainda usa esse e-mail no próprio login é dono
-- legítimo e não é tocado (aí quem chama recebe o 23505 e decide).
-- Uso interno dos gatilhos; ninguém chama pela API.
-- ---------------------------------------------------------------------
create or replace function public.liberar_email_de_perfis(p_email text, p_dono uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r       record;
  v_email text;
begin
  for r in
    select p.id, lower(btrim(u.email)) as login
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.email = p_email
       and p.id is distinct from p_dono
       for update of p
  loop
    continue when r.login = p_email;

    v_email := nullif(r.login, '');
    if v_email is null
       or exists (select 1 from public.profiles q where q.email = v_email and q.id <> r.id) then
      v_email := r.id::text || '@perfil-sem-email.invalid';
    end if;

    update public.profiles set email = v_email where id = r.id;
  end loop;
end;
$$;

revoke all on function public.liberar_email_de_perfis(text, uuid) from public, anon, authenticated;

comment on function public.liberar_email_de_perfis(text, uuid) is
  'Tira o e-mail de perfis que só o guardam como cópia velha (o login deles é outro): voltam para o e-mail do próprio login, ou para <id>@perfil-sem-email.invalid. Uso interno de handle_new_user e sincronizar_email_do_perfil.';


-- ---------------------------------------------------------------------
-- 3. handle_new_user() — o perfil nasce com o usuário, sem nunca derrubá-lo
--
-- Continua gravando só o que é inofensivo (nome e e-mail): o resto do
-- cadastro entra pelas RPCs, com sessão (raw_user_meta_data é escrito pelo
-- próprio cliente e viaja no JWT).
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text  := lower(btrim(new.email));
  v_meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- Sem e-mail (login anônimo ou por telefone, desligados neste projeto) não
  -- há perfil possível: profiles.email é obrigatório.
  if coalesce(v_email, '') = '' then
    return new;
  end if;

  begin
    perform public.liberar_email_de_perfis(v_email, new.id);

    insert into public.profiles (id, buyer_name, email, newsletter)
    values (
      new.id,
      coalesce(
        nullif(btrim(v_meta ->> 'buyer_name'), ''),
        nullif(split_part(v_email, '@', 1), ''),
        'Cliente IrisFlow'
      ),
      v_email,
      -- Só os valores que o cast de boolean aceitaria como verdadeiro; qualquer
      -- outra coisa ("sim", número, objeto) é false em vez de erro.
      lower(btrim(coalesce(v_meta ->> 'newsletter', ''))) in ('true', 't', 'yes', 'y', 'on', '1')
    )
    on conflict (id) do nothing;
  exception when unique_violation then
    -- O cadastro no Auth segue. Sem perfil, a pesquisa da beta falha depois
    -- (FK de beneficiaries) e a equipe vê o aviso abaixo no log do Postgres.
    raise warning 'handle_new_user: perfil do usuário % não criado (o e-mail já está no perfil de outro login)', new.id;
  end;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Trocou o e-mail do login, o perfil acompanha
--
-- AFTER UPDATE OF email: só quando o comando mexe na coluna e o valor muda
-- de fato. Nunca derruba a troca feita pelo Auth: se o e-mail novo estiver
-- no perfil de outro login ativo, o perfil fica como estava e o aviso vai
-- para o log. (A conta de teste pública não troca de e-mail: o gatilho
-- proteger_conta_de_teste recusa antes.)
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_email_do_perfil()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(new.email));
begin
  if coalesce(v_email, '') = '' then
    return null;
  end if;

  begin
    perform public.liberar_email_de_perfis(v_email, new.id);
    update public.profiles
       set email = v_email
     where id = new.id
       and email is distinct from v_email;
  exception when unique_violation then
    raise warning 'sincronizar_email_do_perfil: o perfil % manteve o e-mail anterior (o novo está no perfil de outro login)', new.id;
  end;

  return null;
end;
$$;

revoke all on function public.sincronizar_email_do_perfil() from public, anon, authenticated;

drop trigger if exists sincronizar_email_do_perfil on auth.users;
create trigger sincronizar_email_do_perfil
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sincronizar_email_do_perfil();

comment on function public.sincronizar_email_do_perfil() is
  'Gatilho em auth.users: quando o e-mail do login muda, profiles.email acompanha (liberando-o de cópias velhas antes).';


-- ---------------------------------------------------------------------
-- 5. Alinhamento único dos perfis que já estejam com e-mail velho
--
-- Na segunda execução não encontra nada. Cada perfil é tratado à parte: um
-- caso que não se resolve fica como estava (aviso no log) sem impedir os
-- outros nem a migração.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.id, lower(btrim(u.email)) as login
      from public.profiles p
      join auth.users u on u.id = p.id
     where coalesce(btrim(u.email), '') <> ''
       and p.email is distinct from lower(btrim(u.email))
  loop
    begin
      perform public.liberar_email_de_perfis(r.login, r.id);
      update public.profiles set email = r.login where id = r.id;
    exception when unique_violation then
      raise warning 'alinhamento de e-mail: o perfil % ficou como estava', r.id;
    end;
  end loop;
end $$;

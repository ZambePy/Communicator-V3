-- =====================================================================
-- IrisFlow — a conta de teste pública não pode ter senha nem e-mail trocados
--
-- AINDA NÃO APLICADA EM PRODUÇÃO (23/09/2026): a aplicação pelo assistente foi
-- barrada pela checagem de permissões. Aplique com `supabase db push` (a versão
-- do nome já está depois da última registrada no projeto) ou colando este
-- arquivo no SQL Editor — é idempotente. Ordem: 150000 → 150100 → 150200.
--
-- A conta admin@irisflow.com / irisflow2026 (supabase/seed.sql) é pública de
-- propósito: está no README e nos apps, e o repositório é público. Qualquer
-- pessoa que entrasse com ela podia trocar a senha em /nova-senha (ou o
-- e-mail, pela API) e tirar a conta de todo mundo que testa. Este gatilho
-- recusa, SÓ para essa conta, qualquer UPDATE em auth.users que mude a senha
-- ou o e-mail. O resto que o Auth grava na linha (último login, tokens de
-- confirmação/recuperação, updated_at) continua passando — entrar e sair
-- funcionam normalmente.
--
-- Para a equipe trocar a senha dessa conta de propósito (SQL Editor):
--
--   begin;
--   set local irisflow.liberar_conta_de_teste = 'on';
--   update auth.users
--      set encrypted_password = extensions.crypt('NOVA-SENHA', extensions.gen_salt('bf'))
--    where email = 'admin@irisflow.com';
--   commit;
--
-- (e troque também em frontend/src/services/license/mockLicenseService.ts e
-- app/src/lib/config.ts). Pelo painel (Authentication > Users) a troca é
-- recusada enquanto o gatilho existir; APAGAR o usuário pelo painel continua
-- possível (é DELETE, não UPDATE). Antes do lançamento comercial, apague a
-- conta e depois o gatilho:
--   drop trigger if exists proteger_conta_de_teste on auth.users;
--   drop function if exists public.proteger_conta_de_teste();
-- Idempotente.
-- =====================================================================

create or replace function public.proteger_conta_de_teste()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('irisflow.liberar_conta_de_teste', true), '') = 'on' then
    return new;
  end if;
  if new.encrypted_password is distinct from old.encrypted_password
     or lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, '')) then
    raise exception 'A conta de teste pública (admin@irisflow.com) não pode ter a senha ou o e-mail alterados.'
      using errcode = '42501',
            hint = 'É uma conta compartilhada. Para testar a troca de senha, crie a sua própria conta em /beta.';
  end if;
  return new;
end;
$$;

revoke all on function public.proteger_conta_de_teste() from public, anon, authenticated;

comment on function public.proteger_conta_de_teste() is
  'Gatilho em auth.users: recusa trocar senha ou e-mail da conta de teste pública admin@irisflow.com (liberável com set local irisflow.liberar_conta_de_teste = on).';

drop trigger if exists proteger_conta_de_teste on auth.users;
create trigger proteger_conta_de_teste
  before update on auth.users
  for each row
  when (lower(old.email) = 'admin@irisflow.com')
  execute function public.proteger_conta_de_teste();

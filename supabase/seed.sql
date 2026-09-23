-- =====================================================================
-- IrisFlow — conta de teste padrão da beta
--
--   e-mail: admin@irisflow.com
--   senha:  irisflow2026
--
-- A mesma credencial vale no site (/entrar), no app desktop e no app do
-- cuidador — é uma conta REAL do Supabase, não um modo de demonstração:
-- nasce vazia (sem sessões, conversas ou alertas fabricados), com a
-- inscrição na beta ativa e um paciente vinculado, exatamente como fica a
-- conta de quem se inscreve pelo site.
--
-- Idempotente: rodar de novo não duplica nada nem troca a senha de uma
-- conta que já existe. A senha e o e-mail desta conta são protegidos por um
-- gatilho (migração 20260923150200_conta_de_teste_protegida.sql): a conta é pública, e
-- sem ele qualquer pessoa que entrasse podia trocar a senha e trancar os
-- outros. Para a equipe trocar a senha de propósito, siga o SQL do cabeçalho
-- daquela migração — e troque também em
-- frontend/src/services/license/mockLicenseService.ts (LOGIN_PADRAO) e em
-- app/src/lib/config.ts (CONTA_DE_TESTE).
--
-- Onde rodar: Supabase > SQL Editor (como postgres). `supabase db reset`
-- também roda este arquivo automaticamente no banco local (é o caminho
-- padrão do CLI; `supabase db push` NÃO roda seed no projeto remoto).
--
-- ⚠ Antes do lançamento comercial: apague esta conta. No app do cuidador
-- ela só preenche o login em builds de desenvolvimento (__DEV__, ver
-- CONTA_DE_TESTE em app/src/lib/config.ts); em build de produção os campos
-- vêm vazios. Detalhes no README da raiz, seção "Supabase (supabase/)".
-- =====================================================================

do $$
declare
  v_email text := 'admin@irisflow.com';
  v_uid   uuid;
  v_ben   uuid;
  v_fim   timestamptz;
begin
  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is null then
    v_uid := gen_random_uuid();

    -- As colunas de token precisam ser '' (e não NULL): o GoTrue lê como
    -- string e recusa o login com "converting NULL to string is unsupported".
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, extensions.crypt('irisflow2026', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"buyer_name":"Equipe IrisFlow"}'::jsonb,
      now(), now(),
      '', '', '', '', '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid, v_uid::text, 'email',
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      now(), now(), now()
    );
  end if;

  -- Perfil: o gatilho handle_new_user já criou; garante o nome.
  insert into public.profiles (id, buyer_name, email, newsletter)
  values (v_uid, 'Equipe IrisFlow', v_email, false)
  on conflict (id) do update set buyer_name = excluded.buyer_name;

  -- Paciente vinculado (um por conta).
  insert into public.beneficiaries (profile_id, user_name, relation, condition, os)
  values (v_uid, 'Paciente IrisFlow', 'cuidador', 'prefiro-nao', 'windows')
  on conflict (profile_id) do nothing;
  select id into v_ben from public.beneficiaries where profile_id = v_uid;

  -- Inscrição na beta: assinatura 'ativa' sem cobrança até o fim do programa.
  select coalesce((select ends_at from public.beta_program where id = 1), '2027-03-31 23:59:59-03')
    into v_fim;
  if not exists (select 1 from public.subscriptions where profile_id = v_uid and status <> 'encerrada') then
    insert into public.subscriptions (profile_id, plan_id, status, price_brl, trial_ends_at, next_charge_at)
    values (v_uid, 'beta', 'ativa', 0, now(), v_fim);
  end if;

  insert into public.beta_registrations (profile_id, os, wants_caregiver_app, feedback_consent)
  values (v_uid, 'windows', true, true)
  on conflict (profile_id) do nothing;

  -- Ajustes remotos: só o prazo de emergência padrão; o resto fica NULL
  -- ("o cuidador nunca definiu"), como numa conta nova.
  insert into public.patient_settings (beneficiary_id)
  values (v_ben)
  on conflict (beneficiary_id) do nothing;
end
$$;

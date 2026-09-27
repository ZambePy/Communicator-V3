-- =====================================================================
-- IrisFlow — código de confirmação: contador travado antes de conferir e
-- custo igual para qualquer e-mail
--
-- Revisão do banco de 27/09/2026 (observação da auditoria do site sobre a
-- primeira rajada, e DB-6). Idempotente. Mesma assinatura e mesma resposta
-- da função de 20260927014237_codigo_de_confirmacao.
--
-- 1. Corrida da primeira rajada. O `select … for update` do contador não
--    trava linha que ainda não existe: pedidos simultâneos antes do primeiro
--    erro conferiam todos os seus palpites antes de o contador nascer. Os
--    10 palpites por dia viravam "o tamanho do pool de conexões + 10" — e o
--    acerto devolve o token_hash, que abre a sessão de um cadastro ainda não
--    confirmado. Agora a linha (0 erros) é criada e travada ANTES da
--    conferência: pedidos do mesmo e-mail passam um de cada vez.
--
-- 2. Custo igual (DB-6). Com cadastro pendente a função calculava até 100
--    hashes; sem, nenhum — o tempo distinguia um do outro (~0,1 ms, pouco
--    explorável pela rede, mas contra o que a função promete). Agora as 100
--    terminações são sempre calculadas.
-- =====================================================================

create or replace function public.confirmar_codigo(p_email text, p_codigo text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_email  text := lower(trim(coalesce(p_email, '')));
  v_hash   text;
  v_achou  text;
  v_bloq   timestamptz;
  v_tenta  text;
  s        integer;
begin
  if v_email = '' or coalesce(p_codigo, '') !~ '^[0-9]{4}$' then
    raise exception 'confirmar_codigo: informe o e-mail e os 4 dígitos' using errcode = '22023';
  end if;

  -- Faxina: tentativas de mais de um dia não contam mais.
  delete from public.tentativas_de_codigo where desde < now() - interval '1 day';

  -- O contador existe (e fica travado) antes de qualquer conferência.
  insert into public.tentativas_de_codigo (email, erros, desde)
  values (v_email, 0, now())
  on conflict (email) do nothing;

  select bloqueio_ate into v_bloq
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

  -- Sempre as 100 terminações, com ou sem cadastro pendente.
  for s in 0..99 loop
    v_tenta := encode(digest(v_email || p_codigo || lpad(s::text, 2, '0'), 'sha224'), 'hex');
    if v_achou is null and v_hash is not null and (v_hash = v_tenta or v_hash = 'pkce_' || v_tenta) then
      v_achou := v_hash;
    end if;
  end loop;

  if v_achou is not null then
    delete from public.tentativas_de_codigo where email = v_email;
    return v_achou;
  end if;

  -- Errou (ou não há cadastro esperando confirmação com este e-mail).
  update public.tentativas_de_codigo as t
     set erros = t.erros + 1,
         bloqueio_ate = case when t.erros + 1 >= 10 then t.desde + interval '1 day' else null end
   where t.email = v_email;

  return null;
end;
$$;

comment on function public.confirmar_codigo(text, text) is
  'Confere os 4 dígitos do e-mail de confirmação e devolve o token_hash para verifyOtp (ou null). O contador de erros é travado antes da conferência.';

revoke all on function public.confirmar_codigo(text, text) from public;
grant execute on function public.confirmar_codigo(text, text) to anon, authenticated;

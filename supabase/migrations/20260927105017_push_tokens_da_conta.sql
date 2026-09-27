-- =====================================================================
-- IrisFlow — o celular recebe os alertas da conta em que está logado
--
-- Revisão do banco de 27/09/2026 (auditoria DB-3 / APP-3). Idempotente.
--
-- O problema. `push_tokens.token` é a chave (um dono por aparelho), mas a
-- política só enxerga as linhas do próprio `profile_id`. Quando um celular
-- que já esteve na conta A entra na conta B, o upsert do app (onConflict
-- token) cai no UPDATE de uma linha que B não vê, e a RLS recusa (42501): o
-- token continua na conta A. Resultado: B não recebe socorro com o app
-- fechado, e o aparelho segue recebendo os socorros de A — com o nome do
-- paciente de outra família. O mesmo acontecia quando o "sair" não apagava o
-- token (sem rede, ou sessão encerrada pelo servidor).
--
-- O que muda:
--   • registrar_push_token(token, plataforma): o aparelho passa a pertencer
--     a quem está logado nele (a função é dona da tabela e faz a troca com
--     segurança; o cliente continua sem ver tokens alheios);
--   • remover_push_token(token): apaga o token, se for da conta logada.
--   • A política atual fica: apps antigos continuam funcionando como antes.
-- =====================================================================

create or replace function public.registrar_push_token(p_token text, p_platform text default 'expo')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_token text := btrim(coalesce(p_token, ''));
begin
  if v_uid is null then
    raise exception 'registrar_push_token: é preciso estar autenticado' using errcode = '28000';
  end if;
  if v_token = '' or length(v_token) > 400 then
    raise exception 'registrar_push_token: token inválido' using errcode = '22023';
  end if;

  insert into public.push_tokens (token, profile_id, platform)
  values (v_token, v_uid, coalesce(nullif(btrim(p_platform), ''), 'expo'))
  on conflict (token) do update
     set profile_id = excluded.profile_id,
         platform   = excluded.platform,
         created_at = case
                        when public.push_tokens.profile_id = excluded.profile_id
                          then public.push_tokens.created_at
                        else now()
                      end;
end;
$$;

revoke all on function public.registrar_push_token(text, text) from public, anon;
grant execute on function public.registrar_push_token(text, text) to authenticated;

comment on function public.registrar_push_token(text, text) is
  'Registra o token de push do celular na conta logada, tirando-o de outra conta se preciso (o aparelho recebe os alertas de quem está logado nele).';

create or replace function public.remover_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'remover_push_token: é preciso estar autenticado' using errcode = '28000';
  end if;
  delete from public.push_tokens
   where token = btrim(coalesce(p_token, ''))
     and profile_id = auth.uid();
end;
$$;

revoke all on function public.remover_push_token(text) from public, anon;
grant execute on function public.remover_push_token(text) to authenticated;

comment on function public.remover_push_token(text) is
  'Apaga o token de push do celular, se for da conta logada (ao sair da conta).';

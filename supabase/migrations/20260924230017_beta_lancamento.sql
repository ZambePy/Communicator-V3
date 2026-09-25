-- =====================================================================
-- IrisFlow — data de lançamento da beta
--
-- A inscrição (conta, confirmação do e-mail e pesquisa rápida) funciona
-- desde já; o DOWNLOAD só abre em `launch_at`. O site (/beta, /perfil e a
-- vitrine da página Solução) lê esta coluna sem login e, antes da data,
-- mostra os botões travados com o dia do lançamento. Depois dela, eles
-- liberam sozinhos: adiantar ou adiar é um UPDATE, sem novo deploy.
--
--   update public.beta_program set launch_at = '2026-11-10 00:00:00-03' where id = 1;
--
-- Idempotente. Não muda nada para quem já lê a tabela pelas colunas antigas.
-- =====================================================================

alter table public.beta_program
  add column if not exists launch_at timestamptz not null default '2026-11-10 00:00:00-03';

comment on column public.beta_program.launch_at is
  'Quando o download da beta é liberado no site. Antes disso a inscrição funciona e os botões mostram a data.';

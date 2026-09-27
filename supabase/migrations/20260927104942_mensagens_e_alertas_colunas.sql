-- =====================================================================
-- IrisFlow — conversa e alertas: o app do cuidador só escreve o que é dele
--
-- Revisão do banco de 27/09/2026 (auditoria DB-2 e o mesmo defeito no
-- INSERT). Idempotente.
--
-- O problema. O Supabase dá a `authenticated` UPDATE e INSERT em TODAS as
-- colunas das tabelas de `public`; as políticas limitam a linha (o
-- beneficiário da conta), não a coluna. Com o login da conta — e a conta de
-- teste é pública —, dava para:
--   • trocar `sender`, `kind`, `text` e `created_at` de qualquer mensagem:
--     uma fala do cuidador virava "do paciente", retrodatada, e o que o
--     paciente escreveu podia ser reescrito — exatamente o que o cuidador e o
--     profissional leem nos relatórios;
--   • pôr `spoken = false` numa mensagem antiga (o computador a falava de
--     novo) e mexer em `kind`, `message` e nas datas dos pedidos de ajuda;
--   • inserir "mensagens de sistema" (kind = 'sistema') com data escolhida,
--     iguais às que o escalonamento grava ("Ninguém confirmou o pedido…").
--
-- O que muda (nenhum cliente muda):
--   • messages: o cliente só marca lida (UPDATE de read_at) e só insere
--     beneficiary_id, sender, kind e text — o resto é do servidor (created_at,
--     read_at, spoken e id vêm dos defaults); e a política de INSERT recusa
--     kind = 'sistema'. O app manda exatamente isso em todas as versões
--     (sendMessage: beneficiary_id, sender 'cuidador', kind, text; markRead:
--     read_at).
--   • help_requests: o cliente só confirma e resolve (acknowledged_at,
--     acknowledged_by, resolved_at), que é o que o app faz.
--   • O computador do paciente escreve pela Edge Function desktop-sync, com a
--     service_role: não depende destes grants. SELECT e realtime continuam.
-- =====================================================================

-- REVOKE no nível da tabela também tira os grants de coluna; os GRANTs logo
-- depois os refazem — por isso rodar de novo dá o mesmo resultado.
revoke update, insert on public.messages from anon, authenticated;
grant update (read_at) on public.messages to authenticated;
grant insert (beneficiary_id, sender, kind, text) on public.messages to authenticated;

revoke update, insert on public.help_requests from anon, authenticated;
grant update (acknowledged_at, acknowledged_by, resolved_at) on public.help_requests to authenticated;

-- O cuidador fala como cuidador e nunca como "sistema" (a política antiga só
-- exigia sender = 'cuidador').
drop policy if exists "cuidador envia messages" on public.messages;
create policy "cuidador envia messages" on public.messages for insert
  with check (
    public.is_my_beneficiary(beneficiary_id)
    and sender = 'cuidador'
    and kind <> 'sistema'
  );

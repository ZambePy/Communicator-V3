// Testes das decisões de resposta da desktop-sync.
//   deno test supabase/functions/desktop-sync/
import { strictEqual } from 'node:assert/strict';
import { idDoCliente, statusDoErroDoBanco } from './respostas.ts';

Deno.test('dado inválido e restrição violada são culpa do conteúdo: 400', () => {
  strictEqual(statusDoErroDoBanco({ code: '22P02' }), 400); // invalid_text_representation
  strictEqual(statusDoErroDoBanco({ code: '22001' }), 400); // string_data_right_truncation
  strictEqual(statusDoErroDoBanco({ code: '23505' }), 400); // unique_violation
  strictEqual(statusDoErroDoBanco({ code: '23514' }), 400); // check_violation
});

Deno.test('o resto é passageiro: 503, e o desktop tenta de novo', () => {
  strictEqual(statusDoErroDoBanco({ code: '57014' }), 503); // statement_timeout
  strictEqual(statusDoErroDoBanco({ code: '08006' }), 503); // connection_failure
  strictEqual(statusDoErroDoBanco({ code: '53300' }), 503); // too_many_connections
  strictEqual(statusDoErroDoBanco({ code: 'PGRST000' }), 503);
  strictEqual(statusDoErroDoBanco({ code: '' }), 503); // fetch failed, sem código
  strictEqual(statusDoErroDoBanco({}), 503);
  strictEqual(statusDoErroDoBanco(null), 503);
});

Deno.test('código que só começa parecido não vira 400', () => {
  strictEqual(statusDoErroDoBanco({ code: '2' }), 503);
  strictEqual(statusDoErroDoBanco({ code: '220' }), 503);
  strictEqual(statusDoErroDoBanco({ code: 'x23505' }), 503);
});

Deno.test('id do cliente: só UUID válido, normalizado em minúsculas', () => {
  strictEqual(idDoCliente('3F2504E0-4F89-41D3-9A0C-0305E82C3301'), '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
  strictEqual(idDoCliente('9b2f8c1e-6d3a-4c7b-8e1f-2a3b4c5d6e7f'), '9b2f8c1e-6d3a-4c7b-8e1f-2a3b4c5d6e7f');
  strictEqual(idDoCliente('nao-e-uuid'), null);
  strictEqual(idDoCliente('3f2504e0-4f89-41d3-9a0c-0305e82c330'), null);
  strictEqual(idDoCliente("3f2504e0-4f89-41d3-9a0c-0305e82c3301' or 1=1"), null);
  strictEqual(idDoCliente(42), null);
  strictEqual(idDoCliente(undefined), null);
});

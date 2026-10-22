// Testes do código do QR do celular (formato e hash comuns às duas funções).
//   deno test supabase/functions/desktop-sync/
import { notStrictEqual, ok, strictEqual } from 'node:assert/strict';
import { base64url, BYTES_DO_CODIGO, codigoValido, FORMATO_DO_CODIGO, gerarCodigo, hashDoCodigo, hex } from './codigoDoCelular.ts';

Deno.test('base64url: vetores da RFC 4648, sem "=", com "-" e "_" no lugar de "+" e "/"', () => {
  const t = (s: string) => base64url(new TextEncoder().encode(s));
  strictEqual(t(''), '');
  strictEqual(t('f'), 'Zg');
  strictEqual(t('fo'), 'Zm8');
  strictEqual(t('foo'), 'Zm9v');
  strictEqual(t('foob'), 'Zm9vYg');
  strictEqual(t('fooba'), 'Zm9vYmE');
  strictEqual(t('foobar'), 'Zm9vYmFy');
  // 0xfb 0xff → "+/8" no base64 comum
  strictEqual(base64url(new Uint8Array([0xfb, 0xff])), '-_8');
});

Deno.test('o código sorteado tem 32 bytes, 43 caracteres e passa no formato', () => {
  let pedidos = 0;
  const codigo = gerarCodigo((b) => {
    pedidos++;
    strictEqual(b.length, BYTES_DO_CODIGO);
    return b.fill(0xff);
  });
  strictEqual(pedidos, 1);
  strictEqual(codigo.length, 43);
  strictEqual(codigo, '_'.repeat(42) + '8');
  ok(codigoValido(codigo));
});

Deno.test('dois códigos sorteados de verdade não se repetem', () => {
  const a = gerarCodigo();
  const b = gerarCodigo();
  ok(FORMATO_DO_CODIGO.test(a) && FORMATO_DO_CODIGO.test(b));
  notStrictEqual(a, b);
});

Deno.test('formato: recusa tamanho errado, caracteres do base64 comum e o que não é texto', () => {
  const certo = 'A'.repeat(43);
  ok(codigoValido(certo));
  ok(!codigoValido('A'.repeat(42)));
  ok(!codigoValido('A'.repeat(44)));
  ok(!codigoValido('A'.repeat(42) + '+'));
  ok(!codigoValido('A'.repeat(42) + '/'));
  ok(!codigoValido('A'.repeat(42) + '='));
  ok(!codigoValido('A'.repeat(42) + ';'));
  ok(!codigoValido(' ' + 'A'.repeat(43)));
  // `;` e `#` quebrariam um link intent:// do Android se passassem.
  ok(!codigoValido('A'.repeat(20) + ';end' + 'A'.repeat(19)));
  ok(!codigoValido(undefined));
  ok(!codigoValido(null));
  ok(!codigoValido(42));
  ok(!codigoValido(['A'.repeat(43)]));
});

Deno.test('hash: SHA-256 em hexadecimal minúsculo (vetor do FIPS 180-2)', async () => {
  strictEqual(await hashDoCodigo('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const h = await hashDoCodigo(gerarCodigo());
  ok(/^[0-9a-f]{64}$/.test(h), 'o banco só aceita 64 dígitos hexadecimais');
  strictEqual(hex(new Uint8Array([0, 15, 255])), '000fff');
});

// As duas cópias do módulo do código têm de concordar: a desktop-sync sorteia e
// faz o hash; a parear-celular confere o formato e faz o mesmo hash. (Cada
// função carrega a sua cópia para poder ser publicada sozinha — ver o
// cabeçalho de ./codigoDoCelular.ts.)
//   deno test supabase/functions/parear-celular/
import { ok, strictEqual } from 'node:assert/strict';
import * as aqui from './codigoDoCelular.ts';
import * as daDesktopSync from '../desktop-sync/codigoDoCelular.ts';

Deno.test('as duas cópias: o mesmo formato e o mesmo tamanho de código', () => {
  strictEqual(aqui.FORMATO_DO_CODIGO.source, daDesktopSync.FORMATO_DO_CODIGO.source);
  strictEqual(aqui.FORMATO_DO_CODIGO.flags, daDesktopSync.FORMATO_DO_CODIGO.flags);
  strictEqual(aqui.BYTES_DO_CODIGO, daDesktopSync.BYTES_DO_CODIGO);
});

Deno.test('todo código que a desktop-sync sorteia passa aqui, com o mesmo hash', async () => {
  for (let i = 0; i < 50; i++) {
    const codigo = daDesktopSync.gerarCodigo();
    ok(aqui.codigoValido(codigo), codigo);
    strictEqual(await aqui.hashDoCodigo(codigo), await daDesktopSync.hashDoCodigo(codigo));
  }
});

Deno.test('as duas cópias: os mesmos vetores de base64url e de hash', async () => {
  const bytes = new Uint8Array([0xfb, 0xff, 0x00, 0x10, 0x7f]);
  strictEqual(aqui.base64url(bytes), daDesktopSync.base64url(bytes));
  strictEqual(aqui.hex(bytes), daDesktopSync.hex(bytes));
  strictEqual(await aqui.hashDoCodigo('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  strictEqual(await daDesktopSync.hashDoCodigo('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const fixo = (b: Uint8Array) => b.fill(0x5a);
  strictEqual(aqui.gerarCodigo(fixo), daDesktopSync.gerarCodigo(fixo));
});

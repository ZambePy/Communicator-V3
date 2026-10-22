// Código do QR que conecta o celular do cuidador sem senha (pedido do dono de
// 19/10/2026; migração 20261019200000_pareamento_do_celular).
//
// A desktop-sync (ação pairing.create) sorteia o código; a parear-celular o
// troca pela entrada na conta. O formato e o hash PRECISAM ser os mesmos nos
// dois lados — se divergissem, todo código gerado seria recusado. Este arquivo
// existe IGUAL em supabase/functions/desktop-sync/ e em
// supabase/functions/parear-celular/: cada função fica com tudo dentro da
// própria pasta, e publicar pelo painel (arquivo por arquivo) continua
// funcionando — um import de fora da pasta só funciona pelo CLI. O teste
// parear-celular/codigoDoCelular.test.ts confere que as duas cópias concordam.
//
// Módulo sem APIs do Deno (só Web Crypto, TextEncoder e btoa): importado pelas
// funções e pelos testes (`deno test supabase/functions/<pasta>/`).

/** 32 bytes sorteados = 256 bits: adivinhar um código ativo é inviável. */
export const BYTES_DO_CODIGO = 32;

/** 32 bytes em base64url, sem o "=" do fim: exatamente 43 caracteres. */
export const FORMATO_DO_CODIGO = /^[A-Za-z0-9_-]{43}$/;

/** O código tem o formato que o computador gera? (Antes de qualquer consulta ao banco.) */
export function codigoValido(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_DO_CODIGO.test(valor);
}

/** Bytes em hexadecimal minúsculo (o formato que o banco confere). */
export function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Base64 seguro para URL (RFC 4648 §5), sem preenchimento: o código vai no
 * endereço do QR e no link do app sem precisar de escape nenhum.
 */
export function base64url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Sorteia um código novo. `sortear` existe para os testes. */
export function gerarCodigo(sortear: (b: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  return base64url(sortear(new Uint8Array(BYTES_DO_CODIGO)));
}

/**
 * SHA-256 do código, em hexadecimal: é só isto que o banco guarda e compara.
 * Um hash simples basta (sem sal nem HMAC) porque o código tem 256 bits
 * sorteados — não há o que adivinhar a partir do hash.
 */
export async function hashDoCodigo(codigo: string): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codigo));
  return hex(new Uint8Array(resumo));
}

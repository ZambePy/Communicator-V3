// Decisões puras da `desktop-sync` que o desktop lê para saber o que fazer
// com um evento: reenviar depois, desistir ou considerar entregue.
//
// Módulo sem APIs do Deno: é importado pela função e pelos testes
// (`deno test supabase/functions/desktop-sync/`).

/**
 * Status HTTP de um erro do banco.
 *
 * O desktop trata 4xx (fora 401/403/429) como DEFINITIVO: não reenvia, e
 * descarta da fila offline. Por isso só é 400 o que de fato é culpa do
 * conteúdo enviado — as classes 22 (dado inválido: tipo, tamanho, formato) e
 * 23 (restrição violada) do Postgres. Todo o resto — tempo esgotado, conexão
 * caída, PostgREST fora do ar, erro sem código — é passageiro: 503, e o
 * evento fica na fila para a próxima tentativa. Antes tudo era 400, e um
 * soluço do banco na hora de um pedido de socorro fazia o desktop jogá-lo fora
 * enquanto a tela dizia "alerta enviado".
 */
export function statusDoErroDoBanco(erro: { code?: string | null } | null | undefined): 400 | 503 {
  const codigo = String(erro?.code ?? '');
  return /^2[23][0-9A-Z]{3}$/.test(codigo) ? 400 : 503;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Id gerado pelo desktop para um pedido de ajuda, se for um UUID válido.
 *
 * O mesmo pedido pode chegar duas vezes: a resposta se perde (tempo esgotado,
 * rede caindo) depois de o servidor já ter gravado, e a fila offline reenvia.
 * Com o id escolhido no computador — e mantido nos reenvios —, o segundo envio
 * encontra a linha que já existe e não vira um segundo socorro nem um
 * segundo push.
 */
export function idDoCliente(valor: unknown): string | null {
  return typeof valor === 'string' && UUID.test(valor) ? valor.toLowerCase() : null;
}

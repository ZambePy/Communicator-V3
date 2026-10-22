/**
 * Remover o paciente também tira a voz clonada importada dele (revisão final, rodada 2, N1,
 * 21/10/2026).
 *
 * A voz clonada (a referência, o termo e o cache de frases) mora no processo principal e é única por
 * computador. Quem decide se ela é DESTE perfil é o processo principal, comparando o id com o termo
 * que ele mesmo gravou: sai só se bater; se for de outro paciente, ou de ninguém, fica. Esta função
 * só faz o pedido — pelo id do perfil, nunca por caminho — e traduz qualquer falha em resposta, para a
 * remoção do perfil não depender dela e a tela poder avisar (`AuthContext`).
 *
 * Fora do aplicativo instalado (navegador, testes) não existe voz clonada: não há o que apagar.
 */

import type { ResultadoDaRemocaoDoPerfil } from '@tracker/voz/protocolo';
import { ponteDaVoz } from './local';

const erroDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function removerVozClonadaDoPerfil(perfilId: string): Promise<ResultadoDaRemocaoDoPerfil> {
  const ponte = ponteDaVoz();
  if (!ponte) return { ok: true, removida: false };
  // Preload antigo (o app e o preload saem juntos no instalador, mas uma página nova com um preload
  // velho existe em desenvolvimento): não finge que apagou.
  if (typeof ponte.removerDoPerfil !== 'function') {
    return { ok: false, erro: 'Esta versão do aplicativo não sabe apagar a voz personalizada de um paciente removido.' };
  }
  try {
    const r = await ponte.removerDoPerfil(perfilId);
    if (r && r.ok === true) return { ok: true, removida: r.removida === true };
    if (r && r.ok === false) return { ok: false, erro: typeof r.erro === 'string' ? r.erro : 'Não foi possível apagar a voz personalizada.' };
    return { ok: false, erro: 'O aplicativo respondeu de um jeito inesperado ao apagar a voz personalizada.' };
  } catch (e) {
    return { ok: false, erro: `Não foi possível falar com o aplicativo agora (${erroDe(e)}).` };
  }
}

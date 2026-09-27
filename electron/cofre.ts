/**
 * Cofre local do processo principal (`userData/cloud-store.json`): token da
 * sessão do Supabase, chave do computador, licença e fila offline (inclusive
 * pedidos de socorro que esperam rede). Os valores chegam já cifrados (ou em
 * claro, sem `safeStorage`) — cifrar é com o `main.ts`; aqui é só guardar sem
 * perder.
 *
 * A regra que importa: um cofre que não pôde ser LIDO nunca é regravado. O
 * `secure-set` é ler-modificar-gravar; com a leitura antiga (qualquer erro →
 * `{}`) um arquivo truncado ou segurado pelo antivírus virava, na gravação
 * seguinte, um cofre com uma chave só. Ver `arquivoSeguro.ts`.
 */

import { gravarJsonAtomico, lerJsonProtegido } from './arquivoSeguro';

export type ItemDoCofre = { enc: boolean; v: string };
export type ConteudoDoCofre = Record<string, ItemDoCofre>;

function ehConteudoDoCofre(v: unknown): v is ConteudoDoCofre {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export interface Cofre {
  /** Item guardado, ou `null` se não existe OU se o cofre não pôde ser lido agora. */
  ler(chave: string): ItemDoCofre | null;
  /** Grava. `false` = não gravou (cofre ilegível ou erro de disco) — nada foi apagado. */
  definir(chave: string, item: ItemDoCofre): boolean;
  /** Remove. `false` = não removeu (mesma regra do `definir`). */
  remover(chave: string): boolean;
}

export function criarCofre(
  arquivo: string,
  log: (msg: string, ...extra: unknown[]) => void = (m, ...x) => console.warn(m, ...x),
): Cofre {
  const ler = () => lerJsonProtegido(arquivo, ehConteudoDoCofre, (m) => log(`[cofre] ${m}`));

  function modificar(acao: string, mudar: (c: ConteudoDoCofre) => void): boolean {
    const leitura = ler();
    if (!leitura.ok) {
      // O arquivo existe e não foi lido. Gravar agora sobrescreveria tudo o que
      // ele guarda com um cofre quase vazio.
      log(`[cofre] ${acao} RECUSADO: o cofre não pôde ser lido (${leitura.erro}). Nada foi apagado.`);
      return false;
    }
    const conteudo: ConteudoDoCofre = { ...(leitura.valor ?? {}) };
    mudar(conteudo);
    try {
      // Lido da cópia: o principal no disco é o ilegível, e copiá-lo por cima
      // da cópia boa destruiria a única versão que se salvou.
      gravarJsonAtomico(arquivo, conteudo, { mode: 0o600, manterCopia: leitura.origem === 'principal' });
      return true;
    } catch (e) {
      log(`[cofre] ${acao} falhou ao gravar; o cofre anterior continua intacto:`, e);
      return false;
    }
  }

  return {
    ler(chave) {
      const leitura = ler();
      if (!leitura.ok) {
        log(`[cofre] leitura falhou (${leitura.erro})`);
        return null;
      }
      const item = leitura.valor?.[chave];
      return item && typeof item === 'object' && typeof item.v === 'string' ? item : null;
    },
    definir(chave, item) {
      return modificar(`gravar ${chave}`, (c) => { c[chave] = item; });
    },
    remover(chave) {
      return modificar(`remover ${chave}`, (c) => { delete c[chave]; });
    },
  };
}

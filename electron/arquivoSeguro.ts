/**
 * Arquivo JSON do processo principal que não pode se perder numa gravação
 * interrompida: o cofre (`cloud-store.json`, com a sessão, a chave do
 * computador, a licença e a FILA OFFLINE de socorros) e os JSON da voz.
 *
 * Antes era `writeFileSync` direto no arquivo final, que TRUNCA antes de
 * escrever: uma queda de energia no meio deixava o JSON pela metade. E a
 * leitura transformava qualquer erro em "arquivo vazio" — na gravação seguinte
 * o arquivo era regravado só com a chave nova, e todo o resto sumia sem log.
 *
 * Agora:
 *   - GRAVAÇÃO: escreve `arquivo.tmp`, faz `fsync`, copia a versão boa atual
 *     para `arquivo.bak` e só então troca o arquivo pelo temporário com
 *     `rename` (atômico no NTFS e nos sistemas POSIX). Em qualquer instante de
 *     uma queda, o arquivo principal é a versão antiga inteira ou a nova
 *     inteira.
 *   - LEITURA: só "arquivo não existe" (ENOENT, nos dois) vale como vazio.
 *     JSON inválido ou conteúdo fora do formato tenta a cópia `.bak`. Erro de
 *     E/S (antivírus segurando o arquivo: EBUSY/EPERM) NÃO vira vazio: a
 *     leitura devolve falha, e quem ia gravar desiste em vez de sobrescrever.
 *   - Arquivo principal ilegível SEM cópia boa: ele é preservado com outro nome
 *     (`arquivo.ilegivel-<data>`, para o suporte) e a leitura segue como
 *     vazia — sem isto, um disco que corrompeu os dois arquivos deixaria o app
 *     sem conseguir gravar nada nunca mais.
 */

import fs from 'node:fs';
import path from 'node:path';

export type LeituraProtegida<T> =
  | { ok: true; valor: T | null; origem: 'principal' | 'copia' | 'inexistente' }
  | { ok: false; erro: string };

type Tentativa =
  | { tipo: 'ok'; valor: unknown }
  | { tipo: 'inexistente' }
  | { tipo: 'invalido'; erro: string }
  | { tipo: 'erro_de_leitura'; erro: string };

/** Erros de "arquivo segurado por outro programa agora" (antivírus, indexador, backup). */
const OCUPADO = new Set(['EBUSY', 'EPERM', 'EACCES']);

function tentarLer(arquivo: string): Tentativa {
  let texto: string | null = null;
  // Poucas tentativas curtas: no Windows o antivírus segura o arquivo por
  // instantes logo depois de uma gravação. Sem elas, uma leitura no meio disso
  // (o login do app lendo a sessão, por exemplo) respondia "não há sessão".
  for (let i = 0; texto === null; i++) {
    try {
      texto = fs.readFileSync(arquivo, 'utf-8');
    } catch (e) {
      const codigo = (e as NodeJS.ErrnoException)?.code;
      if (codigo === 'ENOENT') return { tipo: 'inexistente' };
      if (i < 3 && codigo && OCUPADO.has(codigo)) {
        esperarMs(40 * (i + 1));
        continue;
      }
      return { tipo: 'erro_de_leitura', erro: `${codigo ?? 'erro'}: ${(e as Error)?.message ?? String(e)}` };
    }
  }
  try {
    return { tipo: 'ok', valor: JSON.parse(texto) as unknown };
  } catch (e) {
    return { tipo: 'invalido', erro: `JSON inválido (${(e as Error)?.message ?? 'parse'})` };
  }
}

/**
 * Lê `arquivo` com a política descrita no cabeçalho. `formatoValido` decide se
 * o JSON lido tem a forma esperada (um conteúdo fora do formato conta como
 * inválido e cai para a cópia).
 */
export function lerJsonProtegido<T>(
  arquivo: string,
  formatoValido: (v: unknown) => v is T,
  log: (msg: string) => void = (m) => console.warn(m),
): LeituraProtegida<T> {
  const principal = tentarLer(arquivo);
  if (principal.tipo === 'ok') {
    if (formatoValido(principal.valor)) return { ok: true, valor: principal.valor, origem: 'principal' };
  }
  // Erro de E/S no principal: não é corrupção, é o arquivo inacessível AGORA.
  // A cópia pode estar velha; usá-la para uma gravação apagaria o que o
  // principal tem de mais novo. Falha, e quem chama decide não gravar.
  if (principal.tipo === 'erro_de_leitura') {
    return { ok: false, erro: principal.erro };
  }

  const copia = tentarLer(`${arquivo}.bak`);
  if (copia.tipo === 'ok' && formatoValido(copia.valor)) {
    if (principal.tipo !== 'inexistente') {
      log(`[arquivo] ${path.basename(arquivo)} ilegível (${principal.tipo === 'ok' ? 'fora do formato' : principal.erro}); usando a cópia .bak`);
    }
    return { ok: true, valor: copia.valor, origem: 'copia' };
  }
  if (principal.tipo === 'inexistente' && (copia.tipo === 'inexistente' || copia.tipo === 'invalido' || copia.tipo === 'ok')) {
    // Nunca houve arquivo (ou só sobrou uma cópia inútil): vazio de verdade.
    return { ok: true, valor: null, origem: 'inexistente' };
  }
  if (copia.tipo === 'erro_de_leitura') return { ok: false, erro: copia.erro };

  // Principal corrompido e nenhuma cópia boa: guarda o ilegível para o suporte
  // e segue vazio, para o app voltar a conseguir gravar.
  const destino = `${arquivo}.ilegivel-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    fs.renameSync(arquivo, destino);
  } catch (e) {
    return { ok: false, erro: `arquivo ilegível e não foi possível preservá-lo (${(e as Error)?.message ?? e})` };
  }
  log(`[arquivo] ${path.basename(arquivo)} ilegível e sem cópia boa; preservado como ${path.basename(destino)} — seguindo vazio`);
  return { ok: true, valor: null, origem: 'inexistente' };
}

/** Espera síncrona curta (o main não tem `sleep`; usada só entre tentativas de rename). */
function esperarMs(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const fim = Date.now() + ms;
    while (Date.now() < fim) { /* espera ativa, só se Atomics faltar */ }
  }
}

/**
 * `rename` com poucas tentativas: no Windows, antivírus e indexador seguram o
 * arquivo por instantes e o rename falha com EPERM/EBUSY/EACCES.
 */
function renomearComTentativas(de: string, para: string): void {
  let ultimo: unknown = null;
  for (let i = 0; i < 4; i++) {
    try {
      fs.renameSync(de, para);
      return;
    } catch (e) {
      ultimo = e;
      const codigo = (e as NodeJS.ErrnoException)?.code;
      if (codigo !== 'EPERM' && codigo !== 'EBUSY' && codigo !== 'EACCES') break;
      esperarMs(40 * (i + 1));
    }
  }
  throw ultimo;
}

/**
 * Grava `valor` em `arquivo` de forma atômica, mantendo em `arquivo.bak` a
 * versão anterior. `manterCopia: false` pula a cópia (use quando a versão atual
 * no disco sabidamente não é boa — a cópia boa que existe não pode ser trocada
 * por ela). Lança em caso de falha; o arquivo principal fica como estava.
 */
export function gravarJsonAtomico(
  arquivo: string,
  valor: unknown,
  opcoes: { mode?: number; manterCopia?: boolean; indentar?: boolean } = {},
): void {
  const pasta = path.dirname(arquivo);
  fs.mkdirSync(pasta, { recursive: true });
  const texto = opcoes.indentar ? JSON.stringify(valor, null, 2) : JSON.stringify(valor);
  const temporario = `${arquivo}.tmp`;
  const fd = fs.openSync(temporario, 'w', opcoes.mode ?? 0o600);
  try {
    fs.writeSync(fd, texto, null, 'utf-8');
    // Sem o fsync, o rename pode chegar ao disco ANTES do conteúdo: depois de
    // uma queda o arquivo novo existiria, vazio.
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (opcoes.manterCopia !== false) {
    try {
      if (fs.existsSync(arquivo)) fs.copyFileSync(arquivo, `${arquivo}.bak`);
    } catch (e) {
      // Sem cópia a gravação ainda é atômica; só a rede de segurança falta.
      console.warn(`[arquivo] não foi possível atualizar ${path.basename(arquivo)}.bak:`, e);
    }
  }
  renomearComTentativas(temporario, arquivo);
  // POSIX: o rename só é durável depois do fsync da pasta. No Windows abrir
  // uma pasta falha — e lá o NTFS já registra o rename no journal.
  try {
    const dfd = fs.openSync(pasta, 'r');
    try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
  } catch { /* Windows ou sistema sem suporte */ }
}

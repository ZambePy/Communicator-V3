/**
 * Voz guardada — o ARQUIVO, sem Electron (testável com uma pasta temporária).
 *
 * Mora em `userData/voz/guardadas/`, ao lado da voz clonada:
 *   indice.json          a lista das gravações (texto, data, duração, qualidade, perfil)
 *   consentimento.json   os termos aceitos, UM POR PERFIL (texto, hash, quando, perfil) —
 *                        cada registro no mesmo formato do da voz clonada
 *   <uuid>.wav           cada gravação, WAV PCM
 *
 * O termo é de cada paciente (revisão de segurança de 20/10/2026). Antes o
 * arquivo tinha um registro só, sobrescrito a cada aceite, e `salvar` só
 * conferia se ele existia: o "Concordo" de um paciente deixava gravar a voz de
 * outro do mesmo computador, que nunca viu o termo, e o aceite do segundo
 * apagava o registro do primeiro. Agora o arquivo é
 * `{ versao: 2, consentimentos: [ …um por perfil… ] }`, o aceite de um perfil
 * mantém os outros como estavam, e gravar exige o termo do perfil do pedido.
 * O formato antigo (um registro solto, de um perfil só) continua sendo lido e
 * vale para aquele perfil; vira o novo no próximo aceite, com o registro
 * antigo copiado como estava.
 *
 * Gravações NÃO são apagadas junto com a voz clonada: são a voz da própria
 * pessoa, muitas vezes de quando ela ainda falava — não dá para gravar de novo.
 * Só saem uma a uma, por quem decide (o cuidador, com confirmação).
 *
 * Os JSON vão por `arquivoSeguro` (gravação atômica com cópia .bak); o WAV é
 * escrito num temporário e renomeado, para uma queda no meio não deixar meia
 * gravação com nome de inteira.
 *
 * BACKUP COMPLETO (rodada 3, 21/10/2026): o backup do app leva também estas
 * gravações, para quem troca de computador não perder a própria voz.
 *   - SAÍDA: `arquivosParaBackup` lista o que vai (índice, termos, cada áudio) e
 *     `lerArquivoDoBackup` entrega um por vez, por NOME — a página nunca fala em
 *     caminho, e o IPC não carrega tudo de uma vez.
 *   - ENTRADA: `restaurarDoBackup` SOMA ao que já existe e nunca apaga NEM
 *     SOBRESCREVE. Gravação do backup com o id de uma que já está aqui:
 *       · áudio IGUAL (byte a byte): é a mesma gravação — nada é escrito;
 *       · áudio DIFERENTE: a de cá fica como está (arquivo e linha) e a do backup
 *         entra como CÓPIA, com id novo — duas vozes, nenhuma perdida. Era a
 *         voz de alguém que talvez não possa gravar de novo; o mais seguro é
 *         guardar as duas e deixar quem cuida apagar a que não quiser;
 *       · só a linha de cá existe, sem o áudio (o arquivo sumiu): o backup repõe.
 *     Tudo é validado e lido (índice, termos, espaço) ANTES de a primeira escrita.
 *     Depois, a ordem é áudios → termos → índice (o índice é o que as publica), de
 *     modo que uma queda no meio deixa, no pior caso, áudios órfãos e invisíveis —
 *     nunca uma gravação no índice sem o áudio. Falhou em qualquer passo: o que
 *     esta restauração escreveu é desfeito (áudios novos, termos de volta byte a
 *     byte). Os áudios são escritos SEM travar o processo principal (E/S
 *     assíncrona, cedendo a vez entre um arquivo e outro); a junção final do
 *     índice e dos termos lê os dois de novo e é síncrona e curta, para uma
 *     gravação feita durante a restauração não se perder.
 */

import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gravarJsonAtomico, lerJsonProtegido } from '../arquivoSeguro';
import { TAMANHO_MAXIMO_DO_BACKUP_BYTES } from '../../src/backup/protocolo';
import {
  LIMITES_DA_VOZ_GUARDADA, LIMITES_DO_BACKUP_DA_VOZ, NOME_DO_INDICE, NOME_DOS_TERMOS, consentimentoDoPerfil, ehIdDeGravacao,
  ehNomeDeArquivoDoBackup, ehQualidade, ehWav, normalizarTextoDaGravacao,
  type ArquivoDoBackupDaVoz, type ConsentimentoDaVozGuardada, type GravacaoGuardada, type ResultadoDaListaDoBackup,
  type ResultadoDaListagem, type ResultadoDaRestauracaoDaVoz, type ResultadoDeLer, type ResultadoDeLerParaBackup,
  type ResultadoDeSalvar, type ResultadoSimples,
} from '../../src/voz/vozGuardada';

interface Indice {
  versao: 1;
  gravacoes: GravacaoGuardada[];
}

/** `consentimento.json` desde 20/10/2026: um termo por perfil. */
interface ArquivoDosTermos {
  versao: 2;
  consentimentos: ConsentimentoDaVozGuardada[];
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const ehIndice = (v: unknown): v is Indice => ehObjeto(v) && Array.isArray(v.gravacoes);
/** Um registro de termo: o perfil tem de estar escrito (texto ou `null`) — sem dono, o termo não vale para ninguém. */
const ehConsentimento = (v: unknown): v is ConsentimentoDaVozGuardada =>
  ehObjeto(v) && typeof v.texto === 'string' && typeof v.aceitoEm === 'string'
  && (v.perfilId === null || typeof v.perfilId === 'string');
const ehArquivoNovoDosTermos = (v: unknown): v is ArquivoDosTermos =>
  ehObjeto(v) && v.versao === 2 && Array.isArray(v.consentimentos);
/** O formato novo, ou o antigo: um registro solto, de um perfil só (até 20/10/2026). */
const ehArquivoDosTermos = (v: unknown): v is ArquivoDosTermos | ConsentimentoDaVozGuardada =>
  ehArquivoNovoDosTermos(v) || ehConsentimento(v);

/** Os termos do arquivo, nos dois formatos. O antigo vale para o perfil que ele registra, e só para ele. */
function termosDoArquivo(v: ArquivoDosTermos | ConsentimentoDaVozGuardada | null): ConsentimentoDaVozGuardada[] {
  if (!v) return [];
  if (ehArquivoNovoDosTermos(v)) return v.consentimentos.filter(ehConsentimento);
  return [v];
}

function ehGravacao(v: unknown): v is GravacaoGuardada {
  return ehObjeto(v) && ehIdDeGravacao(v.id) && typeof v.texto === 'string' && typeof v.criadaEm === 'string'
    && typeof v.duracaoS === 'number' && ehQualidade(v.qualidade);
}

/** Bytes de um ArrayBuffer ou de uma visão dele (o IPC pode entregar qualquer um dos dois). */
function paraBuffer(v: unknown): Buffer | null {
  if (v instanceof ArrayBuffer) return Buffer.from(v);
  if (ArrayBuffer.isView(v)) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  return null;
}

const hashDoTermo = (texto: string) => createHash('sha256').update(texto, 'utf-8').digest('hex');

/**
 * Grava um WAV inteiro ou nada: escreve num temporário e renomeia. Lança em
 * caso de falha — com o temporário já apagado.
 */
function escreverWav(destino: string, bytes: Buffer): void {
  const temporario = `${destino}.tmp`;
  try {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const fd = fs.openSync(temporario, 'w', 0o600);
    try {
      for (let feito = 0; feito < bytes.byteLength; ) feito += fs.writeSync(fd, bytes, feito, bytes.byteLength - feito);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temporario, destino);
  } catch (e) {
    fs.rmSync(temporario, { force: true });
    throw e;
  }
}

/**
 * O mesmo de `escreverWav`, SEM travar o processo principal: a restauração grava
 * dezenas de áudios de vários MB, e a E/S síncrona deixaria o app inteiro parado
 * (janela, voz, rastreio) durante todo esse tempo. Lança em caso de falha — com o
 * temporário já apagado.
 */
async function escreverWavSemTravar(destino: string, bytes: Buffer): Promise<void> {
  const temporario = `${destino}.tmp`;
  try {
    await fs.promises.mkdir(path.dirname(destino), { recursive: true });
    const arquivo = await fs.promises.open(temporario, 'w', 0o600);
    try {
      for (let feito = 0; feito < bytes.byteLength; ) {
        const { bytesWritten } = await arquivo.write(bytes, feito, bytes.byteLength - feito);
        if (bytesWritten <= 0) throw new Error('a escrita do áudio não avançou');
        feito += bytesWritten;
      }
      await arquivo.sync();
    } finally {
      await arquivo.close();
    }
    await fs.promises.rename(temporario, destino);
  } catch (e) {
    await fs.promises.rm(temporario, { force: true }).catch(() => undefined);
    throw e;
  }
}

const jsonDoIndice = (gravacoes: GravacaoGuardada[]): Buffer =>
  Buffer.from(JSON.stringify({ versao: 1, gravacoes } satisfies Indice), 'utf-8');
const jsonDosTermos = (consentimentos: ConsentimentoDaVozGuardada[]): Buffer =>
  Buffer.from(JSON.stringify({ versao: 2, consentimentos } satisfies ArquivoDosTermos), 'utf-8');
const soOsBytes = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

/** No máximo: o índice, o termo e uma gravação por vaga. */
const ARQUIVOS_DO_BACKUP_MAX = LIMITES_DA_VOZ_GUARDADA.gravacoesMax + 2;

/**
 * O pedido de restauração, conferido sem tocar no disco: uma lista de
 * `{ nome, bytes }` com nomes que o backup conhece, sem repetir, e dentro do
 * teto de bytes. Qualquer coisa fora disso recusa o pedido INTEIRO.
 */
function lerPacoteDoBackup(pedido: unknown): { ok: true; porNome: Map<string, Buffer> } | { ok: false; erro: string } {
  const FORA_DO_FORMATO = { ok: false as const, erro: 'As gravações deste backup não estão no formato esperado.' };
  if (!Array.isArray(pedido) || pedido.length > ARQUIVOS_DO_BACKUP_MAX) return FORA_DO_FORMATO;
  const porNome = new Map<string, Buffer>();
  let total = 0;
  for (const item of pedido) {
    if (!ehObjeto(item) || !ehNomeDeArquivoDoBackup(item.nome) || porNome.has(item.nome)) return FORA_DO_FORMATO;
    const bytes = paraBuffer(item.bytes);
    if (!bytes) return FORA_DO_FORMATO;
    total += bytes.byteLength;
    if (total > LIMITES_DO_BACKUP_DA_VOZ.bytesMax) {
      return { ok: false, erro: `As gravações deste backup somam mais do que cabe num arquivo de backup (${TAMANHO_MAXIMO_DO_BACKUP_BYTES / (1024 * 1024)} MB).` };
    }
    porNome.set(item.nome, bytes);
  }
  return { ok: true, porNome };
}

function lerJsonDoPacote(bytes: Buffer): { ok: true; valor: unknown } | { ok: false } {
  try {
    return { ok: true, valor: JSON.parse(bytes.toString('utf-8')) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * Uma linha do índice do backup, REFEITA com o que se confia. Campo solto não
 * passa e o tamanho é o do áudio de verdade. Sem dono legível (`perfilId` que
 * não é texto nem vazio) a gravação não entra: virar "sem perfil" a mostraria a
 * todos os pacientes do computador.
 */
function gravacaoDoBackup(v: unknown, tamanhoDoAudio: number): GravacaoGuardada | null {
  if (!ehGravacao(v)) return null;
  const perfilId: unknown = v.perfilId;
  if (perfilId !== null && typeof perfilId !== 'string') return null;
  const texto = normalizarTextoDaGravacao(v.texto);
  if (!texto) return null;
  return {
    id: v.id,
    texto,
    criadaEm: v.criadaEm,
    duracaoS: Math.round(Math.max(0, Math.min(600, v.duracaoS)) * 100) / 100,
    qualidade: v.qualidade,
    perfilId,
    bytes: tamanhoDoAudio,
  };
}

/** Um termo do backup, com o hash REFEITO do texto. Texto curto demais não é o termo: o paciente aceita de novo. */
function termoDoBackup(t: ConsentimentoDaVozGuardada): ConsentimentoDaVozGuardada | null {
  if (t.texto.length < LIMITES_DA_VOZ_GUARDADA.consentimentoMin) return null;
  return { texto: t.texto, hash: hashDoTermo(t.texto), aceitoEm: t.aceitoEm, perfilId: t.perfilId };
}

/** `a` é depois de `b`? Data ilegível não ganha de ninguém. */
function ehDepoisDe(a: string, b: string): boolean {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && x > y;
}

/**
 * O que a restauração decide para CADA gravação do backup (comparando o áudio do
 * backup com o que há aqui sob o mesmo id):
 *   novo    não há áudio aqui com esse id → escreve o áudio e a linha (se havia só uma
 *           linha sem áudio, a do backup a substitui);
 *   igual   o áudio de cá é idêntico → nada a escrever; se só faltar a linha (áudio
 *           solto), a do backup a repõe;
 *   copia   o áudio de cá é OUTRO → o de cá fica; a do backup entra com id novo;
 *   jaTem   o mesmo áudio e a mesma frase já estão aqui sob outro id (uma restauração
 *           anterior já fez a cópia) → nada a escrever, para não duplicar de novo.
 */
type Destino =
  | { tipo: 'novo'; gravacao: GravacaoGuardada; bytes: Buffer }
  | { tipo: 'copia'; gravacao: GravacaoGuardada; bytes: Buffer }
  | { tipo: 'igual'; gravacao: GravacaoGuardada }
  | { tipo: 'jaTem' };

/**
 * O índice depois de juntar o que o backup traz ao que há aqui AGORA. Só devolve linha
 * para o que tem áudio (`audioExiste`): um áudio igual que sumiu desde a conferência
 * não volta para a lista — conta como ignorado.
 */
function juntarNoIndice(locais: GravacaoGuardada[], destinos: Destino[], audioExiste: (id: string) => boolean): {
  indice: GravacaoGuardada[]; mudou: boolean; presentes: number; sumiram: number; copiadas: number;
} {
  const idsAqui = new Set(locais.map((g) => g.id));
  const novas: GravacaoGuardada[] = [];
  const substituidas = new Set<string>();
  let presentes = 0;
  let sumiram = 0;
  let copiadas = 0;
  for (const d of destinos) {
    if (d.tipo === 'novo') {
      substituidas.add(d.gravacao.id); // uma linha de cá sem áudio é trocada pela do backup
      novas.push(d.gravacao);
      presentes++;
    } else if (d.tipo === 'copia') {
      novas.push(d.gravacao);
      presentes++;
      copiadas++;
    } else if (d.tipo === 'jaTem') {
      presentes++;
    } else if (!audioExiste(d.gravacao.id)) {
      sumiram++;
    } else {
      if (!idsAqui.has(d.gravacao.id)) novas.push(d.gravacao);
      presentes++;
    }
  }
  return { indice: [...locais.filter((g) => !substituidas.has(g.id)), ...novas], mudou: novas.length > 0, presentes, sumiram, copiadas };
}

/** Os termos numa forma que não depende da ordem — para saber se a restauração muda alguma coisa neles. */
const formaDosTermos = (termos: ConsentimentoDaVozGuardada[]): string =>
  JSON.stringify([...termos].sort((x, y) => (x.perfilId ?? '').localeCompare(y.perfilId ?? '')));

/** Os bytes de um arquivo, ou `null` se ele não existe. Outro erro (arquivo preso) sobe. */
function lerBytesSeExistir(caminho: string): Buffer | null {
  try {
    return fs.readFileSync(caminho);
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw e;
  }
}

/** Na falha de uma restauração: tira os áudios que ELA escreveu (e só eles). */
function removerAudios(caminhos: string[], log: (m: string) => void): void {
  for (const c of caminhos) {
    try {
      fs.rmSync(c, { force: true });
    } catch (e) {
      log(`[voz-guardada] um áudio da restauração ficou no disco, sem aparecer em lugar nenhum: ${(e as Error)?.message ?? e}`);
    }
  }
}

const MENSAGEM_TENTE_DE_NOVO = 'Não foi possível guardar agora. Tente de novo em instantes.';

/** Para teste: como se sorteia o id de uma cópia e como a restauração cede a vez entre um áudio e outro. */
export interface DependenciasDoArmazem {
  gerarId?: () => string;
  ceder?: () => Promise<void>;
}
const cederAVezDoProcesso = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

export interface ArmazemDeGravacoes {
  readonly pasta: string;
  listar(): ResultadoDaListagem;
  consentir(c: unknown): ResultadoSimples;
  salvar(pedido: unknown): ResultadoDeSalvar;
  ler(id: unknown): ResultadoDeLer;
  apagar(id: unknown): ResultadoSimples;
  /**
   * Remover o paciente (revisão final, rodada 1, M4, 21/10/2026): apaga TODAS as gravações do
   * perfil e o termo que ele aceitou, e nada dos outros. A voz é dado biométrico: sem isto ela
   * ficava no computador, e o backup completo a levava, depois de o paciente ter sido removido.
   * Idempotente (perfil sem nada devolve ok). Arquivo preso agora recusa SEM apagar parte, para
   * o app avisar e a pessoa tentar de novo.
   */
  apagarDoPerfil(perfilId: unknown): ResultadoSimples;
  /** Arquivo de uma gravação que existe (para virar a referência da voz clonada). */
  arquivoDe(id: unknown): { caminho: string; gravacao: GravacaoGuardada } | null;
  /** Backup: o que vai no arquivo de backup (índice, termos e cada áudio, com o tamanho de cada um). */
  arquivosParaBackup(): ResultadoDaListaDoBackup;
  /** Backup: um desses arquivos, pelo NOME (nunca por caminho). */
  lerArquivoDoBackup(nome: unknown): ResultadoDeLerParaBackup;
  /**
   * Backup: soma ao que já existe o que o arquivo de backup traz (`opcoes.perfil`:
   * só as gravações e o termo desse paciente). Não apaga NEM sobrescreve nada do
   * computador: gravação do backup com o id de uma de cá e áudio diferente entra
   * como cópia, com id novo. Uma restauração por vez.
   */
  restaurarDoBackup(pedido: unknown, opcoes?: unknown): Promise<ResultadoDaRestauracaoDaVoz>;
}

export function criarArmazemDeGravacoes(
  pasta: string,
  log: (m: string) => void = (m) => console.warn(m),
  dependencias: DependenciasDoArmazem = {},
): ArmazemDeGravacoes {
  const gerarId = dependencias.gerarId ?? randomUUID;
  const ceder = dependencias.ceder ?? cederAVezDoProcesso;
  let restaurando = false;
  const arquivos = {
    indice: path.join(pasta, NOME_DO_INDICE),
    consentimento: path.join(pasta, NOME_DOS_TERMOS),
  };
  const wavDe = (id: string) => path.join(pasta, `${id}.wav`);

  const lerIndice = (): { ok: true; indice: Indice } | { ok: false; erro: string } => {
    const r = lerJsonProtegido(arquivos.indice, ehIndice, (m) => log(`[voz-guardada] ${m}`));
    if (!r.ok) return { ok: false, erro: r.erro };
    const gravacoes = (r.valor?.gravacoes ?? []).filter(ehGravacao);
    return { ok: true, indice: { versao: 1, gravacoes } };
  };

  const lerTermos = (): { ok: true; termos: ConsentimentoDaVozGuardada[] } | { ok: false } => {
    const r = lerJsonProtegido(arquivos.consentimento, ehArquivoDosTermos, (m) => log(`[voz-guardada] ${m}`));
    if (!r.ok) {
      log(`[voz-guardada] não foi possível ler os termos aceitos agora: ${r.erro}`);
      return { ok: false };
    }
    return { ok: true, termos: termosDoArquivo(r.valor) };
  };

  /** O WAV de uma gravação, já com o `id` conferido por quem chama. */
  const lerAudio = (id: string): ResultadoDeLer => {
    try {
      const buf = fs.readFileSync(wavDe(id));
      return { ok: true, wav: soOsBytes(buf) };
    } catch (e) {
      const codigo = (e as NodeJS.ErrnoException)?.code;
      return { ok: false, erro: codigo === 'ENOENT' ? 'Esta gravação não está mais neste computador.' : 'Não foi possível abrir a gravação agora.' };
    }
  };

  /**
   * O que o backup leva, no estado de AGORA: as gravações que têm áudio e todos
   * os termos. Algo ilegível (arquivo preso) recusa — um backup sem as
   * gravações, entregue como completo, seria perda de voz em silêncio.
   */
  const oQueVaiNoBackup = (): { ok: true; gravacoes: GravacaoGuardada[]; termos: ConsentimentoDaVozGuardada[] } | { ok: false; erro: string } => {
    const lido = lerIndice();
    if (!lido.ok) return { ok: false, erro: 'Não foi possível ler as gravações agora. Tente de novo em instantes.' };
    const termos = lerTermos();
    if (!termos.ok) return { ok: false, erro: 'Não foi possível ler os termos aceitos agora. Tente de novo em instantes.' };
    return { ok: true, gravacoes: lido.indice.gravacoes.filter((g) => fs.existsSync(wavDe(g.id))), termos: termos.termos };
  };

  // ---------------------------------------------------------------------------
  // Restauração do backup (rodada 3, 21/10/2026; corrigida na rodada de correção 1)
  // ---------------------------------------------------------------------------

  /** Tem arquivo com esse caminho? (E/S assíncrona; erro que não seja "não existe" sobe.) */
  const existeSemTravar = async (caminho: string): Promise<boolean> => {
    try {
      await fs.promises.access(caminho);
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return false;
      throw e;
    }
  };

  /** O áudio de cá com este id é o mesmo `bytes`? Compara byte a byte; só lê o arquivo se o tamanho bater. */
  const compararComOAudioDeAqui = async (id: string, bytes: Buffer): Promise<'nao-tem' | 'igual' | 'diferente'> => {
    const caminho = wavDe(id);
    try {
      const { size } = await fs.promises.stat(caminho);
      if (size !== bytes.byteLength) return 'diferente';
      return (await fs.promises.readFile(caminho)).equals(bytes) ? 'igual' : 'diferente';
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') return 'nao-tem';
      throw e;
    }
  };

  /** Já há aqui, sob OUTRO id, a mesma frase do mesmo paciente com o mesmo áudio? (A cópia de uma restauração anterior.) */
  const jaTemSobOutroId = async (g: GravacaoGuardada, bytes: Buffer, locais: GravacaoGuardada[]): Promise<boolean> => {
    for (const l of locais) {
      if (l.id === g.id || l.texto !== g.texto || l.perfilId !== g.perfilId) continue;
      if ((await compararComOAudioDeAqui(l.id, bytes)) === 'igual') return true;
    }
    return false;
  };

  /** Devolve um arquivo ao que era (`null`: ele não existia). `false` se nem isso deu certo. */
  const devolverBytes = (caminho: string, antes: Buffer | null): boolean => {
    try {
      if (antes === null) {
        fs.rmSync(caminho, { force: true });
      } else {
        const temporario = `${caminho}.tmp`;
        fs.writeFileSync(temporario, antes, { mode: 0o600 });
        fs.renameSync(temporario, caminho);
      }
      return true;
    } catch (e) {
      log(`[voz-guardada] não foi possível devolver ${path.basename(caminho)} ao que era: ${(e as Error)?.message ?? e}`);
      return false;
    }
  };

  async function restaurar(pedido: unknown, opcoes: unknown): Promise<ResultadoDaRestauracaoDaVoz> {
    const pacote = lerPacoteDoBackup(pedido);
    if (!pacote.ok) return pacote;

    // O recorte por paciente: ausente = tudo; se vier, tem de ser um paciente de
    // verdade — um valor torto não pode virar "restaurar todos".
    const pedidoPerfil = ehObjeto(opcoes) ? opcoes.perfil : undefined;
    if (pedidoPerfil !== undefined && (typeof pedidoPerfil !== 'string' || pedidoPerfil === '')) {
      return { ok: false, erro: 'O paciente escolhido para restaurar não é válido.' };
    }
    const perfil = pedidoPerfil;
    const emEscopo = (perfilId: unknown) => perfil === undefined || perfilId === perfil;

    // O que o pacote diz. Um JSON estragado recusa tudo: um índice torto não pode
    // virar "nenhuma gravação" em silêncio.
    let linhasDoPacote: unknown[] = [];
    const bytesDoIndice = pacote.porNome.get(NOME_DO_INDICE);
    if (bytesDoIndice) {
      const lido = lerJsonDoPacote(bytesDoIndice);
      if (!lido.ok || !ehIndice(lido.valor)) return { ok: false, erro: 'A lista de gravações deste backup está ilegível.' };
      linhasDoPacote = lido.valor.gravacoes;
    }
    let termosDoPacote: ConsentimentoDaVozGuardada[] = [];
    const bytesDosTermos = pacote.porNome.get(NOME_DOS_TERMOS);
    if (bytesDosTermos) {
      const lido = lerJsonDoPacote(bytesDosTermos);
      if (!lido.ok || !ehArquivoDosTermos(lido.valor)) return { ok: false, erro: 'Os termos aceitos deste backup estão ilegíveis.' };
      termosDoPacote = termosDoArquivo(lido.valor);
    }

    // Gravação que entra = linha legível no índice E áudio que é WAV de verdade e
    // cabe no limite de uma gravação. O resto é contado, para a tela dizer.
    const entram = new Map<string, { gravacao: GravacaoGuardada; bytes: Buffer }>();
    let ignoradas = 0;
    for (const linha of linhasDoPacote) {
      if (!emEscopo(ehObjeto(linha) ? linha.perfilId : undefined)) continue;
      const audio = ehObjeto(linha) && typeof linha.id === 'string' ? pacote.porNome.get(`${linha.id}.wav`) : undefined;
      const gravacao = audio ? gravacaoDoBackup(linha, audio.byteLength) : null;
      const audioServe = !!audio && audio.byteLength <= LIMITES_DA_VOZ_GUARDADA.bytesMax
        && ehWav(new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength));
      if (!gravacao || !audio || !audioServe) {
        ignoradas++;
        continue;
      }
      entram.set(gravacao.id, { gravacao, bytes: audio });
    }
    const termosQueEntram = new Map<string | null, ConsentimentoDaVozGuardada>();
    for (const t of termosDoPacote) {
      if (!emEscopo(t.perfilId)) continue;
      const termo = termoDoBackup(t);
      if (termo) termosQueEntram.set(termo.perfilId, termo);
    }

    // O que o computador tem AGORA, lido antes da primeira escrita: ilegível (arquivo
    // preso) recusa sem gravar nada. (A junção final lê os dois de novo.)
    let locais: GravacaoGuardada[] = [];
    if (entram.size > 0) {
      const lido = lerIndice();
      if (!lido.ok) return { ok: false, erro: MENSAGEM_TENTE_DE_NOVO };
      locais = lido.indice.gravacoes;
    }
    if (termosQueEntram.size > 0 && !lerTermos().ok) return { ok: false, erro: MENSAGEM_TENTE_DE_NOVO };

    // Para cada gravação do backup, o que fazer com ela (ver `Destino`). É tudo leitura:
    // se algo falhar aqui, nada foi escrito.
    const idsEmUso = new Set<string>([...locais.map((g) => g.id), ...entram.keys()]);
    const sortearIdLivre = async (): Promise<string> => {
      for (let tentativa = 0; tentativa < 20; tentativa++) {
        const id = gerarId();
        if (!ehIdDeGravacao(id) || idsEmUso.has(id) || await existeSemTravar(wavDe(id))) continue;
        idsEmUso.add(id);
        return id;
      }
      throw new Error('não foi possível sortear um id livre para a cópia');
    };
    const destinos: Destino[] = [];
    try {
      for (const { gravacao, bytes } of entram.values()) {
        const aqui = await compararComOAudioDeAqui(gravacao.id, bytes);
        if (aqui === 'nao-tem') destinos.push({ tipo: 'novo', gravacao, bytes });
        else if (aqui === 'igual') destinos.push({ tipo: 'igual', gravacao });
        else if (await jaTemSobOutroId(gravacao, bytes, locais)) destinos.push({ tipo: 'jaTem' });
        else destinos.push({ tipo: 'copia', gravacao: { ...gravacao, id: await sortearIdLivre() }, bytes });
      }
    } catch (e) {
      log(`[voz-guardada] não foi possível conferir as gravações do backup com as daqui: ${(e as Error)?.message ?? e}`);
      return { ok: false, erro: MENSAGEM_TENTE_DE_NOVO };
    }
    const mensagemDoLimite = `Juntas, as gravações deste computador e as do backup passariam de ${LIMITES_DA_VOZ_GUARDADA.gravacoesMax}. Apague algumas e tente de novo.`;
    if (juntarNoIndice(locais, destinos, () => true).indice.length > LIMITES_DA_VOZ_GUARDADA.gravacoesMax) {
      return { ok: false, erro: mensagemDoLimite };
    }

    // Daqui em diante há escrita. Os áudios primeiro, um de cada vez e cedendo a vez
    // entre eles; o que for escrito fica anotado para ser desfeito se algo falhar.
    const escritos: string[] = [];
    const falhou = (erro: string): ResultadoDaRestauracaoDaVoz => {
      removerAudios(escritos, log);
      return { ok: false, erro };
    };
    try {
      for (const d of destinos) {
        if (d.tipo !== 'novo' && d.tipo !== 'copia') continue;
        const destino = wavDe(d.gravacao.id);
        await escreverWavSemTravar(destino, d.bytes);
        escritos.push(destino);
        await ceder();
      }
    } catch (e) {
      log(`[voz-guardada] não foi possível restaurar as gravações do backup: ${(e as Error)?.message ?? e}`);
      return falhou('Não foi possível guardar as gravações do backup neste computador.');
    }

    // A junção final: índice e termos lidos DE NOVO (uma gravação feita enquanto os áudios
    // eram escritos não pode ser perdida), tudo síncrono e curto. Termos → índice.
    try {
      let indiceFinal: GravacaoGuardada[] | null = null;
      let presentes = 0;
      let sumiram = 0;
      let copiadas = 0;
      if (entram.size > 0) {
        const lido = lerIndice();
        if (!lido.ok) return falhou(MENSAGEM_TENTE_DE_NOVO);
        const juncao = juntarNoIndice(lido.indice.gravacoes, destinos, (id) => fs.existsSync(wavDe(id)));
        if (juncao.indice.length > LIMITES_DA_VOZ_GUARDADA.gravacoesMax) return falhou(mensagemDoLimite);
        ({ presentes, sumiram, copiadas } = juncao);
        if (juncao.mudou) indiceFinal = juncao.indice;
      }
      let termosFinais: ConsentimentoDaVozGuardada[] | null = null;
      if (termosQueEntram.size > 0) {
        const lido = lerTermos();
        if (!lido.ok) return falhou(MENSAGEM_TENTE_DE_NOVO);
        // Termo do mesmo paciente nos dois lados: fica o aceite mais recente.
        const finais = [
          ...lido.termos.filter((l) => !termosQueEntram.has(l.perfilId)),
          ...[...termosQueEntram.values()].map((novo) => {
            const local = lido.termos.find((l) => l.perfilId === novo.perfilId);
            return local && ehDepoisDe(local.aceitoEm, novo.aceitoEm) ? local : novo;
          }),
        ];
        if (formaDosTermos(finais) !== formaDosTermos(lido.termos)) termosFinais = finais;
      }

      let termosAntes: Buffer | null = null;
      if (termosFinais) {
        termosAntes = lerBytesSeExistir(arquivos.consentimento); // para desfazer, se o índice falhar
        try {
          gravarJsonAtomico(arquivos.consentimento, { versao: 2, consentimentos: termosFinais } satisfies ArquivoDosTermos, { indentar: true });
        } catch (e) {
          fs.rmSync(`${arquivos.consentimento}.tmp`, { force: true });
          log(`[voz-guardada] não foi possível gravar os termos do backup: ${(e as Error)?.message ?? e}`);
          return falhou('Não foi possível guardar os termos do backup neste computador.');
        }
      }
      if (indiceFinal) {
        try {
          gravarJsonAtomico(arquivos.indice, { versao: 1, gravacoes: indiceFinal } satisfies Indice, { indentar: true });
        } catch (e) {
          // Sem o índice os áudios novos ficariam órfãos e invisíveis, e os termos novos
          // seriam de uma restauração que não aconteceu: desfaz os dois.
          fs.rmSync(`${arquivos.indice}.tmp`, { force: true });
          const termosVoltaram = !termosFinais || devolverBytes(arquivos.consentimento, termosAntes);
          log(`[voz-guardada] não foi possível restaurar as gravações do backup: ${(e as Error)?.message ?? e}`);
          return falhou(`Não foi possível guardar as gravações do backup neste computador.${termosVoltaram ? '' : ' Os termos aceitos podem ter ficado diferentes do que eram.'}`);
        }
      }
      return { ok: true, gravacoes: presentes, termos: termosQueEntram.size, ignoradas: ignoradas + sumiram, copiadas };
    } catch (e) {
      // Nada deveria chegar aqui; se chegar, o que esta restauração escreveu nos áudios sai.
      log(`[voz-guardada] erro inesperado ao juntar as gravações do backup: ${(e as Error)?.message ?? e}`);
      return falhou('Não foi possível guardar as gravações do backup neste computador.');
    }
  }

  return {
    pasta,

    listar() {
      const r = lerIndice();
      if (!r.ok) return { ok: false, erro: 'Não foi possível ler as gravações agora. Tente de novo em instantes.' };
      // Só o que tem arquivo: uma gravação cujo WAV sumiu (antivírus, limpeza
      // manual) não pode aparecer como mensagem que toca.
      const gravacoes = r.indice.gravacoes.filter((g) => fs.existsSync(wavDe(g.id)));
      // Termos ilegíveis AGORA (arquivo preso): a tela pede o termo de novo, e o
      // aceite — que não grava por cima do que não leu — diz para tentar de novo.
      const termos = lerTermos();
      return { ok: true, gravacoes, consentimentos: termos.ok ? termos.termos : [] };
    },

    consentir(c) {
      if (!ehObjeto(c) || typeof c.texto !== 'string' || c.texto.length < LIMITES_DA_VOZ_GUARDADA.consentimentoMin || typeof c.aceitoEm !== 'string') {
        return { ok: false, erro: 'Gravar a voz exige o termo de consentimento aceito.' };
      }
      const registro: ConsentimentoDaVozGuardada = {
        texto: c.texto,
        hash: hashDoTermo(c.texto),
        aceitoEm: c.aceitoEm,
        perfilId: typeof c.perfilId === 'string' ? c.perfilId : null,
      };
      // Os termos dos OUTROS perfis ficam como estavam (revisão de segurança de
      // 20/10/2026). Arquivo ilegível agora (antivírus segurando): gravar por
      // cima apagaria os termos dos outros — não grava.
      const lidos = lerTermos();
      if (!lidos.ok) return { ok: false, erro: 'Não foi possível guardar o consentimento agora. Tente de novo em instantes.' };
      const arquivo: ArquivoDosTermos = {
        versao: 2,
        consentimentos: [...lidos.termos.filter((t) => t.perfilId !== registro.perfilId), registro],
      };
      try {
        gravarJsonAtomico(arquivos.consentimento, arquivo, { indentar: true });
        return { ok: true };
      } catch (e) {
        log(`[voz-guardada] não foi possível gravar o consentimento: ${(e as Error)?.message ?? e}`);
        return { ok: false, erro: 'Não foi possível guardar o consentimento neste computador.' };
      }
    },

    salvar(pedido) {
      // O termo é o de QUEM grava (revisão de segurança de 20/10/2026): o do
      // perfil do pedido, não o de qualquer perfil deste computador.
      const perfilId = ehObjeto(pedido) && typeof pedido.perfilId === 'string' ? pedido.perfilId : null;
      const termos = lerTermos();
      if (!termos.ok) return { ok: false, erro: 'Não foi possível guardar agora. Tente de novo em instantes.' };
      if (!consentimentoDoPerfil(termos.termos, perfilId)) return { ok: false, erro: 'Gravar a voz exige o termo de consentimento aceito.' };
      if (!ehObjeto(pedido) || !ehIdDeGravacao(pedido.id)) return { ok: false, erro: 'Gravação inválida.' };
      const texto = typeof pedido.texto === 'string' ? normalizarTextoDaGravacao(pedido.texto) : '';
      if (!texto) return { ok: false, erro: 'A gravação precisa da frase que foi dita.' };
      const bytes = paraBuffer(pedido.wav);
      if (!bytes || bytes.byteLength > LIMITES_DA_VOZ_GUARDADA.bytesMax || !ehWav(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength))) {
        return { ok: false, erro: 'O áudio da gravação não veio inteiro.' };
      }
      const duracaoS = typeof pedido.duracaoS === 'number' && Number.isFinite(pedido.duracaoS) ? Math.max(0, Math.min(600, pedido.duracaoS)) : 0;
      const qualidade = ehQualidade(pedido.qualidade) ? pedido.qualidade : 'aceitavel';
      const substitui = ehIdDeGravacao(pedido.substitui) && pedido.substitui !== pedido.id ? pedido.substitui : null;

      const lido = lerIndice();
      // Índice ilegível AGORA (arquivo preso): não grava por cima do que existe.
      if (!lido.ok) return { ok: false, erro: 'Não foi possível guardar agora. Tente de novo em instantes.' };
      const restantes = lido.indice.gravacoes.filter((g) => g.id !== pedido.id && g.id !== substitui);
      if (restantes.length >= LIMITES_DA_VOZ_GUARDADA.gravacoesMax) {
        return { ok: false, erro: `Já há ${restantes.length} gravações guardadas. Apague alguma para gravar outra.` };
      }

      const gravacao: GravacaoGuardada = {
        id: pedido.id,
        texto,
        criadaEm: new Date().toISOString(),
        duracaoS: Math.round(duracaoS * 100) / 100,
        qualidade,
        perfilId,
        bytes: bytes.byteLength,
      };
      const destino = wavDe(gravacao.id);
      try {
        escreverWav(destino, bytes);
      } catch (e) {
        log(`[voz-guardada] não foi possível gravar o áudio: ${(e as Error)?.message ?? e}`);
        return { ok: false, erro: 'Não foi possível guardar o áudio neste computador.' };
      }
      try {
        gravarJsonAtomico(arquivos.indice, { versao: 1, gravacoes: [...restantes, gravacao] } satisfies Indice, { indentar: true });
      } catch (e) {
        // Sem índice o áudio fica órfão e invisível: desfaz.
        fs.rmSync(destino, { force: true });
        log(`[voz-guardada] não foi possível atualizar o índice: ${(e as Error)?.message ?? e}`);
        return { ok: false, erro: 'Não foi possível guardar a gravação neste computador.' };
      }
      // A anterior só sai depois de a nova estar inteira no índice.
      if (substitui) {
        try { fs.rmSync(wavDe(substitui), { force: true }); } catch (e) { log(`[voz-guardada] gravação substituída ficou no disco: ${(e as Error)?.message ?? e}`); }
      }
      return { ok: true, gravacao };
    },

    ler(id) {
      if (!ehIdDeGravacao(id)) return { ok: false, erro: 'Gravação inválida.' };
      return lerAudio(id);
    },

    apagar(id) {
      if (!ehIdDeGravacao(id)) return { ok: false, erro: 'Gravação inválida.' };
      const lido = lerIndice();
      if (!lido.ok) return { ok: false, erro: 'Não foi possível apagar agora. Tente de novo em instantes.' };
      try {
        if (lido.indice.gravacoes.some((g) => g.id === id)) {
          gravarJsonAtomico(arquivos.indice, { versao: 1, gravacoes: lido.indice.gravacoes.filter((g) => g.id !== id) } satisfies Indice, { indentar: true });
        }
        fs.rmSync(wavDe(id), { force: true });
        return { ok: true };
      } catch (e) {
        log(`[voz-guardada] não foi possível apagar: ${(e as Error)?.message ?? e}`);
        return { ok: false, erro: 'Não foi possível apagar a gravação agora.' };
      }
    },

    apagarDoPerfil(perfilId) {
      if (typeof perfilId !== 'string' || perfilId.length === 0) return { ok: false, erro: 'Perfil inválido.' };
      const MENSAGEM = 'Não foi possível apagar a voz deste paciente agora. Tente de novo em instantes.';
      // Lê os dois ANTES de apagar qualquer coisa: arquivo preso (antivírus) recusa inteiro, e a
      // segunda tentativa encontra tudo como estava.
      const lido = lerIndice();
      if (!lido.ok) return { ok: false, erro: MENSAGEM };
      const termos = lerTermos();
      if (!termos.ok) return { ok: false, erro: MENSAGEM };
      const doPerfil = lido.indice.gravacoes.filter((g) => g.perfilId === perfilId);
      const restantes = lido.indice.gravacoes.filter((g) => g.perfilId !== perfilId);
      const termosRestantes = termos.termos.filter((t) => t.perfilId !== perfilId);
      try {
        // Ordem pensada para a nova tentativa: primeiro os áudios (o dado em si), depois o índice,
        // por último o termo. Se algo falhar no meio, o que sobrou ainda está no índice/termos e a
        // próxima tentativa o encontra; nunca fica áudio sem registro que o mostre.
        for (const g of doPerfil) fs.rmSync(wavDe(g.id), { force: true });
        if (doPerfil.length > 0) {
          gravarJsonAtomico(arquivos.indice, { versao: 1, gravacoes: restantes } satisfies Indice, { indentar: true });
        }
        if (termosRestantes.length !== termos.termos.length) {
          gravarJsonAtomico(arquivos.consentimento, { versao: 2, consentimentos: termosRestantes } satisfies ArquivoDosTermos, { indentar: true });
        }
        return { ok: true };
      } catch (e) {
        log(`[voz-guardada] não foi possível apagar a voz do perfil: ${(e as Error)?.message ?? e}`);
        return { ok: false, erro: MENSAGEM };
      }
    },

    arquivoDe(id) {
      if (!ehIdDeGravacao(id)) return null;
      const lido = lerIndice();
      if (!lido.ok) return null;
      const gravacao = lido.indice.gravacoes.find((g) => g.id === id);
      const caminho = wavDe(id);
      return gravacao && fs.existsSync(caminho) ? { caminho, gravacao } : null;
    },

    arquivosParaBackup() {
      const saida = oQueVaiNoBackup();
      if (!saida.ok) return saida;
      try {
        const lista: ArquivoDoBackupDaVoz[] = [];
        if (saida.gravacoes.length > 0) {
          lista.push({ nome: NOME_DO_INDICE, bytes: jsonDoIndice(saida.gravacoes).byteLength });
          for (const g of saida.gravacoes) lista.push({ nome: `${g.id}.wav`, bytes: fs.statSync(wavDe(g.id)).size });
        }
        if (saida.termos.length > 0) lista.push({ nome: NOME_DOS_TERMOS, bytes: jsonDosTermos(saida.termos).byteLength });
        return { ok: true, arquivos: lista };
      } catch (e) {
        // O áudio sumiu entre a conferência e a medida (antivírus, limpeza manual).
        log(`[voz-guardada] não foi possível medir as gravações para o backup: ${(e as Error)?.message ?? e}`);
        return { ok: false, erro: 'Não foi possível ler as gravações agora. Tente de novo em instantes.' };
      }
    },

    lerArquivoDoBackup(nome) {
      if (!ehNomeDeArquivoDoBackup(nome)) return { ok: false, erro: 'Arquivo desconhecido.' };
      if (nome.endsWith('.wav')) {
        const audio = lerAudio(nome.slice(0, -'.wav'.length));
        return audio.ok ? { ok: true, bytes: audio.wav } : audio;
      }
      const saida = oQueVaiNoBackup();
      if (!saida.ok) return saida;
      return { ok: true, bytes: soOsBytes(nome === NOME_DO_INDICE ? jsonDoIndice(saida.gravacoes) : jsonDosTermos(saida.termos)) };
    },

    async restaurarDoBackup(pedido, opcoes) {
      // Duas restaurações ao mesmo tempo escreveriam nos mesmos arquivos: a segunda espera a vez do cuidador.
      if (restaurando) return { ok: false, erro: 'Já há uma restauração em andamento.' };
      restaurando = true;
      try {
        return await restaurar(pedido, opcoes);
      } finally {
        restaurando = false;
      }
    },
  };
}

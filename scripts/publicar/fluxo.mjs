/**
 * fluxo.mjs — a sequência inteira do `npm run publicar`, na ordem certa, parando
 * no primeiro problema e SEM mandar nada para a internet antes da hora.
 *
 * Pedido de 21/10/2026: o dono publica do PC com Windows e, na última vez, pulou
 * um passo da lista de comandos (o commit do V2): o site subiu com a árvore velha.
 *
 * Tudo que toca o mundo entra pela `op` (injeção), para o teste usar repositórios
 * git de verdade numa pasta temporária, com testes, perguntas, npm, consulta ao
 * site e espera falsos (src/publicacao/publicar.test.ts). A casca real, com
 * `spawnSync`, `readline`, `fetch` e `setTimeout`, é scripts/publicar.mjs.
 *
 * Máquina do dono: um só repositório com duas pastas (worktrees) —
 *   IrisFlow Beta  ramo `main`         o que o Cloudflare Pages publica (push na main)
 *   IrisFlow V2    ramo `pipeline-v2`  onde o código novo chega, sem commit; é daqui que roda
 * Remotos: `origin` (GitHub, push na main publica o site) e `v2` (cópia do pipeline-v2).
 * O script NUNCA mexe em configuração do git (`core.hooksPath` do dono aponta para
 * outra pasta): commits e push passam pelos hooks normalmente, sem `--no-verify`.
 *
 * @typedef {{ codigo: number, saida: string, erro: string }} Resultado
 *
 * @typedef {object} Operacao
 * @property {string} raiz  a pasta IrisFlow V2 (onde está o package.json)
 * @property {{ sim: boolean, semConferirSite: boolean, mensagem: string | null, so: string | null }} argumentos
 *           já lidos por `lerArgumentos`
 * @property {(args: string[], opcoes: { cwd: string }) => Resultado | Promise<Resultado>} git
 * @property {(args: string[], opcoes: { cwd: string }) => Resultado | Promise<Resultado>} npm
 * @property {(pedido: { raiz: string, so: string }) => Promise<boolean>} rodarTestes
 * @property {(texto: string) => Promise<string>} perguntar
 * @property {boolean} temTerminal
 * @property {() => Promise<string | null>} buscarVersaoDoSite  o `commit` de /versao.json, ou null
 * @property {(ms: number) => Promise<void>} esperar
 * @property {() => number} [agora]  o relógio, em milissegundos (padrão: `Date.now`); o prazo da espera do site conta por ele
 * @property {(texto: string) => void} log  uma linha por chamada
 * @property {{ BASE: string, REMOVIDOS: string[], MENSAGEM: { titulo: string, corpo: string } }} estaVersao
 */

import { existsSync, lstatSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PESOS_PERMITIDOS,
  acharPastaDoRamo,
  arquivosProibidos,
  caminhoRemovivel,
  gruposDeTeste,
  lerArgumentos,
  lotesDeCaminhos,
  mesmoCommit,
  montarMensagem,
  respostaEhSim,
  segredosNoDiff,
} from './logica.mjs';

const RAMO_DO_V2 = 'pipeline-v2';
const RAMO_DA_BETA = 'main';

/** Pastas com `package.json` próprio e `package-lock.json`. */
const PASTAS_COM_NPM = ['.', 'frontend', 'site', 'app'];
/**
 * O app do cuidador (Expo) é opcional na máquina do dono: o CI do GitHub o
 * confere. Aqui ele só é atualizado se JÁ estiver instalado — instalá-lo do zero
 * (centenas de MB, no OneDrive) por causa de um site seria travar a publicação
 * com algo que não é dela.
 */
const PASTA_OPCIONAL = 'app';

const ENDERECO_DO_SITE = 'https://irisflow.ia.br';
const INTERVALO_DO_SITE_MS = 15_000;
const LIMITE_DO_SITE_MS = 8 * 60 * 1000;
/** O Windows recusa linha de comando muito longa: `git rm` vai em lotes deste tamanho. */
const LINHA_DE_COMANDO_MAXIMA = 6000;

const PERGUNTA = 'Publicar agora no site? Digite S e Enter (outra coisa cancela): ';
const CANCELADO = 'Cancelado. O commit ficou salvo no V2; nada foi enviado.';

/** Um problema que para a publicação, com uma explicação em português simples. */
class Parou extends Error {
  /** @param {string} motivo @param {string[]} [detalhes] linhas extras, mostradas logo abaixo do "PAROU" */
  constructor(motivo, detalhes = []) {
    super(motivo);
    this.name = 'Parou';
    this.detalhes = detalhes;
  }
}

/** @returns {Resultado} */
function normalizar(r) {
  return {
    codigo: Number.isInteger(r?.codigo) ? r.codigo : 1,
    saida: String(r?.saida ?? ''),
    erro: String(r?.erro ?? ''),
  };
}

/** As primeiras linhas do que o git reclamou, para o dono (ou quem o ajuda) ver o porquê. */
function detalhesDoGit(resultado) {
  const texto = (resultado.erro.trim() || resultado.saida.trim()).split(/\r?\n/).filter(Boolean);
  return texto.slice(0, 5).map((linha) => `  git: ${linha}`);
}

/**
 * Publica. Devolve `{ codigo, etapa }`: 0 quando terminou (ou não havia o que
 * publicar, ou o dono cancelou) e 1 quando parou num problema; `etapa` é o nome
 * da etapa onde terminou.
 *
 * @param {Operacao} op
 * @returns {Promise<{ codigo: 0 | 1, etapa: string }>}
 */
export async function publicar(op) {
  const raiz = op.raiz;
  const log = (texto = '') => op.log(texto);
  // `siteMudou`: o envio mexe em site/? (sem isso o Cloudflare Pages não faz build novo; ver `oSiteMudou`)
  // O resto é o que já ficou feito no computador do dono, para o PAROU contar e ensinar a desfazer
  // (`oQueJaFicouFeito`): arquivos apagados, commit desta rodada, a main da Beta que andou.
  const estado = {
    etapa: 'Conferir as pastas',
    enviou: false,
    siteMudou: true,
    pastaBeta: /** @type {string | null} */ (null),
    removidos: /** @type {string[]} */ ([]),
    removidosDe: /** @type {string | null} */ (null),
    // Os da lista que o git não conhecia (só copiados para a pasta) e que foram apagados do disco: não voltam pelo git.
    apagadosSemGit: /** @type {string[]} */ ([]),
    commit: /** @type {string | null} */ (null),
    betaAntes: /** @type {string | null} */ (null),
  };
  const ctx = {
    op,
    raiz,
    log,
    estado,
    argumentos: op.argumentos ?? lerArgumentos([]),
    versao: { BASE: '', REMOVIDOS: [], MENSAGEM: { titulo: 'IrisFlow: atualização', corpo: '' }, ...(op.estaVersao ?? {}) },
    etapa: (nome) => {
      estado.etapa = nome;
      log(`▶ ${nome}`);
    },
    /** @returns {Promise<Resultado>} */
    git: async (args, cwd = raiz) => normalizar(await op.git(args, { cwd })),
  };

  try {
    const { pastaBeta } = await conferirAsPastas(ctx);
    await tirarOsArquivosQueSairam(ctx);
    await cuidarDasDependencias(ctx);
    await rodarOsTestes(ctx);
    await conferirOQueVaiJunto(ctx);
    if ((await fazerOCommit(ctx)) === 'nada') return { codigo: 0, etapa: estado.etapa };
    if (!(await resumirEPerguntar(ctx))) return { codigo: 0, etapa: estado.etapa };
    await atualizarABeta(ctx, pastaBeta);
    await enviar(ctx, pastaBeta);
  } catch (erro) {
    const motivo = erro instanceof Parou ? erro.message : `erro inesperado: ${erro?.message ?? erro}`;
    log(`PAROU: ${motivo}`);
    for (const linha of erro?.detalhes ?? []) log(linha);
    log(estado.enviou ? 'O envio ao GitHub já tinha sido feito antes deste erro.' : 'Nada foi enviado para a internet.');
    for (const linha of oQueJaFicouFeito(estado)) log(linha);
    return { codigo: 1, etapa: estado.etapa };
  }

  // O envio deu certo: daqui em diante nada vira falha, só aviso.
  try {
    if (estado.siteMudou === false && !ctx.argumentos.semConferirSite) {
      ctx.etapa('Conferir o site');
      log('  Este envio não mexe em site/: o Cloudflare Pages não faz build novo, então não há o que esperar.');
    } else {
      const cabeca = await ctx.git(['rev-parse', 'HEAD']);
      await conferirOSite(ctx, cabeca.saida.trim());
    }
  } catch (erro) {
    log(`Aviso: não consegui conferir o site (${erro?.message ?? erro}). O envio ao GitHub deu certo.`);
  }
  log('Pronto.');
  log('Se o app do cuidador também mudou: cd app; npx eas-cli update --channel preview --environment preview   (README: "App do cuidador (EAS)")');
  log('Se vai sair um instalador novo: crie a tag v1.0.0-beta.<n>   (README: "Instalador e atualização automática", "Publicar uma versão")');
  return { codigo: 0, etapa: 'Fim' };
}

/**
 * O que o PAROU conta depois de "Nada foi enviado": o que já ficou feito no
 * computador do dono (nada disso foi para a internet) e como desfazer, em
 * linguagem simples, com os comandos prontos para copiar (linhas recuadas em
 * 4 espaços). Relato da revisão de 21/10/2026: quem lia só o PAROU não sabia que
 * os arquivos já estavam apagados, o commit feito e a main da Beta andada.
 * Depois do envio ao GitHub desfazer não faz mais sentido: devolve [].
 *
 * @returns {string[]}
 */
function oQueJaFicouFeito(estado) {
  if (estado.enviou) return [];
  const feito = [];
  const desfazer = []; // { onde, para, comando }
  const nRemovidos = estado.removidos.length;

  if (nRemovidos > 0) {
    feito.push(nRemovidos === 1 ? 'Apaguei da pasta do V2 1 arquivo que saiu nesta versão.' : `Apaguei da pasta do V2 os ${nRemovidos} arquivos que saíram nesta versão.`);
  }
  if (estado.apagadosSemGit.length > 0) {
    feito.push(`Apaguei também ${quantosNuncaCommitados(estado.apagadosSemGit.length)} (eles não voltam pelo git; o código novo não os usa).`);
  }
  if (estado.commit) feito.push(`Fiz o commit ${estado.commit} no V2.`);
  if (estado.betaAntes) feito.push(`Avancei a pasta da Beta (a main) até ${estado.commit ? 'esse commit' : 'o commit do V2'}.`);
  if (feito.length === 0) return [];

  // Desfazer, nesta ordem: a Beta primeiro (senão o V2 ficaria atrás dela), depois o commit, depois os arquivos.
  if (estado.betaAntes) {
    desfazer.push({
      onde: `Na pasta da Beta${estado.pastaBeta ? ` (${estado.pastaBeta})` : ''}`,
      para: 'para voltar a main para onde estava',
      comando: `git reset --keep ${estado.betaAntes.slice(0, 10)}`,
    });
  }
  if (estado.commit) {
    desfazer.push({
      onde: 'Na pasta do V2',
      para: 'para desfazer o commit (seus arquivos voltam para a fila do commit)',
      comando: 'git reset --soft HEAD~1',
    });
  }
  if (nRemovidos > 0) {
    const comando = comandoParaTrazerDeVolta(estado.removidos, estado.removidosDe);
    desfazer.push(
      comando
        ? {
            onde: 'Na pasta do V2',
            para: `para trazer de volta ${nRemovidos === 1 ? 'o arquivo que saiu' : 'os arquivos que saíram'} (o resto não é mexido)`,
            comando,
          }
        : {
            onde: 'Na pasta do V2',
            para: `para trazer de volta os ${nRemovidos} arquivos que saíram: são muitos para eu escrever o comando aqui, me chame`,
            comando: null,
          },
    );
  }

  const linhas = ['Já ficou feito, só no seu computador:', ...feito.map((linha) => `  - ${linha}`)];
  linhas.push('Para continuar: corrija o problema e rode npm run publicar de novo (ele retoma daqui).');
  linhas.push('Se preferir desistir e desfazer, nesta ordem:');
  desfazer.forEach((passo, i) => {
    linhas.push(`  ${i + 1}. ${passo.onde}, ${passo.para}${passo.comando ? ':' : '.'}`);
    if (passo.comando) linhas.push(`    ${passo.comando}`);
  });
  return linhas;
}

/**
 * O comando que devolve os arquivos apagados, a partir do commit de ANTES de
 * eles saírem (`--source`): vale com ou sem o commit desfeito. Só para poucos
 * arquivos de nome simples (copiar um comando enorme, ou com aspas e `$`, no
 * PowerShell dá errado); senão null.
 */
function comandoParaTrazerDeVolta(caminhos, deOnde) {
  if (!deOnde || caminhos.length > 5) return null;
  if (!caminhos.every((caminho) => /^[^"`$%^&|<>\r\n]+$/.test(caminho))) return null;
  return `git --literal-pathspecs restore --source=${deOnde.slice(0, 10)} --staged --worktree -- ${caminhos.map((c) => `"${c}"`).join(' ')}`;
}

// ---------------------------------------------------------------------------
// 1. Conferir as pastas
// ---------------------------------------------------------------------------

async function conferirAsPastas({ etapa, git, log, estado }) {
  etapa('Conferir as pastas');

  // `-q`: o git sai com 1 quando o HEAD está solto (sem ramo) e com 128 quando falha de verdade
  // (pasta "duvidosa", repositório quebrado). Só o 1 é "sem ramo"; o resto mostra o que o git disse.
  const atual = await git(['symbolic-ref', '--short', '-q', 'HEAD']);
  if (atual.codigo !== 0 && atual.codigo !== 1) throw new Parou('Não consegui ler em que ramo o git está', detalhesDoGit(atual));
  const ramo = atual.codigo === 0 ? atual.saida.trim() : '';
  if (ramo !== RAMO_DO_V2) {
    throw new Parou('Rode este comando dentro da pasta IrisFlow V2', [
      `  (esta pasta está ${ramo ? `no ramo "${ramo}"` : 'sem ramo'}; a do V2 tem de estar no ramo "${RAMO_DO_V2}")`,
    ]);
  }

  const pastas = await git(['worktree', 'list', '--porcelain']);
  if (pastas.codigo !== 0) throw new Parou('Não consegui listar as pastas deste repositório (a Beta e o V2)', detalhesDoGit(pastas));
  const pastaBeta = acharPastaDoRamo(pastas.saida, RAMO_DA_BETA);
  if (!pastaBeta) throw new Parou('Não achei a pasta da Beta (ramo main)');
  estado.pastaBeta = pastaBeta;
  log(`  Beta (main): ${pastaBeta}`);

  const sujeira = await git(['status', '--porcelain'], pastaBeta);
  if (sujeira.codigo !== 0) throw new Parou('Não consegui ler o estado da pasta da Beta', detalhesDoGit(sujeira));
  const mudancas = sujeira.saida.split(/\r?\n/).filter((linha) => linha.trim() !== '');
  if (mudancas.length > 0) {
    const detalhes = mudancas.slice(0, 10).map((linha) => `  ${linha}`);
    if (mudancas.length > 10) detalhes.push(`  …e mais ${mudancas.length - 10}`);
    detalhes.push('  (salve ou desfaça isso na pasta da Beta e rode de novo)');
    throw new Parou('A pasta IrisFlow Beta tem mudanças não salvas', detalhes);
  }

  const origin = await git(['remote', 'get-url', 'origin']);
  if (origin.codigo !== 0) throw new Parou('Não achei o endereço do GitHub (o remoto origin) neste repositório', detalhesDoGit(origin));

  const busca = await git(['fetch', 'origin', 'main']);
  if (busca.codigo !== 0) throw new Parou('Sem internet ou sem acesso ao GitHub', detalhesDoGit(busca));

  // O V2 tem de conter tudo que o GitHub e a Beta já têm: senão o push da main
  // seria recusado, ou (pior) um merge misturaria trabalho de outra origem.
  const noOrigin = await git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
  const naBeta = await git(['merge-base', '--is-ancestor', 'main', 'HEAD']);
  // 0 = é ancestral; 1 = não é; qualquer outro código é o git falhando (não pode virar "tem commits a mais")
  for (const r of [noOrigin, naBeta]) {
    if (r.codigo !== 0 && r.codigo !== 1) throw new Parou('Não consegui comparar o V2 com o GitHub e a Beta', detalhesDoGit(r));
  }
  if (noOrigin.codigo !== 0 || naBeta.codigo !== 0) {
    throw new Parou('O GitHub (ou a Beta) tem commits que não estão no V2. Não vou misturar: me chame.');
  }
  return { pastaBeta };
}

// ---------------------------------------------------------------------------
// 2. Arquivos que saíram
// ---------------------------------------------------------------------------

async function tirarOsArquivosQueSairam({ etapa, git, log, versao, estado, raiz }) {
  etapa('Arquivos que saíram');
  const removidos = Array.isArray(versao.REMOVIDOS) ? versao.REMOVIDOS : [];
  if (removidos.length === 0) {
    log('  Nenhum arquivo saiu nesta versão.');
    return;
  }

  // A lista é DESTA versão. Só vale se o V2 está exatamente onde ela foi
  // calculada (BASE = prefixo do HEAD de antes do código novo): senão uma lista
  // velha poderia apagar um arquivo que voltou numa versão futura.
  const cabeca = await git(['rev-parse', 'HEAD']);
  if (cabeca.codigo !== 0) throw new Parou('Não consegui ler o commit atual do V2', detalhesDoGit(cabeca));
  const base = String(versao.BASE ?? '').trim().toLowerCase();
  if (base.length < 7 || !cabeca.saida.trim().toLowerCase().startsWith(base)) {
    log('lista de removidos é de outra versão; nada removido');
    if (base.length < 7) log('  (a BASE em scripts/publicar/estaVersao.mjs está vazia ou curta demais)');
    return;
  }

  const invalidos = removidos.filter((caminho) => !caminhoRemovivel(caminho));
  if (invalidos.length > 0) {
    throw new Parou(
      'A lista de arquivos que saíram (scripts/publicar/estaVersao.mjs) tem caminho que não serve: ' +
        'tem de ser relativo à raiz, com "/", sem ".." e sem ".git"',
      invalidos.slice(0, 5).map((caminho) => `  ${JSON.stringify(caminho)}`),
    );
  }

  log(`  Tirando ${removidos.length} caminho(s) que saíram nesta versão.`);
  for (const lote of lotesDeCaminhos(removidos, LINHA_DE_COMANDO_MAXIMA)) {
    // --literal-pathspecs: `[id].tsx` e `*` são nomes, não curingas (as rotas do app têm colchetes).
    // Antes de apagar, anota quais do lote existem de verdade: é o que o PAROU promete trazer de volta.
    const existentes = await git(['--literal-pathspecs', 'ls-files', '-z', '--', ...lote]);
    if (existentes.codigo !== 0) throw new Parou('Não consegui ver quais arquivos antigos existem (o git ls-files falhou)', detalhesDoGit(existentes));
    const r = await git(['--literal-pathspecs', 'rm', '-q', '--ignore-unmatch', '--', ...lote]);
    if (r.codigo !== 0) throw new Parou('Não consegui tirar os arquivos antigos (o git rm falhou)', detalhesDoGit(r));
    estado.removidosDe ??= cabeca.saida.trim();
    estado.removidos.push(...existentes.saida.split('\0').filter(Boolean));
    await apagarOsQueNuncaForamCommitados({ git, log, raiz, estado }, lote);
  }
  if (estado.apagadosSemGit.length > 0) {
    log(`  Apaguei da pasta ${quantosNuncaCommitados(estado.apagadosSemGit.length)} (só estavam copiados para cá).`);
  }
}

/** "1 arquivo que nunca tinha sido commitado" / "3 arquivos que nunca tinham sido commitados". */
function quantosNuncaCommitados(n) {
  return n === 1 ? '1 arquivo que nunca tinha sido commitado' : `${n} arquivos que nunca tinham sido commitados`;
}

/**
 * Relato de 21/10/2026: no PC do dono, parte do site v3 foi copiada para a
 * pasta do V2 e nunca commitada. O `git rm --ignore-unmatch` não toca no que o
 * git não conhece, então esses arquivos ficavam lá, importando componentes que
 * esta versão apagou, e o build do site quebrava. Depois do `git rm` de cada
 * lote, todo caminho da lista que ainda existe no disco e não é rastreado é
 * apagado.
 *
 * Só chega aqui com a BASE conferida (a lista é DESTA versão) e com todos os
 * caminhos já validados por `caminhoRemovivel` (relativo, sem "..", sem
 * absoluto). Mesmo assim, três regras, para uma lista errada nunca apagar mais
 * do que ela diz: só ARQUIVO (uma pasta da lista é recusada, com aviso, junto
 * com o que há dentro dela); nunca fora do repositório (a pasta que contém o
 * arquivo, com os atalhos resolvidos, tem de estar dentro da raiz); e um
 * atalho (link simbólico) é apagado como atalho, sem tocar no que ele aponta.
 */
async function apagarOsQueNuncaForamCommitados({ git, log, raiz, estado }, lote) {
  // O que ainda está no git depois do `git rm` não é deste passo (o `git rm` já teria falhado).
  const rastreados = await git(['--literal-pathspecs', 'ls-files', '-z', '--', ...lote]);
  if (rastreados.codigo !== 0) {
    throw new Parou('Não consegui ver quais arquivos antigos ainda estão no git (o git ls-files falhou)', detalhesDoGit(rastreados));
  }
  const aindaNoGit = new Set(rastreados.saida.split('\0').filter(Boolean));
  const raizReal = realpathSync(raiz);

  for (const caminho of lote) {
    if (aindaNoGit.has(caminho)) continue;
    const alvo = path.join(raiz, ...caminho.split('/'));
    let info;
    try {
      info = lstatSync(alvo);
    } catch {
      continue; // não existe: o caso comum (o `git rm` já o tirou, ou saiu numa versão anterior)
    }
    if (info.isDirectory()) {
      log(`  ${caminho}: é uma pasta; só apago arquivo, deixei como está`);
      continue;
    }
    if (!estaDentroDe(raizReal, realpathSync(path.dirname(alvo)))) {
      log(`  ${caminho}: aponta para fora do repositório; deixei como está`);
      continue;
    }
    try {
      unlinkSync(alvo);
    } catch (erro) {
      throw new Parou(`Não consegui apagar ${caminho} da pasta`, [`  ${erro?.message ?? erro}`]);
    }
    estado.apagadosSemGit.push(caminho);
  }
}

/** `pasta` é a própria `raiz` ou está dentro dela? (os dois já com os atalhos resolvidos) */
function estaDentroDe(raiz, pasta) {
  const relativo = path.relative(raiz, pasta);
  return relativo === '' || (!relativo.startsWith('..') && !path.isAbsolute(relativo));
}

// ---------------------------------------------------------------------------
// 3. Dependências
// ---------------------------------------------------------------------------

async function cuidarDasDependencias({ etapa, git, log, op, raiz }) {
  etapa('Dependências');
  for (const pasta of PASTAS_COM_NPM) {
    const dir = path.join(raiz, pasta);
    if (!existsSync(path.join(dir, 'package-lock.json'))) continue;
    const nome = pasta === '.' ? 'raiz' : pasta;
    const temModulos = existsSync(path.join(dir, 'node_modules'));

    if (pasta === PASTA_OPCIONAL && !temModulos) {
      log(`  ${nome}: sem node_modules aqui; o app é opcional, não instalo`);
      continue;
    }
    let motivo = null;
    if (!temModulos) {
      motivo = 'node_modules não existe';
    } else {
      const lock = path.posix.join(pasta, 'package-lock.json');
      const igual = await git(['diff', '--quiet', 'HEAD', '--', lock]);
      if (igual.codigo !== 0) motivo = 'o package-lock.json mudou';
    }
    if (motivo === null) {
      log(`  ${nome}: em dia`);
      continue;
    }
    log(`  ${nome}: npm ci (${motivo})`);
    const r = normalizar(await op.npm(['ci'], { cwd: dir }));
    if (r.codigo !== 0) {
      throw new Parou(`O npm ci falhou em ${nome}. Feche o VS Code e o IrisFlow aberto e rode de novo.`, detalhesDoGit(r));
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Testes
// ---------------------------------------------------------------------------

async function rodarOsTestes({ etapa, log, op, raiz, argumentos }) {
  etapa('Testes');
  const temApp = existsSync(path.join(raiz, 'app', 'node_modules'));
  if (!argumentos.so && !temApp) log('  app do cuidador: conferido pelo CI no GitHub');
  // O site é o que vai ao ar: `--so` nunca o tira (revisão de 21/10/2026), só acrescenta ou reduz o resto.
  const grupos = gruposDeTeste(argumentos.so, temApp);
  const so = grupos.join(',');
  if (argumentos.so && !argumentos.so.split(',').some((grupo) => grupo.trim() === 'site')) {
    log('  (o grupo site sempre entra, mesmo com --so: é o que vai ao ar)');
  }
  log(`  grupos: ${so}`);
  // Não existe jeito de pular: os testes são o portão (o mesmo do CI).
  if (!(await op.rodarTestes({ raiz, so }))) {
    throw new Parou('Os testes não passaram (veja acima qual passo falhou). Corrija e rode de novo');
  }
}

// ---------------------------------------------------------------------------
// 5. Conferir o que vai junto
// ---------------------------------------------------------------------------

/**
 * Esvazia a fila do commit (`git reset -q`: não mexe nos arquivos da pasta).
 * Devolve as linhas que contam ao dono o que NÃO deu certo; vazio = deu. O
 * código de saída é conferido: se o git falhar, não se diz que a fila foi
 * esvaziada e o comando fica à vista para rodar à mão (revisão de 21/10/2026).
 *
 * @returns {Promise<{ esvaziou: boolean, linhas: string[] }>}
 */
async function esvaziarAFila(git) {
  const r = await git(['reset', '-q']);
  if (r.codigo === 0) return { esvaziou: true, linhas: [] };
  return {
    esvaziou: false,
    linhas: [
      'Não consegui tirar tudo da fila do commit sozinho. Na pasta IrisFlow V2, rode este comando (ele só esvazia a fila; seus arquivos ficam como estão):',
      '    git reset -q',
      ...detalhesDoGit(r),
    ],
  };
}

/** Tira repetidos (mesmo arquivo e motivo) mantendo a ordem. */
function semRepetidos(achados) {
  const vistos = new Set();
  return achados.filter(({ arquivo, motivo }) => {
    const chave = `${arquivo}\u0000${motivo}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

async function conferirOQueVaiJunto({ etapa, git, log }) {
  etapa('Conferir o que vai junto');
  const adicionou = await git(['add', '-A']);
  if (adicionou.codigo !== 0) throw new Parou('O git add falhou', detalhesDoGit(adicionou));

  // Prefixos fixos: o formato do diff não pode depender de diff.noprefix/mnemonicPrefix do dono.
  const formato = ['-U0', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/'];

  // (a) O que está na fila e vai no commit desta rodada.
  const nomes = await git(['diff', '--cached', '--name-status']);
  const trechos = await git(['diff', '--cached', ...formato]);
  if (nomes.codigo !== 0 || trechos.codigo !== 0) {
    const fila = await esvaziarAFila(git);
    throw new Parou('Não consegui ler o que vai no commit', [...detalhesDoGit(nomes.codigo !== 0 ? nomes : trechos), ...fila.linhas]);
  }

  // (b) O que JÁ está em commits do V2 à frente do GitHub: o push leva todos eles, não só o de agora
  // (commits feitos à mão antes, de rodadas canceladas…). Commit por commit (`log -p`), e não a soma
  // (`diff origin/main HEAD`): uma chave posta num commit e tirada no seguinte some da soma mas continua
  // no histórico que vai para o repositório público. `-m` olha também o que um merge trouxe.
  // Revisão de 21/10/2026.
  const commitsNomes = await git(['log', '-m', '--name-status', '--format=', 'origin/main..HEAD', '--']);
  const commitsTrechos = await git(['log', '-m', '-p', ...formato, '--format=', 'origin/main..HEAD', '--']);
  if (commitsNomes.codigo !== 0 || commitsTrechos.codigo !== 0) {
    const fila = await esvaziarAFila(git);
    throw new Parou('Não consegui ler os commits que já estavam à frente do GitHub', [
      ...detalhesDoGit(commitsNomes.codigo !== 0 ? commitsNomes : commitsTrechos),
      ...fila.linhas,
    ]);
  }

  const naFila = semRepetidos([...arquivosProibidos(nomes.saida, PESOS_PERMITIDOS), ...segredosNoDiff(trechos.saida)]);
  const nosCommits = semRepetidos([
    ...arquivosProibidos(commitsNomes.saida, PESOS_PERMITIDOS),
    ...segredosNoDiff(commitsTrechos.saida),
  ]);
  if (naFila.length > 0 || nosCommits.length > 0) {
    // `git reset -q` tira tudo do índice e não mexe nos arquivos da pasta.
    const fila = await esvaziarAFila(git);
    const detalhes = [
      ...naFila.map((a) => `Isto não pode ir para o repositório público: ${a.arquivo} — ${a.motivo}`),
      ...nosCommits.map(
        (a) => `Isto não pode ir para o repositório público: ${a.arquivo} — ${a.motivo} (já está num commit do V2 que ainda não foi enviado)`,
      ),
    ];
    if (naFila.length > 0 && fila.esvaziou) {
      detalhes.push('Tirei tudo da fila do commit (git reset); seus arquivos continuam como estavam. Tire isso da pasta e rode de novo.');
    }
    if (nosCommits.length > 0) {
      detalhes.push(
        'O que já está num commit do V2 não pode ser enviado assim. Não mexa nesse commit e não envie nada: me chame para limpá-lo antes de publicar.',
      );
    }
    throw new Parou('O que ia junto no envio tem coisa que não pode ir para o repositório público', [...detalhes, ...fila.linhas]);
  }
  const total = nomes.saida.split(/\r?\n/).filter((linha) => linha.trim() !== '').length;
  log(total === 0 ? '  Nada novo na pasta do V2.' : `  ${total} arquivo(s) vão junto; nada que não possa ir.`);
}

// ---------------------------------------------------------------------------
// 6. Commit
// ---------------------------------------------------------------------------

/** @returns {Promise<'commitou' | 'ja-commitado' | 'nada'>} */
async function fazerOCommit({ etapa, git, log, argumentos, versao, estado }) {
  etapa('Commit');
  const pendente = await git(['diff', '--cached', '--quiet']);

  if (pendente.codigo === 0) {
    // Nada no índice. Se o V2 já está no mesmo commit do GitHub, não há o que publicar;
    // se está à frente (uma rodada anterior commitou e foi cancelada), o envio segue.
    const cabeca = await git(['rev-parse', 'HEAD']);
    const noOrigin = await git(['rev-parse', 'origin/main']);
    if (cabeca.codigo === 0 && noOrigin.codigo === 0 && cabeca.saida.trim() === noOrigin.saida.trim()) {
      log('Nada novo para publicar.');
      return 'nada';
    }
    log('  Nada novo para commitar, mas o V2 tem commits que ainda não foram para o GitHub.');
    return 'ja-commitado';
  }
  if (pendente.codigo !== 1) throw new Parou('Não consegui ler o que vai no commit', detalhesDoGit(pendente));

  const mensagem = montarMensagem(argumentos.mensagem, versao.MENSAGEM);
  if (mensagem.trim() === '') {
    throw new Parou('A mensagem do commit está vazia (confira MENSAGEM em scripts/publicar/estaVersao.mjs ou use --mensagem)');
  }
  // -F com arquivo temporário: mensagem com aspas, acento e várias linhas passa igual no PowerShell.
  const pasta = mkdtempSync(path.join(tmpdir(), 'irisflow-publicar-'));
  try {
    const arquivo = path.join(pasta, 'mensagem.txt');
    writeFileSync(arquivo, mensagem, 'utf8');
    const r = await git(['commit', '-q', '-F', arquivo]);
    if (r.codigo !== 0) {
      throw new Parou('O commit foi recusado (veja a mensagem do git acima: pode ser um aviso de hook)', detalhesDoGit(r));
    }
  } finally {
    try {
      rmSync(pasta, { recursive: true, force: true });
    } catch {
      // Arquivo temporário que ficou para trás não atrapalha ninguém.
    }
  }
  const curto = await git(['rev-parse', '--short', 'HEAD']);
  estado.commit = curto.saida.trim() || null;
  log(`  commit ${curto.saida.trim()}: ${mensagem.split('\n')[0]}`);
  return 'commitou';
}

// ---------------------------------------------------------------------------
// 7. Resumo e pergunta
// ---------------------------------------------------------------------------

/** @returns {Promise<boolean>} true = pode publicar */
async function resumirEPerguntar({ etapa, git, log, op, argumentos }) {
  etapa('Resumo e pergunta');
  const contagem = await git(['rev-list', '--count', 'origin/main..HEAD']);
  const total = Number.parseInt(contagem.saida.trim(), 10);
  if (contagem.codigo !== 0 || !Number.isInteger(total)) {
    throw new Parou('Não consegui contar os commits que vão para o site', detalhesDoGit(contagem));
  }
  const ultimos = await git(['log', '--oneline', '-5', 'origin/main..HEAD']);
  const mudancas = await git(['diff', '--shortstat', 'origin/main', 'HEAD']);

  log(total === 1 ? 'Vai 1 commit para o site:' : `Vão ${total} commits para o site:`);
  for (const linha of ultimos.saida.split(/\r?\n/).filter(Boolean)) log(`  ${linha}`);
  const resumo = mudancas.saida.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean).pop();
  if (resumo) log(`  ${resumo}`);

  if (argumentos.sim) return true;
  if (!op.temTerminal) {
    log(CANCELADO);
    return false;
  }
  if (respostaEhSim(await op.perguntar(PERGUNTA))) return true;
  log(CANCELADO);
  return false;
}

// ---------------------------------------------------------------------------
// 8. Beta
// ---------------------------------------------------------------------------

async function atualizarABeta({ etapa, git, log, estado }, pastaBeta) {
  etapa('Beta');
  // A Beta é a pasta da main: ela só anda para a frente, até o commit do V2.
  const antes = await git(['rev-parse', 'HEAD'], pastaBeta);
  const r = await git(['merge', '--ff-only', RAMO_DO_V2], pastaBeta);
  if (r.codigo !== 0) {
    throw new Parou('Não consegui atualizar a pasta da Beta (a main não anda em linha reta até o pipeline-v2)', detalhesDoGit(r));
  }
  // Se a main andou, guarda de onde ela veio: o PAROU ensina a voltá-la (`git reset --keep`).
  const depois = await git(['rev-parse', 'HEAD'], pastaBeta);
  const de = antes.codigo === 0 ? antes.saida.trim() : '';
  if (/^[0-9a-f]{7,40}$/.test(de) && depois.codigo === 0 && depois.saida.trim() !== de) estado.betaAntes = de;
  log('  Beta em dia com o V2.');
}

// ---------------------------------------------------------------------------
// 9. Envio
// ---------------------------------------------------------------------------

/**
 * O que vai agora para o GitHub mexe em `site/`? O Cloudflare Pages só faz build
 * quando muda algo ali (build watch paths `site/*`, README: "Site no Cloudflare
 * Pages"); sem build novo, o /versao.json não muda e esperar por ele seria esperar
 * à toa e acabar num aviso falso. Tem de ser chamado ANTES do push, quando
 * `origin/main` ainda é o commit de antes. Na dúvida, true (espera como de costume).
 */
async function oSiteMudou(git) {
  const antes = await git(['rev-parse', 'origin/main']);
  if (antes.codigo !== 0 || antes.saida.trim() === '') return true;
  const igual = await git(['diff', '--quiet', antes.saida.trim(), 'HEAD', '--', 'site']);
  return igual.codigo !== 0; // 0 = nada mudou em site/; 1 = mudou; outro código = não sei
}

async function enviar({ etapa, git, log, estado }, pastaBeta) {
  etapa('Envio');
  estado.siteMudou = await oSiteMudou(git);
  const principal = await git(['push', 'origin', 'main'], pastaBeta);
  if (principal.codigo !== 0) {
    // O commit e a main local ficam como estão: rodar de novo tenta só o envio.
    throw new Parou('O envio ao GitHub falhou. Se ele pediu login, entre no GitHub e rode de novo.', detalhesDoGit(principal));
  }
  estado.enviou = true;
  log(estado.siteMudou ? '  main enviada ao GitHub (origin): o Cloudflare Pages começa a publicar.' : '  main enviada ao GitHub (origin).');

  const temV2 = await git(['remote', 'get-url', 'v2']);
  if (temV2.codigo !== 0) {
    log('  O remoto v2 não existe neste repositório; pulei a cópia do V2.');
    return;
  }
  const copia = await git(['push', 'v2', RAMO_DO_V2]);
  if (copia.codigo !== 0) {
    log('Aviso: a cópia no IrisFlow-V2 não foi; rode `git push v2 pipeline-v2` depois.');
    for (const linha of detalhesDoGit(copia)) log(linha);
  } else {
    log('  pipeline-v2 enviado ao remoto v2.');
  }
}

// ---------------------------------------------------------------------------
// 10. Conferir o site
// ---------------------------------------------------------------------------

/**
 * Espera o site mostrar o commit que acabamos de enviar: pergunta a cada 15 s,
 * por até 8 minutos. Devolve true quando o site novo apareceu e false quando
 * não apareceu (passou o tempo) ou a conferência foi pulada; nunca lança por
 * causa da rede, e passar o tempo é só um aviso (o envio já deu certo).
 *
 * @returns {Promise<boolean>}
 */
export async function conferirOSite({ etapa, log, op, argumentos }, shaEnviado) {
  etapa('Conferir o site');
  if (argumentos.semConferirSite) {
    log('  Pulado (--sem-conferir-site).');
    return false;
  }
  log('  Esperando o site novo aparecer (o Cloudflare costuma levar de 1 a 3 minutos)…');
  // O prazo conta pelo RELÓGIO e não pela soma das esperas: cada consulta ao site pode levar até 10 s
  // (casca) e, em rede ruim, somar só as esperas esticava os 8 minutos para uns 13 (revisão de 21/10/2026).
  const agora = op.agora ?? Date.now;
  const comeco = agora();
  let minutosAvisados = 0;
  for (;;) {
    let publicado = null;
    try {
      publicado = await op.buscarVersaoDoSite();
    } catch {
      publicado = null; // rede fora ou 404: ainda não
    }
    if (mesmoCommit(publicado, shaEnviado)) {
      log(`✔ Site novo no ar: ${ENDERECO_DO_SITE}`);
      return true;
    }
    const passou = agora() - comeco;
    if (passou >= LIMITE_DO_SITE_MS) break;
    const minutos = Math.floor(passou / 60_000);
    if (minutos > minutosAvisados) {
      minutosAvisados = minutos;
      log(`  …ainda esperando (${minutos} min)`);
    }
    // Não dorme além do prazo: a última espera é só o que falta.
    await op.esperar(Math.min(INTERVALO_DO_SITE_MS, LIMITE_DO_SITE_MS - passou));
  }
  // O envio deu certo: isto é só um aviso.
  log(
    'O site ainda não mostra a versão nova. Veja Cloudflare → Workers e Pages → irisflow-communicator → Deployments: ' +
      'se o build falhou, o log diz por quê.',
  );
  return false;
}

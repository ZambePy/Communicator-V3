/**
 * logica.mjs — as partes PURAS do `npm run publicar` (scripts/publicar.mjs).
 *
 * Aqui não há git, rede nem disco: só texto entra e decisão sai. Ficam
 * separadas do fluxo (fluxo.mjs) para serem testadas sem repositório
 * (src/publicacao/publicar.test.ts) — é a parte que decide o que NÃO pode ir
 * para o repositório público, então é a que mais precisa de teste.
 *
 * Pedido de 21/10/2026: na última publicação o dono pulou um passo da lista de
 * comandos (o commit do V2) e o site subiu com a árvore velha.
 */

/**
 * Arquivos de modelo que já são versionados DE PROPÓSITO e por isso podem
 * aparecer num commit sem ser barrados. Lista fixa, gerada em 21/10/2026 com
 * `git ls-files`, filtrando as extensões de pesos (onnx, pt, pth, ckpt,
 * safetensors, h5, tflite), na base desta tarefa (commit 0784ba0): saiu VAZIA.
 * Os pesos ficam fora do git (`.gitignore`: `*.onnx`, `*.pt`, ...); só as
 * `*.meta.json` entram, e elas não têm extensão de pesos. Se um dia um peso
 * passar a ser versionado de propósito, o caminho entra aqui. Pesos do
 * GazeGene e do EyeNet nunca entram: a regra deles vale mesmo na lista.
 */
export const PESOS_PERMITIDOS = [];

/** Extensões de pesos de modelo (comparadas em minúsculas). */
const EXTENSOES_DE_PESOS = ['.onnx', '.pt', '.pth', '.ckpt', '.safetensors', '.h5', '.tflite'];

/** Os dois únicos `.env*` que podem ir: a configuração pública e o modelo de exemplo. */
const ENV_PERMITIDOS = ['.env.production', '.env.example'];

/** Chaves e certificados: guardam segredo (revisão de 21/10/2026). Comparadas em minúsculas. */
const EXTENSOES_DE_CHAVES = ['.p12', '.pfx', '.pem', '.key'];
/** Chaves SSH privadas (e as públicas, que não têm por que estar aqui): id_rsa, id_ed25519… */
const RE_CHAVE_SSH = /^id_(rsa|dsa|ecdsa|ed25519)/;
/** Nome de arquivo de credenciais: credenciais.json, google-service-account.json, AWS_CREDENTIALS… */
const RE_NOME_DE_CREDENCIAIS = /credenciais|credentials|service[-_ ]?account/;

// ---------------------------------------------------------------------------
// Argumentos da linha de comando
// ---------------------------------------------------------------------------

const OPCOES_VALIDAS = 'Opções válidas: --sim, --sem-conferir-site, --mensagem "<texto>", --so <grupos>.';

/** Erro de uso da linha de comando (a casca mostra e sai com código 2). */
export class ErroDeUso extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = 'ErroDeUso';
  }
}

/**
 * Lê os argumentos de `npm run publicar -- <opções>`.
 *
 *   --sim                 não pergunta (para uso sem terminal)
 *   --sem-conferir-site   não espera o site novo aparecer no ar
 *   --mensagem "<texto>"  troca a mensagem do commit (também --mensagem=<texto>)
 *   --so <grupos>         repassado ao verificar-tudo.mjs (também --so=<grupos>); o grupo `site`
 *                         entra sempre, ver `gruposDeTeste`
 *
 * Não existe opção para pular os testes, de propósito. Opção desconhecida (ou
 * argumento solto) lança ErroDeUso com a lista das válidas.
 *
 * @param {string[]} argv
 * @returns {{ sim: boolean, semConferirSite: boolean, mensagem: string | null, so: string | null }}
 */
export function lerArgumentos(argv) {
  const lido = { sim: false, semConferirSite: false, mensagem: null, so: null };
  const lista = Array.from(argv ?? [], String);
  for (let i = 0; i < lista.length; i++) {
    const arg = lista[i];
    const igual = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const nome = igual > 0 ? arg.slice(0, igual) : arg;
    const valorJunto = igual > 0 ? arg.slice(igual + 1) : undefined;

    /** O valor de uma opção que o exige: o que veio depois do `=` ou o argumento seguinte. */
    const exigirValor = (oQue) => {
      let valor = valorJunto;
      if (valor === undefined && i + 1 < lista.length && !lista[i + 1].startsWith('--')) valor = lista[++i];
      if (valor === undefined || valor.trim() === '') {
        throw new ErroDeUso(`A opção ${nome} precisa d${oQue}. ${OPCOES_VALIDAS}`);
      }
      return valor.trim();
    };
    const semValor = () => {
      if (valorJunto !== undefined) throw new ErroDeUso(`A opção ${nome} não recebe valor. ${OPCOES_VALIDAS}`);
    };

    switch (nome) {
      case '--sim':
        semValor();
        lido.sim = true;
        break;
      case '--sem-conferir-site':
        semValor();
        lido.semConferirSite = true;
        break;
      case '--mensagem':
        lido.mensagem = exigirValor('e um texto (a mensagem do commit)');
        break;
      case '--so':
        lido.so = exigirValor('da lista de grupos (ex.: --so site,app)');
        break;
      default:
        throw new ErroDeUso(`Não entendi "${arg}". ${OPCOES_VALIDAS}`);
    }
  }
  return lido;
}

/**
 * A mensagem do commit, pronta para `git commit -F`: `--mensagem` troca tudo;
 * sem ela, o título, uma linha em branco e o corpo (se houver). Nenhuma linha
 * de coautoria.
 *
 * @param {string | null} mensagem
 * @param {{ titulo?: string, corpo?: string }} padrao  `MENSAGEM` de estaVersao.mjs
 */
export function montarMensagem(mensagem, padrao) {
  const texto =
    mensagem !== null && mensagem !== undefined
      ? String(mensagem).trim()
      : [padrao?.titulo, padrao?.corpo]
          .map((parte) => String(parte ?? '').trim())
          .filter(Boolean)
          .join('\n\n');
  return `${texto}\n`;
}

/**
 * A resposta de "Publicar agora no site?": só `s` ou `S` (com ou sem espaços em
 * volta) vale. "sim" por extenso, Enter sozinho ou qualquer outra coisa cancela.
 */
export function respostaEhSim(resposta) {
  const texto = String(resposta ?? '').trim();
  return texto === 's' || texto === 'S';
}

/**
 * Os grupos de teste que vão ao `verificar-tudo.mjs --so`. O grupo `site` é
 * SEMPRE incluído: é ele que vai ao ar, e `--so app` não pode deixar o site
 * subir sem o `vitest`, o `tsc` e o build dele (revisão de 21/10/2026). Sem
 * `--so`: `desktop` e `site`, mais `app` se o app do cuidador estiver instalado.
 * Com `--so`, o resto fica como o dono pediu (só se acrescenta o `site`, no fim,
 * se faltar); espaços, vírgulas sobrando e repetições são ignorados.
 *
 * @param {string | null | undefined} so  o valor de `--so`, como veio de `lerArgumentos`
 * @param {boolean} temApp  o `app/node_modules` existe?
 * @returns {string[]}
 */
export function gruposDeTeste(so, temApp) {
  if (so === null || so === undefined || String(so).trim() === '') {
    return temApp ? ['desktop', 'site', 'app'] : ['desktop', 'site'];
  }
  const grupos = [];
  for (const pedaco of String(so).split(',')) {
    const grupo = pedaco.trim();
    if (grupo !== '' && !grupos.includes(grupo)) grupos.push(grupo);
  }
  if (!grupos.includes('site')) grupos.push('site');
  return grupos;
}

// ---------------------------------------------------------------------------
// Saída do git
// ---------------------------------------------------------------------------

/**
 * A pasta de trabalho onde um ramo está aberto, lendo `git worktree list
 * --porcelain`: blocos `worktree <caminho>` … `branch refs/heads/<ramo>`
 * separados por linha vazia. O caminho pode ter espaço e vir com `/` (o git do
 * Windows) ou `\`; é devolvido exatamente como veio. Ramo sem pasta → null.
 *
 * @param {string} porcelana
 * @param {string} ramo
 * @returns {string | null}
 */
export function acharPastaDoRamo(porcelana, ramo) {
  if (typeof porcelana !== 'string' || !ramo) return null;
  const procurada = `branch refs/heads/${ramo}`;
  let pasta = null;
  for (const linha of porcelana.split(/\r?\n/)) {
    if (linha === '') {
      pasta = null; // acabou o bloco
    } else if (linha.startsWith('worktree ')) {
      pasta = linha.slice('worktree '.length);
    } else if (pasta !== null && linha === procurada) {
      return pasta;
    }
  }
  return null;
}

/** Octal e escapes de um caminho entre aspas do git (`core.quotePath`): "relat\303\263rio" → relatório. */
export function desfazerAspas(texto) {
  if (typeof texto !== 'string' || texto.length < 2 || !texto.startsWith('"') || !texto.endsWith('"')) return texto;
  const bruto = Buffer.from(texto.slice(1, -1), 'utf8');
  const bytes = [];
  for (let i = 0; i < bruto.length; i++) {
    const byte = bruto[i];
    if (byte !== 0x5c) {
      bytes.push(byte);
      continue;
    }
    const proximo = bruto[++i];
    if (proximo === undefined) break;
    if (proximo >= 0x30 && proximo <= 0x37) {
      let valor = proximo - 0x30;
      for (let n = 1; n < 3 && bruto[i + 1] >= 0x30 && bruto[i + 1] <= 0x37; n++) valor = valor * 8 + (bruto[++i] - 0x30);
      bytes.push(valor & 0xff);
    } else {
      const simples = { 0x6e: 0x0a, 0x74: 0x09, 0x72: 0x0d, 0x61: 0x07, 0x62: 0x08, 0x66: 0x0c, 0x76: 0x0b };
      bytes.push(simples[proximo] ?? proximo);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/** O caminho de um cabeçalho `+++ b/<caminho>` do `git diff` (com aspas, TAB final e prefixo `b/` tratados). */
function caminhoDoCabecalho(linha) {
  let resto = linha.slice(4);
  if (resto.startsWith('"')) resto = desfazerAspas(resto.slice(0, resto.lastIndexOf('"') + 1));
  else resto = resto.replace(/\t.*$/, ''); // o git acrescenta um TAB depois de nomes com espaço
  return resto.startsWith('b/') ? resto.slice(2) : resto;
}

const RE_CHAVE_SECRETA = /sb_secret_[A-Za-z0-9_-]{10,}/;
/**
 * Um JWT: três trechos em base64url separados por ponto. Relato da revisão de
 * 21/10/2026: o filtro antigo exigia `eyJ` nos dois primeiros trechos e nenhum
 * `=`, e deixava passar um service_role cujo payload é um JSON com espaço ou
 * quebra de linha depois do `{` (`{ "` vira `eyAi…`, `{\n` vira `ewog…`) ou com
 * o `=` de preenchimento do base64url. Quem decide se é segredo é o `role`
 * decodificado (`papelDoJwt`), não o formato; aqui só se acha o candidato:
 * começo `ey`/`ew` (um `{` seguido de aspas, espaço ou quebra de linha), `=` de
 * preenchimento opcional e trechos de até 4096 caracteres (uma chave de verdade
 * tem uns 200; o limite evita varrer à toa um blob enorme).
 */
const RE_JWT = /e[yw][A-Za-z0-9_-]{2,4096}={0,2}\.[A-Za-z0-9_-]{10,4096}={0,2}\.[A-Za-z0-9_-]{0,4096}={0,2}/g;
const RE_CHAVE_PRIVADA = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;
const RE_CABECALHO_DE_TRECHO = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/;

/**
 * Todo candidato a JWT do texto. Depois de cada achado a busca recomeça um
 * caractere adiante, porque o primeiro trecho do regex é frouxo: em
 * `ewmundo.<cabeçalho>.<payload>` o regex começa em `ewmundo` e engoliria o
 * JWT de verdade; recomeçando de dentro dele, o JWT inteiro também é visto.
 */
function candidatosAJwt(texto) {
  const procura = new RegExp(RE_JWT.source, 'g');
  const achados = [];
  let achado;
  while ((achado = procura.exec(texto)) !== null) {
    achados.push(achado[0]);
    procura.lastIndex = achado.index + 1;
  }
  return achados;
}

/** O papel (`role`) que um JWT declara, ou undefined se não for um JWT legível. */
function papelDoJwt(jwt) {
  try {
    const corpo = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
    return corpo !== null && typeof corpo === 'object' ? corpo.role : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Segredos nas linhas ADICIONADAS de `git diff --cached -U0 --no-color`:
 *  - `sb_secret_` seguido de 10 ou mais caracteres [A-Za-z0-9_-] (chave secreta
 *    nova do Supabase);
 *  - JWT cujo payload declara `role: "service_role"`, com ou sem `=` de
 *    preenchimento e com o JSON em qualquer formato (o JWT `anon` NÃO é
 *    segredo: é o que vai no `site/.env.production`);
 *  - cabeçalho de chave privada PEM.
 * Linha removida, contexto e cabeçalho `+++` não contam. O `arquivo` do achado é
 * o do último cabeçalho `+++ b/<caminho>`. Um achado por arquivo e motivo.
 *
 * Os números do cabeçalho `@@ -a,b +c,d @@` dizem quantas linhas o trecho tem;
 * é isso que separa uma linha adicionada que começa com `++ ` do cabeçalho
 * `+++ `. Em diff escrito à mão, sem contagem certa, vale o óbvio: `+++ ` é
 * cabeçalho e as demais linhas com `+` são conteúdo.
 *
 * @param {string} diff
 * @returns {{ arquivo: string, motivo: string }[]}
 */
export function segredosNoDiff(diff) {
  const achados = [];
  const vistos = new Set();
  let arquivo = '(arquivo desconhecido)';

  const anotar = (motivo) => {
    const chave = `${arquivo}\u0000${motivo}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    achados.push({ arquivo, motivo });
  };
  const olhar = (texto) => {
    if (RE_CHAVE_SECRETA.test(texto)) anotar('chave secreta do Supabase (sb_secret_…)');
    for (const jwt of candidatosAJwt(texto)) {
      if (papelDoJwt(jwt) === 'service_role') anotar('chave service_role do Supabase (dá acesso total ao banco)');
    }
    if (RE_CHAVE_PRIVADA.test(texto)) anotar('chave privada (cabeçalho PEM)');
  };

  let faltamAntigas = 0;
  let faltamNovas = 0;
  for (const linha of String(diff ?? '').split(/\r?\n/)) {
    if (faltamAntigas > 0 || faltamNovas > 0) {
      const marca = linha[0];
      if (marca === '+') {
        faltamNovas = Math.max(0, faltamNovas - 1);
        olhar(linha.slice(1));
        continue;
      }
      if (marca === '-') {
        faltamAntigas = Math.max(0, faltamAntigas - 1);
        continue;
      }
      if (marca === ' ') {
        faltamAntigas = Math.max(0, faltamAntigas - 1);
        faltamNovas = Math.max(0, faltamNovas - 1);
        continue;
      }
      if (marca === '\\') continue; // "\ No newline at end of file"
      faltamAntigas = 0; // o trecho acabou antes do que o cabeçalho dizia
      faltamNovas = 0;
    }
    const trecho = RE_CABECALHO_DE_TRECHO.exec(linha);
    if (trecho) {
      faltamAntigas = trecho[1] === undefined ? 1 : Number(trecho[1]);
      faltamNovas = trecho[2] === undefined ? 1 : Number(trecho[2]);
    } else if (linha.startsWith('+++ ')) {
      arquivo = caminhoDoCabecalho(linha);
    } else if (linha.startsWith('+')) {
      olhar(linha.slice(1));
    }
  }
  return achados;
}

/**
 * Arquivos que não podem ir para o repositório público, lendo `git diff
 * --cached --name-status` (status A, M, T, R…, C…; D é ignorado — apagar nunca
 * é o problema; em R e C vale o nome NOVO):
 *  - pesos de modelo (.onnx .pt .pth .ckpt .safetensors .h5 .tflite) que não
 *    estejam em `permitidos`;
 *  - pesos do GazeGene e do EyeNet (caminho com `gazegene` ou `eyenet`, sem
 *    diferenciar maiúscula, e extensão de pesos ou `.bin`), MESMO se estiverem
 *    em `permitidos`: são só pesquisa (CC BY-NC-SA / termos dos autores);
 *  - `.env`, `.env.local`, `.env.*.local` e qualquer `.env*` que não seja
 *    `.env.production` (configuração pública do build) ou `.env.example`; e
 *    também o que TERMINA em `.env` (`producao.env`);
 *  - chaves e certificados: `.p12`, `.pfx`, `.pem`, `.key`; chaves SSH (`id_rsa*`,
 *    `id_ed25519*`…); e nome com `credenciais`, `credentials` ou `service-account`
 *    (qualquer extensão). Pode barrar um arquivo de código com esse nome: nesse
 *    caso é só renomear (revisão de 21/10/2026).
 *
 * @param {string} nomeStatus
 * @param {string[]} [permitidos]
 * @returns {{ arquivo: string, motivo: string }[]}
 */
export function arquivosProibidos(nomeStatus, permitidos = []) {
  const liberados = new Set(permitidos.map(normalizarCaminho));
  const achados = [];
  for (const linha of String(nomeStatus ?? '').split(/\r?\n/)) {
    const campos = linha.split('\t');
    if (campos.length < 2) continue;
    if (campos[0].trim().startsWith('D')) continue;
    const arquivo = desfazerAspas(campos[campos.length - 1]);
    const caminho = normalizarCaminho(arquivo);
    const minusculo = caminho.toLowerCase();
    const nome = minusculo.slice(minusculo.lastIndexOf('/') + 1);
    const ponto = nome.lastIndexOf('.');
    const extensao = ponto > 0 ? nome.slice(ponto) : '';
    const ehPeso = EXTENSOES_DE_PESOS.includes(extensao);

    if ((ehPeso || extensao === '.bin') && (minusculo.includes('gazegene') || minusculo.includes('eyenet'))) {
      achados.push({ arquivo, motivo: 'pesos do GazeGene/EyeNet: são só para pesquisa e nunca vão para o repositório' });
    } else if (ehPeso && !liberados.has(caminho)) {
      achados.push({ arquivo, motivo: 'pesos de modelo: ficam fora do repositório (são grandes e têm licença própria)' });
    } else if ((nome.startsWith('.env') && !ENV_PERMITIDOS.includes(nome)) || nome.endsWith('.env')) {
      achados.push({ arquivo, motivo: 'arquivo de ambiente (.env): pode ter senha ou chave; só .env.production e .env.example vão' });
    } else if (EXTENSOES_DE_CHAVES.includes(extensao)) {
      achados.push({ arquivo, motivo: `chave ou certificado (${extensao}): guarda segredo e fica fora do repositório` });
    } else if (RE_CHAVE_SSH.test(nome)) {
      achados.push({ arquivo, motivo: 'chave SSH (id_rsa…): é segredo e nunca vai para o repositório' });
    } else if (RE_NOME_DE_CREDENCIAIS.test(nome)) {
      achados.push({ arquivo, motivo: 'nome de arquivo de credenciais: costuma ter senha ou chave e fica fora do repositório (se for só código, renomeie)' });
    }
  }
  return achados;
}

function normalizarCaminho(caminho) {
  return String(caminho).replace(/\\/g, '/').replace(/^\.\//, '');
}

// ---------------------------------------------------------------------------
// A lista de arquivos que saíram (estaVersao.mjs → REMOVIDOS)
// ---------------------------------------------------------------------------

/**
 * O caminho serve para `git rm`? Relativo à raiz do repositório, com `/`, sem
 * `..`, sem `.git`: uma lista errada nunca pode apagar mais do que ela diz.
 */
export function caminhoRemovivel(caminho) {
  if (typeof caminho !== 'string' || caminho === '' || caminho !== caminho.trim()) return false;
  if (caminho.includes('\u0000') || caminho.includes('\\')) return false;
  if (caminho.startsWith('/') || /^[A-Za-z]:/.test(caminho)) return false;
  return caminho.split('/').every((parte) => parte !== '' && parte !== '.' && parte !== '..' && parte.toLowerCase() !== '.git');
}

/**
 * Divide a lista em lotes cuja linha de comando cabe no limite (o Windows
 * recusa linha muito longa). Um caminho maior que o limite vai sozinho.
 *
 * @param {string[]} caminhos
 * @param {number} [limite]
 * @returns {string[][]}
 */
export function lotesDeCaminhos(caminhos, limite = 6000) {
  const lotes = [];
  let atual = [];
  let tamanho = 0;
  for (const caminho of caminhos) {
    const cabe = atual.length === 0 || tamanho + 1 + caminho.length <= limite;
    if (!cabe) {
      lotes.push(atual);
      atual = [];
      tamanho = 0;
    }
    tamanho += (atual.length === 0 ? 0 : 1) + caminho.length;
    atual.push(caminho);
  }
  if (atual.length > 0) lotes.push(atual);
  return lotes;
}

// ---------------------------------------------------------------------------
// O site no ar
// ---------------------------------------------------------------------------

/**
 * O commit que o site publicou (`/versao.json`) é o que acabamos de enviar?
 * Um começa com o outro (um pode estar abreviado). Vazio, "desconhecido" ou
 * curto demais (menos de 7 caracteres) nunca conta.
 */
export function mesmoCommit(publicado, enviado) {
  const a = String(publicado ?? '').trim().toLowerCase();
  const b = String(enviado ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(a) || !/^[0-9a-f]{7,40}$/.test(b)) return false;
  return a.startsWith(b) || b.startsWith(a);
}

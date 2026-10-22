// @vitest-environment node
/**
 * `npm run publicar` (scripts/publicar.mjs): publicar com um comando, na ordem
 * certa, parando no primeiro problema e sem mandar nada para a internet.
 *
 * Pedido de 21/10/2026: na última publicação o dono pulou um passo da lista de
 * comandos (o commit do V2) e o site subiu com a árvore velha.
 *
 * Duas camadas:
 *  - `logica.mjs`: funções puras que leem a saída do git (pasta de um ramo,
 *    segredo no diff, arquivo que não pode ir, argumentos) — testadas com texto;
 *  - `fluxo.mjs`: a sequência inteira, testada com REPOSITÓRIOS GIT DE VERDADE
 *    numa pasta temporária (origin bare, Beta em `main`, V2 como worktree em
 *    `pipeline-v2`, remoto `v2` bare). Testes, perguntas, npm, a consulta ao
 *    site e a espera são falsos; não há rede (o "GitHub" é um bare local).
 *
 * Isolamento do git (estes testes rodam na máquina do dono e no CI, dentro de
 * um repositório de verdade — nada pode vazar para ele):
 *  - toda variável `GIT_*` do ambiente é descartada (dentro de um hook, `GIT_DIR`
 *    faria os comandos agirem no repositório do hook);
 *  - a configuração global e a do sistema ficam vazias (HOME/USERPROFILE/XDG e
 *    `GIT_CONFIG_GLOBAL` apontam para uma pasta temporária; `core.hooksPath`,
 *    assinatura de commit e `autocrlf` da máquina não entram);
 *  - a identidade vem de variáveis `GIT_AUTHOR_*`/`GIT_COMMITTER_*` só para o
 *    processo filho: nada é gravado em configuração nenhuma;
 *  - o wrapper recusa rodar sem pasta explícita ou dentro do repositório real.
 *
 * Os segredos de mentira são montados em tempo de execução: o código-fonte deste
 * teste vai para o repositório e passa pelo mesmo detector que ele testa.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as estaVersao from '../../scripts/publicar/estaVersao.mjs';
import { conferirOSite, publicar } from '../../scripts/publicar/fluxo.mjs';
import {
  PESOS_PERMITIDOS,
  acharPastaDoRamo,
  arquivosProibidos,
  caminhoRemovivel,
  desfazerAspas,
  gruposDeTeste,
  lerArgumentos,
  lotesDeCaminhos,
  mesmoCommit,
  montarMensagem,
  respostaEhSim,
  segredosNoDiff,
} from '../../scripts/publicar/logica.mjs';

// Cada caso de fluxo faz dezenas de chamadas ao git (no Windows, ~0,1 s cada).
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const RAIZ = path.resolve(__dirname, '../..');

// ---------------------------------------------------------------------------
// Segredos de mentira e diffs de mentira
// ---------------------------------------------------------------------------

const SEGREDO_SB = 'sb_' + 'secret_' + 'AbC123dEf456GhI789';
const cabecalhoPem = (tipo: string) => '-----BEGIN ' + tipo + 'PRIVATE KEY-----';
const base64url = (valor: unknown) => Buffer.from(JSON.stringify(valor)).toString('base64url');
function jwtDeMentira(papel: string): string {
  const cabecalho = base64url({ alg: 'HS256', typ: 'JWT' });
  const corpo = base64url({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role: papel });
  return `${cabecalho}.${corpo}.assinatura_de_mentira`;
}

const CABECALHO_PADRAO = base64url({ alg: 'HS256', typ: 'JWT' });
const dadosDoPapel = (papel: string) => ({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role: papel });
const montarJwt = (cabecalho: string, corpo: string, assinatura = 'assinatura_de_mentira') => `${cabecalho}.${corpo}.${assinatura}`;
/** base64url COM o "=" de preenchimento (o `base64url` do Node o tira). O JSON aceita espaço depois do "}": é o que acerta o tamanho. */
function base64urlComPreenchimento(json: string, sinais: 0 | 1 | 2): string {
  const resto = { 0: 0, 1: 2, 2: 1 }[sinais]; // bytes % 3 == 2 dá "=", == 1 dá "=="
  let texto = json;
  while (Buffer.byteLength(texto) % 3 !== resto) texto += ' ';
  return Buffer.from(texto).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Um diff no formato de `git diff --cached -U0`, só com linhas adicionadas (e removidas, se pedido). */
function diffDe(arquivo: string, adicionadas: string[], removidas: string[] = []): string {
  return (
    [
      `diff --git a/${arquivo} b/${arquivo}`,
      'index 1111111..2222222 100644',
      `--- a/${arquivo}`,
      `+++ b/${arquivo}`,
      `@@ -1,${removidas.length} +1,${adicionadas.length} @@`,
      ...removidas.map((l) => `-${l}`),
      ...adicionadas.map((l) => `+${l}`),
    ].join('\n') + '\n'
  );
}

const statusDe = (...linhas: string[]) => linhas.join('\n') + '\n';

// ---------------------------------------------------------------------------
// logica.mjs — funções puras
// ---------------------------------------------------------------------------

describe('acharPastaDoRamo (git worktree list --porcelain)', () => {
  const porcelana = [
    'worktree C:/Users/gabri/OneDrive/Desktop/IrisFlow Beta',
    'HEAD 1111111111111111111111111111111111111111',
    'branch refs/heads/main',
    '',
    'worktree C:/Users/gabri/OneDrive/Desktop/IrisFlow V2',
    'HEAD 2222222222222222222222222222222222222222',
    'branch refs/heads/pipeline-v2',
    '',
  ].join('\n');

  it('acha a pasta de cada ramo, com espaço no caminho e barras para a frente', () => {
    expect(acharPastaDoRamo(porcelana, 'main')).toBe('C:/Users/gabri/OneDrive/Desktop/IrisFlow Beta');
    expect(acharPastaDoRamo(porcelana, 'pipeline-v2')).toBe('C:/Users/gabri/OneDrive/Desktop/IrisFlow V2');
  });

  it('aceita barras invertidas e fim de linha do Windows', () => {
    const windows = [
      'worktree C:\\Users\\gabri\\OneDrive\\Desktop\\IrisFlow Beta',
      'HEAD 1111111111111111111111111111111111111111',
      'branch refs/heads/main',
      '',
      'worktree C:\\Users\\gabri\\OneDrive\\Desktop\\IrisFlow V2',
      'HEAD 2222222222222222222222222222222222222222',
      'branch refs/heads/pipeline-v2',
      '',
    ].join('\r\n');
    expect(acharPastaDoRamo(windows, 'main')).toBe('C:\\Users\\gabri\\OneDrive\\Desktop\\IrisFlow Beta');
    expect(acharPastaDoRamo(windows, 'pipeline-v2')).toBe('C:\\Users\\gabri\\OneDrive\\Desktop\\IrisFlow V2');
  });

  it('ramo que não está em nenhuma pasta devolve null', () => {
    expect(acharPastaDoRamo(porcelana, 'ramo-que-nao-existe')).toBeNull();
    expect(acharPastaDoRamo('', 'main')).toBeNull();
  });

  it('não confunde ramos de nome parecido, pasta destacada nem repositório bare', () => {
    const parecidos = [
      'worktree /srv/repo.git',
      'bare',
      '',
      'worktree /srv/solta',
      'HEAD 3333333333333333333333333333333333333333',
      'detached',
      '',
      'worktree /srv/outra',
      'HEAD 4444444444444444444444444444444444444444',
      'branch refs/heads/main2',
      '',
      'worktree /srv/feature',
      'HEAD 5555555555555555555555555555555555555555',
      'branch refs/heads/feature/main',
      '',
    ].join('\n');
    expect(acharPastaDoRamo(parecidos, 'main')).toBeNull();
    expect(acharPastaDoRamo(parecidos, 'main2')).toBe('/srv/outra');
    expect(acharPastaDoRamo(parecidos, 'feature/main')).toBe('/srv/feature');
  });
});

describe('segredosNoDiff (git diff --cached -U0)', () => {
  it('acha uma chave secreta do Supabase e diz em que arquivo', () => {
    const diff = diffDe('supabase/config.ts', [`const chave = '${SEGREDO_SB}';`]);
    const achados = segredosNoDiff(diff);
    expect(achados).toHaveLength(1);
    expect(achados[0].arquivo).toBe('supabase/config.ts');
    expect(achados[0].motivo).toMatch(/sb_secret_/);
  });

  it('só acusa o prefixo com 10 ou mais caracteres depois dele', () => {
    const nove = 'sb_' + 'secret_' + 'abcdefghi';
    const dez = 'sb_' + 'secret_' + 'abcdefghij';
    expect(segredosNoDiff(diffDe('a.ts', [`x = '${nove}'`]))).toEqual([]);
    expect(segredosNoDiff(diffDe('a.ts', [`x = '${dez}'`]))).toHaveLength(1);
  });

  it('acha um JWT cujo papel é service_role', () => {
    const diff = diffDe('site/src/chave.ts', [`export const K = "${jwtDeMentira('service_role')}"`]);
    const achados = segredosNoDiff(diff);
    expect(achados).toHaveLength(1);
    expect(achados[0].arquivo).toBe('site/src/chave.ts');
    expect(achados[0].motivo).toMatch(/service_role/);
  });

  it('NÃO acusa um JWT anon (é o que vai no site/.env.production)', () => {
    const diff = diffDe('site/.env.production', [`VITE_SUPABASE_ANON_KEY=${jwtDeMentira('anon')}`]);
    expect(segredosNoDiff(diff)).toEqual([]);
  });

  it('acha o cabeçalho de chave privada PEM, de qualquer tipo', () => {
    for (const tipo of ['', 'RSA ', 'EC ', 'OPENSSH ', 'ENCRYPTED ']) {
      const achados = segredosNoDiff(diffDe('deploy/chave.txt', [cabecalhoPem(tipo)]));
      expect(achados, `tipo "${tipo}"`).toHaveLength(1);
      expect(achados[0].motivo).toMatch(/chave privada/);
    }
  });

  it('NÃO acusa linha removida nem o cabeçalho +++ (o caminho do arquivo não conta)', () => {
    const diff = [
      `diff --git a/old/${SEGREDO_SB}.txt b/old/${SEGREDO_SB}.txt`,
      `--- a/old/${SEGREDO_SB}.txt`,
      `+++ b/old/${SEGREDO_SB}.txt`,
      '@@ -1,2 +1,1 @@',
      `-const velha = '${SEGREDO_SB}';`,
      `-const velha2 = "${jwtDeMentira('service_role')}";`,
      '+const nova = process.env.CHAVE;',
      '',
    ].join('\n');
    expect(segredosNoDiff(diff)).toEqual([]);
  });

  it('atribui cada achado ao último cabeçalho +++ b/<caminho>', () => {
    const diff =
      diffDe('limpo.ts', ['const a = 1;']) +
      diffDe('com espaço/vazou.ts', [`const k = '${SEGREDO_SB}'`]) +
      diffDe('outro/ok.ts', ['const b = 2;']);
    expect(segredosNoDiff(diff).map((a: { arquivo: string }) => a.arquivo)).toEqual(['com espaço/vazou.ts']);
  });

  it('lê o caminho certo quando o cabeçalho termina em TAB (nome com espaço) ou vem entre aspas (acento)', () => {
    const comTab = [
      'diff --git a/pasta com espaço/a.ts b/pasta com espaço/a.ts',
      '--- a/pasta com espaço/a.ts\t',
      '+++ b/pasta com espaço/a.ts\t',
      '@@ -0,0 +1 @@',
      `+${SEGREDO_SB}`,
      '',
    ].join('\n');
    expect(segredosNoDiff(comTab)[0].arquivo).toBe('pasta com espaço/a.ts');

    const comAspas = [
      'diff --git "a/relat\\303\\263rio.ts" "b/relat\\303\\263rio.ts"',
      '--- "a/relat\\303\\263rio.ts"',
      '+++ "b/relat\\303\\263rio.ts"',
      '@@ -0,0 +1 @@',
      `+${SEGREDO_SB}`,
      '',
    ].join('\n');
    expect(segredosNoDiff(comAspas)[0].arquivo).toBe('relatório.ts');
  });

  it('linha adicionada que parece cabeçalho (+++ …) dentro de um hunk continua sendo conteúdo', () => {
    const diff = [
      'diff --git a/x.sql b/x.sql',
      '--- a/x.sql',
      '+++ b/x.sql',
      '@@ -0,0 +1,2 @@',
      '+-- comentário',
      `+++ ${SEGREDO_SB}`,
      '',
    ].join('\n');
    const achados = segredosNoDiff(diff);
    expect(achados).toHaveLength(1);
    expect(achados[0].arquivo).toBe('x.sql');
  });

  it('JWT quebrado, sem JSON ou sem papel não derruba nem acusa', () => {
    const semJson = ['eyJ' + 'hbGciOiJIUzI1NiJ9', 'eyJ' + 'zdWIiOiIxMjM0', 'assinatura'].join('.');
    const semPapel = `${base64url({ alg: 'HS256' })}.${base64url({ sub: '1' })}.x`;
    const vazio = ['eyJ', 'eyJ', ''].join('.');
    expect(segredosNoDiff(diffDe('a.ts', [semJson, semPapel, vazio]))).toEqual([]);
  });

  it('um achado por arquivo e motivo, mesmo repetido em várias linhas', () => {
    const diff = diffDe('a.ts', [`x = '${SEGREDO_SB}'`, `y = '${SEGREDO_SB}'`, cabecalhoPem('RSA ')]);
    expect(segredosNoDiff(diff)).toHaveLength(2);
    // o mesmo motivo em arquivos diferentes continua sendo um achado por arquivo
    const doisArquivos = diffDe('a.ts', [`x = '${SEGREDO_SB}'`]) + diffDe('b.ts', [`y = '${SEGREDO_SB}'`]);
    expect(segredosNoDiff(doisArquivos).map((achado) => achado.arquivo)).toEqual(['a.ts', 'b.ts']);
  });

  it('diff vazio, binário ou sem linhas adicionadas não acusa nada', () => {
    expect(segredosNoDiff('')).toEqual([]);
    expect(segredosNoDiff('diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ\n')).toEqual([]);
  });

  it('diff com arquivos binários no meio não quebra e o segredo depois deles ainda é achado', () => {
    const binario = (arquivo: string) =>
      `diff --git a/${arquivo} b/${arquivo}\nnew file mode 100644\nindex 0000000..541b5f1\nBinary files /dev/null and b/${arquivo} differ\n`;
    const diff = binario('certs/loja.p12') + diffDe('config/chave.ts', [`const K = "${jwtDeMentira('service_role')}";`]) + binario('img/logo.png');
    const achados = segredosNoDiff(diff);
    expect(achados.map((a: { arquivo: string }) => a.arquivo)).toEqual(['config/chave.ts']);
    expect(segredosNoDiff(binario('a.bin') + binario('b.bin'))).toEqual([]);
  });

  it('a configuração pública já versionada (chave anon) não é acusada', () => {
    for (const arquivo of [
      'site/.env.production',
      'frontend/.env.production',
      'app/.env.production',
      'app/eas.json',
      'site/.env.example',
      'app/.env.example',
    ]) {
      const texto = readFileSync(path.join(RAIZ, arquivo), 'utf8');
      expect(segredosNoDiff(diffDe(arquivo, texto.split('\n'))), arquivo).toEqual([]);
    }
  });
});

describe('segredosNoDiff: JWT service_role em formas que o filtro antigo deixava passar (revisão de 21/10/2026)', () => {
  const dosDois = (jwt: (papel: string) => string) => ({
    service: segredosNoDiff(diffDe('config/chave.ts', [`export const K = "${jwt('service_role')}";`])),
    anon: segredosNoDiff(diffDe('site/.env.production', [`VITE_SUPABASE_ANON_KEY=${jwt('anon')}`])),
  });

  const formas: Record<string, (papel: string) => string> = {
    'payload JSON que começa com "{ \\"" (base64url eyAi…)': (papel) => {
      const corpo = Buffer.from(`{ "iss": "supabase", "role": "${papel}" }`).toString('base64url');
      expect(corpo.startsWith('eyAi')).toBe(true);
      return montarJwt(CABECALHO_PADRAO, corpo);
    },
    'payload com quebra de linha depois do "{" (JSON identado, base64url ewog…)': (papel) => {
      const corpo = Buffer.from(JSON.stringify(dadosDoPapel(papel), null, 2)).toString('base64url');
      expect(corpo.startsWith('ewog')).toBe(true);
      return montarJwt(CABECALHO_PADRAO, corpo);
    },
    'base64url com 1 "=" de preenchimento': (papel) => {
      const corpo = base64urlComPreenchimento(JSON.stringify(dadosDoPapel(papel)), 1);
      expect(corpo).toMatch(/[^=]=$/);
      return montarJwt(CABECALHO_PADRAO, corpo);
    },
    'base64url com 2 "=" de preenchimento': (papel) => {
      const corpo = base64urlComPreenchimento(JSON.stringify(dadosDoPapel(papel)), 2);
      expect(corpo).toMatch(/[^=]==$/);
      return montarJwt(CABECALHO_PADRAO, corpo);
    },
    'assinatura com "=" de preenchimento': (papel) =>
      montarJwt(CABECALHO_PADRAO, base64url(dadosDoPapel(papel)), base64urlComPreenchimento('{"a":1}', 2)),
    'cabeçalho do JWT com espaço depois do "{" (eyAi…) e payload com quebra de linha (ewog…)': (papel) => {
      const cabecalho = Buffer.from('{ "alg": "HS256", "typ": "JWT" }').toString('base64url');
      expect(cabecalho.startsWith('eyAi')).toBe(true);
      return montarJwt(cabecalho, Buffer.from(JSON.stringify(dadosDoPapel(papel), null, 2)).toString('base64url'));
    },
  };

  for (const [nome, jwt] of Object.entries(formas)) {
    it(`acusa o service_role e NÃO acusa o anon: ${nome}`, () => {
      const { service, anon } = dosDois(jwt);
      expect(service).toHaveLength(1);
      expect(service[0].arquivo).toBe('config/chave.ts');
      expect(service[0].motivo).toMatch(/service_role/);
      expect(anon).toEqual([]);
    });
  }

  it('um JWT colado logo depois de um trecho com cara de JWT (ew….) ainda é achado', () => {
    const jwt = jwtDeMentira('service_role');
    expect(segredosNoDiff(diffDe('a.ts', [`const k = "ewmundo.${jwt}"`]))).toHaveLength(1);
  });

  it('hash de lockfile (base64 com "=") e texto comum parecido com JWT não acusam', () => {
    const hash = 'sha512-' + 'eyJ' + 'hbGciOiJIUzI1NiJ9abcdefghijklmnop+/qrstuvwxyz0123456789ABCDEFG==';
    expect(segredosNoDiff(diffDe('package-lock.json', [`"integrity": "${hash}",`]))).toEqual([]);
    expect(segredosNoDiff(diffDe('a.ts', ['eyeTracker.setDwellTime(1500).ewsAnchorElement.value'])).length).toBe(0);
  });
});

describe('arquivosProibidos (git diff --cached --name-status)', () => {
  const nomes = (r: { arquivo: string }[]) => r.map((a) => a.arquivo);

  it('barra pesos de modelo novos, de qualquer extensão da lista, sem diferenciar maiúscula', () => {
    for (const ext of ['.onnx', '.pt', '.pth', '.ckpt', '.safetensors', '.h5', '.tflite', '.ONNX']) {
      const achados = arquivosProibidos(statusDe(`A\tmodels/x${ext}`), []);
      expect(nomes(achados), ext).toEqual([`models/x${ext}`]);
      expect(achados[0].motivo).toEqual(expect.any(String));
    }
  });

  it('barra pesos do GazeGene e do EyeNet (inclusive .bin), mesmo que estejam na lista de permitidos', () => {
    expect(nomes(arquivosProibidos(statusDe('M\talgo/GazeGene/pesos.bin'), []))).toEqual(['algo/GazeGene/pesos.bin']);
    expect(nomes(arquivosProibidos(statusDe('A\tmodels/EYENET_v2.onnx'), ['models/EYENET_v2.onnx']))).toEqual([
      'models/EYENET_v2.onnx',
    ]);
    const gazegene = 'frontend/public/models/l2cs-gazegene/g.safetensors';
    expect(nomes(arquivosProibidos(statusDe(`A\t${gazegene}`), [gazegene]))).toEqual([gazegene]);
  });

  it('o .bin comum e as metas dos modelos (que são versionadas) passam', () => {
    const status = statusDe(
      'A\tdocs/dados.bin',
      'M\tfrontend/public/models/eyenet/eyenet.meta.json',
      'M\tfrontend/public/models/eyenet/eyenet.meta.json.bak',
      'M\tfrontend/public/models/l2cs-gazegene/gazegene_l2cs_r50_v2.meta.json',
    );
    expect(arquivosProibidos(status, [])).toEqual([]);
  });

  it('barra .env, .env.local, .env.*.local e qualquer .env* fora de .env.production e .env.example', () => {
    const status = statusDe(
      'A\t.env',
      'A\t.env.local',
      'A\tsite/.env',
      'M\tfrontend/.env.staging',
      'A\tapp/.env.development.local',
      'A\tsite/.env.production.local',
    );
    expect(nomes(arquivosProibidos(status, []))).toEqual([
      '.env',
      '.env.local',
      'site/.env',
      'frontend/.env.staging',
      'app/.env.development.local',
      'site/.env.production.local',
    ]);
  });

  it('deixa .env.production e .env.example (em qualquer pasta)', () => {
    const status = statusDe('M\tsite/.env.production', 'M\tfrontend/.env.production', 'A\tapp/.env.example', 'M\t.env.example');
    expect(arquivosProibidos(status, [])).toEqual([]);
  });

  it('arquivo removido (D) nunca é problema', () => {
    expect(arquivosProibidos(statusDe('D\tmodels/x.onnx', 'D\t.env', 'D\talgo/gazegene/p.bin'), [])).toEqual([]);
  });

  it('deixa um peso que está na lista de permitidos (e só ele)', () => {
    const status = statusDe('M\tmodels/ok.onnx', 'M\tmodels/outro.onnx');
    expect(nomes(arquivosProibidos(status, ['models/ok.onnx']))).toEqual(['models/outro.onnx']);
  });

  it('em renomeação (R…) e cópia (C…) vale o nome NOVO', () => {
    const status = statusDe(
      'R100\tvelho/nome.txt\tmodels/novo.safetensors',
      'R090\tmodels/antigo.onnx\tmodels/agora.txt',
      'C075\ta.txt\tb.pth',
    );
    expect(nomes(arquivosProibidos(status, []))).toEqual(['models/novo.safetensors', 'b.pth']);
  });

  it('entende caminhos entre aspas com acento (core.quotePath do git)', () => {
    const achados = arquivosProibidos(statusDe('A\t"modelos/a\\303\\247a\\303\\255.onnx"'), []);
    expect(nomes(achados)).toEqual(['modelos/açaí.onnx']);
  });

  it('barra chaves e certificados: .p12 .pfx .pem .key, sem diferenciar maiúscula', () => {
    const status = statusDe('A\tcerts/loja.p12', 'A\tdeploy/assinatura.pfx', 'M\tsite/cert.pem', 'A\tapp/android/release.key', 'A\tCERT.PEM');
    const achados = arquivosProibidos(status, []);
    expect(nomes(achados)).toEqual(['certs/loja.p12', 'deploy/assinatura.pfx', 'site/cert.pem', 'app/android/release.key', 'CERT.PEM']);
    for (const achado of achados) expect(achado.motivo).toMatch(/chave|certificado/i);
  });

  it('barra chaves SSH: id_rsa e os que começam com id_rsa (e os irmãos id_ed25519, id_ecdsa)', () => {
    const status = statusDe('A\tid_rsa', 'A\tdeploy/id_rsa.pub', 'A\tid_rsa_deploy', 'A\t.ssh/id_ed25519', 'A\tid_ecdsa');
    expect(nomes(arquivosProibidos(status, []))).toEqual(['id_rsa', 'deploy/id_rsa.pub', 'id_rsa_deploy', '.ssh/id_ed25519', 'id_ecdsa']);
  });

  it('barra arquivo que TERMINA em .env (producao.env), não só o que começa com .env', () => {
    const achados = arquivosProibidos(statusDe('A\tproducao.env', 'M\tapp/staging.env', 'A\tconfig/Local.ENV'), []);
    expect(nomes(achados)).toEqual(['producao.env', 'app/staging.env', 'config/Local.ENV']);
    expect(achados[0].motivo).toMatch(/\.env/);
  });

  it('barra nome com credenciais, credentials ou service-account, em qualquer extensão e maiúscula', () => {
    const status = statusDe(
      'A\tcredenciais.json',
      'A\tdocs/Minhas-Credenciais.txt',
      'A\tcloud/credentials.json',
      'M\tcloud/AWS_CREDENTIALS',
      'A\tcloud/google-service-account.json',
      'A\tcloud/service_account.json',
      'A\tcloud/serviceaccount.yml',
    );
    const achados = arquivosProibidos(status, []);
    expect(nomes(achados)).toEqual([
      'credenciais.json',
      'docs/Minhas-Credenciais.txt',
      'cloud/credentials.json',
      'cloud/AWS_CREDENTIALS',
      'cloud/google-service-account.json',
      'cloud/service_account.json',
      'cloud/serviceaccount.yml',
    ]);
    for (const achado of achados) expect(achado.motivo).toMatch(/credenciais|senha|chave/i);
  });

  it('nomes parecidos mas inocentes passam (e apagar uma chave nunca é problema)', () => {
    const status = statusDe(
      'M\tsite/src/env.ts',
      'M\tdocs/chaves-de-acesso.md',
      'M\tsrc/keyboard.ts',
      'M\tsrc/monkey.ts',
      'A\tdocs/pem-explicado.md',
      'A\tsrc/idRsaFormato.ts',
      'M\tapp/src/hooks/useCredenciamento.ts',
      'A\tsite/public/favicon.ico',
      'A\tdocs/dados.bin',
      'D\tcerts/velho.pem',
      'D\tcredenciais.json',
      'D\tid_rsa',
    );
    expect(arquivosProibidos(status, [])).toEqual([]);
  });

  it('PESOS_PERMITIDOS é uma lista de caminhos (vazia: nenhum peso é versionado de propósito)', () => {
    expect(Array.isArray(PESOS_PERMITIDOS)).toBe(true);
    for (const caminho of PESOS_PERMITIDOS) expect(typeof caminho).toBe('string');
    expect(PESOS_PERMITIDOS).toEqual([]);
  });
});

describe('desfazerAspas', () => {
  it('tira as aspas e decodifica octal UTF-8 e escapes simples', () => {
    expect(desfazerAspas('"relat\\303\\263rio.ts"')).toBe('relatório.ts');
    expect(desfazerAspas('"com \\"aspas\\" e \\\\ barra"')).toBe('com "aspas" e \\ barra');
    expect(desfazerAspas('"a\\tb"')).toBe('a\tb');
  });
  it('texto sem aspas fica como está', () => {
    expect(desfazerAspas('pasta/arquivo.ts')).toBe('pasta/arquivo.ts');
    expect(desfazerAspas('"sem fechar')).toBe('"sem fechar');
  });
});

describe('lerArgumentos', () => {
  it('sem argumentos: tudo desligado', () => {
    expect(lerArgumentos([])).toEqual({ sim: false, semConferirSite: false, mensagem: null, so: null });
  });

  it('--sim e --sem-conferir-site', () => {
    expect(lerArgumentos(['--sim', '--sem-conferir-site'])).toMatchObject({ sim: true, semConferirSite: true });
  });

  it('--mensagem "<texto>" e --mensagem=<texto>', () => {
    expect(lerArgumentos(['--mensagem', 'Corrige o botão']).mensagem).toBe('Corrige o botão');
    expect(lerArgumentos(['--mensagem=Corrige o botão']).mensagem).toBe('Corrige o botão');
    expect(lerArgumentos(['--mensagem=a=b']).mensagem).toBe('a=b');
  });

  it('--so <grupos> e --so=<grupos> (repassado ao verificar-tudo)', () => {
    expect(lerArgumentos(['--so', 'site,app']).so).toBe('site,app');
    expect(lerArgumentos(['--so=site']).so).toBe('site');
  });

  it('flag desconhecida lança erro com a lista das válidas — e não existe flag para pular os testes', () => {
    for (const ruim of ['--pular-testes', '--sem-testes', '--force', '-f', 'solto']) {
      expect(() => lerArgumentos([ruim]), ruim).toThrow(/--sim.*--sem-conferir-site.*--mensagem.*--so/s);
    }
  });

  it('--mensagem e --so exigem um valor (e não engolem a flag seguinte)', () => {
    expect(() => lerArgumentos(['--mensagem'])).toThrow(/--mensagem/);
    expect(() => lerArgumentos(['--mensagem', '--sim'])).toThrow(/--mensagem/);
    expect(() => lerArgumentos(['--mensagem='])).toThrow(/--mensagem/);
    expect(() => lerArgumentos(['--so'])).toThrow(/--so/);
    expect(() => lerArgumentos(['--sim=1'])).toThrow(/--sim/);
  });
});

describe('gruposDeTeste (o --so nunca tira o grupo site)', () => {
  it('sem --so: desktop e site, mais app só se o app estiver instalado', () => {
    expect(gruposDeTeste(null, false)).toEqual(['desktop', 'site']);
    expect(gruposDeTeste(null, true)).toEqual(['desktop', 'site', 'app']);
  });

  it('--so sem o site: o site entra mesmo assim (e o resto fica como o dono pediu)', () => {
    expect(gruposDeTeste('app', true)).toEqual(['app', 'site']);
    expect(gruposDeTeste('desktop', false)).toEqual(['desktop', 'site']);
    expect(gruposDeTeste('app,pacote', false)).toEqual(['app', 'pacote', 'site']);
  });

  it('--so com o site: não repete nem reordena; espaços e vírgulas sobrando são ignorados', () => {
    expect(gruposDeTeste('site', true)).toEqual(['site']);
    expect(gruposDeTeste('site,app', false)).toEqual(['site', 'app']);
    expect(gruposDeTeste(' app , site ,', false)).toEqual(['app', 'site']);
    expect(gruposDeTeste('app,site,site', false)).toEqual(['app', 'site']);
  });

  it('--so só com vírgulas vira só o site (nunca uma lista vazia)', () => {
    expect(gruposDeTeste(',', true)).toEqual(['site']);
  });
});

describe('montarMensagem', () => {
  const MENSAGEM = { titulo: 'IrisFlow: atualização', corpo: '' };
  it('título sozinho quando não há corpo', () => {
    expect(montarMensagem(null, MENSAGEM)).toBe('IrisFlow: atualização\n');
  });
  it('título, linha em branco e corpo', () => {
    expect(montarMensagem(null, { titulo: 'T', corpo: 'Corpo.\nSegunda linha.' })).toBe('T\n\nCorpo.\nSegunda linha.\n');
  });
  it('--mensagem troca a mensagem inteira', () => {
    expect(montarMensagem('Só isto', { titulo: 'T', corpo: 'C' })).toBe('Só isto\n');
  });
  it('nunca escreve linha de coautoria', () => {
    expect(montarMensagem(null, MENSAGEM)).not.toMatch(/co-authored-by|claude-session/i);
  });
});

describe('caminhos e lotes de REMOVIDOS', () => {
  it('só aceita caminho relativo, literal e dentro do repositório', () => {
    for (const bom of ['site/src/velho.ts', 'app/app/(tabs)/[id].tsx', 'a.txt', 'pasta com espaço/b.txt']) {
      expect(caminhoRemovivel(bom), bom).toBe(true);
    }
    const ruins = [
      '',
      '   ',
      '.',
      './',
      '..',
      '../fora.txt',
      'a/../../fora.txt',
      '/etc/passwd',
      'C:/Windows/x',
      'C:\\x',
      '\\\\servidor\\x',
      'a\\b.txt',
      'a\0b',
      '.git',
      '.git/config',
      'sub/.git/x',
    ];
    for (const ruim of ruins) expect(caminhoRemovivel(ruim), JSON.stringify(ruim)).toBe(false);
  });

  it('divide em lotes que cabem na linha de comando do Windows, sem perder nem repetir caminho', () => {
    const caminhos = Array.from({ length: 500 }, (_, i) => `pasta/${'x'.repeat(60)}/arquivo-${i}.ts`);
    const lotes = lotesDeCaminhos(caminhos, 2000);
    expect(lotes.length).toBeGreaterThan(1);
    for (const lote of lotes) {
      expect(lote.length).toBeGreaterThan(0);
      expect(lote.join(' ').length).toBeLessThanOrEqual(2000);
    }
    expect(lotes.flat()).toEqual(caminhos);
  });

  it('um caminho maior que o limite ainda vai, sozinho num lote', () => {
    const enorme = 'a/' + 'b'.repeat(300);
    expect(lotesDeCaminhos(['x', enorme, 'y'], 100)).toEqual([['x'], [enorme], ['y']]);
  });

  it('lista vazia, nenhum lote', () => {
    expect(lotesDeCaminhos([], 2000)).toEqual([]);
  });
});

describe('mesmoCommit (versao.json do site × SHA enviado)', () => {
  const sha40 = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
  it('o do site começa com o enviado, ou o contrário', () => {
    expect(mesmoCommit(sha40, sha40)).toBe(true);
    expect(mesmoCommit(sha40.slice(0, 7), sha40)).toBe(true);
    expect(mesmoCommit(sha40, sha40.slice(0, 12))).toBe(true);
    expect(mesmoCommit(sha40.toUpperCase(), sha40)).toBe(true);
  });
  it('outro commit, vazio, "desconhecido" ou curto demais não conta', () => {
    expect(mesmoCommit('ffffffffffffffffffffffffffffffffffffffff', sha40)).toBe(false);
    expect(mesmoCommit('', sha40)).toBe(false);
    expect(mesmoCommit('desconhecido', sha40)).toBe(false);
    expect(mesmoCommit('a1b2c3', sha40)).toBe(false);
    expect(mesmoCommit(null, sha40)).toBe(false);
    expect(mesmoCommit(sha40, '')).toBe(false);
  });
});

describe('scripts/publicar/estaVersao.mjs (o que o coordenador preenche a cada versão)', () => {
  it('exporta só BASE, REMOVIDOS e MENSAGEM (um nome errado faria o fluxo usar o padrão sem avisar)', () => {
    expect(Object.keys(estaVersao).sort()).toEqual(['BASE', 'MENSAGEM', 'REMOVIDOS']);
  });

  it('BASE é vazia ou o começo de um SHA (7 a 40 caracteres hexadecimais)', () => {
    expect(typeof estaVersao.BASE).toBe('string');
    expect(estaVersao.BASE).toMatch(/^([0-9a-f]{7,40})?$/i);
  });

  it('REMOVIDOS é uma lista de caminhos literais e relativos, sem repetição — e sem BASE nunca removeria nada', () => {
    expect(Array.isArray(estaVersao.REMOVIDOS)).toBe(true);
    for (const caminho of estaVersao.REMOVIDOS) expect(caminhoRemovivel(caminho), JSON.stringify(caminho)).toBe(true);
    expect(new Set(estaVersao.REMOVIDOS).size).toBe(estaVersao.REMOVIDOS.length);
    if (estaVersao.REMOVIDOS.length > 0) expect(estaVersao.BASE, 'REMOVIDOS preenchido pede a BASE').not.toBe('');
  });

  it('MENSAGEM tem título de uma linha só, corpo em texto e nenhuma linha de coautoria', () => {
    const { titulo, corpo } = estaVersao.MENSAGEM;
    expect(typeof titulo).toBe('string');
    expect(titulo.trim()).not.toBe('');
    expect(titulo).not.toContain('\n');
    expect(typeof corpo).toBe('string');
    expect(`${titulo}\n${corpo}`).not.toMatch(/co-authored-by|claude-session/i);
  });
});

describe('respostaEhSim (a pergunta "Publicar agora no site?")', () => {
  it('só s ou S vale, com ou sem espaços em volta', () => {
    for (const sim of ['s', 'S', ' s ', 'S\r', '\tS\n']) expect(respostaEhSim(sim), JSON.stringify(sim)).toBe(true);
  });
  it('qualquer outra coisa cancela: sim por extenso, n, y, vazio, só Enter, lixo', () => {
    for (const nao of ['sim', 'Sim', 'SIM', 'n', 'N', 'y', 'yes', '', ' ', 'ss', 's s', 'não', '1']) {
      expect(respostaEhSim(nao), JSON.stringify(nao)).toBe(false);
    }
    expect(respostaEhSim(null)).toBe(false);
    expect(respostaEhSim(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fluxo.mjs — a sequência inteira, com repositórios git de verdade
// ---------------------------------------------------------------------------

type ResultadoDoGit = { codigo: number; saida: string; erro: string };
type ChamadaDeGit = (args: string[], opcoes: { cwd: string }) => Promise<ResultadoDoGit> | ResultadoDoGit;

let pastaTemporaria = '';
let ambienteDoGit: Record<string, string | undefined> = {};

beforeAll(() => {
  pastaTemporaria = mkdtempSync(path.join(tmpdir(), 'irisflow-publicar-'));
  const casa = path.join(pastaTemporaria, 'casa');
  mkdirSync(casa);
  writeFileSync(path.join(casa, '.gitconfig'), '');
  const limpo: Record<string, string | undefined> = {};
  for (const [nome, valor] of Object.entries(process.env)) {
    if (!nome.toUpperCase().startsWith('GIT_')) limpo[nome] = valor;
  }
  ambienteDoGit = {
    ...limpo,
    HOME: casa,
    USERPROFILE: casa,
    XDG_CONFIG_HOME: casa,
    GIT_CONFIG_GLOBAL: path.join(casa, '.gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'Teste',
    GIT_AUTHOR_EMAIL: 'teste@exemplo.invalid',
    GIT_COMMITTER_NAME: 'Teste',
    GIT_COMMITTER_EMAIL: 'teste@exemplo.invalid',
    LC_ALL: 'C',
    LANG: 'C',
  };
});

afterAll(() => {
  try {
    rmSync(pastaTemporaria, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Limpar é cortesia: no Windows um antivírus pode segurar um arquivo do git.
  }
});

/** O git do teste: sempre numa pasta explícita, nunca dentro do repositório real. */
function rodarGit(args: string[], cwd: string): ResultadoDoGit {
  if (!cwd) throw new Error('o teste tentou rodar o git sem dizer a pasta');
  const relativa = path.relative(RAIZ, path.resolve(cwd));
  if (relativa === '' || (!relativa.startsWith('..') && !path.isAbsolute(relativa))) {
    throw new Error(`o teste tentou rodar o git dentro do repositório real: ${cwd}`);
  }
  const r = spawnSync('git', args, {
    cwd,
    env: ambienteDoGit as NodeJS.ProcessEnv,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { codigo: r.status ?? 1, saida: r.stdout ?? '', erro: r.error ? String(r.error.message) : (r.stderr ?? '') };
}

function git(args: string[], cwd: string): string {
  const r = rodarGit(args, cwd);
  if (r.codigo !== 0) throw new Error(`git ${args.join(' ')} (em ${cwd}) falhou: ${r.erro}`);
  return r.saida;
}

function escrever(pasta: string, relativo: string, conteudo: string): void {
  const destino = path.join(pasta, ...relativo.split('/'));
  mkdirSync(path.dirname(destino), { recursive: true });
  writeFileSync(destino, conteudo);
}

interface Cenario {
  base: string;
  origin: string;
  beta: string;
  v2: string;
  v2remoto: string;
}

const ARQUIVOS_BASE: Record<string, string> = {
  'LEIAME.txt': 'IrisFlow de teste\n',
  'velho.txt': 'este arquivo sai numa versão futura\n',
  'site/index.html': '<!doctype html>\n',
};

let contador = 0;

/**
 * O que existe na máquina do dono, em miniatura: o "GitHub" (origin, bare), a
 * pasta Beta em `main`, a pasta V2 como worktree em `pipeline-v2` e o remoto
 * `v2` (bare). `main`, `origin/main` e `pipeline-v2` começam no mesmo commit.
 */
function criarCenario(arquivos: Record<string, string> = ARQUIVOS_BASE): Cenario {
  const base = path.join(pastaTemporaria, `cenario-${++contador}`);
  const c: Cenario = {
    base,
    origin: path.join(base, 'origin.git'),
    beta: path.join(base, 'IrisFlow Beta'),
    v2: path.join(base, 'IrisFlow V2'),
    v2remoto: path.join(base, 'v2-copia.git'),
  };
  mkdirSync(c.origin, { recursive: true });
  mkdirSync(c.beta);
  mkdirSync(c.v2remoto);
  git(['init', '-q', '--bare', '-b', 'main'], c.origin);
  git(['init', '-q', '--bare', '-b', 'main'], c.v2remoto);
  git(['init', '-q', '-b', 'main'], c.beta);
  for (const [relativo, conteudo] of Object.entries(arquivos)) escrever(c.beta, relativo, conteudo);
  git(['add', '-A'], c.beta);
  git(['commit', '-q', '-m', 'base'], c.beta);
  git(['remote', 'add', 'origin', c.origin], c.beta);
  git(['remote', 'add', 'v2', c.v2remoto], c.beta);
  git(['push', '-q', 'origin', 'main'], c.beta);
  git(['worktree', 'add', '-q', '-b', 'pipeline-v2', c.v2], c.beta);
  return c;
}

/** "O código novo chega ao V2 sem commit." */
function chegaCodigoNovo(c: Cenario): void {
  escrever(c.v2, 'site/novo.txt', 'código novo\n');
  escrever(c.v2, 'LEIAME.txt', 'IrisFlow de teste, versão nova\n');
}

const MENSAGEM_DE_TESTE = { titulo: 'IrisFlow: publicação de teste', corpo: 'Corpo da mensagem de teste.' };

const sha = (pasta: string, ref: string) => git(['rev-parse', ref], pasta).trim();
const shaDoOrigin = (c: Cenario) => sha(c.origin, 'refs/heads/main');
const shaDoV2 = (c: Cenario) => sha(c.v2, 'HEAD');
const temIndiceVazio = (c: Cenario) => rodarGit(['diff', '--cached', '--quiet'], c.v2).codigo === 0;
const arquivosPublicados = (c: Cenario) => git(['ls-tree', '-r', '--name-only', 'refs/heads/main'], c.origin).split('\n');

interface Chamadas {
  npm: { args: string[]; cwd: string }[];
  testes: { raiz: string; so: string | null }[];
  perguntas: string[];
  git: string[][];
  buscas: number;
  esperas: number[];
}

/** `resposta`: o que o dono digita; `testesPassam`: o resultado do portão de testes. O resto sobrescreve a `op`. */
type Extras = Record<string, unknown> & { resposta?: string; testesPassam?: boolean };

/** Um relógio de mentira: só anda quando o teste manda (a espera falsa o faz andar). */
function relogioFalso(inicio = 1_700_000_000_000) {
  let agora = inicio;
  return { agora: () => agora, avancar: (ms: number) => void (agora += ms) };
}

function montarOp(c: Cenario, extras: Extras = {}) {
  const { resposta = 's', testesPassam = true, ...sobrescritas } = extras;
  const relogio = relogioFalso();
  const linhas: string[] = [];
  const chamadas: Chamadas = { npm: [], testes: [], perguntas: [], git: [], buscas: 0, esperas: [] };
  const gitDoTeste: ChamadaDeGit = (args, { cwd }) => {
    chamadas.git.push(args);
    return rodarGit(args, cwd);
  };
  const op = {
    raiz: c.v2,
    argumentos: lerArgumentos(['--sim', '--sem-conferir-site']),
    git: gitDoTeste,
    npm: async (args: string[], { cwd }: { cwd: string }) => {
      chamadas.npm.push({ args, cwd });
      return { codigo: 0, saida: '', erro: '' };
    },
    rodarTestes: async (pedido: { raiz: string; so: string | null }) => {
      chamadas.testes.push(pedido);
      return testesPassam;
    },
    perguntar: async (texto: string) => {
      chamadas.perguntas.push(texto);
      return resposta;
    },
    temTerminal: false,
    buscarVersaoDoSite: async (): Promise<string | null> => {
      chamadas.buscas++;
      return null;
    },
    esperar: async (ms: number) => {
      chamadas.esperas.push(ms);
      relogio.avancar(ms);
    },
    agora: relogio.agora,
    log: (texto: string) => {
      linhas.push(texto);
    },
    estaVersao: { BASE: '', REMOVIDOS: [] as string[], MENSAGEM: MENSAGEM_DE_TESTE },
    ...sobrescritas,
  };
  return { op, linhas, chamadas };
}

async function rodar(c: Cenario, extras: Extras = {}) {
  const montado = montarOp(c, extras);
  const resultado = await publicar(montado.op);
  return { ...montado, resultado, texto: montado.linhas.join('\n') };
}

/** O git de verdade, menos os comandos para os quais `quando` devolve true: esses falham. */
function gitQueFalhaEm(quando: (args: string[]) => boolean): ChamadaDeGit {
  return (args, { cwd }) =>
    quando(args) ? { codigo: 1, saida: '', erro: 'falha simulada pelo teste' } : rodarGit(args, cwd);
}

describe('publicar(): o caminho feliz', () => {
  it('commita no V2, atualiza a Beta, envia ao origin e ao v2, confere o site e termina', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    // A chave anon é pública (vai no site/.env.production): não pode travar nada.
    escrever(c.v2, 'site/.env.production', `VITE_SUPABASE_ANON_KEY=${jwtDeMentira('anon')}\n`);
    const antes = shaDoOrigin(c);
    // O site, a cada consulta: ainda o velho, falha de rede, outro commit e, por fim, o nosso (abreviado).
    let consultas = 0;

    const { resultado, texto, linhas, chamadas } = await rodar(c, {
      temTerminal: true, // com --sim não pergunta, mesmo com terminal
      argumentos: lerArgumentos(['--sim']),
      buscarVersaoDoSite: async () => {
        consultas++;
        if (consultas === 1) return null;
        if (consultas === 2) throw new Error('sem rede');
        if (consultas === 3) return 'ffffffffffffffffffffffffffffffffffffffff';
        return shaDoV2(c).slice(0, 7);
      },
    });

    expect(resultado).toEqual({ codigo: 0, etapa: 'Fim' });
    const novo = shaDoV2(c);
    expect(novo).not.toBe(antes);
    expect(shaDoOrigin(c)).toBe(novo);
    expect(sha(c.v2remoto, 'refs/heads/pipeline-v2')).toBe(novo);
    // a Beta andou junto (fast-forward) e já tem o arquivo novo na pasta
    expect(sha(c.beta, 'HEAD')).toBe(novo);
    expect(existsSync(path.join(c.beta, 'site', 'novo.txt'))).toBe(true);
    // um commit só, com a mensagem de MENSAGEM e sem linha de coautoria
    expect(git(['rev-list', '--count', `${antes}..${novo}`], c.v2).trim()).toBe('1');
    const mensagem = git(['log', '-1', '--format=%B'], c.v2).trim();
    expect(mensagem).toBe(`${MENSAGEM_DE_TESTE.titulo}\n\n${MENSAGEM_DE_TESTE.corpo}`);
    expect(mensagem).not.toMatch(/co-authored-by|claude-session/i);
    expect(git(['show', '--name-only', '--format=', novo], c.v2).split('\n').filter(Boolean).sort()).toEqual([
      'LEIAME.txt',
      'site/.env.production',
      'site/novo.txt',
    ]);
    // uma linha "▶ <etapa>" por etapa, na ordem
    expect(linhas.filter((l) => l.startsWith('▶ '))).toEqual([
      '▶ Conferir as pastas',
      '▶ Arquivos que saíram',
      '▶ Dependências',
      '▶ Testes',
      '▶ Conferir o que vai junto',
      '▶ Commit',
      '▶ Resumo e pergunta',
      '▶ Beta',
      '▶ Envio',
      '▶ Conferir o site',
    ]);
    // o resumo: quantos commits vão, os últimos e a última linha do --shortstat
    expect(texto).toMatch(/Vai 1 commit para o site/);
    expect(texto).toContain(MENSAGEM_DE_TESTE.titulo);
    expect(texto).toMatch(/3 files? changed/);
    // sem --sim e sem terminal nada seria perguntado; com --sim, nem com terminal
    expect(chamadas.perguntas).toEqual([]);
    // o site: 4 consultas, 3 esperas de 15 s
    expect(consultas).toBe(4);
    expect(chamadas.esperas).toEqual([15_000, 15_000, 15_000]);
    expect(texto).toContain('✔ Site novo no ar: https://irisflow.ia.br');
    expect(texto).toContain('o Cloudflare Pages começa a publicar');
    expect(linhas).toContain('Pronto.');
    expect(texto).toContain('npx eas-cli update --channel preview --environment preview');
    expect(texto).toMatch(/v1\.0\.0-beta\.<n>/);
    expect(texto).not.toContain('PAROU');
    // nunca mexe em configuração do git, nunca pula os hooks, só LÊ os remotos
    expect(chamadas.git.some((args) => args[0] === 'config' || args.includes('--no-verify'))).toBe(false);
    expect(chamadas.git.filter((args) => args[0] === 'remote').every((args) => args[1] === 'get-url')).toBe(true);
  });

  it('--mensagem troca a mensagem inteira do commit e --sem-conferir-site não consulta o site', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const { resultado, chamadas } = await rodar(c, {
      argumentos: lerArgumentos(['--sim', '--sem-conferir-site', '--mensagem', 'Corrige o botão de socorro']),
    });
    expect(resultado.codigo).toBe(0);
    expect(git(['log', '-1', '--format=%B'], c.v2).trim()).toBe('Corrige o botão de socorro');
    expect(chamadas.buscas).toBe(0);
    expect(chamadas.esperas).toEqual([]);
  });
});

describe('publicar(): para antes de commitar', () => {
  it('Beta com arquivo modificado: código 1, nenhum commit novo no V2, origin igual — e lista só 10 linhas', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    escrever(c.beta, 'LEIAME.txt', 'mexi na Beta sem salvar\n');
    // o git junta os não rastreados de uma mesma pasta numa linha só: uma pasta por arquivo
    for (let i = 0; i < 14; i++) escrever(c.beta, `sujeira-${String(i).padStart(2, '0')}/a.txt`, 'x\n');
    const v2Antes = shaDoV2(c);
    const originAntes = shaDoOrigin(c);

    const { resultado, texto, chamadas } = await rodar(c);

    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir as pastas' });
    expect(texto).toContain('PAROU: A pasta IrisFlow Beta tem mudanças não salvas');
    expect(texto).toContain('Nada foi enviado para a internet.');
    expect(texto).toContain('LEIAME.txt');
    expect(texto.split('\n').filter((l) => /^ {2}(\?\?| M) /.test(l))).toHaveLength(10);
    expect(texto).toContain('…e mais 5');
    expect(shaDoV2(c)).toBe(v2Antes);
    expect(shaDoOrigin(c)).toBe(originAntes);
    expect(chamadas.testes).toHaveLength(0);
  });

  it('fora do ramo pipeline-v2 manda rodar na pasta do V2; sem pasta com a main, diz que não achou a Beta', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);

    let r = await rodar(c, { raiz: c.beta });
    expect(r.resultado).toMatchObject({ codigo: 1, etapa: 'Conferir as pastas' });
    expect(r.texto).toContain('PAROU: Rode este comando dentro da pasta IrisFlow V2');
    expect(r.texto).toContain('Nada foi enviado para a internet.');

    git(['checkout', '-q', '--detach'], c.beta);
    r = await rodar(c);
    expect(r.resultado.codigo).toBe(1);
    expect(r.texto).toContain('PAROU: Não achei a pasta da Beta (ramo main)');
  });

  it('sem o remoto origin, e com o origin fora do ar, para e diz', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const v2Antes = shaDoV2(c);

    git(['remote', 'remove', 'origin'], c.beta);
    let r = await rodar(c);
    expect(r.resultado.codigo).toBe(1);
    expect(r.texto).toMatch(/PAROU: .*origin/);
    expect(r.texto).toContain('Nada foi enviado para a internet.');

    git(['remote', 'add', 'origin', path.join(c.base, 'nao-existe.git')], c.beta);
    r = await rodar(c);
    expect(r.resultado.codigo).toBe(1);
    expect(r.texto).toContain('PAROU: Sem internet ou sem acesso ao GitHub');
    expect(shaDoV2(c)).toBe(v2Antes);
  });

  it('origin à frente (outro clone empurrou um commit): código 1 antes do commit', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const outro = path.join(c.base, 'outro-clone');
    git(['clone', '-q', c.origin, outro], c.base);
    escrever(outro, 'mudanca-no-github.txt', 'alguém mexeu pelo site do GitHub\n');
    git(['add', '-A'], outro);
    git(['commit', '-q', '-m', 'commit feito em outro lugar'], outro);
    git(['push', '-q', 'origin', 'main'], outro);
    const v2Antes = shaDoV2(c);
    const originAntes = shaDoOrigin(c);

    const { resultado, texto, chamadas } = await rodar(c);

    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir as pastas' });
    expect(texto).toContain('PAROU: O GitHub (ou a Beta) tem commits que não estão no V2. Não vou misturar: me chame.');
    expect(shaDoV2(c)).toBe(v2Antes);
    expect(shaDoOrigin(c)).toBe(originAntes);
    expect(temIndiceVazio(c)).toBe(true);
    expect(chamadas.testes).toHaveLength(0);
  });

  it('Beta com commit que não está no V2 também para', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    escrever(c.beta, 'so-na-beta.txt', 'commit só na Beta\n');
    git(['add', '-A'], c.beta);
    git(['commit', '-q', '-m', 'só na Beta'], c.beta);
    const { resultado, texto } = await rodar(c);
    expect(resultado.codigo).toBe(1);
    expect(texto).toContain('O GitHub (ou a Beta) tem commits que não estão no V2');
  });
});

describe('publicar(): arquivos que saíram (REMOVIDOS e BASE)', () => {
  it('com BASE igual ao HEAD do V2 os arquivos somem no commit publicado: caminho literal, lista longa em lotes', async () => {
    const c = criarCenario({
      ...ARQUIVOS_BASE,
      'app/[id].tsx': 'rota dinâmica que sai\n',
      'app/i.tsx': 'este fica\n',
      'app/d.tsx': 'este também fica\n',
      'docs-a.txt': 'fica\n',
    });
    chegaCodigoNovo(c);
    const base = shaDoV2(c);
    const fantasmas = Array.from({ length: 400 }, (_, i) => `pasta-bem-comprida-para-estourar-a-linha/${'x'.repeat(70)}-${i}.ts`);

    const { resultado, chamadas } = await rodar(c, {
      // `*.txt` é o NOME de um arquivo (que não existe), não um curinga; `[id]` também
      estaVersao: { BASE: base.slice(0, 10), REMOVIDOS: ['velho.txt', 'app/[id].tsx', '*.txt', ...fantasmas], MENSAGEM: MENSAGEM_DE_TESTE },
    });

    expect(resultado.codigo).toBe(0);
    const publicados = arquivosPublicados(c);
    expect(publicados).not.toContain('velho.txt');
    expect(publicados).not.toContain('app/[id].tsx');
    expect(publicados).toEqual(expect.arrayContaining(['site/novo.txt', 'app/i.tsx', 'app/d.tsx', 'docs-a.txt', 'LEIAME.txt']));
    expect(existsSync(path.join(c.v2, 'velho.txt'))).toBe(false);
    expect(existsSync(path.join(c.beta, 'velho.txt'))).toBe(false);
    // a linha de comando do Windows tem limite: vai em lotes
    const remocoes = chamadas.git.filter((args) => args.includes('rm'));
    expect(remocoes.length).toBeGreaterThan(1);
    for (const args of remocoes) expect(args.join(' ').length).toBeLessThan(8000);
  });

  it('com BASE de outra versão o arquivo fica e a mensagem "de outra versão" aparece; BASE vazia e caminho inválido também não removem', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);

    // publicando de verdade: o arquivo fica na árvore publicada
    let r = await rodar(c, { estaVersao: { BASE: 'deadbeef', REMOVIDOS: ['velho.txt'], MENSAGEM: MENSAGEM_DE_TESTE } });
    expect(r.resultado.codigo).toBe(0);
    expect(r.texto).toContain('lista de removidos é de outra versão; nada removido');
    expect(arquivosPublicados(c)).toContain('velho.txt');
    expect(existsSync(path.join(c.v2, 'velho.txt'))).toBe(true);

    // BASE vazia = "não conferido"
    r = await rodar(c, { estaVersao: { BASE: '', REMOVIDOS: ['velho.txt'], MENSAGEM: MENSAGEM_DE_TESTE } });
    expect(r.texto).toContain('lista de removidos é de outra versão; nada removido');
    expect(existsSync(path.join(c.v2, 'velho.txt'))).toBe(true);

    // BASE certa, mas um caminho que não serve (sai do repositório): para sem remover nada
    const base = shaDoV2(c);
    r = await rodar(c, { estaVersao: { BASE: base, REMOVIDOS: ['velho.txt', '../fora.txt'], MENSAGEM: MENSAGEM_DE_TESTE } });
    expect(r.resultado).toMatchObject({ codigo: 1, etapa: 'Arquivos que saíram' });
    expect(r.texto).toContain('tem caminho que não serve');
    expect(r.texto).toContain('../fora.txt');
    expect(existsSync(path.join(c.v2, 'velho.txt'))).toBe(true);
    expect(shaDoV2(c)).toBe(base);
  });
});

/* Relato de 21/10/2026 (a entrega do visual sem o olho de partículas): no PC do
   dono, parte do site v3 foi COPIADA para a pasta do V2 e nunca commitada. O
   `git rm` ignora o que o git não conhece (`--ignore-unmatch`), então esses
   arquivos ficavam lá, importando componentes que a versão nova apagou, e o
   build do site quebrava. Agora, na etapa dos removidos (e só quando o HEAD
   bate com a BASE), todo caminho da lista que ainda existe e não é rastreado
   é apagado — só arquivo, nunca pasta, nunca fora do repositório. */
describe('publicar(): arquivos que saíram e nunca foram commitados', () => {
  const ANTIGO = 'site/src/componentes/FundoAntigo.tsx';
  const ANTIGO_TESTE = 'site/src/componentes/FundoAntigo.test.tsx';
  const NOVO = 'site/src/componentes/FundoNovo.tsx';

  /** O V2 do dono: dois arquivos antigos só copiados para a pasta (não rastreados) e um novo, fora da lista. */
  function cenarioComArquivosSoCopiados() {
    const c = criarCenario();
    chegaCodigoNovo(c);
    escrever(c.v2, ANTIGO, 'copiado para a pasta, nunca commitado\n');
    escrever(c.v2, ANTIGO_TESTE, 'o teste dele, também só copiado\n');
    escrever(c.v2, NOVO, 'o componente que fica\n');
    return c;
  }

  it('o arquivo da lista que só existe na pasta some; o que não está na lista fica e vai no commit', async () => {
    const c = cenarioComArquivosSoCopiados();
    const base = shaDoV2(c);

    const { resultado, texto } = await rodar(c, {
      // `velho.txt` está no git (o `git rm` o tira); os dois do site, não (só o disco os tem)
      estaVersao: { BASE: base, REMOVIDOS: ['velho.txt', ANTIGO, ANTIGO_TESTE], MENSAGEM: MENSAGEM_DE_TESTE },
    });

    expect(resultado.codigo).toBe(0);
    expect(existsSync(path.join(c.v2, 'velho.txt'))).toBe(false);
    expect(existsSync(path.join(c.v2, ...ANTIGO.split('/')))).toBe(false);
    expect(existsSync(path.join(c.v2, ...ANTIGO_TESTE.split('/')))).toBe(false);
    expect(existsSync(path.join(c.beta, ...ANTIGO.split('/')))).toBe(false);
    const publicados = arquivosPublicados(c);
    expect(publicados).not.toContain(ANTIGO);
    expect(publicados).not.toContain(ANTIGO_TESTE);
    expect(publicados).toContain(NOVO);
    expect(texto).toMatch(/2 arquivos que nunca tinham sido commitados/);
  });

  it('com a BASE de outra versão (ou vazia) nenhum arquivo é apagado', async () => {
    const c = cenarioComArquivosSoCopiados();

    for (const BASE of ['deadbeef', '']) {
      const r = await rodar(c, { estaVersao: { BASE, REMOVIDOS: [ANTIGO, ANTIGO_TESTE], MENSAGEM: MENSAGEM_DE_TESTE } });
      expect(r.texto).toContain('lista de removidos é de outra versão; nada removido');
      expect(existsSync(path.join(c.v2, ...ANTIGO.split('/'))), `BASE "${BASE}"`).toBe(true);
      expect(existsSync(path.join(c.v2, ...ANTIGO_TESTE.split('/'))), `BASE "${BASE}"`).toBe(true);
    }
  });

  it('só arquivo: uma pasta da lista (e o que há dentro dela) não é apagada', async () => {
    const c = cenarioComArquivosSoCopiados();
    escrever(c.v2, 'site/src/pasta-antiga/a.tsx', 'dentro de uma pasta\n');
    const base = shaDoV2(c);

    const { resultado, texto } = await rodar(c, {
      estaVersao: { BASE: base, REMOVIDOS: ['site/src/pasta-antiga', ANTIGO], MENSAGEM: MENSAGEM_DE_TESTE },
    });

    expect(resultado.codigo).toBe(0);
    expect(existsSync(path.join(c.v2, 'site', 'src', 'pasta-antiga', 'a.tsx'))).toBe(true);
    expect(existsSync(path.join(c.v2, ...ANTIGO.split('/')))).toBe(false);
    expect(texto).toContain('é uma pasta');
  });

  it('nunca fora do repositório: caminho com ".." ou absoluto para tudo, sem apagar nem o de fora nem o de dentro', async () => {
    const c = cenarioComArquivosSoCopiados();
    const fora = path.join(c.base, 'fora.txt');
    writeFileSync(fora, 'isto não é do repositório\n');
    const base = shaDoV2(c);

    for (const intruso of ['../fora.txt', fora.replace(/\\/g, '/')]) {
      const r = await rodar(c, { estaVersao: { BASE: base, REMOVIDOS: [ANTIGO, intruso], MENSAGEM: MENSAGEM_DE_TESTE } });
      expect(r.resultado, intruso).toMatchObject({ codigo: 1, etapa: 'Arquivos que saíram' });
      expect(r.texto).toContain('tem caminho que não serve');
      expect(readFileSync(fora, 'utf8'), intruso).toBe('isto não é do repositório\n');
      // a validação vem antes de qualquer remoção: o arquivo de dentro, da mesma lista, também fica
      expect(existsSync(path.join(c.v2, ...ANTIGO.split('/'))), intruso).toBe(true);
    }
  });

  it('um atalho (link simbólico) da lista é apagado sem tocar no que ele aponta; pasta-atalho para fora do repositório não é seguida', async () => {
    const c = cenarioComArquivosSoCopiados();
    const foraDir = path.join(c.base, 'fora-dir');
    mkdirSync(foraDir);
    writeFileSync(path.join(foraDir, 'alvo.txt'), 'de fora\n');
    try {
      symlinkSync(path.join(foraDir, 'alvo.txt'), path.join(c.v2, 'site', 'atalho-para-arquivo'));
      symlinkSync(foraDir, path.join(c.v2, 'site', 'atalho-para-pasta'), 'dir');
    } catch {
      return; // sem permissão para criar link simbólico (Windows comum): nada a provar aqui
    }
    const base = shaDoV2(c);

    const r = await rodar(c, {
      estaVersao: {
        BASE: base,
        REMOVIDOS: ['site/atalho-para-arquivo', 'site/atalho-para-pasta/alvo.txt', ANTIGO],
        MENSAGEM: MENSAGEM_DE_TESTE,
      },
    });

    expect(r.resultado.codigo).toBe(0);
    expect(() => lstatSync(path.join(c.v2, 'site', 'atalho-para-arquivo'))).toThrow();
    expect(readFileSync(path.join(foraDir, 'alvo.txt'), 'utf8')).toBe('de fora\n');
    expect(r.texto).toContain('fora do repositório');
    expect(existsSync(path.join(c.v2, ...ANTIGO.split('/')))).toBe(false);
  });

  it('se uma etapa seguinte parar, o PAROU conta que esses arquivos foram apagados e que não voltam pelo git', async () => {
    const c = cenarioComArquivosSoCopiados();
    const base = shaDoV2(c);

    const r = await rodar(c, {
      testesPassam: false,
      estaVersao: { BASE: base, REMOVIDOS: [ANTIGO, ANTIGO_TESTE], MENSAGEM: MENSAGEM_DE_TESTE },
    });

    expect(r.resultado.codigo).toBe(1);
    expect(r.texto).toMatch(/Apaguei também 2 arquivos que nunca tinham sido commitados/);
    expect(r.texto).toContain('não voltam pelo git');
  });
});

describe('publicar(): dependências e testes', () => {
  it('npm ci onde falta node_modules ou o package-lock.json mudou; o app do cuidador é opcional', async () => {
    const c = criarCenario({
      ...ARQUIVOS_BASE,
      'package-lock.json': '{"lockfileVersion":3}\n',
      'site/package-lock.json': '{"lockfileVersion":3}\n',
      'app/package-lock.json': '{"lockfileVersion":3}\n',
    });
    chegaCodigoNovo(c);
    const pararNosTestes = { testesPassam: false }; // aqui só interessa o passo 3: para nos testes, sem commitar
    const pastas = (r: Awaited<ReturnType<typeof rodar>>) => r.chamadas.npm.map((x) => x.cwd);
    const site = path.join(c.v2, 'site');
    const app = path.join(c.v2, 'app');

    // 1. nada instalado: raiz e site. O app é opcional: nunca é instalado do zero
    let r = await rodar(c, pararNosTestes);
    expect(pastas(r)).toEqual([c.v2, site]);
    expect(r.chamadas.npm.every((x) => x.args.length === 1 && x.args[0] === 'ci')).toBe(true);
    expect(r.texto).toContain('app do cuidador: conferido pelo CI no GitHub');

    // 2. tudo instalado e lock igual ao HEAD: nada a fazer; os testes recebem a raiz e os grupos padrão
    mkdirSync(path.join(c.v2, 'node_modules'));
    mkdirSync(path.join(site, 'node_modules'));
    r = await rodar(c, pararNosTestes);
    expect(pastas(r)).toEqual([]);
    expect(r.chamadas.testes).toEqual([{ raiz: c.v2, so: 'desktop,site' }]);

    // 3. o package-lock.json mudou em relação ao HEAD: só essa pasta
    escrever(c.v2, 'site/package-lock.json', '{"lockfileVersion":3,"mudou":true}\n');
    r = await rodar(c, pararNosTestes);
    expect(pastas(r)).toEqual([site]);

    // 4. o app que JÁ está instalado é atualizado se o lock mudou, e entra nos testes
    mkdirSync(path.join(app, 'node_modules'));
    escrever(c.v2, 'app/package-lock.json', '{"lockfileVersion":3,"mudou":true}\n');
    r = await rodar(c, pararNosTestes);
    expect(pastas(r)).toEqual([site, app]);
    expect(r.chamadas.testes[0].so).toBe('desktop,site,app');

    // 5. --so substitui o padrão
    r = await rodar(c, { ...pararNosTestes, argumentos: lerArgumentos(['--sim', '--so', 'site']) });
    expect(r.chamadas.testes).toEqual([{ raiz: c.v2, so: 'site' }]);

    // 6. npm ci que falha para antes de testar e de commitar
    const v2Antes = shaDoV2(c);
    r = await rodar(c, { npm: async () => ({ codigo: 1, saida: '', erro: 'EBUSY' }) });
    expect(r.resultado).toMatchObject({ codigo: 1, etapa: 'Dependências' });
    expect(r.texto).toContain('PAROU: O npm ci falhou em site. Feche o VS Code e o IrisFlow aberto e rode de novo.');
    expect(r.chamadas.testes).toHaveLength(0);
    expect(shaDoV2(c)).toBe(v2Antes);
  });

  it('testes que falham: código 1, nenhum commit novo, origin igual, nada na fila do commit', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const v2Antes = shaDoV2(c);
    const originAntes = shaDoOrigin(c);
    const { resultado, texto, chamadas } = await rodar(c, { testesPassam: false });
    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Testes' });
    expect(chamadas.testes).toHaveLength(1);
    expect(texto).toMatch(/PAROU: .*teste/i);
    expect(texto).toContain('Nada foi enviado para a internet.');
    expect(shaDoV2(c)).toBe(v2Antes);
    expect(shaDoOrigin(c)).toBe(originAntes);
    expect(temIndiceVazio(c)).toBe(true);
  });
});

describe('publicar(): o que vai junto', () => {
  it('JWT service_role e os outros: código 1, índice vazio, os arquivos continuam na pasta, origin igual', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    escrever(c.v2, 'config/chave.ts', `export const K = "${jwtDeMentira('service_role')}";\n`);
    escrever(c.v2, 'supabase/segredo.ts', `const s = '${SEGREDO_SB}';\n`);
    escrever(c.v2, 'deploy/id.txt', `${cabecalhoPem('RSA ')}\nabc\n`);
    escrever(c.v2, '.env.local', 'X=1\n');
    escrever(c.v2, 'site/.env', 'X=1\n');
    escrever(c.v2, 'models/novo.onnx', 'pesos\n');
    escrever(c.v2, 'algo/GazeGene/pesos.bin', 'pesos\n');
    // estes dois podem ir
    escrever(c.v2, 'site/.env.production', `VITE_SUPABASE_ANON_KEY=${jwtDeMentira('anon')}\n`);
    escrever(c.v2, 'site/.env.example', 'VITE_X=\n');
    const v2Antes = shaDoV2(c);
    const originAntes = shaDoOrigin(c);

    const { resultado, texto } = await rodar(c);

    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir o que vai junto' });
    expect(texto).toMatch(/Isto não pode ir para o repositório público: config\/chave\.ts — .*service_role/);
    for (const arquivo of ['supabase/segredo.ts', 'deploy/id.txt', '.env.local', 'site/.env', 'models/novo.onnx', 'algo/GazeGene/pesos.bin']) {
      expect(texto, arquivo).toContain(`Isto não pode ir para o repositório público: ${arquivo} — `);
    }
    expect(texto).not.toContain('público: site/.env.production');
    expect(texto).not.toContain('público: site/.env.example');
    expect(texto).toContain('Nada foi enviado para a internet.');
    expect(temIndiceVazio(c)).toBe(true);
    for (const arquivo of ['config/chave.ts', 'algo/GazeGene/pesos.bin', '.env.local']) {
      expect(existsSync(path.join(c.v2, ...arquivo.split('/'))), arquivo).toBe(true);
    }
    expect(shaDoV2(c)).toBe(v2Antes);
    expect(shaDoOrigin(c)).toBe(originAntes);
  });
});

describe('publicar(): o que vai junto (quando o git falha)', () => {
  it('se o git não consegue mostrar o que vai no commit, para sem commitar e tira tudo da fila', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const v2Antes = shaDoV2(c);
    const { resultado, texto } = await rodar(c, {
      git: gitQueFalhaEm((args) => args[0] === 'diff' && args.includes('--name-status')),
    });
    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir o que vai junto' });
    expect(texto).toContain('PAROU: Não consegui ler o que vai no commit');
    expect(texto).toContain('Nada foi enviado para a internet.');
    expect(temIndiceVazio(c)).toBe(true);
    expect(shaDoV2(c)).toBe(v2Antes);
  });
});

/** Faz um commit à mão no V2, como o dono fazia antes do `npm run publicar`. */
function commitarNoV2(c: Cenario, arquivos: Record<string, string | Buffer>, mensagem: string): void {
  for (const [relativo, conteudo] of Object.entries(arquivos)) {
    const destino = path.join(c.v2, ...relativo.split('/'));
    mkdirSync(path.dirname(destino), { recursive: true });
    writeFileSync(destino, conteudo);
  }
  git(['add', '-A'], c.v2);
  git(['commit', '-q', '-m', mensagem], c.v2);
}

/** Executa uma linha `git …` impressa pelo PAROU (aspas duplas respeitadas): prova que a instrução funciona. */
function executarComandoImpresso(linha: string, cwd: string): ResultadoDoGit {
  const pedacos = (linha.trim().match(/"[^"]*"|\S+/g) ?? []).map((p) => p.replace(/^"|"$/g, ''));
  expect(pedacos[0], linha).toBe('git');
  return rodarGit(pedacos.slice(1), cwd);
}
/** Os comandos que o PAROU mostra para o dono copiar: linhas recuadas em 4 espaços que começam com `git `. */
const comandosImpressos = (texto: string) => texto.split('\n').filter((linha) => /^ {4}git /.test(linha));

describe('publicar(): varre tudo o que vai no envio, também os commits que já estavam à frente (revisão de 21/10/2026)', () => {
  it('segredo num commit feito à mão no V2 (a pasta está limpa): para, não envia, não mexe no commit', async () => {
    const c = criarCenario();
    commitarNoV2(c, { 'config/chave.ts': `export const K = "${jwtDeMentira('service_role')}";\n` }, 'commit à mão');
    const v2Antes = shaDoV2(c);
    const originAntes = shaDoOrigin(c);

    const { resultado, texto, chamadas } = await rodar(c);

    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir o que vai junto' });
    expect(texto).toMatch(/Isto não pode ir para o repositório público: config\/chave\.ts — .*service_role/);
    expect(texto).toContain('já está num commit do V2');
    expect(texto).toContain('me chame');
    expect(texto).not.toContain('Tirei tudo da fila do commit'); // não havia nada na fila
    expect(texto).toContain('Nada foi enviado para a internet.');
    expect(chamadas.git.some((args) => args[0] === 'push')).toBe(false);
    expect(shaDoV2(c)).toBe(v2Antes);
    expect(shaDoOrigin(c)).toBe(originAntes);
    expect(temIndiceVazio(c)).toBe(true);
  });

  it('segredo posto num commit e tirado no seguinte continua no histórico que iria: para', async () => {
    const c = criarCenario();
    commitarNoV2(c, { 'config/chave.ts': `export const K = "${jwtDeMentira('service_role')}";\n` }, 'põe a chave');
    git(['rm', '-q', 'config/chave.ts'], c.v2);
    git(['commit', '-q', '-m', 'tira a chave'], c.v2);
    // a árvore de agora está limpa: só o histórico (que o push leva) tem a chave
    expect(existsSync(path.join(c.v2, 'config', 'chave.ts'))).toBe(false);
    const originAntes = shaDoOrigin(c);

    const { resultado, texto } = await rodar(c);

    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir o que vai junto' });
    expect(texto).toMatch(/config\/chave\.ts — .*service_role/);
    expect(shaDoOrigin(c)).toBe(originAntes);
  });

  it('arquivo proibido (chave .pem, peso .onnx) posto num commit e apagado no seguinte também para', async () => {
    const c = criarCenario();
    commitarNoV2(c, { 'deploy/servidor.pem': 'chave\n', 'models/novo.onnx': 'pesos\n' }, 'põe arquivos');
    git(['rm', '-q', 'deploy/servidor.pem', 'models/novo.onnx'], c.v2);
    git(['commit', '-q', '-m', 'tira os arquivos'], c.v2);
    const originAntes = shaDoOrigin(c);

    const { resultado, texto } = await rodar(c);

    expect(resultado.codigo).toBe(1);
    expect(texto).toContain('Isto não pode ir para o repositório público: deploy/servidor.pem — ');
    expect(texto).toContain('Isto não pode ir para o repositório público: models/novo.onnx — ');
    expect(shaDoOrigin(c)).toBe(originAntes);
  });

  it('commit antigo com segredo + arquivo novo na pasta: lista os dois, esvazia a fila, deixa tudo no lugar', async () => {
    const c = criarCenario();
    commitarNoV2(c, { 'supabase/segredo.ts': `const s = '${SEGREDO_SB}';\n` }, 'commit à mão');
    chegaCodigoNovo(c);
    escrever(c.v2, 'site/.env', 'X=1\n');
    const v2Antes = shaDoV2(c);

    const { resultado, texto } = await rodar(c);

    expect(resultado.codigo).toBe(1);
    expect(texto).toMatch(/público: site\/\.env — /);
    expect(texto).toMatch(/público: supabase\/segredo\.ts — .*sb_secret_.*já está num commit do V2/);
    expect(texto).toContain('Tirei tudo da fila do commit');
    expect(temIndiceVazio(c)).toBe(true);
    expect(existsSync(path.join(c.v2, 'site', '.env'))).toBe(true);
    expect(existsSync(path.join(c.v2, 'site', 'novo.txt'))).toBe(true);
    expect(shaDoV2(c)).toBe(v2Antes);
  });

  it('segredo escondido no próprio commit de merge (não está em nenhum dos lados): também é achado', async () => {
    const c = criarCenario();
    git(['checkout', '-q', '-b', 'lado'], c.v2);
    commitarNoV2(c, { 'docs/lado.txt': 'trabalho do outro ramo\n' }, 'trabalho do outro ramo');
    git(['checkout', '-q', 'pipeline-v2'], c.v2);
    commitarNoV2(c, { 'docs/v2.txt': 'trabalho do V2\n' }, 'trabalho do V2');
    git(['merge', '-q', '--no-ff', '--no-commit', 'lado'], c.v2);
    escrever(c.v2, 'config/chave.ts', `export const K = "${jwtDeMentira('service_role')}";\n`);
    git(['add', '-A'], c.v2);
    git(['commit', '-q', '-m', 'merge com um extra'], c.v2);
    const originAntes = shaDoOrigin(c);

    const { resultado, texto } = await rodar(c);

    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir o que vai junto' });
    expect(texto).toMatch(/config\/chave\.ts — .*service_role/);
    expect(shaDoOrigin(c)).toBe(originAntes);
  });

  it('commits à frente limpos, com binário no meio, seguem normalmente e vão no envio', async () => {
    const c = criarCenario();
    commitarNoV2(c, { 'img/logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x01, 0x02]), 'docs/nota.txt': 'texto comum\n' }, 'commit à mão');
    git(['commit', '-q', '--allow-empty', '-m', 'vazio'], c.v2);
    const { resultado, texto } = await rodar(c);
    expect(resultado.codigo).toBe(0);
    expect(texto).not.toContain('PAROU');
    expect(shaDoOrigin(c)).toBe(shaDoV2(c));
    expect(arquivosPublicados(c)).toEqual(expect.arrayContaining(['img/logo.png', 'docs/nota.txt']));
  });

  it('git que não consegue mostrar os commits à frente: para e tira tudo da fila (fecha para o lado seguro)', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const originAntes = shaDoOrigin(c);
    const { resultado, texto } = await rodar(c, {
      git: gitQueFalhaEm((args) => args[0] === 'log' && args.includes('--name-status')),
    });
    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir o que vai junto' });
    expect(texto).toContain('PAROU: Não consegui ler os commits que já estavam à frente do GitHub');
    expect(temIndiceVazio(c)).toBe(true);
    expect(shaDoOrigin(c)).toBe(originAntes);
  });
});

describe('publicar(): o git reset que esvazia a fila (revisão de 21/10/2026)', () => {
  it('reset que falha: não diz que tirou da fila; mostra o comando para rodar à mão', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    escrever(c.v2, 'config/chave.ts', `export const K = "${jwtDeMentira('service_role')}";\n`);
    const { resultado, texto } = await rodar(c, { git: gitQueFalhaEm((args) => args[0] === 'reset') });
    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir o que vai junto' });
    expect(texto).toMatch(/público: config\/chave\.ts — /);
    expect(texto).not.toContain('Tirei tudo da fila do commit');
    expect(texto).toContain('Não consegui tirar tudo da fila do commit');
    expect(comandosImpressos(texto)).toContain('    git reset -q');
    expect(temIndiceVazio(c)).toBe(false); // a fila continua cheia: o aviso é verdadeiro
    // e o comando que ele manda rodar funciona
    expect(executarComandoImpresso('    git reset -q', c.v2).codigo).toBe(0);
    expect(temIndiceVazio(c)).toBe(true);
  });

  it('reset que falha no caminho "não consegui ler o que vai no commit" também mostra o comando', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const { texto } = await rodar(c, {
      git: gitQueFalhaEm((args) => args[0] === 'reset' || (args[0] === 'diff' && args.includes('--name-status'))),
    });
    expect(texto).toContain('PAROU: Não consegui ler o que vai no commit');
    expect(comandosImpressos(texto)).toContain('    git reset -q');
  });

  it('reset que funciona continua dizendo que tirou da fila e não mostra comando nenhum', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    escrever(c.v2, 'site/.env', 'X=1\n');
    const { texto } = await rodar(c);
    expect(texto).toContain('Tirei tudo da fila do commit');
    expect(comandosImpressos(texto)).toEqual([]);
  });
});

describe('publicar(): quando o git falha por outro motivo, mostra o que o git disse (revisão de 21/10/2026)', () => {
  const falhaCom = (subcomando: string, codigo: number, erro: string): ChamadaDeGit => (args, { cwd }) =>
    args[0] === subcomando ? { codigo, saida: '', erro } : rodarGit(args, cwd);

  it('não consegue ler o ramo (código 128, ex.: pasta "duvidosa" para o git): mostra a mensagem, não "rode no V2"', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const { resultado, texto } = await rodar(c, {
      git: falhaCom('symbolic-ref', 128, "fatal: detected dubious ownership in repository at 'C:/pasta'"),
    });
    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir as pastas' });
    expect(texto).toMatch(/PAROU: Não consegui ler em que ramo/);
    expect(texto).toContain('dubious ownership');
    expect(texto).not.toContain('Rode este comando dentro da pasta IrisFlow V2');
    expect(texto).toContain('Nada foi enviado para a internet.');
  });

  it('HEAD solto (sem ramo; o git sai com 1 de verdade) continua mandando rodar na pasta do V2', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    git(['checkout', '-q', '--detach'], c.v2);
    const { resultado, texto } = await rodar(c);
    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir as pastas' });
    expect(texto).toContain('PAROU: Rode este comando dentro da pasta IrisFlow V2');
    expect(texto).toContain('sem ramo');
  });

  it('git worktree list que falha: mostra a mensagem do git, em vez de "não achei a Beta"', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const { texto } = await rodar(c, { git: falhaCom('worktree', 128, 'fatal: não é um repositório git') });
    expect(texto).toMatch(/PAROU: Não consegui listar as pastas/);
    expect(texto).toContain('não é um repositório git');
    expect(texto).not.toContain('Não achei a pasta da Beta');
  });

  it('merge-base com erro de verdade (128) não vira "o GitHub tem commits que não estão no V2"', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const { resultado, texto } = await rodar(c, { git: falhaCom('merge-base', 128, 'fatal: Not a valid object name origin/main') });
    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Conferir as pastas' });
    expect(texto).toMatch(/PAROU: Não consegui comparar/);
    expect(texto).toContain('Not a valid object name');
    expect(texto).not.toContain('Não vou misturar');
  });

  it('sem o remoto origin: a mensagem do git vem junto', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    git(['remote', 'remove', 'origin'], c.beta);
    const { texto } = await rodar(c);
    expect(texto).toMatch(/PAROU: .*origin/);
    expect(texto).toContain('No such remote');
  });
});

describe('publicar(): o PAROU diz o que já ficou feito e como desfazer (revisão de 21/10/2026)', () => {
  it('parou cedo, antes de mexer em qualquer coisa: não tem bloco "já ficou feito"', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    escrever(c.beta, 'LEIAME.txt', 'mexi na Beta sem salvar\n');
    const { texto } = await rodar(c);
    expect(texto).toContain('Nada foi enviado para a internet.');
    expect(texto).not.toContain('Já ficou feito');
    expect(comandosImpressos(texto)).toEqual([]);
  });

  it('testes falharam depois de tirar os arquivos que saíram: diz quais voltam e o comando devolve só eles', async () => {
    const c = criarCenario({ ...ARQUIVOS_BASE, 'app/[id].tsx': 'rota dinâmica que sai\n' });
    chegaCodigoNovo(c);
    const base = shaDoV2(c);
    const { resultado, texto } = await rodar(c, {
      testesPassam: false,
      // 'ja-saiu-antes.txt' não está no repositório: não conta e não entra no comando para trazer de volta
      estaVersao: { BASE: base.slice(0, 10), REMOVIDOS: ['velho.txt', 'ja-saiu-antes.txt', 'app/[id].tsx'], MENSAGEM: MENSAGEM_DE_TESTE },
    });

    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Testes' });
    expect(texto).toContain('Nada foi enviado para a internet.');
    expect(texto).toContain('Já ficou feito');
    expect(texto).toMatch(/Apaguei da pasta do V2 os 2 arquivos? que saíram nesta versão/);
    expect(texto).toContain('npm run publicar'); // rodar de novo continua daqui
    expect(existsSync(path.join(c.v2, 'velho.txt'))).toBe(false);

    const comandos = comandosImpressos(texto);
    expect(comandos).toHaveLength(1);
    expect(executarComandoImpresso(comandos[0], c.v2).codigo).toBe(0);
    expect(readFileSync(path.join(c.v2, 'velho.txt'), 'utf8')).toBe(ARQUIVOS_BASE['velho.txt']);
    expect(readFileSync(path.join(c.v2, 'app', '[id].tsx'), 'utf8')).toBe('rota dinâmica que sai\n');
    // o código novo que chegou ao V2 sem commit não foi tocado
    expect(readFileSync(path.join(c.v2, 'LEIAME.txt'), 'utf8')).toBe('IrisFlow de teste, versão nova\n');
    expect(existsSync(path.join(c.v2, 'site', 'novo.txt'))).toBe(true);
    expect(shaDoV2(c)).toBe(base);
  });

  it('o envio ao GitHub falhou depois do commit e da Beta: conta os dois e os comandos devolvem tudo ao que era', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const antes = shaDoV2(c);
    const originAntes = shaDoOrigin(c);

    const { resultado, texto } = await rodar(c, { git: gitQueFalhaEm((args) => args[0] === 'push' && args[1] === 'origin') });

    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Envio' });
    const novo = shaDoV2(c);
    expect(novo).not.toBe(antes);
    expect(sha(c.beta, 'HEAD')).toBe(novo);
    expect(texto).toContain('Nada foi enviado para a internet.');
    expect(texto).toContain('Já ficou feito');
    expect(texto).toContain(`Fiz o commit ${novo.slice(0, 7)} no V2`);
    expect(texto).toMatch(/Avancei a pasta da Beta/);
    expect(texto).toContain('rode npm run publicar de novo'); // o commit e a main ficam: tentar de novo repete só o envio
    expect(texto).toContain('IrisFlow Beta'); // diz em que pasta rodar cada comando

    const comandos = comandosImpressos(texto);
    expect(comandos).toHaveLength(2);
    // 1º na pasta da Beta, 2º na do V2 (é a ordem em que o texto os mostra)
    expect(executarComandoImpresso(comandos[0], c.beta).codigo).toBe(0);
    expect(executarComandoImpresso(comandos[1], c.v2).codigo).toBe(0);
    expect(sha(c.beta, 'HEAD')).toBe(antes);
    expect(shaDoV2(c)).toBe(antes);
    expect(shaDoOrigin(c)).toBe(originAntes);
    // o código novo voltou para a fila do V2, nada se perdeu
    expect(temIndiceVazio(c)).toBe(false);
    expect(readFileSync(path.join(c.v2, 'site', 'novo.txt'), 'utf8')).toBe('código novo\n');
    expect(rodarGit(['status', '--porcelain'], c.beta).saida).toBe('');
  });

  it('a Beta não andou (o merge falhou): só o commit é desfeito, nenhum comando para a Beta', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const antes = shaDoV2(c);
    const { texto } = await rodar(c, { git: gitQueFalhaEm((args) => args[0] === 'merge') });
    expect(texto).toContain('Já ficou feito');
    expect(texto).toMatch(/Fiz o commit [0-9a-f]{7} no V2/);
    expect(texto).not.toContain('Avancei a pasta da Beta');
    const comandos = comandosImpressos(texto);
    expect(comandos).toHaveLength(1);
    expect(comandos[0]).toContain('reset --soft HEAD~1');
    expect(executarComandoImpresso(comandos[0], c.v2).codigo).toBe(0);
    expect(shaDoV2(c)).toBe(antes);
  });

  it('commit que já estava de uma rodada anterior: só a Beta é desfeita; não diz que fez commit agora', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    await rodar(c, { temTerminal: true, argumentos: lerArgumentos(['--sem-conferir-site']), resposta: 'n' }); // 1ª rodada: commita e cancela
    const commitDaRodadaAnterior = shaDoV2(c);
    const antesDaBeta = sha(c.beta, 'HEAD');

    const { texto } = await rodar(c, { git: gitQueFalhaEm((args) => args[0] === 'push' && args[1] === 'origin') });

    expect(texto).toContain('Já ficou feito');
    expect(texto).not.toContain('Fiz o commit');
    expect(texto).toMatch(/Avancei a pasta da Beta/);
    const comandos = comandosImpressos(texto);
    expect(comandos).toHaveLength(1);
    expect(executarComandoImpresso(comandos[0], c.beta).codigo).toBe(0);
    expect(sha(c.beta, 'HEAD')).toBe(antesDaBeta);
    expect(shaDoV2(c)).toBe(commitDaRodadaAnterior);
  });

  it('segredo achado depois de tirar arquivos: o reset esvazia a fila mas o bloco ainda diz que os arquivos foram apagados', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    escrever(c.v2, 'config/chave.ts', `export const K = "${jwtDeMentira('service_role')}";\n`);
    const base = shaDoV2(c);
    const { texto } = await rodar(c, {
      estaVersao: { BASE: base.slice(0, 10), REMOVIDOS: ['velho.txt'], MENSAGEM: MENSAGEM_DE_TESTE },
    });
    expect(texto).toContain('Tirei tudo da fila do commit');
    expect(texto).toContain('Já ficou feito');
    expect(texto).toMatch(/Apaguei da pasta do V2 1 arquivo que saiu nesta versão/);
    expect(texto).not.toContain('Fiz o commit');
    const comandos = comandosImpressos(texto);
    expect(comandos).toHaveLength(1);
    expect(executarComandoImpresso(comandos[0], c.v2).codigo).toBe(0);
    expect(readFileSync(path.join(c.v2, 'velho.txt'), 'utf8')).toBe(ARQUIVOS_BASE['velho.txt']);
  });

  it('lista longa de arquivos que saíram: não despeja um comando enorme, manda pedir ajuda', async () => {
    const muitos = Array.from({ length: 12 }, (_, i) => `site/src/velho-${i}.ts`);
    const c = criarCenario({ ...ARQUIVOS_BASE, ...Object.fromEntries(muitos.map((caminho) => [caminho, 'x\n'])) });
    chegaCodigoNovo(c);
    const base = shaDoV2(c);
    const { texto } = await rodar(c, {
      testesPassam: false,
      estaVersao: { BASE: base.slice(0, 10), REMOVIDOS: muitos, MENSAGEM: MENSAGEM_DE_TESTE },
    });
    expect(texto).toMatch(/Apaguei da pasta do V2 os 12 arquivos/);
    expect(comandosImpressos(texto)).toEqual([]);
    expect(texto).toContain('me chame');
  });
});

describe('publicar(): o --so nunca tira o grupo site', () => {
  it('--so app (sem o site) roda app E site; o dono é avisado', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const { chamadas, texto } = await rodar(c, { testesPassam: false, argumentos: lerArgumentos(['--sim', '--so', 'app']) });
    expect(chamadas.testes).toEqual([{ raiz: c.v2, so: 'app,site' }]);
    expect(texto).toContain('grupos: app,site');
    expect(texto).toMatch(/site.*sempre/);
  });

  it('--so com o site fica como o dono pediu e sem aviso', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const { chamadas, texto } = await rodar(c, { testesPassam: false, argumentos: lerArgumentos(['--sim', '--so', 'site,app']) });
    expect(chamadas.testes).toEqual([{ raiz: c.v2, so: 'site,app' }]);
    expect(texto).not.toMatch(/site.*sempre/);
  });
});

describe('publicar(): a pergunta', () => {
  it('n e qualquer outra resposta cancelam; sem terminal cancela sem perguntar; S publica o commit que ficou', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const v2Antes = shaDoV2(c);
    const originAntes = shaDoOrigin(c);
    const semSite = lerArgumentos(['--sem-conferir-site']);

    // com terminal, resposta n: código 0, o commit fica no V2, nada é enviado
    let r = await rodar(c, { temTerminal: true, argumentos: semSite, resposta: 'n' });
    expect(r.resultado.codigo).toBe(0);
    expect(r.chamadas.perguntas).toEqual(['Publicar agora no site? Digite S e Enter (outra coisa cancela): ']);
    expect(r.texto).toContain('Cancelado. O commit ficou salvo no V2; nada foi enviado.');
    const commitDoV2 = shaDoV2(c);
    expect(commitDoV2).not.toBe(v2Antes);
    expect(shaDoOrigin(c)).toBe(originAntes);
    expect(sha(c.beta, 'HEAD')).toBe(v2Antes);

    // sem terminal e sem --sim: cancela sem perguntar (e sem fazer outro commit)
    r = await rodar(c, { temTerminal: false, argumentos: semSite });
    expect(r.resultado.codigo).toBe(0);
    expect(r.chamadas.perguntas).toEqual([]);
    expect(r.texto).toContain('Cancelado. O commit ficou salvo no V2; nada foi enviado.');
    // nada novo na pasta: não diz "0 arquivo(s) vão junto"
    expect(r.texto).toContain('Nada novo na pasta do V2.');
    expect(r.texto).not.toContain('0 arquivo(s)');

    // "sim" por extenso não vale: só s ou S
    r = await rodar(c, { temTerminal: true, argumentos: semSite, resposta: 'sim' });
    expect(r.texto).toContain('Cancelado.');
    expect(shaDoOrigin(c)).toBe(originAntes);
    expect(shaDoV2(c)).toBe(commitDoV2);

    // S (com espaços) publica o commit que ficou, sem fazer outro
    r = await rodar(c, { temTerminal: true, argumentos: semSite, resposta: ' S ' });
    expect(r.resultado.codigo).toBe(0);
    expect(r.texto).not.toContain('Nada novo para publicar.');
    expect(shaDoV2(c)).toBe(commitDoV2);
    expect(shaDoOrigin(c)).toBe(commitDoV2);
    expect(sha(c.beta, 'HEAD')).toBe(commitDoV2);
  });
});

describe('publicar(): nada a publicar', () => {
  it('"Nada novo para publicar.", código 0, nada enviado', async () => {
    const c = criarCenario();
    const originAntes = shaDoOrigin(c);
    const { resultado, texto } = await rodar(c);
    expect(resultado.codigo).toBe(0);
    expect(texto).toContain('Nada novo para publicar.');
    expect(texto).not.toContain('PAROU');
    expect(shaDoV2(c)).toBe(originAntes);
    expect(shaDoOrigin(c)).toBe(originAntes);
  });
});

describe('publicar(): o envio', () => {
  it('push do origin que falha: código 1; o commit e a main local ficam como estão; o v2 nem é tentado', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const originAntes = shaDoOrigin(c);
    const { resultado, texto } = await rodar(c, {
      git: gitQueFalhaEm((args) => args[0] === 'push' && args[1] === 'origin'),
    });
    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Envio' });
    expect(texto).toContain('PAROU: O envio ao GitHub falhou. Se ele pediu login, entre no GitHub e rode de novo.');
    expect(texto).toContain('Nada foi enviado para a internet.');
    expect(shaDoOrigin(c)).toBe(originAntes);
    expect(shaDoV2(c)).not.toBe(originAntes);
    expect(sha(c.beta, 'HEAD')).toBe(shaDoV2(c));
    expect(rodarGit(['rev-parse', '--verify', '-q', 'refs/heads/pipeline-v2'], c.v2remoto).codigo).not.toBe(0);
  });

  it('push do v2 que falha só avisa: código 0 e o origin já foi', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const { resultado, texto } = await rodar(c, {
      git: gitQueFalhaEm((args) => args[0] === 'push' && args[1] === 'v2'),
    });
    expect(resultado.codigo).toBe(0);
    expect(texto).toContain('a cópia no IrisFlow-V2 não foi; rode `git push v2 pipeline-v2` depois');
    expect(shaDoOrigin(c)).toBe(shaDoV2(c));
    expect(texto).toContain('Pronto.');
  });

  it('sem o remoto v2: publica no origin e segue', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    git(['remote', 'remove', 'v2'], c.beta);
    const { resultado, texto } = await rodar(c);
    expect(resultado.codigo).toBe(0);
    expect(shaDoOrigin(c)).toBe(shaDoV2(c));
    expect(texto).toMatch(/remoto v2/);
  });

  it('a Beta que não avança em linha reta para: código 1, origin igual', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const originAntes = shaDoOrigin(c);
    const { resultado, texto } = await rodar(c, {
      git: gitQueFalhaEm((args) => args[0] === 'merge'),
    });
    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Beta' });
    expect(texto).toMatch(/PAROU: .*Beta/);
    expect(texto).toContain('Nada foi enviado para a internet.');
    expect(shaDoOrigin(c)).toBe(originAntes);
  });

  it('commit recusado (hook ou erro do git): código 1, nada enviado', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c);
    const originAntes = shaDoOrigin(c);
    const { resultado, texto } = await rodar(c, {
      git: gitQueFalhaEm((args) => args[0] === 'commit'),
    });
    expect(resultado).toMatchObject({ codigo: 1, etapa: 'Commit' });
    expect(texto).toMatch(/PAROU: .*commit/i);
    expect(shaDoOrigin(c)).toBe(originAntes);
  });
});

describe('publicar(): envio que não mexe em site/', () => {
  it('o Cloudflare Pages não faz build novo: não espera o site à toa, nem avisa em falso', async () => {
    const c = criarCenario();
    escrever(c.v2, 'LEIAME.txt', 'só o que fica fora de site/ mudou\n');
    const { resultado, texto, chamadas } = await rodar(c, { argumentos: lerArgumentos(['--sim']) });
    expect(resultado).toEqual({ codigo: 0, etapa: 'Fim' });
    expect(shaDoOrigin(c)).toBe(shaDoV2(c));
    expect(texto).toContain('▶ Conferir o site');
    expect(texto).toContain('Este envio não mexe em site/');
    expect(texto).not.toContain('começa a publicar'); // não há build novo para começar
    expect(chamadas.buscas).toBe(0);
    expect(chamadas.esperas).toEqual([]);
    expect(texto).not.toContain('O site ainda não mostra');
    expect(texto).toContain('Pronto.');
  });

  it('se o git não responde sobre o origin/main, na dúvida espera o site como de costume', async () => {
    const c = criarCenario();
    escrever(c.v2, 'LEIAME.txt', 'fora de site/, mas o git não soube dizer\n');
    let consultas = 0;
    const { resultado, texto } = await rodar(c, {
      argumentos: lerArgumentos(['--sim']),
      git: gitQueFalhaEm((args) => args[0] === 'rev-parse' && args.includes('origin/main')),
      buscarVersaoDoSite: async () => {
        consultas++;
        return shaDoV2(c);
      },
    });
    expect(resultado).toEqual({ codigo: 0, etapa: 'Fim' });
    expect(consultas).toBe(1);
    expect(texto).toContain('✔ Site novo no ar: https://irisflow.ia.br');
    expect(texto).not.toContain('Este envio não mexe em site/');
  });

  it('commit que ficou de uma rodada cancelada e mexe em site/ conta: espera o site', async () => {
    const c = criarCenario();
    chegaCodigoNovo(c); // mexe em site/novo.txt
    // 1ª rodada: commita e o dono cancela
    await rodar(c, { temTerminal: true, argumentos: lerArgumentos(['--sem-conferir-site']), resposta: 'n' });
    // 2ª rodada: nada novo na pasta, mas o commit que ficou vai e mexe em site/
    let consultas = 0;
    const { resultado, texto } = await rodar(c, {
      argumentos: lerArgumentos(['--sim']),
      buscarVersaoDoSite: async () => {
        consultas++;
        return shaDoV2(c);
      },
    });
    expect(resultado.codigo).toBe(0);
    expect(consultas).toBe(1);
    expect(texto).toContain('✔ Site novo no ar: https://irisflow.ia.br');
    expect(texto).not.toContain('Este envio não mexe em site/');
  });
});

describe('conferirOSite (o prazo da espera)', () => {
  const ESPERA = 15_000;
  const ENVIADO = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

  /** `duracaoDaConsulta`: quanto tempo (do relógio de mentira) cada consulta ao site leva. */
  function montar(buscar: () => Promise<string | null>, argv: string[] = [], duracaoDaConsulta = 0) {
    const linhas: string[] = [];
    const esperas: number[] = [];
    const relogio = relogioFalso();
    const comeco = relogio.agora();
    const ctx = {
      etapa: (nome: string) => linhas.push(`▶ ${nome}`),
      log: (texto: string) => linhas.push(texto),
      argumentos: lerArgumentos(argv),
      op: {
        buscarVersaoDoSite: async () => {
          relogio.avancar(duracaoDaConsulta);
          return buscar();
        },
        esperar: async (ms: number) => {
          esperas.push(ms);
          relogio.avancar(ms);
        },
        agora: relogio.agora,
      },
    };
    return { ctx, linhas, esperas, passou: () => relogio.agora() - comeco };
  }

  it('a cada 15 s, e para assim que o site mostra o commit enviado (inclusive abreviado)', async () => {
    let consultas = 0;
    const { ctx, linhas, esperas } = montar(async () => {
      consultas++;
      if (consultas === 1) return null; // o site velho, sem versao.json
      if (consultas === 2) throw new Error('sem rede');
      if (consultas === 3) return 'ffffffffffffffffffffffffffffffffffffffff'; // outro commit
      return ENVIADO.slice(0, 7);
    });
    expect(await conferirOSite(ctx, ENVIADO)).toBe(true);
    expect(consultas).toBe(4);
    expect(esperas).toEqual([ESPERA, ESPERA, ESPERA]);
    expect(linhas).toContain('✔ Site novo no ar: https://irisflow.ia.br');
  });

  it('passou de 8 minutos: avisa onde olhar (não é falha: o envio deu certo)', async () => {
    let consultas = 0;
    const { ctx, linhas, esperas } = montar(async () => {
      consultas++;
      return 'desconhecido';
    });
    expect(await conferirOSite(ctx, ENVIADO)).toBe(false);
    expect(esperas.every((ms) => ms === ESPERA)).toBe(true);
    expect(esperas.reduce((a, b) => a + b, 0)).toBe(8 * 60 * 1000);
    expect(consultas).toBe(esperas.length + 1);
    expect(linhas).toContain(
      'O site ainda não mostra a versão nova. Veja Cloudflare → Workers e Pages → irisflow-communicator → Deployments: se o build falhou, o log diz por quê.',
    );
    expect(linhas.join('\n')).not.toContain('Site novo no ar');
  });

  it('o prazo de 8 minutos conta pelo RELÓGIO, não pela soma das esperas: consulta lenta não estica a espera', async () => {
    let consultas = 0;
    const { ctx, linhas, passou } = montar(
      async () => {
        consultas++;
        return 'desconhecido';
      },
      [],
      10_000, // cada consulta leva 10 s (o limite da casca)
    );
    expect(await conferirOSite(ctx, ENVIADO)).toBe(false);
    // 8 min = 480 s; a cada volta: 10 s de consulta + 15 s de espera = 25 s → 20 consultas, não 33
    expect(consultas).toBeLessThanOrEqual(20);
    expect(passou()).toBeLessThanOrEqual(8 * 60 * 1000 + 10_000); // no máximo a última consulta passa do prazo
    expect(passou()).toBeGreaterThanOrEqual(8 * 60 * 1000);
    expect(linhas.some((l) => l.startsWith('O site ainda não mostra'))).toBe(true);
    expect(linhas.filter((l) => l.includes('ainda esperando'))).toEqual([
      '  …ainda esperando (1 min)',
      '  …ainda esperando (2 min)',
      '  …ainda esperando (3 min)',
      '  …ainda esperando (4 min)',
      '  …ainda esperando (5 min)',
      '  …ainda esperando (6 min)',
      '  …ainda esperando (7 min)',
    ]);
  });

  it('não dorme além do prazo: a última espera é só o que falta para os 8 minutos', async () => {
    // cada volta: 7 s de consulta + 15 s de espera; depois da 22ª consulta já se passaram 469 s: faltam 11 s
    const { ctx, esperas, passou } = montar(async () => null, [], 7_000);
    await conferirOSite(ctx, ENVIADO);
    expect(esperas.at(-1)).toBe(11_000);
    expect(esperas.slice(0, -1).every((ms) => ms === 15_000)).toBe(true);
    expect(passou()).toBe(8 * 60 * 1000 + 7_000); // a consulta final, já no prazo, é a última
  });

  it('--sem-conferir-site: não consulta nem espera', async () => {
    let consultas = 0;
    const { ctx, esperas } = montar(async () => {
      consultas++;
      return null;
    }, ['--sem-conferir-site']);
    await conferirOSite(ctx, ENVIADO);
    expect(consultas).toBe(0);
    expect(esperas).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A casca da linha de comando e o que a liga ao resto
// ---------------------------------------------------------------------------

describe('scripts/publicar.mjs (a casca)', () => {
  it('recusa uma opção desconhecida antes de tocar no git ou na rede', () => {
    const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'publicar.mjs'), '--pular-testes'], {
      cwd: pastaTemporaria,
      encoding: 'utf8',
    });
    expect(r.status).toBe(2);
    const saida = `${r.stdout}${r.stderr}`;
    expect(saida).toContain('--pular-testes');
    for (const flag of ['--sim', '--sem-conferir-site', '--mensagem', '--so']) expect(saida).toContain(flag);
  });

  it('o package.json tem o script "publicar" ao lado do "verificar"', () => {
    const pacote = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pacote.scripts.publicar).toBe('node scripts/publicar.mjs');
    expect(pacote.scripts.verificar).toBe('node scripts/verificar-tudo.mjs');
  });
});

describe('o código desta ferramenta passa pelo próprio detector', () => {
  // Se o detector acusasse os arquivos do `publicar`, o dono não conseguiria publicar
  // nem a própria ferramenta.
  const ARQUIVOS = [
    'scripts/publicar.mjs',
    'scripts/publicar/fluxo.mjs',
    'scripts/publicar/logica.mjs',
    'scripts/publicar/estaVersao.mjs',
    'src/publicacao/publicar.test.ts',
    'site/plugins/versaoDoBuild.ts',
    'site/src/versaoDoBuild.test.ts',
    'site/vite.config.ts',
    'site/public/_headers',
    'package.json',
  ];

  it('nem os arquivos nem o texto deles são barrados', () => {
    for (const arquivo of ARQUIVOS) {
      expect(existsSync(path.join(RAIZ, arquivo)), `${arquivo} existe`).toBe(true);
      const texto = readFileSync(path.join(RAIZ, arquivo), 'utf8');
      expect(segredosNoDiff(diffDe(arquivo, texto.split('\n'))), arquivo).toEqual([]);
      expect(arquivosProibidos(statusDe(`A\t${arquivo}`), PESOS_PERMITIDOS), arquivo).toEqual([]);
    }
  });
});

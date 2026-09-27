// @vitest-environment node
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { criarCofre } from '../electron/cofre';

// -----------------------------------------------------------------------------
// O cofre do processo principal guarda a sessão, a chave do computador, a
// licença e a FILA OFFLINE (socorros que esperam rede). Antes: gravação direta
// no arquivo final (uma queda no meio o deixava pela metade) e leitura que
// transformava qualquer erro em `{}` — a gravação seguinte regravava o cofre só
// com a chave nova, e o app reabria no login, sem a emergência.
// -----------------------------------------------------------------------------

let pasta = '';
let arquivo = '';
const avisos: string[] = [];
const log = (m: string) => { avisos.push(m); };
const item = (v: string) => ({ enc: true, v });

beforeEach(() => {
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'irisflow-cofre-'));
  arquivo = path.join(pasta, 'cloud-store.json');
  avisos.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('gravação atômica', () => {
  it('uma gravação interrompida antes da troca deixa o cofre anterior inteiro', () => {
    const cofre = criarCofre(arquivo, log);
    expect(cofre.definir('irisflow.device-key', item('chave-123'))).toBe(true);
    expect(cofre.definir('irisflow.fila', item('[{"action":"help.create"}]'))).toBe(true);

    // Queda de energia entre escrever o temporário e trocá-lo pelo arquivo.
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw Object.assign(new Error('queda'), { code: 'EIO' }); });
    expect(cofre.definir('irisflow.sessao', item('token'))).toBe(false);
    rename.mockRestore();

    // O arquivo principal continua sendo a versão anterior, completa.
    const conteudo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    expect(Object.keys(conteudo).sort()).toEqual(['irisflow.device-key', 'irisflow.fila']);
    expect(cofre.ler('irisflow.fila')?.v).toBe('[{"action":"help.create"}]');
    // E a próxima gravação funciona normalmente, sem perder nada.
    expect(cofre.definir('irisflow.sessao', item('token'))).toBe(true);
    expect(Object.keys(JSON.parse(fs.readFileSync(arquivo, 'utf8'))).sort())
      .toEqual(['irisflow.device-key', 'irisflow.fila', 'irisflow.sessao']);
  });

  it('mantém em .bak a versão anterior', () => {
    const cofre = criarCofre(arquivo, log);
    cofre.definir('irisflow.a', item('1'));
    cofre.definir('irisflow.b', item('2'));
    expect(Object.keys(JSON.parse(fs.readFileSync(`${arquivo}.bak`, 'utf8')))).toEqual(['irisflow.a']);
  });
});

describe('um cofre que não pôde ser lido nunca é regravado', () => {
  it('arquivo principal corrompido: a cópia responde e a gravação seguinte parte dela', () => {
    const cofre = criarCofre(arquivo, log);
    cofre.definir('irisflow.device-key', item('chave-123'));
    cofre.definir('irisflow.fila', item('fila'));
    cofre.definir('irisflow.licenca', item('licenca'));
    // Corrupção FORA de uma gravação nossa (disco, antivírus): principal pela metade.
    const cheio = fs.readFileSync(arquivo, 'utf8');
    fs.writeFileSync(arquivo, cheio.slice(0, Math.floor(cheio.length / 2)));

    // A cópia é a versão anterior (sem a última chave), não um cofre vazio.
    expect(cofre.ler('irisflow.device-key')?.v).toBe('chave-123');
    expect(cofre.ler('irisflow.fila')?.v).toBe('fila');
    expect(cofre.definir('irisflow.sessao', item('token'))).toBe(true);
    const depois = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    expect(Object.keys(depois).sort()).toEqual(['irisflow.device-key', 'irisflow.fila', 'irisflow.sessao']);
    // A cópia boa não foi trocada pelo principal corrompido.
    expect(() => JSON.parse(fs.readFileSync(`${arquivo}.bak`, 'utf8'))).not.toThrow();
    expect(avisos.some((a) => /cópia \.bak/.test(a))).toBe(true);
  });

  it('erro de leitura (arquivo inacessível) recusa gravar e não apaga nada', () => {
    const cofre = criarCofre(arquivo, log);
    cofre.definir('irisflow.device-key', item('chave-123'));
    const original = fs.readFileSync(arquivo, 'utf8');
    const lerDeVerdade = fs.readFileSync.bind(fs);
    // Antivírus segurando o arquivo: a leitura falha com EBUSY. A cópia (.bak)
    // não existe ainda — antes, esse erro virava `{}` e a gravação seguinte
    // deixava o cofre só com a chave nova.
    const leitura = vi.spyOn(fs, 'readFileSync').mockImplementation(((p: fs.PathOrFileDescriptor, o?: unknown) => {
      if (String(p) === arquivo) throw Object.assign(new Error('ocupado'), { code: 'EBUSY' });
      return lerDeVerdade(p, o as never);
    }) as typeof fs.readFileSync);

    expect(cofre.ler('irisflow.device-key')).toBeNull();
    expect(cofre.definir('irisflow.sessao', item('token'))).toBe(false);
    expect(cofre.remover('irisflow.device-key')).toBe(false);
    leitura.mockRestore();

    expect(fs.readFileSync(arquivo, 'utf8')).toBe(original);
    expect(cofre.ler('irisflow.device-key')?.v).toBe('chave-123');
    expect(avisos.some((a) => /RECUSADO/.test(a))).toBe(true);
  });

  it('principal corrompido SEM cópia boa: o ilegível é preservado com outro nome e o cofre volta a gravar', () => {
    fs.writeFileSync(arquivo, '{"irisflow.fila": {"enc": true, "v": "trunc');
    const cofre = criarCofre(arquivo, log);
    expect(cofre.ler('irisflow.fila')).toBeNull();
    const preservados = fs.readdirSync(pasta).filter((n) => n.startsWith('cloud-store.json.ilegivel-'));
    expect(preservados).toHaveLength(1);
    expect(fs.readFileSync(path.join(pasta, preservados[0]), 'utf8')).toContain('trunc');
    expect(cofre.definir('irisflow.sessao', item('token'))).toBe(true);
  });

  it('sem arquivo nenhum (primeira abertura) o cofre é vazio e grava', () => {
    const cofre = criarCofre(arquivo, log);
    expect(cofre.ler('irisflow.qualquer')).toBeNull();
    expect(cofre.definir('irisflow.sessao', item('token'))).toBe(true);
    expect(cofre.ler('irisflow.sessao')?.v).toBe('token');
  });
});

describe('o processo principal usa este cofre', () => {
  it('os canais secure-get/set/remove passam pelo `criarCofre`, sem gravação direta no arquivo', () => {
    const main = fs.readFileSync(path.resolve(__dirname, '..', 'electron', 'main.ts'), 'utf8');
    expect(main).toMatch(/criarCofre\(path\.join\(app\.getPath\('userData'\), 'cloud-store\.json'\)\)/);
    expect(main).not.toMatch(/writeFileSync\([^)]*cloud-store/);
    expect(main).not.toMatch(/function lerCofre/);
    // O resultado da gravação chega ao renderer: `false` quando nada foi gravado.
    expect(main).toMatch(/return cofre\(\)\.definir\(/);
    expect(main).toMatch(/return cofre\(\)\.remover\(/);
  });
});

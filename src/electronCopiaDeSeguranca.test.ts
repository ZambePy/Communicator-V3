// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registrarCopiaDeSeguranca } from '../electron/copiaDeSeguranca';
import {
  CANAL_DA_COPIA_DE_SEGURANCA, COPIAS_DE_SEGURANCA_MANTIDAS, TAMANHO_MAXIMO_DO_BACKUP_BYTES, type ResultadoDaCopiaDeSeguranca,
} from './backup/protocolo';

// -----------------------------------------------------------------------------
// Cópia de segurança antes de restaurar um backup (rodada 3, 21/10/2026).
//
// Restaurar troca as configurações do computador pelas do arquivo. Antes de
// escrever qualquer coisa, o app guarda o estado de agora — e quem guarda é o
// PROCESSO PRINCIPAL, numa pasta do app: um download pela página abre o "Salvar
// como" do sistema e a janela recarrega logo depois, o que pode cancelá-lo; e o
// localStorage não comporta uma cópia do localStorage inteiro.
//
// A página manda só o texto. Quem decide a pasta, o nome e a extensão é o main:
// nenhum caminho vindo da página. E uma cópia NUNCA sobrescreve outra — a segunda
// do mesmo segundo guardaria o estado já restaurado por cima do original.
// -----------------------------------------------------------------------------

let base = '';
let pasta = '';
beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'irisflow-copia-'));
  pasta = path.join(base, 'copias-de-seguranca');
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

const backup = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ formato: 'irisflow-backup', versao: 1, criadoEm: '2026-10-21T08:00:00Z', app: '0.0.0', chaves: { irisflow_settings: '{"a":1}' }, ...extra });

const DATA = new Date('2026-10-21T08:15:30Z');

function montar(o: { pasta?: string; agora?: Date; destruida?: boolean; semJanela?: boolean } = {}) {
  const handlers = new Map<string, (e: unknown, ...a: unknown[]) => unknown>();
  const webContents = { id: 'principal' };
  const janela = { isDestroyed: () => o.destruida === true, webContents };
  const log = vi.fn();
  let agora = o.agora ?? DATA;
  registrarCopiaDeSeguranca({
    ipcMain: { handle: (canal: string, fn: (e: unknown, ...a: unknown[]) => unknown) => { handlers.set(canal, fn); } } as never,
    janelaPrincipal: () => (o.semJanela ? null : (janela as never)),
    pasta: () => o.pasta ?? pasta,
    agora: () => agora,
    log,
  });
  return {
    handlers,
    log,
    guardar: (texto: unknown, sender: unknown = webContents) =>
      handlers.get(CANAL_DA_COPIA_DE_SEGURANCA)!({ sender }, texto) as ResultadoDaCopiaDeSeguranca,
    passarPara: (quando: Date) => { agora = quando; },
  };
}

describe('guardar a cópia de segurança', () => {
  it('grava o texto, inteiro e igual, numa pasta do app, com o nome pela data — e diz onde ficou', () => {
    const texto = backup({ extra: 'acentuação: ção, é, ü e 😀' });
    const r = montar().guardar(texto);

    expect(r).toEqual({ ok: true, nome: 'copia-de-seguranca-2026-10-21T08-15-30Z-01.json', pasta });
    expect(fs.readFileSync(path.join(pasta, 'copia-de-seguranca-2026-10-21T08-15-30Z-01.json'), 'utf8')).toBe(texto);
    expect(fs.readdirSync(pasta)).toEqual(['copia-de-seguranca-2026-10-21T08-15-30Z-01.json']); // sem .tmp sobrando
  });

  it('a cópia nunca sobrescreve outra: duas no mesmo segundo viram duas, e a primeira (o estado original) continua inteira', () => {
    const m = montar();
    const original = backup({ chaves: { irisflow_settings: '{"estado":"original"}' } });
    const depois = backup({ chaves: { irisflow_settings: '{"estado":"ja-restaurado"}' } });

    const a = m.guardar(original);
    const b = m.guardar(depois);

    expect(a.ok && b.ok).toBe(true);
    expect(a.ok && b.ok && a.nome !== b.nome).toBe(true);
    expect(fs.readFileSync(path.join(pasta, 'copia-de-seguranca-2026-10-21T08-15-30Z-01.json'), 'utf8')).toBe(original);
    expect(fs.readFileSync(path.join(pasta, 'copia-de-seguranca-2026-10-21T08-15-30Z-02.json'), 'utf8')).toBe(depois);
  });

  it('guarda só as últimas cópias — e não encosta em arquivo que não é cópia', () => {
    const m = montar();
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'anotacao-do-suporte.txt'), 'não é cópia nossa');
    const total = COPIAS_DE_SEGURANCA_MANTIDAS + 2;
    for (let i = 0; i < total; i++) {
      m.passarPara(new Date(Date.UTC(2026, 9, 21, 8, 0, i)));
      expect(m.guardar(backup({ numero: i })).ok).toBe(true);
    }

    const copias = fs.readdirSync(pasta).filter((n) => n.startsWith('copia-de-seguranca-')).sort();
    expect(copias).toHaveLength(COPIAS_DE_SEGURANCA_MANTIDAS);
    // As mais NOVAS ficam: da número 2 à 6.
    expect(JSON.parse(fs.readFileSync(path.join(pasta, copias[0]), 'utf8')).numero).toBe(total - COPIAS_DE_SEGURANCA_MANTIDAS);
    expect(JSON.parse(fs.readFileSync(path.join(pasta, copias.at(-1)!), 'utf8')).numero).toBe(total - 1);
    expect(fs.existsSync(path.join(pasta, 'anotacao-do-suporte.txt'))).toBe(true);
  });

  it('a cópia nova nunca é a que sobra de fora: com a cota cheia, a mais antiga sai, não a recém-gravada', () => {
    const m = montar();
    for (let i = 0; i < COPIAS_DE_SEGURANCA_MANTIDAS; i++) {
      m.passarPara(new Date(Date.UTC(2026, 9, 21, 9, 0, i)));
      m.guardar(backup({ numero: i }));
    }
    m.passarPara(new Date(Date.UTC(2026, 9, 21, 7, 0, 0))); // relógio atrasado: o nome é "mais velho" que todos
    const r = m.guardar(backup({ numero: 99 }));

    expect(r.ok).toBe(true);
    expect(r.ok && fs.existsSync(path.join(pasta, r.nome))).toBe(true);
  });
});

describe('o que a cópia recusa — sem escrever nada', () => {
  it('outra janela (ou página) não grava', () => {
    const m = montar();
    const r = m.guardar(backup(), { id: 'outra' });
    expect(r).toMatchObject({ ok: false });
    expect(fs.existsSync(pasta)).toBe(false);
  });

  it('janela principal fechada (ou ainda não aberta): não grava — nem mesmo para quem tem o remetente certo', () => {
    for (const situacao of [{ destruida: true }, { semJanela: true }]) {
      const r = montar(situacao).guardar(backup());
      expect(r, JSON.stringify(situacao)).toEqual({ ok: false, erro: 'Origem não autorizada.' });
    }
    expect(fs.existsSync(pasta)).toBe(false);
  });

  it('texto vazio ou que nem é texto: diz que não veio conteúdo (e não "não é um backup")', () => {
    for (const texto of ['', 42, null, undefined]) {
      expect(montar().guardar(texto), String(texto)).toMatchObject({ ok: false, erro: expect.stringMatching(/não veio conteúdo/) });
    }
  });

  it('o que não é um backup do IrisFlow: texto qualquer, JSON de outro formato, JSON quebrado, vazio, não-texto', () => {
    const m = montar();
    for (const texto of ['qualquer coisa', '{"formato":"outro-programa","versao":1}', '{"formato":"irisflow-backup"', '', '[]', 'null', 42, null, undefined, { formato: 'irisflow-backup' }]) {
      expect(m.guardar(texto).ok, String(texto)).toBe(false);
    }
    expect(fs.existsSync(pasta)).toBe(false);
  });

  // Os dois textos abaixo são backups VÁLIDOS: o que os recusa é só o tamanho.
  it('acima do tamanho máximo do backup: recusa antes de gravar', () => {
    const grande = backup({ chaves: { irisflow_x: 'a'.repeat(TAMANHO_MAXIMO_DO_BACKUP_BYTES) } });
    expect(JSON.parse(grande).formato).toBe('irisflow-backup');
    const r = montar().guardar(grande);
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/tamanho/) });
    expect(fs.existsSync(pasta)).toBe(false);
  });

  it('o limite é "mais que": o backup com exatamente o tamanho máximo, em bytes, é gravado', () => {
    const vazio = backup({ chaves: { irisflow_x: '' } });
    const noLimite = backup({ chaves: { irisflow_x: 'a'.repeat(TAMANHO_MAXIMO_DO_BACKUP_BYTES - Buffer.byteLength(vazio, 'utf8')) } });
    expect(Buffer.byteLength(noLimite, 'utf8')).toBe(TAMANHO_MAXIMO_DO_BACKUP_BYTES);

    const r = montar().guardar(noLimite);

    expect(r.ok).toBe(true);
    expect(r.ok && fs.statSync(path.join(pasta, r.nome)).size).toBe(TAMANHO_MAXIMO_DO_BACKUP_BYTES);
  });

  it('o limite é de BYTES, não de letras: backup que cabe em letras mas não em bytes (acentos) é recusado', () => {
    const vazio = backup({ chaves: { irisflow_x: '' } });
    const letras = Math.ceil((TAMANHO_MAXIMO_DO_BACKUP_BYTES - vazio.length) / 2) + 1; // 2 bytes cada em UTF-8
    const quase = backup({ chaves: { irisflow_x: 'é'.repeat(letras) } });
    expect(quase.length).toBeLessThan(TAMANHO_MAXIMO_DO_BACKUP_BYTES);
    expect(Buffer.byteLength(quase, 'utf8')).toBeGreaterThan(TAMANHO_MAXIMO_DO_BACKUP_BYTES);
    expect(montar().guardar(quase)).toMatchObject({ ok: false, erro: expect.stringMatching(/tamanho/) });
    expect(fs.existsSync(pasta)).toBe(false);
  });

  it('não conseguir gravar (pasta impossível) devolve uma mensagem em palavras — e o app NÃO segue para restaurar sem cópia', () => {
    const naoEPasta = path.join(base, 'arquivo-no-lugar-da-pasta');
    fs.writeFileSync(naoEPasta, 'sou um arquivo');
    const r = montar({ pasta: naoEPasta }).guardar(backup());
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/Não foi possível guardar a cópia de segurança/) });
  });

  it('a gravação que falha no meio não deixa cópia pela metade nem arquivo temporário — e o motivo vai para o registro, não some', () => {
    const m = montar();
    const espia = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw new Error('EXDEV: o disco recusou'); });

    const r = m.guardar(backup());
    espia.mockRestore();

    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/Não foi possível guardar a cópia de segurança/) });
    expect(fs.readdirSync(pasta)).toEqual([]); // nem a cópia, nem o `.tmp`
    expect(m.log).toHaveBeenCalledWith(expect.stringMatching(/EXDEV: o disco recusou/));
  });
});

// "Conferida" não pode ser só "o texto que mandamos gravar estava certo": antivírus, disco cheio e unidade removível
// podem deixar no disco outra coisa. Depois do rename a cópia é MEDIDA de novo (rodada 1, 21/10/2026).
describe('a cópia é medida de novo depois de gravada', () => {
  /** Faz o `statSync` de arquivos `.json` enxergar `delta` bytes a mais (ou a menos) do que há de verdade. */
  function tamanhoErradoNoDisco(delta: number) {
    const real = fs.statSync;
    return vi.spyOn(fs, 'statSync').mockImplementation(((caminho: fs.PathLike, ...resto: unknown[]) => {
      const st = (real as (...a: unknown[]) => fs.Stats)(caminho, ...resto);
      return String(caminho).endsWith('.json') ? ({ ...st, size: st.size + delta } as fs.Stats) : st;
    }) as typeof fs.statSync);
  }

  it('o arquivo no disco com tamanho diferente do texto não é cópia: é apagado, o app é avisado e o motivo vai para o registro', () => {
    const m = montar();
    const espia = tamanhoErradoNoDisco(-1);

    const r = m.guardar(backup({ extra: 'acentuação: ção, é, ü' }));
    espia.mockRestore();

    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/Não foi possível guardar a cópia de segurança/) });
    expect(fs.readdirSync(pasta)).toEqual([]); // a cópia ruim não fica pela pasta, parecendo a mais recente
    expect(m.log).toHaveBeenCalledWith(expect.stringMatching(/copia-de-seguranca-2026-10-21T08-15-30Z-01\.json.*tamanho/));
  });

  it('o tamanho é conferido em BYTES: texto com acentos grava o dobro de letras, e a conta fecha', () => {
    const texto = backup({ extra: 'ççççççççççççççççççççç' });
    expect(Buffer.byteLength(texto, 'utf8')).toBeGreaterThan(texto.length);

    const r = montar().guardar(texto);

    expect(r.ok).toBe(true);
    expect(r.ok && fs.statSync(path.join(pasta, r.nome)).size).toBe(Buffer.byteLength(texto, 'utf8'));
  });

  it('se nem dá para medir o arquivo (sumiu logo depois do rename), também não é cópia', () => {
    const m = montar();
    const real = fs.statSync;
    const espia = vi.spyOn(fs, 'statSync').mockImplementation(((caminho: fs.PathLike, ...resto: unknown[]) => {
      if (String(caminho).endsWith('.json')) throw Object.assign(new Error('ENOENT: sumiu'), { code: 'ENOENT' });
      return (real as (...a: unknown[]) => fs.Stats)(caminho, ...resto);
    }) as typeof fs.statSync);

    const r = m.guardar(backup());
    espia.mockRestore();

    expect(r).toMatchObject({ ok: false });
    expect(fs.readdirSync(pasta)).toEqual([]);
    expect(m.log).toHaveBeenCalledWith(expect.stringMatching(/ENOENT: sumiu/));
  });

  it('uma cópia que não passou na medida NÃO faz sair as antigas: só uma cópia boa abre vaga na pasta', () => {
    const m = montar();
    for (let i = 0; i < COPIAS_DE_SEGURANCA_MANTIDAS; i++) {
      m.passarPara(new Date(Date.UTC(2026, 9, 21, 8, 0, i)));
      expect(m.guardar(backup({ numero: i })).ok).toBe(true);
    }
    const antes = fs.readdirSync(pasta).sort();
    m.passarPara(new Date(Date.UTC(2026, 9, 21, 9, 0, 0)));
    const espia = tamanhoErradoNoDisco(5);

    const r = m.guardar(backup({ numero: 99 }));
    espia.mockRestore();

    expect(r.ok).toBe(false);
    expect(fs.readdirSync(pasta).sort()).toEqual(antes);
  });
});

describe.skipIf(process.platform === 'win32')('quem pode ler a cópia', () => {
  it('só o dono do computador: ela tem nome de paciente, frases e histórico de dor', () => {
    const r = montar().guardar(backup());

    expect(r.ok && (fs.statSync(path.join(pasta, r.nome)).mode & 0o077)).toBe(0);
  });
});

describe('a porta da página', () => {
  it('o preload usa o mesmo canal e não importa o módulo do main (que usa fs)', () => {
    const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.ts'), 'utf8');
    expect(preload).toContain('CANAL_DA_COPIA_DE_SEGURANCA');
    expect(preload).not.toMatch(/from '\.\/copiaDeSeguranca'/);
    expect(CANAL_DA_COPIA_DE_SEGURANCA).toBe('irisflow:backup-guardar-copia');
  });

  it('o preload expõe os três canais do backup da voz ao lado dos da voz guardada', () => {
    const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.ts'), 'utf8');
    for (const canal of ['backupListar', 'backupLer', 'backupRestaurar']) expect(preload).toContain(`CANAIS_VOZ_GUARDADA.${canal}`);
  });

  it('o main registra a cópia de segurança dentro de userData, ao lado das outras pastas do app', () => {
    const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.ts'), 'utf8');
    expect(main).toContain('registrarCopiaDeSeguranca');
    expect(main).toMatch(/copias-de-seguranca/);
  });
});

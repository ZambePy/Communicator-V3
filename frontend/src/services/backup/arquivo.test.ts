import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAMANHO_MAXIMO_DO_BACKUP_BYTES } from '@tracker/backup/protocolo';
import { baixarTexto, lerArquivoDeBackup, nomeDaCopiaBaixada, nomeDoArquivoDeBackup } from './arquivo';
import { ErroDeBackup } from './erro';

// -----------------------------------------------------------------------------
// O arquivo em si (rodada 3, 21/10/2026): o nome com que ele é baixado, o
// download, e a leitura do que a pessoa escolhe para restaurar.
// -----------------------------------------------------------------------------

describe('o nome do arquivo usa a data e a hora de AQUI, não a UTC', () => {
  let tzAntes: string | undefined;
  // São Paulo é UTC−3 o ano todo (sem horário de verão desde 2019).
  beforeEach(() => { tzAntes = process.env.TZ; process.env.TZ = 'America/Sao_Paulo'; });
  afterEach(() => { if (tzAntes === undefined) delete process.env.TZ; else process.env.TZ = tzAntes; });

  // 22h30 do dia 21 em São Paulo já é 01h30 do dia 22 em UTC.
  const noiteDe21 = new Date('2026-10-22T01:30:45.000Z');

  it('backup: irisflow-backup-AAAA-MM-DD.json — a cuidadora que salvou às 22h de 21/10 lê 21, não 22', () => {
    expect(nomeDoArquivoDeBackup(noiteDe21)).toBe('irisflow-backup-2026-10-21.json');
  });

  it('cópia de segurança baixada: com a hora e os minutos, para duas no mesmo dia não se confundirem', () => {
    expect(nomeDaCopiaBaixada(noiteDe21)).toBe('irisflow-copia-de-seguranca-2026-10-21-2230.json');
  });

  it('mês e dia de um dígito ganham zero à esquerda', () => {
    expect(nomeDoArquivoDeBackup(new Date('2026-03-04T15:00:00.000Z'))).toBe('irisflow-backup-2026-03-04.json');
  });
});

describe('baixarTexto', () => {
  let nomeBaixado: string | null = null;
  let conteudo: Blob | null = null;
  let endereco: string | null = null;
  let liberado: string | null = null;
  let antesCriar: typeof URL.createObjectURL;
  let antesRevogar: typeof URL.revokeObjectURL;

  beforeEach(() => {
    nomeBaixado = null; conteudo = null; endereco = null; liberado = null;
    antesCriar = URL.createObjectURL; antesRevogar = URL.revokeObjectURL;
    URL.createObjectURL = (b: Blob | MediaSource) => { conteudo = b as Blob; return 'blob:teste'; };
    URL.revokeObjectURL = (u: string) => { liberado = u; };
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      nomeBaixado = this.download; endereco = this.href;
    });
  });
  afterEach(() => {
    URL.createObjectURL = antesCriar; URL.revokeObjectURL = antesRevogar;
    vi.restoreAllMocks();
  });

  it('baixa o texto, sem alterar uma letra (acentos inclusos), com o nome pedido; e solta o endereço temporário', async () => {
    baixarTexto('irisflow-backup-2026-10-21.json', '{"nome":"João — ação"}');

    expect(nomeBaixado).toBe('irisflow-backup-2026-10-21.json');
    expect(endereco).toBe('blob:teste');
    expect(await (conteudo as unknown as Blob).text()).toBe('{"nome":"João — ação"}');
    expect(liberado).toBe('blob:teste');
  });

  it('o link usado no download não fica pendurado na página', () => {
    baixarTexto('x.json', '{}');

    expect(document.querySelector('a[download]')).toBeNull();
  });
});

describe('lerArquivoDeBackup', () => {
  it('lê o arquivo e entrega o objeto, para o validador decidir se é um backup', async () => {
    const arquivo = new File([JSON.stringify({ formato: 'irisflow-backup', versao: 1, nome: 'João' })], 'irisflow-backup.json');

    expect(await lerArquivoDeBackup(arquivo)).toEqual({ formato: 'irisflow-backup', versao: 1, nome: 'João' });
  });

  it('tolera o BOM que o Bloco de Notas põe no começo ao salvar (quem abre o arquivo para olhar não o estraga)', async () => {
    const arquivo = new File(['\uFEFF{"a":1}'], 'irisflow-backup.json');

    expect(await lerArquivoDeBackup(arquivo)).toEqual({ a: 1 });
  });

  // `File.text()` já descarta o BOM; este teste fixa que o código não depende disso (outro leitor de texto pode entregá-lo).
  it('...e também quando o texto chega com o BOM no começo', async () => {
    const comBom = { size: 10, text: async () => '﻿{"a":1}' };

    expect(await lerArquivoDeBackup(comBom)).toEqual({ a: 1 });
  });

  it('um arquivo maior que o limite recusa ANTES de ler (não carrega centenas de MB na memória para depois recusar)', async () => {
    let leu = false;
    const enorme = { size: TAMANHO_MAXIMO_DO_BACKUP_BYTES + 1, text: async () => { leu = true; return '{}'; } };

    const falha = await lerArquivoDeBackup(enorme).catch((e: unknown) => e);

    expect(falha).toBeInstanceOf(ErroDeBackup);
    expect(falha).toMatchObject({ codigo: 'grande-demais', message: expect.stringMatching(/50 MB/) });
    expect(leu).toBe(false);
  });

  it('um arquivo no limite exato ainda é lido', async () => {
    const noLimite = { size: TAMANHO_MAXIMO_DO_BACKUP_BYTES, text: async () => '{"ok":true}' };

    expect(await lerArquivoDeBackup(noLimite)).toEqual({ ok: true });
  });

  it('o que não é texto de backup (vazio, cortado, outro formato) recusa com uma frase para leigo, sem a palavra JSON', async () => {
    for (const ruim of ['', '{"formato":"irisflow-backup","versao":1,"chaves":{', 'isto não é nada', '<html></html>']) {
      const falha = await lerArquivoDeBackup(new File([ruim], 'x.json')).catch((e: unknown) => e);

      expect(falha, JSON.stringify(ruim)).toBeInstanceOf(ErroDeBackup);
      expect(falha, JSON.stringify(ruim)).toMatchObject({ codigo: 'invalido', message: expect.stringMatching(/não é um backup do IrisFlow/) });
      expect((falha as Error).message).not.toMatch(/json/i);
    }
  });

  it('um arquivo que o sistema não deixa abrir recusa com o motivo, sem lançar uma exceção solta', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const preso = { size: 10, text: async (): Promise<string> => { throw new DOMException('Arquivo mudou', 'NotReadableError'); } };

    const falha = await lerArquivoDeBackup(preso).catch((e: unknown) => e);

    expect(falha).toMatchObject({ codigo: 'invalido', message: expect.stringMatching(/abrir o arquivo/) });
    vi.restoreAllMocks();
  });
});

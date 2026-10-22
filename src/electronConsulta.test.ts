// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANAL_DA_CONSULTA_EM_PDF, CANAL_DA_CONSULTA_IMPRESSA, CANAL_DA_PRANCHA_EM_PDF, CANAL_DA_PRANCHA_IMPRESSA, FOLHA_DA_CONSULTA,
  NOME_DO_ARQUIVO, NOME_DO_ARQUIVO_DA_CONSULTA, OPCOES_DA_IMPRESSAO, OPCOES_DA_IMPRESSAO_DA_CONSULTA, OPCOES_DO_PDF,
  OPCOES_DO_PDF_DA_CONSULTA, caixaDasImpressoras, registrarPranchaEmPdf,
} from '../electron/prancha';

// Folha da consulta (21/10/2026): a mesma via da prancha — o processo principal
// gera o PDF e imprime, sem segurar a página —, mas em A4 EM PÉ, com canais,
// nomes e textos próprios. A página continua sem escolher tamanho nem
// orientação: os canais não recebem argumento.

type Impressora = { name: string; displayName: string; description: string; options: Record<string, string> };
const impressora = (name: string, displayName = name): Impressora => ({ name, displayName, description: '', options: {} });

function montar(o: { caminho?: string | null; resposta?: number; impressao?: [boolean, string]; impressoras?: Impressora[] } = {}) {
  const handlers = new Map<string, (e: unknown) => Promise<unknown>>();
  const webContents = {
    printToPDF: vi.fn(async () => Buffer.from('%PDF-1.7 consulta')),
    getPrintersAsync: vi.fn(async () => o.impressoras ?? [impressora('HP_LaserJet', 'HP LaserJet')]),
    print: vi.fn((_op: unknown, cb: (ok: boolean, motivo: string) => void) => {
      const [ok, motivo] = o.impressao ?? [true, ''];
      cb(ok, motivo);
    }),
  };
  const janela = { isDestroyed: () => false, webContents };
  const dialog = {
    showSaveDialog: vi.fn(async () => (o.caminho === null ? { canceled: true, filePath: '' } : { canceled: false, filePath: o.caminho ?? '/docs/consulta.pdf' })),
    showMessageBox: vi.fn(async () => ({ response: o.resposta ?? 0, checkboxChecked: false })),
  };
  const gravar = vi.fn();
  registrarPranchaEmPdf({
    ipcMain: { handle: (canal: string, fn: (e: unknown) => Promise<unknown>) => { handlers.set(canal, fn); } } as never,
    dialog: dialog as never,
    janelaPrincipal: () => janela as never,
    pastaPadrao: () => '/docs',
    gravar,
    log: () => {},
  });
  return {
    handlers,
    pdf: (sender: unknown = webContents) => handlers.get(CANAL_DA_CONSULTA_EM_PDF)!({ sender }),
    imprimir: (sender: unknown = webContents) => handlers.get(CANAL_DA_CONSULTA_IMPRESSA)!({ sender }),
    pranchaPdf: (sender: unknown = webContents) => handlers.get(CANAL_DA_PRANCHA_EM_PDF)!({ sender }),
    webContents,
    dialog,
    gravar,
  };
}

describe('canais da folha da consulta', () => {
  it('são dois, próprios, sem argumento vindo da página — e os da prancha continuam lá', () => {
    expect(CANAL_DA_CONSULTA_EM_PDF).toBe('irisflow:consulta-pdf');
    expect(CANAL_DA_CONSULTA_IMPRESSA).toBe('irisflow:consulta-imprimir');
    expect([...montar().handlers.keys()].sort()).toEqual(
      [CANAL_DA_PRANCHA_EM_PDF, CANAL_DA_PRANCHA_IMPRESSA, CANAL_DA_CONSULTA_EM_PDF, CANAL_DA_CONSULTA_IMPRESSA].sort(),
    );
  });

  it('o preload expõe os mesmos canais, em uma ponte própria, sem importar o módulo do main', () => {
    const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.ts'), 'utf8');
    expect(preload).toContain(`'${CANAL_DA_CONSULTA_EM_PDF}'`);
    expect(preload).toContain(`'${CANAL_DA_CONSULTA_IMPRESSA}'`);
    expect(preload).toContain("exposeInMainWorld('irisflowConsulta'");
    expect(preload).not.toMatch(/from '\.\/prancha'/);
  });
});

describe('A4 em pé', () => {
  it('PDF: retrato, com fundo e o tamanho do CSS; a prancha continua deitada', () => {
    expect(OPCOES_DO_PDF_DA_CONSULTA).toMatchObject({ landscape: false, pageSize: 'A4', printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
    expect(OPCOES_DO_PDF.landscape).toBe(true);
  });

  it('impressão: em silêncio, retrato, A4; a prancha continua deitada', () => {
    expect(OPCOES_DA_IMPRESSAO_DA_CONSULTA).toMatchObject({ silent: true, landscape: false, pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
    expect(OPCOES_DA_IMPRESSAO.landscape).toBe(true);
  });
});

describe('Salvar a folha da consulta em PDF', () => {
  it('outra janela (ou página) não gera PDF nem abre diálogo', async () => {
    const m = montar();
    expect(await m.pdf({ outro: true })).toMatchObject({ ok: false });
    expect(m.webContents.printToPDF).not.toHaveBeenCalled();
    expect(m.dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it('gera com as opções de retrato, sugere Documentos com o nome da folha e grava', async () => {
    const m = montar();
    const r = await m.pdf();
    expect(m.webContents.printToPDF).toHaveBeenCalledWith(OPCOES_DO_PDF_DA_CONSULTA);
    const opcoes = (m.dialog.showSaveDialog.mock.calls[0] as unknown[])[1] as { defaultPath: string; title: string };
    expect(opcoes.defaultPath).toBe(path.join('/docs', NOME_DO_ARQUIVO_DA_CONSULTA));
    expect(NOME_DO_ARQUIVO_DA_CONSULTA).not.toBe(NOME_DO_ARQUIVO);
    expect(opcoes.title).toMatch(/consulta/i);
    expect(m.gravar).toHaveBeenCalledWith('/docs/consulta.pdf', expect.any(Buffer));
    expect(r).toEqual({ ok: true, caminho: '/docs/consulta.pdf' });
  });

  it('cancelar não grava; o PDF da prancha segue com as opções dela', async () => {
    const m = montar({ caminho: null });
    expect(await m.pdf()).toEqual({ ok: false, cancelado: true });
    expect(m.gravar).not.toHaveBeenCalled();
    const outra = montar();
    await outra.pranchaPdf();
    expect(outra.webContents.printToPDF).toHaveBeenCalledWith(OPCOES_DO_PDF);
  });
});

describe('Imprimir a folha da consulta pelo processo principal', () => {
  it('outra janela (ou página) não imprime nem pergunta nada', async () => {
    const m = montar();
    expect(await m.imprimir({ outro: true })).toMatchObject({ ok: false });
    expect(m.dialog.showMessageBox).not.toHaveBeenCalled();
    expect(m.webContents.print).not.toHaveBeenCalled();
  });

  it('pergunta a impressora numa caixa que fala da folha da consulta e imprime em retrato', async () => {
    const m = montar({ resposta: 1 });
    expect(await m.imprimir()).toEqual({ ok: true, impressora: 'HP LaserJet' });
    const caixa = (m.dialog.showMessageBox.mock.calls[0] as unknown[])[1] as { title: string; detail: string };
    expect(caixa.title).toMatch(/consulta/i);
    expect(caixa.detail).toMatch(/em pé/i);
    expect(caixa.detail).not.toMatch(/deitado/i);
    expect((m.webContents.print.mock.calls[0] as unknown[])[0]).toEqual({ ...OPCOES_DA_IMPRESSAO_DA_CONSULTA, deviceName: 'HP_LaserJet' });
  });

  it('a caixa da prancha segue falando de A4 deitado', () => {
    const { opcoes } = caixaDasImpressoras([impressora('a')] as never);
    expect(opcoes.detail).toMatch(/deitado/i);
    const { opcoes: daConsulta } = caixaDasImpressoras([impressora('a')] as never, FOLHA_DA_CONSULTA);
    expect(daConsulta.detail).toMatch(/em pé/i);
  });

  it('cancelar não imprime; impressora que recusa vira mensagem; sem impressora sugere o PDF', async () => {
    expect(await montar({ resposta: 2 }).imprimir()).toEqual({ ok: false, cancelado: true });
    expect(await montar({ resposta: 1, impressao: [false, 'Print job failed'] }).imprimir()).toMatchObject({ ok: false, erro: expect.any(String) });
    expect(await montar({ resposta: 1, impressao: [false, 'Print job canceled'] }).imprimir()).toEqual({ ok: false, cancelado: true });
    const sem = montar({ impressoras: [] });
    expect(await sem.imprimir()).toMatchObject({ ok: false, erro: expect.stringContaining('Salvar em PDF') });
    expect(sem.dialog.showMessageBox).not.toHaveBeenCalled();
  });
});

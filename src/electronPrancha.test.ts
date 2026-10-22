// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANAL_DA_PRANCHA_EM_PDF, CANAL_DA_PRANCHA_IMPRESSA, MAXIMO_DE_IMPRESSORAS_NA_CAIXA, NOME_DO_ARQUIVO, OPCOES_DA_IMPRESSAO,
  OPCOES_DO_PDF, caixaDasImpressoras, registrarPranchaEmPdf,
} from '../electron/prancha';

// Prancha de letras em PDF (pedido de 19/10/2026): canal estreito, só a janela
// do app, A4 deitado, e o cuidador escolhe onde salvar. E a impressão pelo
// processo principal (revisão de UX de 20/10/2026, achado 8).

type Impressora = { name: string; displayName: string; description: string; options: Record<string, string> };
const impressora = (name: string, displayName = name): Impressora => ({ name, displayName, description: '', options: {} });

function montar(o: {
  caminho?: string | null;
  falhaNoPdf?: boolean;
  falhaAoGravar?: boolean;
  impressoras?: Impressora[];
  falhaAoListar?: boolean;
  /** Índice do botão escolhido na caixa das impressoras. */
  resposta?: number;
  /** O que o `print` responde: `[ok, motivo]`. */
  impressao?: [boolean, string];
} = {}) {
  const handlers = new Map<string, (e: unknown) => Promise<unknown>>();
  const webContents = {
    printToPDF: vi.fn(async () => {
      if (o.falhaNoPdf) throw new Error('sem impressora virtual');
      return Buffer.from('%PDF-1.7 prancha');
    }),
    getPrintersAsync: vi.fn(async () => {
      if (o.falhaAoListar) throw new Error('spooler parado');
      return o.impressoras ?? [impressora('HP_LaserJet', 'HP LaserJet'), impressora('Microsoft Print to PDF')];
    }),
    print: vi.fn((_op: unknown, cb: (ok: boolean, motivo: string) => void) => {
      const [ok, motivo] = o.impressao ?? [true, ''];
      cb(ok, motivo);
    }),
  };
  const janela = { isDestroyed: () => false, webContents };
  const dialog = {
    showSaveDialog: vi.fn(async () => (o.caminho === null ? { canceled: true, filePath: '' } : { canceled: false, filePath: o.caminho ?? '/docs/prancha.pdf' })),
    showMessageBox: vi.fn(async () => ({ response: o.resposta ?? 0, checkboxChecked: false })),
  };
  const gravar = vi.fn((_c: string, _d: Buffer) => { if (o.falhaAoGravar) throw new Error('EACCES'); });
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
    chamar: (sender: unknown = webContents) => handlers.get(CANAL_DA_PRANCHA_EM_PDF)!({ sender }),
    imprimir: (sender: unknown = webContents) => handlers.get(CANAL_DA_PRANCHA_IMPRESSA)!({ sender }),
    webContents,
    dialog,
    gravar,
  };
}

describe('Salvar a prancha em PDF', () => {
  it('outra janela (ou página) não gera PDF nem abre diálogo', async () => {
    const m = montar();
    const r = await m.chamar({ outro: true });
    expect(r).toMatchObject({ ok: false });
    expect(m.webContents.printToPDF).not.toHaveBeenCalled();
    expect(m.dialog.showSaveDialog).not.toHaveBeenCalled();
  });

  it('A4 deitado, com fundo, tamanho do CSS e sem margens extras; sugere Documentos', async () => {
    const m = montar();
    const r = await m.chamar();
    expect(m.webContents.printToPDF).toHaveBeenCalledWith(OPCOES_DO_PDF);
    expect(OPCOES_DO_PDF).toMatchObject({ landscape: true, pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    const opcoes = (m.dialog.showSaveDialog.mock.calls[0] as unknown[])[1] as { defaultPath: string };
    expect(opcoes.defaultPath).toBe(path.join('/docs', NOME_DO_ARQUIVO));
    expect(m.gravar).toHaveBeenCalledWith('/docs/prancha.pdf', expect.any(Buffer));
    expect(r).toEqual({ ok: true, caminho: '/docs/prancha.pdf' });
  });

  it('cancelar o diálogo não grava nada', async () => {
    const m = montar({ caminho: null });
    expect(await m.chamar()).toEqual({ ok: false, cancelado: true });
    expect(m.gravar).not.toHaveBeenCalled();
  });

  it('nome sem extensão ganha ".pdf"; falhas viram mensagem, não exceção', async () => {
    expect(await montar({ caminho: '/docs/minha prancha' }).chamar()).toEqual({ ok: true, caminho: '/docs/minha prancha.pdf' });
    expect(await montar({ falhaNoPdf: true }).chamar()).toMatchObject({ ok: false, erro: expect.any(String) });
    expect(await montar({ falhaAoGravar: true }).chamar()).toMatchObject({ ok: false, erro: expect.any(String) });
  });

  it('o preload usa os mesmos canais (sem importar o módulo do main, que usa fs)', () => {
    const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.ts'), 'utf8');
    expect(preload).toContain(`'${CANAL_DA_PRANCHA_EM_PDF}'`);
    expect(preload).toContain(`'${CANAL_DA_PRANCHA_IMPRESSA}'`);
    expect(preload).not.toMatch(/from '\.\/prancha'/);
  });

  it('o main.ts não precisa mudar: a impressão é registrada pela mesma função do PDF', () => {
    // 21/10/2026: a mesma função registra também a folha da consulta (ver
    // `electronConsulta.test.ts`), com canais próprios. Os da prancha seguem
    // exatamente estes dois.
    const canais = [...montar().handlers.keys()];
    expect(canais.filter((c) => c.startsWith('irisflow:prancha')).sort()).toEqual([CANAL_DA_PRANCHA_EM_PDF, CANAL_DA_PRANCHA_IMPRESSA].sort());
    expect(canais.filter((c) => !c.startsWith('irisflow:prancha')).sort()).toEqual(['irisflow:consulta-imprimir', 'irisflow:consulta-pdf']);
  });
});

// O `window.print()` segurava a página até o diálogo fechar: o app inteiro
// parava, a Emergência incluída. O main pergunta a impressora numa caixa dele
// (assíncrona, não segura a página) e imprime em silêncio.
describe('Imprimir a prancha pelo processo principal', () => {
  it('outra janela (ou página) não imprime nem pergunta nada', async () => {
    const m = montar();
    expect(await m.imprimir({ outro: true })).toMatchObject({ ok: false });
    expect(m.dialog.showMessageBox).not.toHaveBeenCalled();
    expect(m.webContents.print).not.toHaveBeenCalled();
  });

  it('pergunta a impressora (a padrão primeiro, Cancelar por último) e imprime a escolhida em silêncio, A4 deitado', async () => {
    const m = montar({ resposta: 1 });
    expect(await m.imprimir()).toEqual({ ok: true, impressora: 'HP LaserJet' });
    const opcoes = (m.dialog.showMessageBox.mock.calls[0] as unknown[])[1] as { buttons: string[]; cancelId: number; defaultId: number };
    expect(opcoes.buttons).toEqual(['A impressora padrão deste computador', 'HP LaserJet', 'Microsoft Print to PDF', 'Cancelar']);
    expect(opcoes.cancelId).toBe(3);
    expect(opcoes.defaultId).toBe(0);
    expect(m.webContents.print).toHaveBeenCalledTimes(1);
    const op = (m.webContents.print.mock.calls[0] as unknown[])[0];
    expect(op).toEqual({ ...OPCOES_DA_IMPRESSAO, deviceName: 'HP_LaserJet' });
    // Sem o diálogo do sistema (ele é pedido de dentro da página e a seguraria).
    expect(OPCOES_DA_IMPRESSAO).toMatchObject({ silent: true, landscape: true, pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
  });

  it('a padrão do sistema vai sem nome (o Electron escolhe a padrão)', async () => {
    const m = montar({ resposta: 0 });
    expect(await m.imprimir()).toEqual({ ok: true, impressora: null });
    expect((m.webContents.print.mock.calls[0] as unknown[])[0]).toMatchObject({ deviceName: '' });
  });

  it('Cancelar (ou fechar a caixa) não imprime', async () => {
    const m = montar({ resposta: 3 });
    expect(await m.imprimir()).toEqual({ ok: false, cancelado: true });
    expect(m.webContents.print).not.toHaveBeenCalled();
  });

  it('sem impressora, ou sem conseguir listar: diz em palavras e sugere o PDF, sem perguntar', async () => {
    const sem = montar({ impressoras: [] });
    expect(await sem.imprimir()).toMatchObject({ ok: false, erro: expect.stringContaining('Salvar em PDF') });
    expect(sem.dialog.showMessageBox).not.toHaveBeenCalled();
    expect(await montar({ falhaAoListar: true }).imprimir()).toMatchObject({ ok: false, erro: expect.stringContaining('Salvar em PDF') });
  });

  it('a impressora recusou: mensagem, não exceção; o driver cancelado é cancelamento', async () => {
    expect(await montar({ resposta: 1, impressao: [false, 'Print job failed'] }).imprimir()).toMatchObject({ ok: false, erro: expect.any(String) });
    expect(await montar({ resposta: 1, impressao: [false, 'Print job canceled'] }).imprimir()).toEqual({ ok: false, cancelado: true });
  });

  it('a caixa não vira uma lista sem fim', () => {
    const muitas = Array.from({ length: 12 }, (_, i) => impressora(`p${i}`));
    const { opcoes, escolhas } = caixaDasImpressoras(muitas as never);
    expect(escolhas).toHaveLength(MAXIMO_DE_IMPRESSORAS_NA_CAIXA + 1);
    expect(opcoes.buttons).toHaveLength(MAXIMO_DE_IMPRESSORAS_NA_CAIXA + 2);
    expect(opcoes.buttons?.at(-1)).toBe('Cancelar');
  });
});

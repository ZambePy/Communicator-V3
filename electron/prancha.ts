/**
 * Prancha de letras em PDF (pedido de 19/10/2026): o plano C, para quando o
 * computador não está por perto. A página já está desenhada na janela do app
 * (as regras de impressão escondem o resto); aqui ela vira um PDF A4 deitado
 * e o cuidador escolhe onde salvar.
 *
 * Canais sem argumentos vindos da página: o main decide o tamanho, a
 * orientação e o diálogo. Só a janela do app pede.
 *
 * Imprimir também passa por aqui (revisão de UX de 20/10/2026, achado 8). O
 * `window.print()` da página segura a thread da janela até o diálogo fechar:
 * enquanto o cuidador escolhia a impressora, o app inteiro parava — o olhar,
 * a varredura, a contagem e o alarme da Emergência. No Chromium, o diálogo de
 * impressão do sistema é pedido de dentro da própria página, numa chamada
 * síncrona (`ScriptedPrint`) — também quando o main chama `webContents.print`
 * sem `silent` —, então ele seguraria a página do mesmo jeito. Aqui o main
 * pergunta a impressora numa caixa dele, que não segura a página, e imprime em
 * silêncio, A4 deitado.
 *
 * A folha da consulta (21/10/2026) segue o mesmo caminho — mesmo processo
 * principal, mesma checagem de remetente, mesma caixa de impressoras —, só que
 * em A4 EM PÉ e com canais, nome de arquivo e textos próprios. Cada folha é uma
 * descrição (`FolhaImpressa`): a página continua sem escolher tamanho nem
 * orientação, porque nenhum canal recebe argumento.
 */

import type {
  BrowserWindow, Dialog, IpcMain, IpcMainInvokeEvent, MessageBoxOptions, PrinterInfo, PrintToPDFOptions,
  SaveDialogOptions, WebContentsPrintOptions,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export const CANAL_DA_PRANCHA_EM_PDF = 'irisflow:prancha-pdf';
export const CANAL_DA_PRANCHA_IMPRESSA = 'irisflow:prancha-imprimir';
export const CANAL_DA_CONSULTA_EM_PDF = 'irisflow:consulta-pdf';
export const CANAL_DA_CONSULTA_IMPRESSA = 'irisflow:consulta-imprimir';

export type ResultadoDoPdf =
  | { ok: true; caminho: string }
  | { ok: false; cancelado?: boolean; erro?: string };

/**
 * A4 deitado, com o fundo (as cores das faixas) e o tamanho da página vindo do
 * CSS (`@page`). Margens zero: a página já reserva as dela, e o mesmo
 * desenho sai igual pela impressora (`OPCOES_DA_IMPRESSAO`) e no PDF.
 */
export const OPCOES_DO_PDF: PrintToPDFOptions = {
  landscape: true,
  pageSize: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  margins: { marginType: 'none' },
};

export const NOME_DO_ARQUIVO = 'Prancha de letras - IrisFlow.pdf';

/** A folha da consulta é uma página A4 EM PÉ (a prancha é deitada). */
export const OPCOES_DO_PDF_DA_CONSULTA: PrintToPDFOptions = { ...OPCOES_DO_PDF, landscape: false };
export const NOME_DO_ARQUIVO_DA_CONSULTA = 'Folha da consulta - IrisFlow.pdf';

/** `impressora: null` = a padrão do sistema. */
export type ResultadoDaImpressao =
  | { ok: true; impressora: string | null }
  | { ok: false; cancelado?: boolean; erro?: string };

/**
 * A mesma folha do PDF: A4 deitado, com o fundo, sem margens extras. Em
 * silêncio porque a impressora já foi escolhida na caixa do main (ver o
 * cabeçalho); `deviceName` vazio é a impressora padrão do sistema.
 */
export const OPCOES_DA_IMPRESSAO: WebContentsPrintOptions = {
  silent: true,
  landscape: true,
  pageSize: 'A4',
  printBackground: true,
  margins: { marginType: 'none' },
};

export const OPCOES_DA_IMPRESSAO_DA_CONSULTA: WebContentsPrintOptions = { ...OPCOES_DA_IMPRESSAO, landscape: false };

/** Impressoras listadas pelo nome na caixa, além da padrão: a caixa não pode virar uma lista sem fim. */
export const MAXIMO_DE_IMPRESSORAS_NA_CAIXA = 6;

const ROTULO_DA_PADRAO = 'A impressora padrão deste computador';

/** O que muda de uma folha impressa para outra. */
export interface FolhaImpressa {
  /** Prefixo das linhas de log. */
  nome: string;
  canalPdf: string;
  canalImpressao: string;
  opcoesDoPdf: PrintToPDFOptions;
  opcoesDaImpressao: WebContentsPrintOptions;
  nomeDoArquivo: string;
  tituloDoSalvar: string;
  tituloDaImpressao: string;
  /** Como a folha sai, dito na caixa de impressoras. */
  formatoDito: string;
}

export const FOLHA_DA_PRANCHA: FolhaImpressa = {
  nome: 'prancha',
  canalPdf: CANAL_DA_PRANCHA_EM_PDF,
  canalImpressao: CANAL_DA_PRANCHA_IMPRESSA,
  opcoesDoPdf: OPCOES_DO_PDF,
  opcoesDaImpressao: OPCOES_DA_IMPRESSAO,
  nomeDoArquivo: NOME_DO_ARQUIVO,
  tituloDoSalvar: 'Salvar a prancha de letras',
  tituloDaImpressao: 'Imprimir a prancha de letras',
  formatoDito: 'A folha sai em A4 deitado.',
};

export const FOLHA_DA_CONSULTA: FolhaImpressa = {
  nome: 'consulta',
  canalPdf: CANAL_DA_CONSULTA_EM_PDF,
  canalImpressao: CANAL_DA_CONSULTA_IMPRESSA,
  opcoesDoPdf: OPCOES_DO_PDF_DA_CONSULTA,
  opcoesDaImpressao: OPCOES_DA_IMPRESSAO_DA_CONSULTA,
  nomeDoArquivo: NOME_DO_ARQUIVO_DA_CONSULTA,
  tituloDoSalvar: 'Salvar a folha da consulta',
  tituloDaImpressao: 'Imprimir a folha da consulta',
  formatoDito: 'A folha sai em A4 em pé.',
};

/** A pergunta da impressora: a padrão primeiro, depois as do sistema, e Cancelar por último. */
export function caixaDasImpressoras(impressoras: readonly PrinterInfo[], folha: FolhaImpressa = FOLHA_DA_PRANCHA): {
  opcoes: MessageBoxOptions;
  escolhas: Array<{ deviceName: string; rotulo: string }>;
} {
  const escolhas = [
    { deviceName: '', rotulo: ROTULO_DA_PADRAO },
    ...impressoras.slice(0, MAXIMO_DE_IMPRESSORAS_NA_CAIXA).map((p) => ({ deviceName: p.name, rotulo: p.displayName || p.name })),
  ];
  return {
    escolhas,
    opcoes: {
      type: 'question',
      title: folha.tituloDaImpressao,
      message: 'Em qual impressora?',
      detail: `${folha.formatoDito} Enquanto você escolhe, o IrisFlow continua funcionando — inclusive a Emergência.`,
      buttons: [...escolhas.map((e) => e.rotulo), 'Cancelar'],
      defaultId: 0,
      cancelId: escolhas.length,
    },
  };
}

interface DependenciasDasFolhas {
  ipcMain: Pick<IpcMain, 'handle'>;
  dialog: Pick<Dialog, 'showSaveDialog' | 'showMessageBox'>;
  janelaPrincipal: () => BrowserWindow | null;
  pastaPadrao: () => string;
  gravar?: (caminho: string, dados: Buffer) => void;
  log?: (m: string) => void;
}

/**
 * Registra as folhas impressas do app: a prancha de letras e a folha da
 * consulta. Mantém o nome e a assinatura de quando só havia a prancha — o
 * `main.ts` continua chamando esta mesma função.
 */
export function registrarPranchaEmPdf(deps: DependenciasDasFolhas): void {
  registrarFolha(deps, FOLHA_DA_PRANCHA);
  registrarFolha(deps, FOLHA_DA_CONSULTA);
}

function registrarFolha(deps: DependenciasDasFolhas, folha: FolhaImpressa): void {
  const gravar = deps.gravar ?? ((caminho, dados) => fs.writeFileSync(caminho, dados));
  const log = deps.log ?? ((m) => console.warn(m));
  const tag = `[${folha.nome}]`;

  // Imprimir (achado 8 de 20/10/2026). Registrado aqui, junto do PDF, para o
  // main.ts não mudar: ele já chama esta função.
  deps.ipcMain.handle(folha.canalImpressao, async (e: IpcMainInvokeEvent): Promise<ResultadoDaImpressao> => {
    const janela = deps.janelaPrincipal();
    if (!janela || janela.isDestroyed() || e.sender !== janela.webContents) {
      log(`${tag} impressão recusada: remetente não é a janela principal`);
      return { ok: false, erro: 'Origem não autorizada.' };
    }
    let impressoras: PrinterInfo[];
    try {
      impressoras = await janela.webContents.getPrintersAsync();
    } catch (erro) {
      log(`${tag} não foi possível listar as impressoras: ${(erro as Error)?.message ?? erro}`);
      return { ok: false, erro: 'Não consegui ver as impressoras deste computador agora. Tente de novo, ou use "Salvar em PDF".' };
    }
    if (impressoras.length === 0) {
      return { ok: false, erro: 'Nenhuma impressora foi encontrada neste computador. Use "Salvar em PDF" e imprima de outro lugar.' };
    }
    const { opcoes, escolhas } = caixaDasImpressoras(impressoras, folha);
    const resposta = await deps.dialog.showMessageBox(janela, opcoes);
    const escolha = escolhas[resposta.response];
    if (!escolha) return { ok: false, cancelado: true };
    if (janela.isDestroyed()) return { ok: false, erro: 'A janela do IrisFlow fechou antes de imprimir.' };
    return new Promise<ResultadoDaImpressao>((resolver) => {
      try {
        janela.webContents.print({ ...folha.opcoesDaImpressao, deviceName: escolha.deviceName }, (ok, motivo) => {
          if (ok) {
            resolver({ ok: true, impressora: escolha.deviceName ? escolha.rotulo : null });
            return;
          }
          // "Print job canceled": o driver (ex.: salvar como PDF) foi fechado.
          if (/cancel/i.test(motivo ?? '')) {
            resolver({ ok: false, cancelado: true });
            return;
          }
          log(`${tag} a impressão falhou: ${motivo}`);
          resolver({ ok: false, erro: 'A impressora não aceitou a folha agora. Confira se ela está ligada, ou use "Salvar em PDF".' });
        });
      } catch (erro) {
        log(`${tag} não foi possível imprimir: ${(erro as Error)?.message ?? erro}`);
        resolver({ ok: false, erro: 'Não foi possível imprimir agora.' });
      }
    });
  });

  deps.ipcMain.handle(folha.canalPdf, async (e: IpcMainInvokeEvent): Promise<ResultadoDoPdf> => {
    const janela = deps.janelaPrincipal();
    if (!janela || janela.isDestroyed() || e.sender !== janela.webContents) {
      log(`${tag} pedido recusado: remetente não é a janela principal`);
      return { ok: false, erro: 'Origem não autorizada.' };
    }
    let pdf: Buffer;
    try {
      pdf = await janela.webContents.printToPDF(folha.opcoesDoPdf);
    } catch (erro) {
      log(`${tag} não foi possível gerar o PDF: ${(erro as Error)?.message ?? erro}`);
      return { ok: false, erro: 'Não foi possível gerar o PDF agora.' };
    }
    const opcoes: SaveDialogOptions = {
      title: folha.tituloDoSalvar,
      defaultPath: path.join(deps.pastaPadrao(), folha.nomeDoArquivo),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    };
    const escolha = await deps.dialog.showSaveDialog(janela, opcoes);
    if (escolha.canceled || !escolha.filePath) return { ok: false, cancelado: true };
    const caminho = /\.pdf$/i.test(escolha.filePath) ? escolha.filePath : `${escolha.filePath}.pdf`;
    try {
      gravar(caminho, pdf);
    } catch (erro) {
      log(`${tag} não foi possível gravar o PDF: ${(erro as Error)?.message ?? erro}`);
      return { ok: false, erro: 'Não foi possível gravar o arquivo nessa pasta.' };
    }
    return { ok: true, caminho };
  });
}

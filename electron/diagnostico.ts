/**
 * Diagnóstico local: relatório de falhas (minidumps) e log do processo principal.
 *
 * O QUE ENTRA NO LOG: eventos do processo principal — início, versão, quedas
 * de processo (`render-process-gone`, `child-process-gone`), exceções não
 * tratadas do main, avisos e erros que o próprio main já escrevia no console.
 * O QUE NUNCA ENTRA: imagem da câmera, landmarks, olhar, texto digitado pelo
 * paciente. O main não recebe quadros de câmera (a câmera vive no renderer) e
 * os logs do renderer NÃO são espelhados no app empacotado.
 *
 * Onde fica: `app.getPath('logs')` (o nome da pasta é o `name` do
 * package.json, `irisflow` — o mesmo da pasta de dados que já existe nas
 * máquinas da beta; não mudar, ou o app "esquece" login e calibração):
 *   Windows  %APPDATA%\irisflow\logs\irisflow-main.log
 *   macOS    ~/Library/Logs/irisflow/irisflow-main.log
 *   Linux    ~/.config/irisflow/logs/irisflow-main.log
 * Um arquivo de até 1 MB + o anterior (`.1.log`): o cuidador pode anexar num
 * pedido de suporte sem ferramenta nenhuma.
 *
 * MINIDUMPS (`crashReporter`, nativo do Electron, sem dependência nova):
 * sempre gravados LOCALMENTE (`app.getPath('crashDumps')`). Só são ENVIADOS
 * se o instalador foi compilado com `IRISFLOW_CRASH_URL` (endpoint de
 * minidump compatível com Sentry: `https://oXXX.ingest.sentry.io/api/<id>/minidump/?sentry_key=<chave>`).
 * Atenção de privacidade para quem ligar o envio: um minidump de um processo
 * de renderer carrega pedaços de memória, e a memória do renderer contém
 * quadros da câmera. Por isso o padrão é NÃO enviar, e a URL só entra por
 * decisão explícita no build (README, "Instalador e atualização automática").
 */

import { app, crashReporter } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

declare const __IRISFLOW_CRASH_URL__: string;

/** Endereço de envio, fixado no build por `electron/build.mjs` (vazio = só local). */
function urlDeEnvio(): string {
  try {
    return typeof __IRISFLOW_CRASH_URL__ === 'string' ? __IRISFLOW_CRASH_URL__.trim() : '';
  } catch {
    return '';
  }
}

const TAMANHO_MAXIMO = 1024 * 1024;
let caminhoDoLog: string | null = null;

function arquivoDeLog(): string | null {
  if (caminhoDoLog) return caminhoDoLog;
  try {
    // Sem argumento = pasta padrão do SO. Precisa vir antes do primeiro
    // `getPath('logs')`, que em algumas plataformas lança antes do `ready`.
    try { app.setAppLogsPath(); } catch { /* já definida */ }
    const pasta = app.getPath('logs');
    fs.mkdirSync(pasta, { recursive: true });
    caminhoDoLog = path.join(pasta, 'irisflow-main.log');
    return caminhoDoLog;
  } catch {
    return null;
  }
}

function formatar(valor: unknown): string {
  if (valor instanceof Error) return `${valor.name}: ${valor.message}${valor.stack ? `\n${valor.stack}` : ''}`;
  if (typeof valor === 'string') return valor;
  try {
    return JSON.stringify(valor);
  } catch {
    return String(valor);
  }
}

/** Acrescenta uma linha ao log local. Nunca lança. */
export function registrarNoLog(nivel: 'info' | 'aviso' | 'erro', ...partes: unknown[]): void {
  const arq = arquivoDeLog();
  if (!arq) return;
  try {
    try {
      if (fs.statSync(arq).size > TAMANHO_MAXIMO) fs.renameSync(arq, arq.replace(/\.log$/, '.1.log'));
    } catch { /* ainda não existe */ }
    const linha = `${new Date().toISOString()} [${nivel}] ${partes.map(formatar).join(' ')}\n`;
    fs.appendFileSync(arq, linha.length > 8000 ? `${linha.slice(0, 8000)}…\n` : linha, 'utf8');
  } catch { /* disco cheio, pasta sem permissão: o app segue */ }
}

/**
 * Liga o crashReporter e o log. Chamar o MAIS CEDO possível (antes de
 * `app.whenReady`), para cobrir quedas da própria inicialização.
 */
export function iniciarDiagnostico(opcoes: { canal: string }): void {
  const url = urlDeEnvio();
  try {
    crashReporter.start({
      submitURL: url,
      uploadToServer: url.length > 0,
      compress: true,
      ignoreSystemCrashHandler: false,
      globalExtra: { canal: opcoes.canal, versao: app.getVersion() },
    });
  } catch (erro) {
    registrarNoLog('aviso', '[diagnostico] crashReporter não iniciou:', erro);
  }

  // O que o main já escrevia como aviso/erro no console passa a ir também
  // para o arquivo. `console.log` fica de fora: é ruído de desenvolvimento.
  const avisoOriginal = console.warn.bind(console);
  const erroOriginal = console.error.bind(console);
  console.warn = (...args: unknown[]) => { avisoOriginal(...args); registrarNoLog('aviso', ...args); };
  console.error = (...args: unknown[]) => { erroOriginal(...args); registrarNoLog('erro', ...args); };

  process.on('uncaughtException', (erro) => {
    // Com este ouvinte o Electron não mostra a caixa de erro e o processo
    // continua. Para um app de comunicação, continuar vivo (e registrar) é
    // melhor que fechar no meio de uma frase.
    registrarNoLog('erro', '[main] exceção não tratada:', erro);
    erroOriginal('[main] exceção não tratada:', erro);
  });
  process.on('unhandledRejection', (motivo) => {
    registrarNoLog('erro', '[main] promessa rejeitada sem tratamento:', motivo);
  });

  app.on('child-process-gone', (_e, detalhes) => {
    if (detalhes.reason === 'clean-exit') return;
    registrarNoLog('erro', '[processo] filho caiu:', {
      tipo: detalhes.type, motivo: detalhes.reason, codigo: detalhes.exitCode, servico: detalhes.serviceName, nome: detalhes.name,
    });
  });

  registrarNoLog('info', `[diagnostico] IrisFlow ${app.getVersion()} (${process.platform}/${process.arch}, Electron ${process.versions.electron}); ` +
    `minidumps ${url ? 'locais + envio configurado' : 'só locais'}`);
}

/** Pasta dos logs, para mostrar ao cuidador ou anexar num suporte. */
export function pastaDosLogs(): string | null {
  const arq = arquivoDeLog();
  return arq ? path.dirname(arq) : null;
}

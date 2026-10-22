// Ponte mínima para o renderer ler geometria física da tela.
//
// O renderer roda com `contextIsolation: true` e `sandbox: true`. Nesse modo
// o preload ainda tem acesso a `contextBridge` e `ipcRenderer` (subconjunto
// permitido), que é tudo de que precisamos: nenhum módulo de Node vaza para
// a página.
//
// Superfície deliberadamente estreita. Ampliar isto exige justificar por que
// o renderer precisa de mais poder. Hoje são dois grupos:
//   `irisflowSystem` — geometria física da tela (leitura).
//   `irisflowCloud`  — cofre cifrado (safeStorage) para o token da sessão do
//                      Supabase e a chave do computador, mais a identidade do
//                      app. Chaves restritas ao prefixo `irisflow.` no main.
//   `irisflowSystem.desktop` — Modo Computador: liga/desliga a sobreposição
//                      sobre o Windows e manda o olhar para o main (que é
//                      quem move o mouse do sistema). O renderer NÃO tem
//                      acesso a mover/clicar diretamente.
//   `irisflowVoz`    — motor de voz local (clonagem): status, importar
//                      áudio de referência, sintetizar. Áudio e modelo ficam
//                      na pasta de dados do app; nada disto sai do computador.
//   `irisflowBackup` — a cópia de segurança que o app guarda ANTES de restaurar
//                      um backup (a página manda só o texto; o main escolhe a pasta).
import { contextBridge, ipcRenderer } from 'electron';
import { CANAIS } from '../src/computador/protocolo';
import type { SelecaoDaSobreposicao } from '../src/computador/protocolo';
import type { AmostraDeOlhar, CapacidadesDoSistema, MotivoDeSaida } from '../src/computador/protocolo';
import { CANAIS_VOZ } from '../src/voz/protocolo';
import type { EstadoDoMotorDeVoz, OpcoesDeSintese, ResultadoDaImportacao, ResultadoDaRemocaoDoPerfil, ResultadoDaSintese } from '../src/voz/protocolo';
import { CANAL_DA_BATIDA } from '../src/vigiaDoRenderer';
import { CANAIS_VOZ_GUARDADA } from '../src/voz/vozGuardada';
import type {
  ArquivoParaRestaurar, PedidoDeSalvar, ResultadoDaListaDoBackup, ResultadoDaListagem, ResultadoDaRestauracaoDaVoz, ResultadoDeLer,
  ResultadoDeLerParaBackup, ResultadoDeSalvar, ResultadoSimples,
} from '../src/voz/vozGuardada';
import { CANAL_DA_COPIA_DE_SEGURANCA } from '../src/backup/protocolo';
import type { ResultadoDaCopiaDeSeguranca } from '../src/backup/protocolo';

export interface PhysicalPanelSizeIPC {
  widthCm: number;
  heightCm: number;
  /** Diagnóstico: de onde veio o número ('edid-dtd' | 'edid-cm' | 'wmi' | 'coregraphics'). */
  fonte?: string;
  /** Nome do monitor declarado no EDID, quando houver. */
  nome?: string;
}

contextBridge.exposeInMainWorld('irisflowSystem', {
  /** Dimensões físicas do(s) monitor(es) em uso, do EDID (registro/WMI no
   *  Windows, sysfs no Linux, ioreg/CoreGraphics no macOS). Lista VAZIA quando
   *  o SO não informa ou o valor não é confiável — a UI mantém o passo manual. */
  getMonitorSizes: (): Promise<PhysicalPanelSizeIPC[]> =>
    ipcRenderer.invoke('irisflow:monitor-sizes'),
  /** Resolução e fator de escala do monitor em que a JANELA do app está (não
   *  o primário), do SO. `window.screen` do renderer não expõe a escala do
   *  Windows, e ela altera a relação px→cm. */
  getDisplayInfo: (): Promise<{
    id?: number; widthPx: number; heightPx: number; scaleFactor: number;
    physicalWidthPx: number; physicalHeightPx: number;
  }> => ipcRenderer.invoke('irisflow:display-info'),
  /** O monitor da janela mudou (ela foi para outro monitor, ou a resolução ou
   *  a escala dele mudou): quem guardou `getDisplayInfo`/`getMonitorSizes` deve
   *  consultar de novo. Devolve a função que cancela a escuta. */
  onTelaMudou: (cb: (info: { id: number; scaleFactor: number }) => void): (() => void) => {
    const handler = (_e: unknown, info: { id: number; scaleFactor: number }) => cb(info);
    ipcRenderer.on('irisflow:tela-mudou', handler);
    return () => ipcRenderer.removeListener('irisflow:tela-mudou', handler);
  },

  /** Alarme de emergência do lado do sistema (electron/alarme.ts): `true`
   *  traz a janela para a frente, por cima de tudo, e — com `volumeMaximo` —
   *  sobe o volume do Windows; `false` desfaz e devolve o volume. */
  alarme: (ligar: boolean, opcoes?: { volumeMaximo?: boolean }): Promise<boolean> =>
    ipcRenderer.invoke('irisflow:alarme', ligar, opcoes),

  /** Abre a pasta de registros do app (log do processo principal, sem imagem
   *  nem texto do paciente) no gerenciador de arquivos — para anexar num
   *  pedido de suporte. `false` se não deu. */
  abrirPastaDosLogs: (): Promise<boolean> => ipcRenderer.invoke('irisflow:abrir-pasta-dos-logs'),

  /** Batida do laço do rastreador para o vigia de página travada do main
   *  (`electron/vigiaDoRenderer.ts`). `send`, sem resposta; só o booleano
   *  atravessa — nada do que a página mandar além disso chega ao main. */
  vivo: (batida: { rastreando: boolean }): void =>
    ipcRenderer.send(CANAL_DA_BATIDA, { rastreando: batida?.rastreando === true }),

  desktop: {
    capacidades: (): Promise<CapacidadesDoSistema> => ipcRenderer.invoke(CANAIS.capacidades),
    iniciar: (pedido: { dwellMs: number; tamanhoCursorPx: number; lupa: boolean }): Promise<{ ok: true } | { ok: false; motivo: string }> =>
      ipcRenderer.invoke(CANAIS.iniciar, pedido),
    parar: (): Promise<void> => ipcRenderer.invoke(CANAIS.parar),
    /** Fluxo contínuo (30–60 Hz): `send`, sem resposta, para não enfileirar promessas. */
    olhar: (amostra: AmostraDeOlhar): void => ipcRenderer.send(CANAIS.olhar, amostra),
    /** Estado do rastreador (`sem_camera` encerra a sessão pelo vigia do main). */
    rastreamento: (estado: string): void => ipcRenderer.send(CANAIS.rastreamento, estado),
    onParou: (cb: (motivo: MotivoDeSaida) => void): (() => void) => {
      const handler = (_e: unknown, motivo: MotivoDeSaida) => cb(motivo);
      ipcRenderer.on(CANAIS.parou, handler);
      return () => ipcRenderer.removeListener(CANAIS.parou, handler);
    },
    onSelecao: (cb: (s: SelecaoDaSobreposicao) => void): (() => void) => {
      const handler = (_e: unknown, s: SelecaoDaSobreposicao) => cb(s);
      ipcRenderer.on(CANAIS.selecao, handler);
      return () => ipcRenderer.removeListener(CANAIS.selecao, handler);
    },
  },
});

contextBridge.exposeInMainWorld('irisflowVoz', {
  estado: (): Promise<EstadoDoMotorDeVoz> => ipcRenderer.invoke(CANAIS_VOZ.estado),
  onEstado: (cb: (e: EstadoDoMotorDeVoz) => void): (() => void) => {
    const handler = (_e: unknown, estado: EstadoDoMotorDeVoz) => cb(estado);
    ipcRenderer.on(CANAIS_VOZ.estadoMudou, handler);
    return () => ipcRenderer.removeListener(CANAIS_VOZ.estadoMudou, handler);
  },
  /** Abre o seletor de arquivo do sistema e prepara o áudio de referência. */
  importar: (consentimento: { texto: string; aceitoEm: string; perfilId: string | null }): Promise<ResultadoDaImportacao> =>
    ipcRenderer.invoke(CANAIS_VOZ.importar, consentimento),
  remover: (): Promise<void> => ipcRenderer.invoke(CANAIS_VOZ.remover),
  /**
   * Remover o paciente (N1, 21/10/2026): apaga a voz clonada importada SÓ se o termo dela for deste
   * perfil. Só o id do perfil sai daqui; o main compara com o termo que gravou.
   */
  removerDoPerfil: (perfilId: string): Promise<ResultadoDaRemocaoDoPerfil> => ipcRenderer.invoke(CANAIS_VOZ.removerDoPerfil, perfilId),
  baixarModelo: (): Promise<{ ok: boolean; erro?: string }> => ipcRenderer.invoke(CANAIS_VOZ.baixarModelo),
  sintetizar: (texto: string, opcoes?: OpcoesDeSintese): Promise<ResultadoDaSintese> => ipcRenderer.invoke(CANAIS_VOZ.sintetizar, texto, opcoes ?? {}),
  /** Acorda o motor e consulta status/dispositivo (tela de Voz). */
  sondar: (): Promise<EstadoDoMotorDeVoz> => ipcRenderer.invoke(CANAIS_VOZ.sondar),
  ativar: (ligado: boolean): Promise<void> => ipcRenderer.invoke(CANAIS_VOZ.ativar, ligado),
});

contextBridge.exposeInMainWorld('irisflowCloud', {
  secureGet: (chave: string): Promise<string | null> =>
    ipcRenderer.invoke('irisflow:secure-get', chave),
  secureSet: (chave: string, valor: string): Promise<boolean> =>
    ipcRenderer.invoke('irisflow:secure-set', chave, valor),
  secureRemove: (chave: string): Promise<boolean> =>
    ipcRenderer.invoke('irisflow:secure-remove', chave),
  appInfo: (): Promise<{
    version: string; hostname: string; platform: string; encryptionAvailable: boolean;
  }> => ipcRenderer.invoke('irisflow:app-info'),
});

// Atualização automática: estado para a faixa na tela e o botão de reiniciar.
// A instalação só acontece por este canal (decisão do cuidador) ou ao fechar.
contextBridge.exposeInMainWorld('irisflowAtualizacao', {
  estado: (): Promise<unknown> => ipcRenderer.invoke('irisflow:atualizacao-estado'),
  verificar: (): Promise<boolean> => ipcRenderer.invoke('irisflow:atualizacao-verificar'),
  instalar: (): Promise<boolean> => ipcRenderer.invoke('irisflow:atualizacao-instalar'),
  aoMudar: (cb: (estado: unknown) => void): (() => void) => {
    const ouvinte = (_e: unknown, estado: unknown) => cb(estado);
    ipcRenderer.on('irisflow:atualizacao-mudou', ouvinte);
    return () => ipcRenderer.removeListener('irisflow:atualizacao-mudou', ouvinte);
  },
});

// Voz guardada (19/10/2026): frases gravadas pelo próprio paciente, guardadas
// em `userData/voz/guardadas/` (nada sai do computador). A página manda e
// recebe o WAV e escolhe as gravações pelo id — nunca por caminho de arquivo.
contextBridge.exposeInMainWorld('irisflowVozGuardada', {
  listar: (): Promise<ResultadoDaListagem> => ipcRenderer.invoke(CANAIS_VOZ_GUARDADA.listar),
  consentir: (consentimento: { texto: string; aceitoEm: string; perfilId: string | null }): Promise<ResultadoSimples> =>
    ipcRenderer.invoke(CANAIS_VOZ_GUARDADA.consentir, consentimento),
  salvar: (pedido: PedidoDeSalvar): Promise<ResultadoDeSalvar> => ipcRenderer.invoke(CANAIS_VOZ_GUARDADA.salvar, pedido),
  ler: (id: string): Promise<ResultadoDeLer> => ipcRenderer.invoke(CANAIS_VOZ_GUARDADA.ler, id),
  apagar: (id: string): Promise<ResultadoSimples> => ipcRenderer.invoke(CANAIS_VOZ_GUARDADA.apagar, id),
  /** Remover o paciente: todas as gravações e o termo dele (M4, 21/10/2026). */
  apagarDoPerfil: (perfilId: string): Promise<ResultadoSimples> => ipcRenderer.invoke(CANAIS_VOZ_GUARDADA.apagarDoPerfil, perfilId),
  /** A importação da voz clonada, com uma gravação guardada no lugar do arquivo escolhido. */
  usarComoReferencia: (id: string, consentimento: { texto: string; aceitoEm: string; perfilId: string | null }): Promise<ResultadoDaImportacao> =>
    ipcRenderer.invoke(CANAIS_VOZ_GUARDADA.usarComoReferencia, id, consentimento),
  // Backup completo (rodada 3, 21/10/2026): as gravações viajam no arquivo de backup. A
  // página lista o que há (nomes e tamanhos), lê um arquivo por vez PELO NOME — nada de
  // caminho — e, ao restaurar, devolve tudo de uma vez para somar ao que já existe.
  backupListar: (): Promise<ResultadoDaListaDoBackup> => ipcRenderer.invoke(CANAIS_VOZ_GUARDADA.backupListar),
  backupLer: (nome: string): Promise<ResultadoDeLerParaBackup> => ipcRenderer.invoke(CANAIS_VOZ_GUARDADA.backupLer, nome),
  backupRestaurar: (arquivos: ArquivoParaRestaurar[], opcoes?: { perfil?: string }): Promise<ResultadoDaRestauracaoDaVoz> =>
    ipcRenderer.invoke(CANAIS_VOZ_GUARDADA.backupRestaurar, arquivos, opcoes ?? {}),
});

// Backup completo (rodada 3, 21/10/2026): antes de restaurar, o app guarda o estado de
// agora. A página manda só o TEXTO; pasta, nome e extensão são do processo principal
// (`electron/copiaDeSeguranca.ts`) — um download pela página abriria o "Salvar como" do
// sistema e a recarga que vem logo depois poderia cancelá-lo.
contextBridge.exposeInMainWorld('irisflowBackup', {
  guardarCopia: (texto: string): Promise<ResultadoDaCopiaDeSeguranca> => ipcRenderer.invoke(CANAL_DA_COPIA_DE_SEGURANCA, texto),
});

// Prancha de letras (plano C): gera o PDF da página que está na tela (o main
// decide tamanho e orientação) e pergunta ao cuidador onde salvar. E imprime
// pelo main, que pergunta a impressora sem segurar a página — o
// `window.print()` parava o app inteiro, a Emergência incluída, até o diálogo
// fechar (revisão de UX de 20/10/2026, achado 8).
contextBridge.exposeInMainWorld('irisflowPrancha', {
  salvarPdf: (): Promise<{ ok: true; caminho: string } | { ok: false; cancelado?: boolean; erro?: string }> =>
    ipcRenderer.invoke('irisflow:prancha-pdf'),
  imprimir: (): Promise<{ ok: true; impressora: string | null } | { ok: false; cancelado?: boolean; erro?: string }> =>
    ipcRenderer.invoke('irisflow:prancha-imprimir'),
});

// Folha da consulta (21/10/2026): o mesmo caminho da prancha — o main gera o PDF
// e imprime sem segurar a página —, em A4 em pé. Ponte própria e canais
// próprios; a página continua sem escolher tamanho nem orientação.
contextBridge.exposeInMainWorld('irisflowConsulta', {
  salvarPdf: (): Promise<{ ok: true; caminho: string } | { ok: false; cancelado?: boolean; erro?: string }> =>
    ipcRenderer.invoke('irisflow:consulta-pdf'),
  imprimir: (): Promise<{ ok: true; impressora: string | null } | { ok: false; cancelado?: boolean; erro?: string }> =>
    ipcRenderer.invoke('irisflow:consulta-imprimir'),
});

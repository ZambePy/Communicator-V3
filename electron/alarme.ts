// Alarme de emergência do lado do SISTEMA (pedido de 18/10/2026: "alarme alto
// no computador, que funcione à noite").
//
// A página toca a sirene (frontend/src/utils/emergencyAudio.ts), mas não
// alcança três coisas que decidem se alguém OUVE e VÊ o alarme:
//   1. a janela minimizada, escondida (Modo Computador) ou atrás de outra — o
//      alarme tocava com a tela de emergência invisível;
//   2. o volume do Windows baixo ou mudo — comum à noite, e aí a sirene mais
//      alta do mundo sai em silêncio;
//   3. a barra de tarefas: piscar o ícone chama atenção de quem está no PC.
//
// Ligado: mostra a janela, restaura se minimizada, põe por cima de tudo, foca
// e pisca; se o ajuste permitir, guarda o volume e o mudo atuais e sobe o
// volume ao máximo, sem mudo. Desligado: tira o "por cima", para de piscar e
// devolve o volume e o mudo como estavam — mexer no volume de alguém e não
// devolver seria um efeito colateral que ninguém pediu.
//
// O volume é mexido pela API de áudio do Windows (Core Audio,
// IAudioEndpointVolume), chamada por um PowerShell sem perfil, com texto FIXO
// (nada vindo da página entra no comando). Fora do Windows, ou se o
// PowerShell falhar, o alarme segue só com a janela e a sirene da página; a
// falha vai para o log uma vez.
import { execFile } from 'node:child_process';
import path from 'node:path';
import type { BrowserWindow } from 'electron';

export const CANAL_DO_ALARME = 'irisflow:alarme';

/** Prazo do PowerShell: compilar o trecho em C# leva ~1–2 s na primeira vez. */
export const PRAZO_DO_POWERSHELL_MS = 15_000;

/**
 * Quanto o app espera o volume voltar ao fechar (will-quit), sem subida em
 * curso: falta no máximo devolver o volume, um PowerShell de ~1–2 s.
 */
export const PRAZO_DE_SAIDA_MS = 8_000;

/**
 * Com uma subida em curso, a espera da saída é o prazo do PowerShell MAIS esta
 * folga para a devolução (revisão de segurança de 20/10/2026). Antes eram os
 * mesmos 8 s: com uma subida lenta (Add-Type devagar, antivírus), o app saía
 * antes de ela terminar, e ela terminava depois — o Windows ficava em 100%,
 * sem ninguém para devolver. A subida começou antes da saída, então a
 * devolução tem pelo menos esta folga (mais o que a subida não usou); e uma
 * subida que estoura o prazo é morta sem ter lido o volume — aí não há o que
 * devolver.
 */
export const FOLGA_PARA_DEVOLVER_MS = 3_000;

/**
 * Trecho de PowerShell que define a classe `IrisFlowAudio` (volume e mudo do
 * dispositivo de saída padrão). É o padrão conhecido de interop com o Core
 * Audio: a ordem dos métodos da interface tem de ser a da vtable de
 * IAudioEndpointVolume (os quatro primeiros e os quatro do meio não são
 * usados, mas ocupam o lugar).
 */
export const DEFINICAO_DO_AUDIO = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
  int j();
  int GetMasterVolumeLevelScalar(out float pfLevel);
  int k(); int l(); int m(); int n();
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class IrisFlowAudio {
  static IAudioEndpointVolume Vol() {
    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
    IMMDevice dev = null;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out dev));
    IAudioEndpointVolume epv = null;
    var epvid = typeof(IAudioEndpointVolume).GUID;
    Marshal.ThrowExceptionForHR(dev.Activate(ref epvid, 23, 0, out epv));
    return epv;
  }
  public static float Volume {
    get { float v = -1; Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v)); return v; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(value, Guid.Empty)); }
  }
  public static bool Mute {
    get { bool mute; Marshal.ThrowExceptionForHR(Vol().GetMute(out mute)); return mute; }
    set { Marshal.ThrowExceptionForHR(Vol().SetMute(value, Guid.Empty)); }
  }
}
'@
`;

/** Comando que lê o estado atual, sobe ao máximo sem mudo e imprime o anterior em JSON. */
export const COMANDO_SUBIR = `${DEFINICAO_DO_AUDIO}
$antes = @{ volume = [IrisFlowAudio]::Volume; mudo = [IrisFlowAudio]::Mute }
[IrisFlowAudio]::Mute = $false
[IrisFlowAudio]::Volume = 1.0
$antes | ConvertTo-Json -Compress
`;

/** Comando que devolve volume e mudo. Os dois números são validados antes. */
export function comandoRestaurar(volume: number, mudo: boolean): string {
  const v = Math.min(1, Math.max(0, volume));
  return `${DEFINICAO_DO_AUDIO}
[IrisFlowAudio]::Volume = ${v.toFixed(4)}
[IrisFlowAudio]::Mute = $${mudo ? 'true' : 'false'}
`;
}

/** Lê a saída do COMANDO_SUBIR; `null` se não for o JSON esperado. */
export function lerEstadoAnterior(saida: string): { volume: number; mudo: boolean } | null {
  try {
    const linha = saida.trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
    const o = JSON.parse(linha) as { volume?: unknown; mudo?: unknown };
    const volume = typeof o.volume === 'number' ? o.volume : Number(o.volume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) return null;
    return { volume, mudo: o.mudo === true };
  } catch {
    return null;
  }
}

type Executor = (comando: string) => Promise<string>;

/**
 * Caminho completo do PowerShell do Windows (revisão de segurança de
 * 19/10/2026): pelo nome só, o Windows procura antes na pasta do programa e na
 * pasta atual — um `powershell.exe` posto ali rodaria no lugar do verdadeiro.
 */
export function caminhoDoPowershell(env: NodeJS.ProcessEnv = process.env): string {
  const raiz = env.SystemRoot || env.windir || 'C:\\Windows';
  return path.win32.join(raiz, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function powershell(comando: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      caminhoDoPowershell(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', comando],
      { timeout: PRAZO_DO_POWERSHELL_MS, windowsHide: true },
      (erro, stdout) => (erro ? reject(erro) : resolve(String(stdout))),
    );
  });
}

export interface DependenciasDoAlarme {
  janela: () => BrowserWindow | null;
  plataforma?: NodeJS.Platform;
  executar?: Executor;
  log?: (nivel: 'info' | 'aviso' | 'erro', ...partes: unknown[]) => void;
}

/**
 * Estado do alarme do sistema. Separado do `ipcMain` para ser testável: o
 * teste injeta a janela, a plataforma e o executor.
 *
 * As operações de volume (subir e devolver) passam por UMA fila, uma de cada
 * vez, e cada uma confere na hora de rodar o que a página pediu por último
 * (revisão de segurança de 19/10/2026). Antes, um "ligar" logo depois de um
 * "desligar" abria um segundo PowerShell em paralelo: conforme quem terminasse
 * primeiro, o segundo alarme tocava com o Windows MUDO, ou o volume da pessoa
 * ficava no máximo depois de o alarme parar — e alternar rápido abria um
 * PowerShell por pedido. Agora:
 *  - nunca há dois PowerShell ao mesmo tempo;
 *  - o volume de ANTES é o do começo do episódio: uma segunda subida (alarme
 *    religado antes de o volume voltar) não troca o "antes" pelo máximo;
 *  - um "devolver" que chega à vez com o alarme religado não roda (o alarme
 *    novo continua alto), e um "subir" que chega à vez com o alarme desligado
 *    também não.
 */
export function criarAlarmeDoSistema(dep: DependenciasDoAlarme) {
  const plataforma = dep.plataforma ?? process.platform;
  const executar = dep.executar ?? powershell;
  const log = dep.log ?? (() => undefined);
  let ligado = false;
  /** Pedido de volume máximo do alarme em vigor (o ajuste do paciente). */
  let querVolumeMaximo = false;
  /** Volume e mudo de antes do episódio; `null` = nada a devolver. */
  let volumeAnterior: { volume: number; mudo: boolean } | null = null;
  /** A fila das operações de volume (uma de cada vez). */
  let fila: Promise<void> = Promise.resolve();
  let pendentes = 0;
  /** O PowerShell da subida está rodando agora (decide quanto a saída espera). */
  let subindo = false;
  let avisouFalhaDoVolume = false;

  function enfileirar(op: () => Promise<void>): Promise<void> {
    pendentes += 1;
    const vez = fila.then(op).catch((e) => {
      log('aviso', '[alarme] operação de volume falhou', e);
    }).finally(() => { pendentes -= 1; });
    fila = vez;
    return vez;
  }

  async function subirVolume(): Promise<void> {
    // Desligado antes da vez chegar, ou sem o ajuste: nada a subir.
    if (!ligado || !querVolumeMaximo) return;
    try {
      let saida: string;
      subindo = true;
      try {
        saida = await executar(COMANDO_SUBIR);
      } finally {
        subindo = false;
      }
      const antes = lerEstadoAnterior(saida);
      if (!antes) throw new Error(`resposta inesperada do PowerShell: ${saida.slice(0, 200)}`);
      // O "antes" é o do começo do episódio: numa segunda subida, o volume
      // lido já é o máximo que o próprio alarme pôs.
      if (!volumeAnterior) volumeAnterior = antes;
      log('info', `[alarme] volume do sistema no máximo (antes: ${Math.round(volumeAnterior.volume * 100)}%${volumeAnterior.mudo ? ', mudo' : ''})`);
    } catch (e) {
      if (!avisouFalhaDoVolume) {
        avisouFalhaDoVolume = true;
        log('aviso', '[alarme] não foi possível subir o volume do sistema; o alarme segue com o volume atual', e);
      }
    }
  }

  async function devolverVolume(): Promise<void> {
    // Religado antes da vez chegar: o alarme novo continua alto, e o volume
    // de antes fica guardado para o fim dele.
    if (ligado) return;
    const antes = volumeAnterior;
    if (!antes) return;
    volumeAnterior = null;
    try {
      await executar(comandoRestaurar(antes.volume, antes.mudo));
      log('info', '[alarme] volume do sistema devolvido');
    } catch (e) {
      log('aviso', '[alarme] não foi possível devolver o volume do sistema', e);
    }
  }

  function janelaParaFrente(w: BrowserWindow) {
    try {
      if (w.isMinimized()) w.restore();
      if (!w.isVisible()) w.show();
      w.setAlwaysOnTop(true, 'screen-saver');
      w.focus();
      w.flashFrame(true);
    } catch (e) {
      log('aviso', '[alarme] não foi possível trazer a janela para a frente', e);
    }
  }

  async function ligar(opcoes: { volumeMaximo?: boolean } = {}): Promise<boolean> {
    if (ligado) return true;
    ligado = true;
    querVolumeMaximo = opcoes.volumeMaximo !== false && plataforma === 'win32';
    const w = dep.janela();
    if (w && !w.isDestroyed()) janelaParaFrente(w);
    log('info', '[alarme] alarme de emergência ligado');
    if (querVolumeMaximo) void enfileirar(subirVolume);
    return true;
  }

  async function desligar(): Promise<boolean> {
    if (!ligado) return true;
    ligado = false;
    const w = dep.janela();
    if (w && !w.isDestroyed()) {
      try {
        w.setAlwaysOnTop(false);
        w.flashFrame(false);
      } catch (e) {
        log('aviso', '[alarme] não foi possível soltar a janela', e);
      }
    }
    if (plataforma === 'win32') await enfileirar(devolverVolume);
    log('info', '[alarme] alarme de emergência desligado');
    return true;
  }

  /**
   * Quanto esperar ao fechar, decidido NA HORA (revisão de segurança de
   * 20/10/2026): com uma subida em curso, o prazo do PowerShell e a folga da
   * devolução; sem ela, a espera curta de sempre.
   */
  function prazoParaSair(): number {
    return subindo ? PRAZO_DO_POWERSHELL_MS + FOLGA_PARA_DEVOLVER_MS : PRAZO_DE_SAIDA_MS;
  }

  /**
   * Ao fechar o app: desliga e espera o volume voltar, no máximo `prazoMs` —
   * por padrão `prazoParaSair()`, lido antes de desligar. Nunca lança.
   */
  async function encerrar(prazoMs: number = prazoParaSair()): Promise<void> {
    if (subindo) log('info', `[alarme] saindo com a subida do volume em curso: esperando até ${Math.round(prazoMs / 1000)} s para devolvê-lo`);
    let limite: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        desligar().then(() => fila),
        new Promise<void>((r) => { limite = setTimeout(r, prazoMs); }),
      ]);
    } catch (e) {
      log('aviso', '[alarme] falha ao desligar o alarme ao sair', e);
    } finally {
      if (limite) clearTimeout(limite);
    }
  }

  return {
    ligar,
    desligar,
    encerrar,
    get ligado() { return ligado; },
    /** Há algo a desfazer antes de sair (alarme ligado, volume a devolver ou operação na fila)? */
    get precisaDesligarAoSair() { return ligado || volumeAnterior !== null || pendentes > 0; },
    /** O PowerShell da subida do volume está rodando agora. */
    get subidaEmCurso() { return subindo; },
    /** Quanto a saída esperaria agora (`encerrar()` sem prazo usa este). */
    get prazoParaSairMs() { return prazoParaSair(); },
  };
}

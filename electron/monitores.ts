/**
 * Tamanho físico dos monitores (para a diagonal da tela), lido do SO.
 *
 * Mesma IPC de antes (`irisflow:monitor-sizes` → `{ widthCm, heightCm }[]`),
 * agora com várias fontes e nenhuma capaz de travar o app:
 *
 *   Windows  1. EDID do REGISTRO via `reg.exe` (rápido, sem admin, sem WMI),
 *               filtrado pelos monitores presentes (`Services\monitor\Enum`);
 *            2. WMI `WmiMonitorBasicDisplayParams` (a fonte antiga), só se o
 *               registro não deu nada.
 *   Linux    `/sys/class/drm/card*-*\/edid` dos conectores `connected`.
 *   macOS    blobs de EDID no `ioreg -lw0`; se não houver (painel interno de
 *            MacBook costuma não expor), `CGDisplayScreenSize` via JXA.
 *
 * Toda leitura tem timeout e cai em lista vazia; a decisão sobre QUAIS
 * painéis devolver é pura (`selecionarPaineis`, testada em
 * `src/displayGeometryEdid.test.ts`). Lista vazia = a UI mantém o passo
 * manual (e a calibração pelo cartão de crédito na tela).
 *
 * O resultado fica em memória até a configuração de telas mudar: o
 * renderer pode perguntar à vontade sem abrir um processo por pergunta.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { screen } from 'electron';
import { buildMonitorSizeQuery } from '../src/displayGeometry';
import {
  filtrarAtivos,
  lerEdid,
  lerEdidsDoIoreg,
  lerEdidsDoRegQuery,
  lerMonitoresAtivosDoRegQuery,
  lerSaidaDoWmi,
  lerTamanhoDoCoreGraphics,
  selecionarPaineis,
  tamanhoFisicoDoEdid,
  type TamanhoDoPainel,
  type TelaEmUso,
} from '../src/displayGeometryEdid';

export interface TamanhoDoMonitorIPC {
  widthCm: number;
  heightCm: number;
  fonte?: TamanhoDoPainel['fonte'];
  nome?: string;
}

/** Teto de uma leitura inteira, somando as fontes. Nunca segura a tela de Ajustes. */
const TETO_TOTAL_MS = 12_000;

function rodar(cmd: string, args: string[], timeoutMs: number, maxBuffer = 4 * 1024 * 1024): Promise<string> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeoutMs, windowsHide: true, maxBuffer, encoding: 'utf8' }, (err, stdout) => {
        resolve(err ? '' : String(stdout ?? ''));
      });
    } catch {
      resolve('');
    }
  });
}

function telaPrincipal(): TelaEmUso | null {
  try {
    const d = screen.getPrimaryDisplay();
    return {
      larguraPx: Math.round(d.size.width * d.scaleFactor),
      alturaPx: Math.round(d.size.height * d.scaleFactor),
    };
  } catch {
    return null;
  }
}

function paineisDosBytes(blobs: Iterable<Uint8Array>): TamanhoDoPainel[] {
  const out: TamanhoDoPainel[] = [];
  for (const b of blobs) {
    const t = tamanhoFisicoDoEdid(lerEdid(b));
    if (t) out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------- Windows
async function lerWindows(tela: TelaEmUso | null): Promise<TamanhoDoPainel[]> {
  const reg = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'reg.exe') : 'reg.exe';
  const [saidaEdids, saidaAtivos] = await Promise.all([
    rodar(reg, ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY', '/s', '/v', 'EDID'], 5000, 8 * 1024 * 1024),
    rodar(reg, ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\monitor\\Enum'], 3000),
  ]);
  const { edids, confirmados } = filtrarAtivos(lerEdidsDoRegQuery(saidaEdids), lerMonitoresAtivosDoRegQuery(saidaAtivos));
  const doRegistro = selecionarPaineis(paineisDosBytes(edids.map((e) => e.bytes)), tela, confirmados);
  if (doRegistro.length > 0) return doRegistro;

  // Fonte antiga. O PowerShell pode demorar vários segundos para abrir numa
  // máquina fraca — por isso ela é a segunda, e com teto próprio.
  const saidaWmi = await rodar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', buildMonitorSizeQuery()], 8000);
  // O WMI só lista monitores presentes: presença confirmada.
  return selecionarPaineis(lerSaidaDoWmi(saidaWmi), tela, true);
}

// ---------------------------------------------------------------- Linux
function lerLinux(tela: TelaEmUso | null): TamanhoDoPainel[] {
  const base = '/sys/class/drm';
  const blobs: Uint8Array[] = [];
  let nomes: string[] = [];
  try {
    nomes = fs.readdirSync(base).filter((n) => /^card\d+-/.test(n));
  } catch {
    return [];
  }
  for (const n of nomes) {
    try {
      const status = fs.readFileSync(path.join(base, n, 'status'), 'utf8').trim();
      if (status !== 'connected') continue;
      const edid = fs.readFileSync(path.join(base, n, 'edid'));
      if (edid.length >= 128) blobs.push(new Uint8Array(edid));
    } catch { /* conector sem EDID legível: segue */ }
  }
  return selecionarPaineis(paineisDosBytes(blobs), tela, true);
}

// ---------------------------------------------------------------- macOS
const JXA_TAMANHO_DA_TELA =
  "ObjC.import('CoreGraphics'); var s = $.CGDisplayScreenSize($.CGMainDisplayID()); s.width + 'x' + s.height";

async function lerMac(tela: TelaEmUso | null): Promise<TamanhoDoPainel[]> {
  const saida = await rodar('/usr/sbin/ioreg', ['-lw0'], 6000, 64 * 1024 * 1024);
  const doIoreg = selecionarPaineis(paineisDosBytes(lerEdidsDoIoreg(saida)), tela, true);
  if (doIoreg.length > 0) return doIoreg;
  // Painel interno de MacBook: sem EDID no ioreg, mas o CoreGraphics sabe o
  // tamanho em mm. Melhor esforço; número implausível vira nada.
  const cg = lerTamanhoDoCoreGraphics(await rodar('/usr/bin/osascript', ['-l', 'JavaScript', '-e', JXA_TAMANHO_DA_TELA], 5000));
  return cg ? selecionarPaineis([cg], tela, true) : [];
}

async function lerAgora(): Promise<TamanhoDoPainel[]> {
  const tela = telaPrincipal();
  switch (process.platform) {
    case 'win32': return lerWindows(tela);
    case 'linux': return lerLinux(tela);
    case 'darwin': return lerMac(tela);
    default: return [];
  }
}

let emCache: Promise<TamanhoDoMonitorIPC[]> | null = null;

/** Lê (ou devolve do cache) os tamanhos físicos. Nunca rejeita. */
export function lerTamanhosDosMonitores(): Promise<TamanhoDoMonitorIPC[]> {
  if (emCache) return emCache;
  const leitura = (async () => {
    try {
      const teto = new Promise<TamanhoDoPainel[]>((r) => setTimeout(() => r([]), TETO_TOTAL_MS).unref?.());
      const paineis = await Promise.race([lerAgora(), teto]);
      const out = paineis.map((p) => ({
        widthCm: Math.round(p.widthCm * 10) / 10,
        heightCm: Math.round(p.heightCm * 10) / 10,
        fonte: p.fonte,
        ...(p.nome ? { nome: p.nome } : {}),
      }));
      console.log(`[monitores] ${out.length ? out.map((p) => `${p.widthCm}×${p.heightCm} cm (${p.fonte})`).join(', ') : 'nenhum tamanho confiável — diagonal fica manual'}`);
      return out;
    } catch (erro) {
      console.warn('[monitores] leitura falhou:', erro);
      return [];
    }
  })();
  emCache = leitura;
  // Resultado vazio não fica em cache para sempre: a próxima pergunta tenta de novo.
  void leitura.then((r) => { if (r.length === 0 && emCache === leitura) emCache = null; });
  return leitura;
}

/** Chamar quando a configuração de telas mudar (monitor ligado/desligado). */
export function esquecerTamanhosDosMonitores(): void {
  emCache = null;
}

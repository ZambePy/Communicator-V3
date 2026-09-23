// Leitura do EDID do monitor: a parte PURA (bytes → centímetros).
//
// POR QUE EXISTE
//
// `displayGeometry.ts` converte centímetros em diagonal; faltava de onde tirar
// os centímetros quando a consulta WMI falha — e ela falhou no PC de teste
// (PowerShell lento para abrir, classe `WmiMonitorBasicDisplayParams` sem
// instância com driver genérico, política corporativa bloqueando CIM...).
// O EDID em si está em lugares que não dependem do WMI:
//
//   - Windows: `HKLM\SYSTEM\CurrentControlSet\Enum\DISPLAY\<modelo>\<instância>\
//     Device Parameters\EDID` (REG_BINARY), legível sem administrador via
//     `reg.exe`. O registro guarda TODOS os monitores já conectados; os
//     presentes agora estão em `HKLM\SYSTEM\CurrentControlSet\Services\monitor\Enum`.
//   - Linux: `/sys/class/drm/card*-*/edid` (arquivo binário), com `status`.
//   - macOS: blobs `<00ffffffffffff00…>` na saída do `ioreg -lw0`.
//
// Tudo o que é leitura de SO fica em `electron/monitores.ts`; aqui só há
// funções puras, testadas com EDIDs de 128 bytes montados byte a byte.
//
// POLÍTICA: na dúvida, NADA. Uma diagonal inventada é pior que nenhuma (ver
// `computeDisplayGeometry`): a UI mantém o passo manual/opcional quando esta
// camada devolve lista vazia.

/** Cabeçalho fixo de todo EDID 1.x. */
export const EDID_CABECALHO = [0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00] as const;

/** Maior dimensão física aceita. Acima disso é TV gigante, projetor ou lixo. */
const MAX_MM = 3000;
/** Menor largura/altura aceita (mesmos pisos de `computeDisplayGeometry`). */
const MIN_LARGURA_MM = 100;
const MIN_ALTURA_MM = 60;
/** Tolerância entre a proporção física e a proporção em pixels do modo nativo. */
const TOL_PROPORCAO_MM = 0.08;
/** Os campos em cm têm resolução de 1 cm: num painel de 19 cm isso é 5 %. */
const TOL_PROPORCAO_CM = 0.12;
/** Diferença de diagonal acima da qual as duas fontes do MESMO EDID "brigam". */
const TOL_CONCORDANCIA = 0.15;

export interface ModoNativo {
  larguraPx: number;
  alturaPx: number;
  /** Tamanho da imagem declarado no descritor de temporização, em mm (0 = não informado). */
  larguraMm: number;
  alturaMm: number;
}

export interface EdidInfo {
  /** Código PnP de três letras (ex.: "DEL", "AUO", "SAM"). */
  fabricante: string;
  codigoProduto: number;
  versao: string;
  /** Nome declarado no descritor 0xFC, se houver. */
  nome: string | null;
  /** Bytes 21–22 (cm). `null` quando algum é 0 (projetor, ou só proporção no EDID 1.4). */
  tamanhoCm: { larguraCm: number; alturaCm: number } | null;
  /** Primeiro Detailed Timing Descriptor (o modo preferido/nativo). */
  modoNativo: ModoNativo | null;
}

/** Tamanho físico escolhido para um painel, na forma que a IPC já entrega. */
export interface TamanhoDoPainel {
  widthCm: number;
  heightCm: number;
  /** De onde veio o número (diagnóstico; a UI não precisa). */
  fonte: 'edid-dtd' | 'edid-cm' | 'wmi' | 'coregraphics';
  /** Resolução nativa, quando o EDID a declara — é o que casa painel com tela. */
  larguraPx?: number;
  alturaPx?: number;
  nome?: string;
  /** Identidade do modelo, para eliminar duplicatas do registro. */
  modelo?: string;
}

/** Converte a string hexadecimal de `reg query`/`ioreg` em bytes. */
export function hexParaBytes(hex: string): Uint8Array | null {
  const limpo = hex.replace(/[\s,]/g, '');
  if (limpo.length === 0 || limpo.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(limpo)) return null;
  const out = new Uint8Array(limpo.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(limpo.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Soma dos 128 bytes do bloco base ≡ 0 (mod 256). */
export function checksumValido(bytes: Uint8Array): boolean {
  if (bytes.length < 128) return false;
  let soma = 0;
  for (let i = 0; i < 128; i++) soma = (soma + bytes[i]) & 0xff;
  return soma === 0;
}

function lerDescritorDeTemporizacao(b: Uint8Array, o: number): ModoNativo | null {
  const pixelClock = b[o] | (b[o + 1] << 8);
  if (pixelClock === 0) return null; // é um descritor de texto/limites, não de temporização
  const larguraPx = b[o + 2] | ((b[o + 4] & 0xf0) << 4);
  const alturaPx = b[o + 5] | ((b[o + 7] & 0xf0) << 4);
  const larguraMm = b[o + 12] | ((b[o + 14] & 0xf0) << 4);
  const alturaMm = b[o + 13] | ((b[o + 14] & 0x0f) << 8);
  if (larguraPx === 0 || alturaPx === 0) return null;
  return { larguraPx, alturaPx, larguraMm, alturaMm };
}

function lerNome(b: Uint8Array): string | null {
  for (const o of [54, 72, 90, 108]) {
    if (b[o] === 0 && b[o + 1] === 0 && b[o + 2] === 0 && b[o + 3] === 0xfc) {
      let s = '';
      for (let i = o + 5; i < o + 18; i++) {
        if (b[i] === 0x0a || b[i] === 0x00) break;
        s += String.fromCharCode(b[i]);
      }
      const nome = s.trim();
      return nome || null;
    }
  }
  return null;
}

/**
 * Decodifica o bloco base (128 bytes) de um EDID. `null` se o cabeçalho ou o
 * checksum não conferem — EDID corrompido não é fonte de medida.
 */
export function lerEdid(bytes: Uint8Array | null | undefined): EdidInfo | null {
  if (!bytes || bytes.length < 128) return null;
  for (let i = 0; i < 8; i++) if (bytes[i] !== EDID_CABECALHO[i]) return null;
  if (!checksumValido(bytes)) return null;

  const id = (bytes[8] << 8) | bytes[9];
  const letra = (n: number) => String.fromCharCode(64 + (n & 0x1f));
  const fabricante = letra(id >> 10) + letra(id >> 5) + letra(id);
  const codigoProduto = bytes[10] | (bytes[11] << 8);
  const hCm = bytes[21];
  const vCm = bytes[22];

  return {
    fabricante,
    codigoProduto,
    versao: `${bytes[18]}.${bytes[19]}`,
    nome: lerNome(bytes),
    tamanhoCm: hCm > 0 && vCm > 0 ? { larguraCm: hCm, alturaCm: vCm } : null,
    modoNativo: lerDescritorDeTemporizacao(bytes, 54),
  };
}

function proporcaoConfere(w: number, h: number, pxW: number | undefined, pxH: number | undefined, tol: number): boolean {
  if (!pxW || !pxH) return true; // sem modo nativo não há contra o que conferir
  const fisica = w / h;
  const pixels = pxW / pxH;
  return Math.abs(fisica - pixels) / pixels <= tol;
}

/**
 * O tamanho físico que um EDID sustenta, ou `null` se ele não sustenta nenhum
 * com segurança.
 *
 * Duas fontes dentro do mesmo EDID:
 *   1. Detailed Timing Descriptor (bytes 54+12..14), em MILÍMETROS — a mais
 *      precisa, preferida;
 *   2. bytes 21–22, em CENTÍMETROS inteiros.
 *
 * Filtros (cada um corresponde a um EDID ruim que existe de verdade):
 *   - zero em qualquer dimensão (projetores; EDID 1.4 que guarda só proporção);
 *   - "16 × 9 mm" / "16 × 10 cm" (a proporção gravada no lugar do tamanho);
 *   - mais de 3 m;
 *   - proporção física que não bate com a proporção em pixels do modo nativo;
 *   - as duas fontes discordando em mais de 15 % na diagonal → nenhuma.
 */
export function tamanhoFisicoDoEdid(info: EdidInfo | null): TamanhoDoPainel | null {
  if (!info) return null;
  const px = info.modoNativo;
  const pxW = px?.larguraPx;
  const pxH = px?.alturaPx;

  let doDtd: { w: number; h: number } | null = null;
  if (px && px.larguraMm > 0 && px.alturaMm > 0) {
    const { larguraMm: w, alturaMm: h } = px;
    if (w >= MIN_LARGURA_MM && h >= MIN_ALTURA_MM && w <= MAX_MM && h <= MAX_MM && proporcaoConfere(w, h, pxW, pxH, TOL_PROPORCAO_MM)) {
      doDtd = { w: w / 10, h: h / 10 };
    }
  }

  let doCm: { w: number; h: number } | null = null;
  if (info.tamanhoCm) {
    const { larguraCm: w, alturaCm: h } = info.tamanhoCm;
    if (w * 10 >= MIN_LARGURA_MM && h * 10 >= MIN_ALTURA_MM && w * 10 <= MAX_MM && h * 10 <= MAX_MM && proporcaoConfere(w, h, pxW, pxH, TOL_PROPORCAO_CM)) {
      doCm = { w, h };
    }
  }

  let escolhido: { w: number; h: number; fonte: 'edid-dtd' | 'edid-cm' } | null = null;
  if (doDtd && doCm) {
    const dDtd = Math.hypot(doDtd.w, doDtd.h);
    const dCm = Math.hypot(doCm.w, doCm.h);
    if (Math.abs(dDtd - dCm) / Math.max(dDtd, dCm) > TOL_CONCORDANCIA) return null;
    escolhido = { ...doDtd, fonte: 'edid-dtd' };
  } else if (doDtd) {
    escolhido = { ...doDtd, fonte: 'edid-dtd' };
  } else if (doCm) {
    escolhido = { ...doCm, fonte: 'edid-cm' };
  }
  if (!escolhido) return null;

  return {
    widthCm: escolhido.w,
    heightCm: escolhido.h,
    fonte: escolhido.fonte,
    ...(pxW && pxH ? { larguraPx: pxW, alturaPx: pxH } : {}),
    ...(info.nome ? { nome: info.nome } : {}),
    modelo: `${info.fabricante}${info.codigoProduto.toString(16).toUpperCase().padStart(4, '0')}`,
  };
}

// ---------------------------------------------------------------------------
// Saídas de ferramentas do SO → blobs de EDID
// ---------------------------------------------------------------------------

export interface EdidDoRegistro {
  /** Instância PnP, ex.: `DISPLAY\DELA0F4\5&2d1a4e0&0&UID4352`. */
  instancia: string;
  bytes: Uint8Array;
}

/**
 * Interpreta a saída de
 *   reg query "HKLM\SYSTEM\CurrentControlSet\Enum\DISPLAY" /s /v EDID
 *
 * Linhas `HKEY_LOCAL_MACHINE\...\Enum\DISPLAY\<modelo>\<inst>\Device Parameters`
 * seguidas de `    EDID    REG_BINARY    00FFFFFFFFFFFF00...`. O rodapé
 * ("End of search" / "Fim da pesquisa") é localizado e simplesmente ignorado.
 */
export function lerEdidsDoRegQuery(saida: string): EdidDoRegistro[] {
  const out: EdidDoRegistro[] = [];
  let instancia: string | null = null;
  for (const linhaCrua of saida.split(/\r?\n/)) {
    const linha = linhaCrua.trimEnd();
    if (/^HKEY_/i.test(linha)) {
      const m = /\\Enum\\(DISPLAY\\[^\\]+\\[^\\]+)\\Device Parameters$/i.exec(linha);
      instancia = m ? m[1] : null;
      continue;
    }
    const v = /^\s+EDID\s+REG_BINARY\s+([0-9A-Fa-f]+)\s*$/.exec(linha);
    if (v && instancia) {
      const bytes = hexParaBytes(v[1]);
      if (bytes) out.push({ instancia, bytes });
    }
  }
  return out;
}

/**
 * Interpreta a saída de
 *   reg query "HKLM\SYSTEM\CurrentControlSet\Services\monitor\Enum"
 * — a lista dos monitores PRESENTES agora (`0  REG_SZ  DISPLAY\...`).
 */
export function lerMonitoresAtivosDoRegQuery(saida: string): string[] {
  const out: string[] = [];
  for (const linha of saida.split(/\r?\n/)) {
    const m = /^\s+\d+\s+REG_SZ\s+(DISPLAY\\\S.*?)\s*$/i.exec(linha);
    if (m) out.push(m[1]);
  }
  return out;
}

/**
 * Filtra os EDIDs do registro pelos monitores ativos (comparação sem caixa).
 * Lista de ativos vazia = não se sabe quais estão presentes: devolve tudo e
 * `confirmados = false`, para a seleção ser mais exigente.
 */
export function filtrarAtivos(edids: readonly EdidDoRegistro[], ativos: readonly string[]): { edids: EdidDoRegistro[]; confirmados: boolean } {
  if (ativos.length === 0) return { edids: [...edids], confirmados: false };
  const set = new Set(ativos.map((a) => a.toUpperCase()));
  return { edids: edids.filter((e) => set.has(e.instancia.toUpperCase())), confirmados: true };
}

/** Todos os blobs de EDID (`<00ffffffffffff00…>`) na saída do `ioreg -lw0` do macOS. */
export function lerEdidsDoIoreg(saida: string): Uint8Array[] {
  const out: Uint8Array[] = [];
  const vistos = new Set<string>();
  const re = /<(00ffffffffffff00[0-9a-f]{240,}?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(saida)) !== null) {
    const hex = m[1].toLowerCase();
    // O mesmo EDID aparece em vários nós (IODisplayEDID, …Original): um só.
    const chave = hex.slice(0, 256);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const b = hexParaBytes(hex);
    if (b) out.push(b);
  }
  return out;
}

/**
 * Saída do JXA que lê `CGDisplayScreenSize` (mm) da tela principal no macOS,
 * no formato `"<largura>x<altura>"`. Números implausíveis viram `null`.
 */
export function lerTamanhoDoCoreGraphics(saida: string): TamanhoDoPainel | null {
  const m = /^\s*(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\s*$/.exec(saida);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!(w >= MIN_LARGURA_MM && h >= MIN_ALTURA_MM && w <= MAX_MM && h <= MAX_MM)) return null;
  return { widthCm: w / 10, heightCm: h / 10, fonte: 'coregraphics' };
}

/** Linhas cruas do WMI (`MaxHorizontalImageSize`/`MaxVerticalImageSize`, cm). */
export function lerSaidaDoWmi(stdout: string): TamanhoDoPainel[] {
  if (!stdout.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const out: TamanhoDoPainel[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const w = o.MaxHorizontalImageSize;
    const h = o.MaxVerticalImageSize;
    if (typeof w !== 'number' || typeof h !== 'number') continue;
    if (w * 10 < MIN_LARGURA_MM || h * 10 < MIN_ALTURA_MM || w * 10 > MAX_MM || h * 10 > MAX_MM) continue;
    out.push({ widthCm: w, heightCm: h, fonte: 'wmi' });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Seleção: quais painéis devolver para a tela em uso
// ---------------------------------------------------------------------------

export interface TelaEmUso {
  /** Resolução FÍSICA (px × fator de escala), como o EDID a declara. */
  larguraPx: number;
  alturaPx: number;
}

/** Remove duplicatas (mesmo modelo e mesmo tamanho, comum no registro). */
export function semDuplicatas(paineis: readonly TamanhoDoPainel[]): TamanhoDoPainel[] {
  const vistos = new Set<string>();
  const out: TamanhoDoPainel[] = [];
  for (const p of paineis) {
    const chave = `${p.modelo ?? ''}|${p.widthCm.toFixed(1)}|${p.heightCm.toFixed(1)}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push(p);
  }
  return out;
}

/** Gira o painel para a orientação da tela (monitor em pé). */
function orientar(p: TamanhoDoPainel, tela: TelaEmUso | null): TamanhoDoPainel {
  if (!tela) return p;
  const telaEmPe = tela.alturaPx > tela.larguraPx;
  const painelEmPe = p.heightCm > p.widthCm;
  if (telaEmPe === painelEmPe) return p;
  return {
    ...p,
    widthCm: p.heightCm,
    heightCm: p.widthCm,
    ...(p.larguraPx && p.alturaPx ? { larguraPx: p.alturaPx, alturaPx: p.larguraPx } : {}),
  };
}

function mesmaResolucao(p: TamanhoDoPainel, tela: TelaEmUso): boolean {
  if (!p.larguraPx || !p.alturaPx) return false;
  return (
    (p.larguraPx === tela.larguraPx && p.alturaPx === tela.alturaPx) ||
    (p.larguraPx === tela.alturaPx && p.alturaPx === tela.larguraPx)
  );
}

/**
 * Decide o que a IPC `irisflow:monitor-sizes` devolve.
 *
 *   - Um painel cuja resolução nativa é EXATAMENTE a da tela principal →
 *     só ele (o registro do Windows lembra monitores antigos; a resolução
 *     casa o painel certo mesmo quando a lista de ativos falha).
 *   - Sem casamento exato: se a lista vem de monitores sabidamente presentes
 *     (`confirmados`), devolve todos e deixa `pickPanelForDisplay` (frontend)
 *     desambiguar pela proporção; se não, devolve VAZIO — um monitor de
 *     2019 que não está mais na mesa não pode virar a diagonal de hoje.
 */
export function selecionarPaineis(
  paineis: readonly TamanhoDoPainel[],
  tela: TelaEmUso | null,
  confirmados: boolean,
): TamanhoDoPainel[] {
  const unicos = semDuplicatas(paineis);
  if (unicos.length === 0) return [];
  if (tela && tela.larguraPx > 0 && tela.alturaPx > 0) {
    const exatos = unicos.filter((p) => mesmaResolucao(p, tela));
    if (exatos.length > 0) return exatos.map((p) => orientar(p, tela));
  }
  return confirmados ? unicos.map((p) => orientar(p, tela)) : [];
}

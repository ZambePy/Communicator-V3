import { describe, it, expect } from 'vitest';
import {
  checksumValido,
  filtrarAtivos,
  hexParaBytes,
  lerEdid,
  lerEdidsDoIoreg,
  lerEdidsDoRegQuery,
  lerMonitoresAtivosDoRegQuery,
  lerSaidaDoWmi,
  lerTamanhoDoCoreGraphics,
  selecionarPaineis,
  tamanhoFisicoDoEdid,
  type TamanhoDoPainel,
} from './displayGeometryEdid';
import { computeDisplayGeometry } from './displayGeometry';

// ---------------------------------------------------------------------------
// Fixtures: EDIDs 1.3/1.4 de 128 bytes montados byte a byte, com checksum.
// Os campos seguem a especificação VESA E-EDID; os valores imitam monitores
// reais (Dell 23,8" 1920×1080, painel AUO de notebook 15,6", ultrawide LG,
// projetor Epson que zera o tamanho).
// ---------------------------------------------------------------------------

interface Spec {
  fabricante: string;
  produto: number;
  versao?: [number, number];
  cm: [number, number];
  /** Modo nativo e tamanho da imagem em mm (DTD). `mm` pode ser [0, 0]. */
  dtd?: { px: [number, number]; mm: [number, number] };
  nome?: string;
}

function montarEdid(s: Spec): Uint8Array {
  const b = new Uint8Array(128);
  b.set([0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00], 0);
  const [l1, l2, l3] = s.fabricante.split('').map((c) => c.charCodeAt(0) - 64);
  const id = (l1 << 10) | (l2 << 5) | l3;
  b[8] = id >> 8;
  b[9] = id & 0xff;
  b[10] = s.produto & 0xff;
  b[11] = s.produto >> 8;
  b[12] = 0x4c; b[13] = 0x33; b[14] = 0x31; b[15] = 0x30; // serial
  b[16] = 12; b[17] = 2019 - 1990;                        // semana/ano
  b[18] = s.versao?.[0] ?? 1; b[19] = s.versao?.[1] ?? 4;
  b[20] = 0xa5;                                           // digital, 8 bpc, DisplayPort
  b[21] = s.cm[0]; b[22] = s.cm[1];
  b[23] = 0x78;                                           // gama 2,2
  b[24] = 0x3a;                                           // recursos (modo preferido = DTD 1)
  // bytes 25–34 cromaticidade, 35–37 temporizações estabelecidas, 38–53 padrão
  b.set([0xee, 0x91, 0xa3, 0x54, 0x4c, 0x99, 0x26, 0x0f, 0x50, 0x54], 25);
  b.set([0xa5, 0x4b, 0x00], 35);
  for (let i = 38; i < 54; i += 2) { b[i] = 0x01; b[i + 1] = 0x01; }

  // Descritor 1 (54): temporização detalhada — ou vazio.
  if (s.dtd) {
    const [w, h] = s.dtd.px;
    const [wmm, hmm] = s.dtd.mm;
    const hBlank = 280, vBlank = 45;
    const o = 54;
    b[o] = 0x3a; b[o + 1] = 0x02;              // 148,5 MHz (14850 × 10 kHz)
    b[o + 2] = w & 0xff; b[o + 3] = hBlank & 0xff; b[o + 4] = ((w >> 8) << 4) | (hBlank >> 8);
    b[o + 5] = h & 0xff; b[o + 6] = vBlank & 0xff; b[o + 7] = ((h >> 8) << 4) | (vBlank >> 8);
    b[o + 8] = 88; b[o + 9] = 44; b[o + 10] = 0x45; b[o + 11] = 0x00;
    b[o + 12] = wmm & 0xff; b[o + 13] = hmm & 0xff; b[o + 14] = ((wmm >> 8) << 4) | (hmm >> 8);
    b[o + 15] = 0; b[o + 16] = 0; b[o + 17] = 0x1e;
  } else {
    b.set([0, 0, 0, 0x10], 54); // descritor "dummy"
  }
  // Descritor 2 (72): nome do monitor (0xFC).
  b.set([0, 0, 0, 0xfc, 0], 72);
  const nome = (s.nome ?? '').slice(0, 13);
  for (let i = 0; i < 13; i++) b[77 + i] = i < nome.length ? nome.charCodeAt(i) : i === nome.length ? 0x0a : 0x20;
  // Descritor 3 (90): limites de faixa (0xFD); 4 (108): dummy.
  b.set([0, 0, 0, 0xfd, 0, 0x38, 0x4c, 0x1e, 0x53, 0x11, 0x00, 0x0a, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20], 90);
  b.set([0, 0, 0, 0x10], 108);
  b[126] = 0; // sem extensões
  let soma = 0;
  for (let i = 0; i < 127; i++) soma = (soma + b[i]) & 0xff;
  b[127] = (256 - soma) & 0xff;
  return b;
}

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

const DELL_24 = montarEdid({ fabricante: 'DEL', produto: 0xa0f4, cm: [53, 30], dtd: { px: [1920, 1080], mm: [527, 296] }, nome: 'DELL P2419H' });
const NOTEBOOK_156 = montarEdid({ fabricante: 'AUO', produto: 0x1e8d, cm: [34, 19], dtd: { px: [1920, 1080], mm: [344, 193] } });
const ULTRAWIDE = montarEdid({ fabricante: 'GSM', produto: 0x5b7f, cm: [80, 34], dtd: { px: [3440, 1440], mm: [800, 335] }, nome: 'LG ULTRAWIDE' });
const PROJETOR = montarEdid({ fabricante: 'ENC', produto: 0x0a21, cm: [0, 0], dtd: { px: [1920, 1080], mm: [0, 0] }, nome: 'EPSON PJ' });

describe('lerEdid — bloco base', () => {
  it('fixtures têm checksum válido', () => {
    for (const e of [DELL_24, NOTEBOOK_156, ULTRAWIDE, PROJETOR]) expect(checksumValido(e)).toBe(true);
  });

  it('decodifica fabricante, produto, versão e nome', () => {
    const i = lerEdid(DELL_24)!;
    expect(i.fabricante).toBe('DEL');
    expect(i.codigoProduto).toBe(0xa0f4);
    expect(i.versao).toBe('1.4');
    expect(i.nome).toBe('DELL P2419H');
  });

  it('lê os bytes 21–22 em cm e o DTD em mm, com os 4 bits altos', () => {
    const i = lerEdid(ULTRAWIDE)!;
    expect(i.tamanhoCm).toEqual({ larguraCm: 80, alturaCm: 34 });
    // 3440 = 0xD70 e 800 mm = 0x320: exigem o nibble alto dos bytes 4 e 14.
    expect(i.modoNativo).toEqual({ larguraPx: 3440, alturaPx: 1440, larguraMm: 800, alturaMm: 335 });
  });

  it('projetor com tamanho zerado → tamanhoCm null', () => {
    expect(lerEdid(PROJETOR)!.tamanhoCm).toBeNull();
  });

  it('checksum errado → null (EDID corrompido não mede nada)', () => {
    const ruim = DELL_24.slice();
    ruim[21] = 60;
    expect(lerEdid(ruim)).toBeNull();
  });

  it('cabeçalho errado ou curto → null', () => {
    const ruim = DELL_24.slice();
    ruim[0] = 0x01;
    expect(lerEdid(ruim)).toBeNull();
    expect(lerEdid(DELL_24.slice(0, 100))).toBeNull();
    expect(lerEdid(null)).toBeNull();
  });

  it('aceita EDID de 256 bytes (com bloco de extensão)', () => {
    const b = new Uint8Array(256);
    b.set(DELL_24, 0);
    b[128] = 0x02; // CTA-861
    expect(lerEdid(b)?.fabricante).toBe('DEL');
  });
});

describe('tamanhoFisicoDoEdid — escolha e filtros', () => {
  it('prefere o DTD em mm (mais preciso que os cm inteiros)', () => {
    const t = tamanhoFisicoDoEdid(lerEdid(DELL_24))!;
    expect(t.fonte).toBe('edid-dtd');
    expect(t.widthCm).toBeCloseTo(52.7, 5);
    expect(t.heightCm).toBeCloseTo(29.6, 5);
    expect(computeDisplayGeometry(t)!.diagonalIn).toBeCloseTo(23.8, 1);
    expect(t.larguraPx).toBe(1920);
    expect(t.modelo).toBe('DELA0F4');
  });

  it('notebook 15,6" pelo DTD', () => {
    const t = tamanhoFisicoDoEdid(lerEdid(NOTEBOOK_156))!;
    expect(computeDisplayGeometry(t)!.diagonalIn).toBeCloseTo(15.5, 1);
  });

  it('projetor (0 × 0 nas duas fontes) → null', () => {
    expect(tamanhoFisicoDoEdid(lerEdid(PROJETOR))).toBeNull();
  });

  it('DTD com a PROPORÇÃO no lugar do tamanho (16 × 9 mm) cai para os cm', () => {
    const e = montarEdid({ fabricante: 'SAM', produto: 0x0f00, cm: [52, 29], dtd: { px: [1920, 1080], mm: [16, 9] } });
    const t = tamanhoFisicoDoEdid(lerEdid(e))!;
    expect(t.fonte).toBe('edid-cm');
    expect(t.widthCm).toBe(52);
  });

  it('DTD zerado com cm válidos → cm', () => {
    const e = montarEdid({ fabricante: 'HWP', produto: 0x3031, cm: [48, 27], dtd: { px: [1920, 1080], mm: [0, 0] } });
    expect(tamanhoFisicoDoEdid(lerEdid(e))!.fonte).toBe('edid-cm');
  });

  it('EDID 1.4 com só proporção nos bytes 21–22 (um deles 0) e DTD vazio → null', () => {
    const e = montarEdid({ fabricante: 'ACR', produto: 0x0001, cm: [0, 0x4f], dtd: { px: [1920, 1080], mm: [0, 0] } });
    expect(tamanhoFisicoDoEdid(lerEdid(e))).toBeNull();
  });

  it('proporção física que não bate com a resolução → descartada', () => {
    // 1920×1080 (16:9) declarando 40 × 30 cm (4:3): um dos dois mente.
    const e = montarEdid({ fabricante: 'XYZ', produto: 0x0002, cm: [40, 30], dtd: { px: [1920, 1080], mm: [400, 300] } });
    expect(tamanhoFisicoDoEdid(lerEdid(e))).toBeNull();
  });

  it('mais de 3 m → descartado (TV/projetor/lixo)', () => {
    const e = montarEdid({ fabricante: 'TVX', produto: 0x0003, cm: [0, 0], dtd: { px: [1920, 1080], mm: [3200, 1800] } });
    expect(tamanhoFisicoDoEdid(lerEdid(e))).toBeNull();
  });

  it('as duas fontes discordando muito → null (na dúvida, nada)', () => {
    // DTD diz 23,8", os cm dizem 32": não há como saber qual está certo.
    const e = montarEdid({ fabricante: 'BNQ', produto: 0x0004, cm: [71, 40], dtd: { px: [1920, 1080], mm: [527, 296] } });
    expect(tamanhoFisicoDoEdid(lerEdid(e))).toBeNull();
  });

  it('sem DTD de temporização, usa os cm sem conferir proporção', () => {
    const e = montarEdid({ fabricante: 'OLD', produto: 0x0005, versao: [1, 3], cm: [34, 27] });
    const t = tamanhoFisicoDoEdid(lerEdid(e))!;
    expect(t.fonte).toBe('edid-cm');
    expect(t.larguraPx).toBeUndefined();
  });
});

describe('saída do reg.exe (Windows)', () => {
  const REG_EDIDS = [
    '',
    `HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\DELA0F4\\5&2d1a4e0&0&UID4352\\Device Parameters`,
    `    EDID    REG_BINARY    ${hex(DELL_24)}`,
    '',
    `HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\AUO1E8D\\4&1b4b5a5a&0&UID265988\\Device Parameters`,
    `    EDID    REG_BINARY    ${hex(NOTEBOOK_156)}`,
    '',
    `HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Enum\\DISPLAY\\ENC0A21\\5&aa&0&UID1\\Device Parameters`,
    `    EDID    REG_BINARY    ${hex(PROJETOR)}`,
    '',
    'Fim da pesquisa: 3 correspondência(s) encontrada(s).',
  ].join('\r\n');

  const REG_ATIVOS = [
    '',
    'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\monitor\\Enum',
    '    0    REG_SZ    DISPLAY\\DELA0F4\\5&2d1a4e0&0&UID4352',
    '    Count    REG_DWORD    0x1',
    '    NextInstance    REG_DWORD    0x1',
    '',
  ].join('\r\n');

  it('extrai instância e bytes de cada EDID', () => {
    const r = lerEdidsDoRegQuery(REG_EDIDS);
    expect(r.map((e) => e.instancia)).toEqual([
      'DISPLAY\\DELA0F4\\5&2d1a4e0&0&UID4352',
      'DISPLAY\\AUO1E8D\\4&1b4b5a5a&0&UID265988',
      'DISPLAY\\ENC0A21\\5&aa&0&UID1',
    ]);
    expect(r[0].bytes).toEqual(DELL_24);
  });

  it('extrai a lista de monitores presentes', () => {
    expect(lerMonitoresAtivosDoRegQuery(REG_ATIVOS)).toEqual(['DISPLAY\\DELA0F4\\5&2d1a4e0&0&UID4352']);
  });

  it('filtra pelos presentes (sem caixa) e marca como confirmado', () => {
    const r = filtrarAtivos(lerEdidsDoRegQuery(REG_EDIDS), ['display\\dela0f4\\5&2D1A4E0&0&uid4352']);
    expect(r.confirmados).toBe(true);
    expect(r.edids).toHaveLength(1);
  });

  it('sem lista de presentes: tudo, mas NÃO confirmado', () => {
    const r = filtrarAtivos(lerEdidsDoRegQuery(REG_EDIDS), []);
    expect(r.confirmados).toBe(false);
    expect(r.edids).toHaveLength(3);
  });

  it('saída vazia ou lixo não explode', () => {
    expect(lerEdidsDoRegQuery('')).toEqual([]);
    expect(lerEdidsDoRegQuery('ERRO: O sistema não pôde localizar a chave')).toEqual([]);
    expect(lerMonitoresAtivosDoRegQuery('')).toEqual([]);
  });
});

describe('ioreg (macOS) e CoreGraphics', () => {
  it('acha os blobs de EDID e elimina repetidos', () => {
    const h = hex(ULTRAWIDE).toLowerCase();
    const saida = `  | "IODisplayEDID" = <${h}>\n  | "IODisplayEDIDOriginal" = <${h}>\n  | "Outro" = <00ff>\n`;
    const r = lerEdidsDoIoreg(saida);
    expect(r).toHaveLength(1);
    expect(lerEdid(r[0])!.fabricante).toBe('GSM');
  });

  it('CGDisplayScreenSize em mm → cm; lixo → null', () => {
    expect(lerTamanhoDoCoreGraphics('344.2x193.5\n')).toMatchObject({ widthCm: 34.42, heightCm: 19.35, fonte: 'coregraphics' });
    expect(lerTamanhoDoCoreGraphics('0x0')).toBeNull();
    expect(lerTamanhoDoCoreGraphics('erro')).toBeNull();
  });
});

describe('WMI (fonte antiga, mantida)', () => {
  it('um ou vários monitores; zerados são descartados', () => {
    expect(lerSaidaDoWmi('{"MaxHorizontalImageSize":52,"MaxVerticalImageSize":29}')).toHaveLength(1);
    expect(lerSaidaDoWmi('[{"MaxHorizontalImageSize":52,"MaxVerticalImageSize":29},{"MaxHorizontalImageSize":0,"MaxVerticalImageSize":0}]')).toHaveLength(1);
    expect(lerSaidaDoWmi('')).toEqual([]);
    expect(lerSaidaDoWmi('Get-CimInstance : Acesso negado')).toEqual([]);
  });
});

describe('selecionarPaineis — qual painel é a tela em uso', () => {
  const dell = tamanhoFisicoDoEdid(lerEdid(DELL_24))!;
  const note = tamanhoFisicoDoEdid(lerEdid(NOTEBOOK_156))!;
  const uw = tamanhoFisicoDoEdid(lerEdid(ULTRAWIDE))!;

  it('casamento EXATO de resolução escolhe o painel mesmo sem lista de presentes', () => {
    const r = selecionarPaineis([dell, uw], { larguraPx: 3440, alturaPx: 1440 }, false);
    expect(r).toHaveLength(1);
    expect(r[0].modelo).toBe(uw.modelo);
  });

  it('dois painéis com a mesma resolução: devolve os dois (o frontend admite a ambiguidade)', () => {
    const r = selecionarPaineis([dell, note], { larguraPx: 1920, alturaPx: 1080 }, true);
    expect(r).toHaveLength(2);
  });

  it('sem casamento e SEM confirmação de presença → vazio (monitor antigo do registro)', () => {
    expect(selecionarPaineis([dell], { larguraPx: 2560, alturaPx: 1440 }, false)).toEqual([]);
  });

  it('sem casamento mas com presença confirmada → todos', () => {
    expect(selecionarPaineis([dell], { larguraPx: 1600, alturaPx: 900 }, true)).toHaveLength(1);
  });

  it('monitor em pé: largura e altura trocadas para a orientação da tela', () => {
    const r = selecionarPaineis([dell], { larguraPx: 1080, alturaPx: 1920 }, false);
    expect(r[0].widthCm).toBeCloseTo(29.6, 5);
    expect(r[0].heightCm).toBeCloseTo(52.7, 5);
    expect(r[0].larguraPx).toBe(1080);
  });

  it('duplicatas do registro (mesmo modelo e tamanho) viram uma só', () => {
    expect(selecionarPaineis([dell, { ...dell }], null, true)).toHaveLength(1);
  });

  it('WMI (sem resolução) com presença confirmada passa', () => {
    const wmi: TamanhoDoPainel = { widthCm: 52, heightCm: 29, fonte: 'wmi' };
    expect(selecionarPaineis([wmi], { larguraPx: 1920, alturaPx: 1080 }, true)).toEqual([wmi]);
  });

  it('lista vazia → vazia', () => {
    expect(selecionarPaineis([], { larguraPx: 1920, alturaPx: 1080 }, true)).toEqual([]);
  });
});

describe('hexParaBytes', () => {
  it('aceita espaços e vírgulas; recusa ímpar e não-hex', () => {
    expect(hexParaBytes('00 ff,10')).toEqual(new Uint8Array([0, 255, 16]));
    expect(hexParaBytes('abc')).toBeNull();
    expect(hexParaBytes('zz')).toBeNull();
    expect(hexParaBytes('')).toBeNull();
  });
});

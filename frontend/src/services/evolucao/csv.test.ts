import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agregarPorSemana } from './agregar';
import { CABECALHO_DO_CSV, baixarCsv, escaparCelula, evolucaoEmCsv, nomeDoArquivoCsv } from './csv';
import type { DiaDeUso } from './registroDeUso';

// O CSV é para abrir no Excel em português do Brasil e levar à consulta:
// separador ";" (a vírgula é o decimal), BOM para os acentos, quebras CRLF.

const AGORA = Date.parse('2026-10-21T15:00:00Z');

const dia = (data: string, extra: Partial<DiaDeUso>): DiaDeUso => ({
  dia: data,
  minutosUteis: 0,
  ultimoMinuto: 0,
  caracteres: 0,
  msDigitando: 0,
  desfazer: 0,
  avisosDeFadiga: 0,
  dwellSomaMs: 0,
  dwellAmostras: 0,
  ...extra,
});

const evolucao = () =>
  agregarPorSemana({
    calibracoes: [
      { errorDeg: 1.25, timestamp: '2026-10-07T15:00:00Z' },
      { errorDeg: 1.5, timestamp: '2026-10-08T15:00:00Z' },
    ],
    uso: [
      dia('2026-10-14', { minutosUteis: 120, caracteres: 100, msDigitando: 300_000, dwellSomaMs: 3000, dwellAmostras: 2, avisosDeFadiga: 3, desfazer: 9 }),
      dia('2026-10-20', { minutosUteis: 10 }),
    ],
    agora: AGORA,
  });

const linhas = (csv: string) => csv.replace(/^\uFEFF/, '').split('\r\n').filter((l) => l !== '');
const celulas = (linha: string) => linha.split(';');

describe('evolucaoEmCsv', () => {
  it('começa com BOM (acentos certos no Excel) e usa quebras CRLF, terminando em uma', () => {
    const csv = evolucaoEmCsv(evolucao());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toMatch(/\r\n$/);
    expect(csv.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('o cabeçalho diz o que cada coluna é, com a unidade', () => {
    const [cabecalho] = linhas(evolucaoEmCsv(evolucao()));
    expect(celulas(cabecalho)).toEqual([...CABECALHO_DO_CSV]);
    expect(CABECALHO_DO_CSV).toContain('Erro médio da calibração (graus)');
    expect(CABECALHO_DO_CSV).toContain('Minutos úteis');
    expect(CABECALHO_DO_CSV).toContain('Caracteres por minuto');
    expect(CABECALHO_DO_CSV).toContain('Avisos de fadiga');
    expect(CABECALHO_DO_CSV).toContain('Desfazer');
  });

  it('uma linha por semana, todas com o mesmo número de colunas do cabeçalho', () => {
    const l = linhas(evolucaoEmCsv(evolucao()));
    // cabeçalho + 05/10, 12/10 e 19/10
    expect(l).toHaveLength(4);
    for (const x of l) expect(celulas(x)).toHaveLength(CABECALHO_DO_CSV.length);
  });

  it('datas dd/mm/aaaa, decimais com vírgula e a situação da semana', () => {
    const l = linhas(evolucaoEmCsv(evolucao()));
    const col = (nome: (typeof CABECALHO_DO_CSV)[number]) => CABECALHO_DO_CSV.indexOf(nome);

    const semana05 = celulas(l[1]);
    expect(semana05[col('Semana (segunda)')]).toBe('05/10/2026');
    expect(semana05[col('Semana (domingo)')]).toBe('11/10/2026');
    expect(semana05[col('Situação')]).toBe('completa');
    expect(semana05[col('Medições de calibração')]).toBe('2');
    expect(semana05[col('Erro médio da calibração (graus)')]).toBe('1,38'); // (1,25 + 1,5) / 2 = 1,375

    const semana12 = celulas(l[2]);
    expect(semana12[col('Minutos úteis')]).toBe('120');
    expect(semana12[col('Dias com uso')]).toBe('1');
    expect(semana12[col('Dwell em uso (ms)')]).toBe('1500');
    expect(semana12[col('Caracteres por minuto')]).toBe('20,0');
    expect(semana12[col('Avisos de fadiga por hora de uso')]).toBe('1,50');
    expect(semana12[col('Desfazer por hora de uso')]).toBe('4,50');

    const atual = celulas(l[3]);
    expect(atual[col('Semana (segunda)')]).toBe('19/10/2026');
    expect(atual[col('Situação')]).toBe('em andamento');
  });

  it('sem número, a célula fica vazia — nunca "NaN", "null" nem zero inventado', () => {
    const l = linhas(evolucaoEmCsv(evolucao()));
    const col = (nome: (typeof CABECALHO_DO_CSV)[number]) => CABECALHO_DO_CSV.indexOf(nome);
    const semana05 = celulas(l[1]);
    // Semana de 05/10 não tem registro de uso.
    expect(semana05[col('Dwell em uso (ms)')]).toBe('');
    expect(semana05[col('Caracteres por minuto')]).toBe('');
    expect(semana05[col('Avisos de fadiga por hora de uso')]).toBe('');
    expect(evolucaoEmCsv(evolucao())).not.toMatch(/NaN|null|undefined|Infinity/);
  });

  it('nenhuma vírgula separa colunas, e os decimais não usam ponto', () => {
    const corpo = linhas(evolucaoEmCsv(evolucao())).slice(1).join('\r\n');
    expect(corpo).not.toMatch(/\d\.\d/);
  });

  it('sem semanas, só o cabeçalho', () => {
    const vazio = agregarPorSemana({ calibracoes: [], uso: [], agora: AGORA });
    expect(linhas(evolucaoEmCsv(vazio))).toHaveLength(1);
  });

  it('não exporta texto livre — nada do que a pessoa escreveu ou disse vai na planilha', () => {
    // Só datas, números, a situação da semana ou vazio: frases e relatos de dor
    // ficam no aparelho.
    const corpo = linhas(evolucaoEmCsv(evolucao())).slice(1);
    for (const linha of corpo) {
      for (const c of celulas(linha)) expect(c, c).toMatch(/^(\d{2}\/\d{2}\/\d{4}|\d+(,\d+)?|completa|em andamento|)$/);
    }
  });

  it('sem registro de uso na semana, as colunas de uso ficam vazias — não é "zero minutos"', () => {
    const col = (nome: (typeof CABECALHO_DO_CSV)[number]) => CABECALHO_DO_CSV.indexOf(nome);
    const semana05 = celulas(linhas(evolucaoEmCsv(evolucao()))[1]);
    for (const nome of ['Dias com uso', 'Minutos úteis', 'Caracteres', 'Avisos de fadiga', 'Desfazer'] as const) {
      expect(semana05[col(nome)], nome).toBe('');
    }
  });
});

describe('escaparCelula', () => {
  it('texto simples passa; ponto e vírgula, aspas e quebra de linha pedem aspas', () => {
    expect(escaparCelula('abc')).toBe('abc');
    expect(escaparCelula('a;b')).toBe('"a;b"');
    expect(escaparCelula('diz "oi"')).toBe('"diz ""oi"""');
    expect(escaparCelula('linha\nnova')).toBe('"linha\nnova"');
  });

  it('célula que começa como fórmula é neutralizada (a planilha não executa o que a pessoa escreveu)', () => {
    for (const perigoso of ['=1+1', '+SOMA(A1)', '@x', '-2+3', '\t=1']) {
      expect(escaparCelula(perigoso).replace(/^"/, '')).toMatch(/^'/);
    }
  });
});

describe('nomeDoArquivoCsv', () => {
  it('leva a data de Brasília: 23h30 de quarta ainda é quarta', () => {
    expect(nomeDoArquivoCsv(Date.parse('2026-10-22T02:30:00Z'))).toBe('irisflow-evolucao-2026-10-21.csv');
    expect(nomeDoArquivoCsv(Date.parse('2026-10-22T03:00:00Z'))).toBe('irisflow-evolucao-2026-10-22.csv');
  });

  it('data inválida não vira "null" no nome', () => {
    expect(nomeDoArquivoCsv(Number.NaN)).toBe('irisflow-evolucao.csv');
  });
});

describe('baixarCsv', () => {
  const criar = vi.fn((blob: Blob) => {
    void blob;
    return 'blob:teste';
  });
  const revogar = vi.fn();
  let baixado: { nome: string; href: string } | null;

  beforeEach(() => {
    vi.useFakeTimers();
    baixado = null;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: criar });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revogar });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      baixado = { nome: this.download, href: this.href };
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    criar.mockClear();
    revogar.mockClear();
  });

  it('baixa um arquivo .csv em UTF-8 com o nome do dia, sem deixar o link na página', () => {
    baixarCsv(evolucao(), AGORA);
    expect(baixado).toEqual({ nome: 'irisflow-evolucao-2026-10-21.csv', href: 'blob:teste' });
    const blob = criar.mock.calls[0][0] as Blob;
    expect(blob.type).toMatch(/^text\/csv/);
    expect(blob.type).toMatch(/utf-8/i);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(blob.size).toBe(new TextEncoder().encode(evolucaoEmCsv(evolucao())).length);
  });

  it('só revoga o endereço depois: revogar na hora corta o download em alguns navegadores', () => {
    baixarCsv(evolucao(), AGORA);
    expect(revogar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(revogar).toHaveBeenCalledWith('blob:teste');
  });
});

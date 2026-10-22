import { describe, expect, it } from 'vitest';
import {
  avaliarAlvos,
  decidirAceitacao,
  escolherAlvosParaRecoletar,
  substituirAmostras,
  FATOR_SOBRE_OS_PARES,
  MAXIMO_DE_ALVOS_POR_RODADA,
  PISO_DA_DISPERSAO_DEG,
  PISO_DO_ERRO_DEG,
  type LotoDoAlvo,
  type MedidaDoAlvo,
} from './recoletaDeAlvos';

// A bancada de referência: 23,6" a 60 cm, 1920×1080 → 38,5 px por grau.
const PX_POR_GRAU = 38.5;
const MINIMO = 15;

/**
 * Uma calibração de 13 pontos de uma sessão BOA: o miolo erra ~80 px fora da
 * amostra, os cantos ~300 px (extrapolação por construção, como no replay de
 * 23/09), todos com tremor parecido e amostras de sobra.
 */
function sessao(alterar: Record<string, Partial<MedidaDoAlvo>> = {}): MedidaDoAlvo[] {
  const grade: [number, number][] = [
    [0.17, 0.05], [0.5, 0.05], [0.83, 0.05],
    [0.17, 0.5], [0.5, 0.5], [0.83, 0.5],
    [0.17, 0.8375], [0.5, 0.8375], [0.83, 0.8375],
  ];
  const cantos: [number, number][] = [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]];
  const base = (x: number, y: number, borda: boolean, i: number): MedidaDoAlvo => ({
    chave: `${x.toFixed(4)},${y.toFixed(4)}`,
    x, y,
    erroLotoPx: (borda ? 300 : 80) + (i % 3) * 7,
    dispersaoPx: 30 + (i % 4) * 3,
    amostras: 45,
    borda,
  });
  const todos = [
    ...grade.map(([x, y], i) => base(x, y, false, i)),
    ...cantos.map(([x, y], i) => base(x, y, true, i)),
  ];
  return todos.map((m) => ({ ...m, ...(alterar[m.chave] ?? {}) }));
}
const CANTO_SUP_ESQ = '0.0500,0.0500';
const CANTO_INF_ESQ = '0.0500,0.9500';
const CANTO_INF_DIR = '0.9500,0.9500';
const CENTRO = '0.5000,0.5000';

const ruins = (m: MedidaDoAlvo[]) =>
  avaliarAlvos(m, PX_POR_GRAU, MINIMO).filter((a) => a.motivos.length > 0).map((a) => a.chave);

describe('quem é ruim (recoleta dos alvos, 19/10/2026)', () => {
  it('sessão boa: nenhum alvo, mesmo com os cantos 4× piores que o miolo', () => {
    // É o caso normal. Os cantos são comparados com os cantos, não com o miolo.
    expect(ruins(sessao())).toEqual([]);
  });

  it('um canto mal coletado (olhar chegou atrasado) é refeito', () => {
    const r = avaliarAlvos(sessao({ [CANTO_SUP_ESQ]: { erroLotoPx: 900 } }), PX_POR_GRAU, MINIMO);
    const canto = r.find((a) => a.chave === CANTO_SUP_ESQ)!;
    expect(canto.motivos).toEqual(['erro']);
    // A referência é a mediana DOS CANTOS (com ele): o canto ruim é o maior de
    // quatro e não puxa a mediana.
    expect(canto.referenciaDoErroPx).toBeLessThan(320);
    expect(canto.severidade).toBeGreaterThan(1);
    expect(ruins(sessao({ [CANTO_SUP_ESQ]: { erroLotoPx: 900 } }))).toEqual([CANTO_SUP_ESQ]);
  });

  it('dois cantos ruins JUNTOS (a pálpebra nos dois de baixo) não disparam: é da geometria, refazer não muda', () => {
    expect(ruins(sessao({ [CANTO_INF_ESQ]: { erroLotoPx: 700 }, [CANTO_INF_DIR]: { erroLotoPx: 720 } }))).toEqual([]);
  });

  it('um canto só um pouco pior que os outros cantos não justifica o tempo do paciente', () => {
    expect(ruins(sessao({ [CANTO_SUP_ESQ]: { erroLotoPx: 300 * (FATOR_SOBRE_OS_PARES - 0.2) } }))).toEqual([]);
  });

  it('um ponto do miolo que vagou (dispersão alta) é refeito pela dispersão', () => {
    const r = avaliarAlvos(sessao({ [CENTRO]: { dispersaoPx: 140 } }), PX_POR_GRAU, MINIMO);
    expect(r.find((a) => a.chave === CENTRO)!.motivos).toEqual(['dispersao']);
  });

  it('com poucas amostras, refaz: a média do ponto é ruído de poucos quadros', () => {
    const r = avaliarAlvos(sessao({ [CENTRO]: { amostras: 6 } }), PX_POR_GRAU, MINIMO);
    expect(r.find((a) => a.chave === CENTRO)!.motivos).toEqual(['poucasAmostras']);
  });

  it('o piso em graus vale: numa sessão excelente, "duas vezes pior" ainda é bom', () => {
    // Tudo a ~10 px; um alvo a 40 px (4×) e com 30 px de tremor (3×) — ambos
    // abaixo dos pisos (2,5° ≈ 96 px; 2,0° ≈ 77 px).
    const excelente = sessao().map((m) => ({ ...m, erroLotoPx: 10, dispersaoPx: 10 }));
    excelente[4] = { ...excelente[4], erroLotoPx: 40, dispersaoPx: 30 };
    expect(ruins(excelente)).toEqual([]);
    const q = avaliarAlvos(excelente, PX_POR_GRAU, MINIMO)[4];
    expect(q.corteDoErroPx).toBeCloseTo(PISO_DO_ERRO_DEG * PX_POR_GRAU, 6);
    expect(q.corteDaDispersaoPx).toBeCloseTo(PISO_DA_DISPERSAO_DEG * PX_POR_GRAU, 6);
  });

  it('medida não finita nunca vira motivo: dobra que falhou não é coleta ruim', () => {
    const r = avaliarAlvos(sessao({ [CENTRO]: { erroLotoPx: Number.NaN, dispersaoPx: Number.NaN } }), PX_POR_GRAU, MINIMO);
    expect(r.find((a) => a.chave === CENTRO)!.motivos).toEqual([]);
  });

  it('converte para graus com a geometria dada', () => {
    const q = avaliarAlvos(sessao(), PX_POR_GRAU, MINIMO)[0];
    expect(q.erroLotoDeg).toBeCloseTo(q.erroLotoPx / PX_POR_GRAU, 9);
    expect(q.dispersaoDeg).toBeCloseTo(q.dispersaoPx / PX_POR_GRAU, 9);
  });

  it('escolhe os piores primeiro, no máximo quatro, e a escolha é determinística', () => {
    const muitos = sessao({
      [CANTO_SUP_ESQ]: { erroLotoPx: 2000 },
      [CENTRO]: { amostras: 2 },
      '0.1700,0.0500': { dispersaoPx: 500 },
      '0.5000,0.0500': { dispersaoPx: 400 },
      '0.8300,0.0500': { dispersaoPx: 300 },
    });
    const a = escolherAlvosParaRecoletar(avaliarAlvos(muitos, PX_POR_GRAU, MINIMO));
    const b = escolherAlvosParaRecoletar(avaliarAlvos(muitos, PX_POR_GRAU, MINIMO));
    expect(a.length).toBe(MAXIMO_DE_ALVOS_POR_RODADA);
    expect(a.map((t) => t.chave)).toEqual(b.map((t) => t.chave));
    for (let i = 1; i < a.length; i++) expect(a[i - 1].severidade).toBeGreaterThanOrEqual(a[i].severidade);
  });
});

describe('substituir, não somar', () => {
  type Amostra = { k: string; id: number };
  const chave = (a: Amostra) => a.k;
  const antes: Amostra[] = [
    ...Array.from({ length: 40 }, (_, i) => ({ k: 'A', id: i })),
    ...Array.from({ length: 40 }, (_, i) => ({ k: 'B', id: 100 + i })),
  ];

  it('as amostras novas tomam o lugar das antigas — o alvo não pesa em dobro', () => {
    const novas = Array.from({ length: 30 }, (_, i) => ({ k: 'B', id: 500 + i }));
    const r = substituirAmostras(antes, novas, chave, new Set(['B']), 15);
    expect(r.substituidas).toEqual(['B']);
    expect(r.perfil.filter((a) => a.k === 'B').map((a) => a.id)).toEqual(novas.map((a) => a.id));
    expect(r.perfil.filter((a) => a.k === 'A')).toHaveLength(40);
  });

  it('uma recoleta que rendeu pouco deixa o alvo com as amostras de antes', () => {
    const r = substituirAmostras(antes, [{ k: 'B', id: 999 }], chave, new Set(['B']), 15);
    expect(r.substituidas).toEqual([]);
    expect(r.mantidas).toEqual(['B']);
    // Nada trocado: os MESMOS objetos, na mesma ordem.
    expect(r.perfil).toEqual(antes);
    r.perfil.forEach((a, i) => expect(a).toBe(antes[i]));
  });

  it('um alvo que já tinha poucas amostras aceita a recoleta com pelo menos tantas', () => {
    const fraco = [...antes.filter((a) => a.k === 'A'), { k: 'C', id: 1 }, { k: 'C', id: 2 }];
    const novas = [{ k: 'C', id: 3 }, { k: 'C', id: 4 }, { k: 'C', id: 5 }];
    const r = substituirAmostras(fraco, novas, chave, new Set(['C']), 15);
    expect(r.substituidas).toEqual(['C']);
    expect(r.perfil.filter((a) => a.k === 'C').map((a) => a.id)).toEqual([3, 4, 5]);
  });

  it('amostra nova de um alvo que não foi pedido não entra', () => {
    const r = substituirAmostras(antes, [{ k: 'A', id: 777 }, ...Array.from({ length: 20 }, (_, i) => ({ k: 'B', id: 600 + i }))], chave, new Set(['B']), 15);
    expect(r.perfil.some((a) => a.id === 777)).toBe(false);
  });
});

describe('a trava de aceitação', () => {
  const loto = (erros: number[], internos = erros.map(() => true)): LotoDoAlvo[] =>
    erros.map((e, i) => ({ chave: `k${i}`, erroPx: e, interno: internos[i] }));

  it('LOTO médio menor: aceita', () => {
    const d = decidirAceitacao(loto([80, 90, 600, 300]), loto([78, 85, 320, 290]));
    expect(d.aceito).toBe(true);
    expect(d.motivo).toBe('melhorou');
    expect(d.looDepoisPx).toBeLessThan(d.looAntesPx);
  });

  it('LOTO médio maior: recusa, mesmo que um alvo tenha melhorado', () => {
    const d = decidirAceitacao(loto([80, 90, 300, 300]), loto([120, 130, 250, 320]));
    expect(d.aceito).toBe(false);
    expect(d.motivo).toBe('piorou');
  });

  it('empate não é piora', () => {
    const d = decidirAceitacao(loto([80, 90, 100]), loto([80, 90, 100]));
    expect(d.aceito).toBe(true);
    expect(d.motivo).toBe('igual');
  });

  it('compara os MESMOS alvos: um alvo que só existe de um lado não entra na média', () => {
    const antes = loto([80, 90, 100]);
    const depois = [...loto([80, 90, 100]), { chave: 'novo', erroPx: 5000, interno: true }];
    expect(decidirAceitacao(antes, depois).aceito).toBe(true);
  });

  it('uma dobra que funcionava e passou a falhar reprova o modelo novo', () => {
    const d = decidirAceitacao(loto([80, 90, 100, 110]), loto([10, 10, Number.NaN, 10]));
    expect(d.aceito).toBe(false);
    expect(d.motivo).toBe('dobra_nova_falhou');
  });

  it('com menos de três alvos comparáveis não há trava que se sustente: recusa', () => {
    expect(decidirAceitacao(loto([80, 90]), loto([10, 10])).aceito).toBe(false);
  });

  it('registra o miolo à parte (não decide, mas vai para o relatório)', () => {
    const d = decidirAceitacao(loto([80, 90, 300], [true, true, false]), loto([70, 80, 200], [true, true, false]));
    expect(d.looInternoAntesPx).toBeCloseTo(85, 9);
    expect(d.looInternoDepoisPx).toBeCloseTo(75, 9);
  });
});

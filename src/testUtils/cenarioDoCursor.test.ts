import { describe, expect, it } from 'vitest';
import { gerarCenarioDoCursor, CENARIO_DO_VIDEO } from './cenarioDoCursor';

// O cenário reproduz o uso real: o olho fixa um ponto, salta para outro, e a
// estimativa chega ruidosa (ruído colorido, ρ ≈ 0,8 entre quadros de câmera) e
// em intervalos irregulares (a thread principal processa cada quadro em
// 24–41 ms e perde alguns). Números do relatório de 25/10/2026 e do vídeo de
// 06/11/2026: ~22–28 amostras/s, desvio de ~30–36 px por eixo; o cenário gera
// ~25 amostras/s.

describe('gerarCenarioDoCursor', () => {
  it('a mesma semente dá o mesmo cenário', () => {
    const a = gerarCenarioDoCursor({ ...CENARIO_DO_VIDEO, semente: 7 });
    const b = gerarCenarioDoCursor({ ...CENARIO_DO_VIDEO, semente: 7 });
    expect(b).toEqual(a);
    const c = gerarCenarioDoCursor({ ...CENARIO_DO_VIDEO, semente: 8 });
    expect(c).not.toEqual(a);
  });

  it('o ruído tem o desvio e a correlação pedidos', () => {
    // Sem quadro perdido: a correlação é a de quadros de câmera vizinhos.
    const s = gerarCenarioDoCursor({
      ...CENARIO_DO_VIDEO, semente: 3, fixacoes: 200, sigmaPx: 30, rho: 0.8,
      fracaoPerdida: 0, processamento: { minimoMs: 10, caudaMediaMs: 0 },
    });
    const ex = s.map((a) => a.x - a.verdadeX);
    const media = ex.reduce((t, v) => t + v, 0) / ex.length;
    const dp = Math.sqrt(ex.reduce((t, v) => t + (v - media) ** 2, 0) / ex.length);
    let num = 0;
    let den = 0;
    for (let i = 1; i < ex.length; i++) { num += (ex[i] - media) * (ex[i - 1] - media); den += (ex[i - 1] - media) ** 2; }
    expect(dp).toBeGreaterThan(26);
    expect(dp).toBeLessThan(34);
    expect(num / den).toBeGreaterThan(0.74);
    expect(num / den).toBeLessThan(0.86);
  });

  it('as amostras chegam em ordem, em intervalos irregulares, a ~22–28 por segundo', () => {
    const s = gerarCenarioDoCursor({ ...CENARIO_DO_VIDEO, semente: 11, fixacoes: 60 });
    for (let i = 1; i < s.length; i++) expect(s[i].tMs).toBeGreaterThan(s[i - 1].tMs);
    const duracaoS = (s[s.length - 1].tMs - s[0].tMs) / 1000;
    const taxa = (s.length - 1) / duracaoS;
    expect(taxa).toBeGreaterThan(20);
    expect(taxa).toBeLessThan(29);
    const intervalos = s.slice(1).map((a, i) => a.tMs - s[i].tMs);
    expect(Math.max(...intervalos)).toBeGreaterThan(55);
  });

  it('com saltos curtos, cada fixação fica a 40–120 px da anterior', () => {
    const s = gerarCenarioDoCursor({ ...CENARIO_DO_VIDEO, semente: 9, fixacoes: 30, amplitudeDoSaltoPx: [40, 120] });
    const centros = new Map<number, { x: number; y: number }>();
    for (const a of s) if (!centros.has(a.fixacao)) centros.set(a.fixacao, { x: a.verdadeX, y: a.verdadeY });
    const lista = [...centros.values()];
    for (let i = 1; i < lista.length; i++) {
      const d = Math.hypot(lista[i].x - lista[i - 1].x, lista[i].y - lista[i - 1].y);
      expect(d).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(d).toBeLessThanOrEqual(120 + 1e-9);
    }
  });

  it('marca a fixação de cada amostra e o tempo desde a última sacada', () => {
    const s = gerarCenarioDoCursor({ ...CENARIO_DO_VIDEO, semente: 5, fixacoes: 5 });
    const fixacoes = new Set(s.map((a) => a.fixacao));
    expect(fixacoes.size).toBe(5);
    for (const a of s) expect(a.desdeASacadaMs).toBeGreaterThanOrEqual(0);
  });

  it('olhar para baixo congela as primeiras amostras da fixação, como a pálpebra baixa no engine', () => {
    const s = gerarCenarioDoCursor({
      ...CENARIO_DO_VIDEO, semente: 4, fixacoes: 30,
      palpebraBaixa: { abaixoDeYPx: 700, congelamentoMs: 400 },
    });
    const congeladas = s.filter((a) => a.congelado);
    expect(congeladas.length).toBeGreaterThan(0);
    for (const a of congeladas) {
      expect(a.verdadeY).toBeGreaterThan(700);
      expect(a.desdeASacadaMs).toBeLessThan(400);
    }
  });

  it('o L2CS soma um termo que muda em degraus a cada inferência, ou em rampa', () => {
    const base = { ...CENARIO_DO_VIDEO, semente: 6, fixacoes: 10, sigmaPx: 0 };
    const degraus = gerarCenarioDoCursor({ ...base, l2cs: { periodoMs: 100, sigmaPx: 20, rampa: false } });
    const rampa = gerarCenarioDoCursor({ ...base, l2cs: { periodoMs: 100, sigmaPx: 20, rampa: true } });
    const passos = (v: typeof degraus) => v.slice(1).map((a, i) => Math.hypot(a.x - a.verdadeX - (v[i].x - v[i].verdadeX), a.y - a.verdadeY - (v[i].y - v[i].verdadeY)));
    const pd = passos(degraus);
    const pr = passos(rampa);
    // Em degraus: muitos quadros sem mudança e alguns saltos grandes.
    expect(pd.filter((p) => p < 1e-9).length).toBeGreaterThan(pd.length / 2);
    expect(Math.max(...pr)).toBeLessThan(Math.max(...pd));
  });
});

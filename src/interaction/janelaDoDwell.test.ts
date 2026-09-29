import { describe, expect, it } from 'vitest';
import { AMOSTRAS_MINIMAS, CHEGADA_MS, HISTORICO_MS, HistoricoDoOlhar, SAIDA_MS } from './janelaDoDwell';

const DT = 1000 / 30;

function encher(h: HistoricoDoOlhar, de: number, ate: number, f: (t: number) => { x: number; y: number }, saturada = false) {
  for (let t = de; t <= ate; t += DT) h.registrar({ t, ...f(t), saturada });
}

describe('HistoricoDoOlhar', () => {
  it('mede só a janela estável: sem a chegada e sem a saída do olhar', () => {
    const h = new HistoricoDoOlhar();
    // Chegando (0–200 ms) o olhar ainda está longe; parado depois; saindo no fim.
    encher(h, 0, 1500, (t) => (t < CHEGADA_MS ? { x: 0, y: 0 } : t > 1500 - SAIDA_MS ? { x: 2000, y: 2000 } : { x: 500, y: 400 }));
    const m = h.medir(0, 1500)!;
    expect(m.mediana).toEqual({ x: 500, y: 400 });
    expect(m.dispersao).toEqual({ x: 0, y: 0 });
    expect(m.saturada).toBe(false);
  });

  it('uma intrusão curta no meio do dwell não puxa a mediana', () => {
    const h = new HistoricoDoOlhar();
    encher(h, 0, 1500, (t) => (t > 700 && t < 800 ? { x: 900, y: 400 } : { x: 500 + ((t / DT) % 2 ? 5 : -5), y: 400 }));
    const m = h.medir(0, 1500)!;
    expect(Math.abs(m.mediana.x - 500)).toBeLessThanOrEqual(5);
    expect(m.dispersao.x).toBeLessThan(10);
  });

  it('amostra repetida ou fora de ordem não entra; o passado velho sai', () => {
    const h = new HistoricoDoOlhar();
    h.registrar({ t: 100, x: 1, y: 1, saturada: false });
    h.registrar({ t: 100, x: 999, y: 999, saturada: false });
    h.registrar({ t: 50, x: 999, y: 999, saturada: false });
    encher(h, 200, 200 + HISTORICO_MS + 1000, () => ({ x: 7, y: 7 }));
    // A amostra de t = 100 já saiu do histórico: nenhuma janela a encontra.
    expect(h.medir(-CHEGADA_MS, 150)).toBeNull();
  });

  it('janela curta demais não é medida; saturação na janela é informada', () => {
    const h = new HistoricoDoOlhar();
    encher(h, 0, 200 + (AMOSTRAS_MINIMAS - 2) * DT + SAIDA_MS, () => ({ x: 1, y: 1 }));
    expect(h.medir(0, 200 + (AMOSTRAS_MINIMAS - 2) * DT + SAIDA_MS)).toBeNull();
    const s = new HistoricoDoOlhar();
    encher(s, 0, 1500, () => ({ x: 1, y: 1 }), true);
    expect(s.medir(0, 1500)!.saturada).toBe(true);
    s.limpar();
    expect(s.medir(0, 1500)).toBeNull();
  });
});

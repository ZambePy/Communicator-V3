import { describe, it, expect } from 'vitest';
import { analisarGravacao, apararSilencio, falaMinimaParaOTexto, MENSAGENS, resumoDaQualidade } from './qualidade';
import { codificarWav, lerWav, paraMono } from './wav';

// Checagem de qualidade da voz guardada (pedido de 19/10/2026), com amostras
// SINTÉTICAS: uma "voz" (harmônicos de 140 Hz com sílabas a 4 Hz), silêncio
// com um chiado mínimo, ruído branco e estouro — cada caso isola um problema.

const TAXA = 16000;

/** PRNG determinístico (LCG): o teste não pode variar de uma rodada a outra. */
function aleatorio(semente = 7) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Ruído branco com valor eficaz `rms`. */
function ruido(n: number, rms: number, semente = 7): Float32Array {
  const r = aleatorio(semente);
  const a = new Float32Array(n);
  // Uniforme em [-1, 1] tem RMS 1/√3.
  for (let i = 0; i < n; i++) a[i] = (r() * 2 - 1) * rms * Math.sqrt(3);
  return a;
}

/** Uma "voz": harmônicos de 140 Hz com envelope de sílabas (4 por segundo). */
function voz(segundos: number, pico: number): Float32Array {
  const n = Math.round(segundos * TAXA);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / TAXA;
    const silaba = Math.sin(Math.PI * 4 * t) ** 2;
    const tom = 0.6 * Math.sin(2 * Math.PI * 140 * t) + 0.3 * Math.sin(2 * Math.PI * 280 * t) + 0.1 * Math.sin(2 * Math.PI * 420 * t);
    a[i] = pico * silaba * tom;
  }
  return a;
}

/** silêncio (chiado de -70 dBFS) + voz + silêncio. */
function gravacao(o: { falaS?: number; pico?: number; antesS?: number; depoisS?: number; chiado?: number } = {}): Float32Array {
  const antes = ruido(Math.round((o.antesS ?? 0.4) * TAXA), o.chiado ?? 0.0003, 1);
  const fala = voz(o.falaS ?? 1.5, o.pico ?? 0.5);
  const depois = ruido(Math.round((o.depoisS ?? 0.8) * TAXA), o.chiado ?? 0.0003, 2);
  const tudo = new Float32Array(antes.length + fala.length + depois.length);
  tudo.set(antes, 0);
  tudo.set(fala, antes.length);
  tudo.set(depois, antes.length + fala.length);
  // O chiado continua por baixo da fala, como num microfone de verdade.
  const chiado = ruido(fala.length, o.chiado ?? 0.0003, 3);
  for (let i = 0; i < fala.length; i++) tudo[antes.length + i] += chiado[i];
  return tudo;
}

const somar = (a: Float32Array, b: Float32Array) => a.map((x, i) => x + (b[i] ?? 0));
const tipos = (amostras: Float32Array, texto = 'Pode mudar a minha posição?') =>
  analisarGravacao(amostras, TAXA, texto).problemas.map((p) => `${p.tipo}${p.grave ? '!' : ''}`);

describe('qualidade da gravação', () => {
  it('voz limpa, em bom volume, é "boa" — sem nenhuma ressalva', () => {
    const a = analisarGravacao(gravacao(), TAXA, 'Pode mudar a minha posição?');
    expect(a.qualidade).toBe('boa');
    expect(a.problemas).toEqual([]);
    expect(a.snrDb!).toBeGreaterThan(30);
    expect(a.falaS).toBeGreaterThan(1);
    expect(a.inicioDaFalaS!).toBeGreaterThan(0.35);
    expect(a.fimDaFalaS!).toBeLessThan(2.0);
    expect(resumoDaQualidade(a)).toMatch(/Ficou boa/);
  });

  it('volume baixo: "baixinho", e grave quando é baixo demais', () => {
    expect(tipos(gravacao({ pico: 0.01 }))).toEqual(['baixa!']);
    expect(analisarGravacao(gravacao({ pico: 0.01 }), TAXA).qualidade).toBe('refazer');
    // Um pouco baixo: dá para guardar, com a dica.
    const leve = analisarGravacao(gravacao({ pico: 0.05 }), TAXA, 'Pode mudar a minha posição?');
    expect(leve.qualidade).toBe('aceitavel');
    expect(leve.problemas).toEqual([{ tipo: 'baixa', grave: false }]);
  });

  it('som estourado (topo achatado) é apontado', () => {
    const estourado = gravacao({ pico: 3 }).map((x) => Math.max(-1, Math.min(1, x)));
    const a = analisarGravacao(estourado, TAXA, 'Pode mudar a minha posição?');
    expect(a.problemas[0]).toEqual({ tipo: 'estourada', grave: true });
    expect(a.qualidade).toBe('refazer');
    expect(a.fracaoEstourada).toBeGreaterThan(0.01);
  });

  it('um pico isolado no topo não é estouro', () => {
    const g = gravacao();
    g[10000] = 1;
    expect(tipos(g)).toEqual([]);
  });

  it('ruído de fundo alto: grave com relação sinal/ruído abaixo de 12 dB; leve entre 12 e 20', () => {
    const base = gravacao({ pico: 0.3 });
    expect(tipos(somar(base, ruido(base.length, 0.05, 9)))).toEqual(['ruido!']);
    const leve = analisarGravacao(somar(base, ruido(base.length, 0.012, 9)), TAXA, 'Pode mudar a minha posição?');
    expect(leve.problemas).toEqual([{ tipo: 'ruido', grave: false }]);
    expect(leve.qualidade).toBe('aceitavel');
  });

  it('curta demais para a frase: aponta "cortada" — mas "Sim." curto é normal', () => {
    expect(tipos(gravacao({ falaS: 0.12 }), 'Pode mudar a minha posição?')).toContain('curta!');
    expect(tipos(gravacao({ falaS: 0.35 }), 'Sim.')).toEqual([]);
    // Quem fala devagar (disartria) nunca é "curto": a folga é só para baixo.
    expect(tipos(gravacao({ falaS: 4 }), 'Sim.')).toEqual([]);
    expect(falaMinimaParaOTexto('Sim.')).toBeCloseTo(0.2, 2);
  });

  it('sem voz (silêncio, ou só o chiado) diz que não ouviu', () => {
    for (const amostras of [new Float32Array(TAXA), ruido(TAXA * 2, 0.0005), gravacao({ pico: 0.002 })]) {
      const a = analisarGravacao(amostras, TAXA, 'Estou com dor.');
      expect(a.problemas[0]).toEqual({ tipo: 'silencio', grave: true });
      expect(a.qualidade).toBe('refazer');
    }
    expect(analisarGravacao(new Float32Array(0), TAXA).problemas[0].tipo).toBe('silencio');
  });

  it('amostras não finitas não viram NaN no veredito', () => {
    const g = gravacao();
    g[5] = Number.NaN;
    g[6] = Number.POSITIVE_INFINITY;
    const a = analisarGravacao(g, TAXA, 'Pode mudar a minha posição?');
    expect(a.qualidade).toBe('boa');
    expect(Number.isFinite(a.falaDbfs!)).toBe(true);
  });

  it('aparar tira o silêncio das pontas e deixa uma folga curta', () => {
    const g = gravacao({ antesS: 1.2, depoisS: 2 });
    const a = analisarGravacao(g, TAXA, 'Pode mudar a minha posição?');
    const aparada = apararSilencio(g, TAXA, a);
    expect(aparada.length / TAXA).toBeLessThan(1.9);
    expect(aparada.length / TAXA).toBeGreaterThan(1.4);
    // Sem voz, não apara nada (seria apagar a gravação).
    const muda = new Float32Array(TAXA);
    expect(apararSilencio(muda, TAXA, analisarGravacao(muda, TAXA)).length).toBe(TAXA);
  });

  it('toda mensagem tem título e dica em linguagem simples', () => {
    for (const m of Object.values(MENSAGENS)) {
      expect(m.titulo.length).toBeGreaterThan(5);
      expect(m.dica).not.toMatch(/dB|SNR|clipping|RMS/i);
    }
  });
});

describe('WAV', () => {
  it('codifica e lê de volta (16 bits, mono), com a taxa', () => {
    const g = gravacao();
    const lido = lerWav(codificarWav(g, TAXA))!;
    expect(lido.taxa).toBe(TAXA);
    expect(lido.amostras.length).toBe(g.length);
    let erro = 0;
    for (let i = 0; i < g.length; i++) erro = Math.max(erro, Math.abs(lido.amostras[i] - g[i]));
    expect(erro).toBeLessThan(1 / 16000);
    // A checagem dá o mesmo veredito antes e depois de guardar.
    expect(analisarGravacao(lido.amostras, lido.taxa, 'Pode mudar a minha posição?').qualidade).toBe('boa');
  });

  it('valores fora de -1..1 e não finitos são contidos ao codificar', () => {
    const lido = lerWav(codificarWav(new Float32Array([2, -2, Number.NaN, 0.5]), 8000))!;
    expect(Array.from(lido.amostras).map((x) => Math.round(x * 100) / 100)).toEqual([1, -1, 0, 0.5]);
  });

  it('não é WAV: null', () => {
    expect(lerWav(new TextEncoder().encode('isto não é um arquivo de áudio, de jeito nenhum!!').buffer)).toBeNull();
  });

  it('mistura estéreo em mono pela média', () => {
    expect(Array.from(paraMono([new Float32Array([1, 0]), new Float32Array([0, 1])]))).toEqual([0.5, 0.5]);
  });
});

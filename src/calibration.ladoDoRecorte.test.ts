// Revisão do pipeline de 19/10/2026 — quando o lado do recorte do L2CS muda
// MESMO ASSIM (o engine já mantém o lado no reinício; isto cobre o resto: a
// primeira carga numa máquina que perdeu a WebGPU, um ONNX que não aceita o
// lado), a calibração fica SUSPENSA em vez de apagada, a coleta em curso é
// interrompida com aviso à tela, e o disco só é consultado SEM mexer no modelo
// em uso. Antes: `clearCalibration()` (nada clicável, nem a Emergência), ou —
// com a janela fora do tamanho — o modelo zerado em silêncio pelo `loadProfile`.
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import * as cal from './calibration';
import { EXPERIMENT } from './config/experiment';
import { createDwellState, DEFAULT_DWELL_CONFIG, stepDwell } from './interaction/dwell';

const W = 1920, H = 1080;
let relogio = 0;
function gerador(semente: number) {
  let s = semente;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
}
const olhoCom = (rnd: () => number) => (x: number, y: number) => [
  (x - 0.5) * 0.08 + rnd() * 0.0008, (y - 0.5) * 0.05 + rnd() * 0.0008,
  Math.tan((x - 0.5) * 0.9) + rnd() * 0.003, Math.tan((y - 0.5) * 0.5) + rnd() * 0.003,
];
const semRuido = olhoCom(() => 0);
const QUALIDADE = {
  yaw: 0, pitch: 0, roll: 0, irisVisibilityPercentage: 1, detectorConfidence: 0.99,
  brightnessEstimate: 0.3, contrastEstimate: 0.1, blurEstimate: 0,
};
function coletar(alvo: { x: number; y: number }, olho: (x: number, y: number) => number[], cb: (ok: boolean) => void = () => {}) {
  cal.startCollectingPoint(alvo.x, alvo.y, cb);
  const dur = cal.duracaoTotalDoPonto(cal.getCollectionMsForPoint(alvo.x, alvo.y));
  for (let ms = 0; ms <= dur + 200; ms += 33) { relogio += 33; cal.feedRawData(olho(alvo.x, alvo.y), olho(alvo.x, alvo.y), QUALIDADE); }
}
function calibrar(semente = 7) {
  const olho = olhoCom(gerador(semente));
  expect(cal.startCalibrationMode()).toBe(true);
  for (const t of cal.getCalibrationTargets()) coletar(t, olho);
  let ok: boolean | null = null;
  cal.completeCalibration((o) => { ok = (o as { ok: boolean }).ok !== false; });
  expect(ok).toBe(true);
}
function sonda(): ({ x: number; y: number } | null)[] {
  const out: ({ x: number; y: number } | null)[] = [];
  for (const y of [0.05, 0.5, 0.95]) for (const x of [0.05, 0.5, 0.95]) out.push(cal.mapGaze(semRuido(x, y), semRuido(x, y)));
  return out;
}
/** Cinco segundos de olhar firme na Emergência: degradada quando suspensa, como o `emit` do engine. */
function cliquesNaEmergencia(): number {
  let st = createDwellState();
  const alvo = { key: 'emergencia', customDwellMs: null, isEmergency: true, isRecovery: false, isDisabled: false };
  let cliques = 0;
  for (let t = 0; t <= 5000; t += 33) {
    const o = stepDwell(st, {
      x: 100, y: 100, timestamp: 10_000 + t, hasFace: true,
      degraded: cal.getSuspensaoDaCalibracao() !== null, uncalibrated: !cal.isCalibrated(), eyeState: 'open',
    }, alvo, DEFAULT_DWELL_CONFIG);
    st = o.state;
    if (o.effect.type === 'click') cliques++;
  }
  return cliques;
}

describe('o lado do recorte muda com a calibração em uso', () => {
  const salvas = { p: EXPERIMENT.persistirCalibracao, r: EXPERIMENT.recoletaDeAlvosRuins };
  beforeAll(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    EXPERIMENT.recoletaDeAlvosRuins = true;
    cal.setSessionGeometry(null);
  });
  beforeEach(() => {
    EXPERIMENT.persistirCalibracao = false;
    localStorage.clear();
    cal.clearCalibration();
    // O registro em memória guarda os perfis dos casos anteriores, e o
    // `saveProfile` os levaria ao disco: cada caso começa sem nenhum.
    for (const e of cal.listCalibrationProfiles()) cal.deleteCalibrationProfile(e.meta.id);
    cal.setL2csInputSizeEfetivo(448);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    EXPERIMENT.persistirCalibracao = salvas.p;
    EXPERIMENT.recoletaDeAlvosRuins = salvas.r;
    cal.clearCalibration();
    cal.setL2csInputSizeEfetivo(448);
    localStorage.clear();
  });

  it('sem perfil do lado novo: o modelo FICA, suspenso — a Emergência aciona — e volta inteiro com o lado', () => {
    calibrar();
    const antes = sonda();
    const invalidacoes: string[] = [];
    const eventos: (string | null)[] = [];
    const pararI = cal.onCalibrationInvalidated((e) => invalidacoes.push(e.reason));
    const pararS = cal.onSuspensaoDaCalibracao((s) => eventos.push(s?.recorte ? `recorte ${s.recorte.calibracao}→${s.recorte.atual}` : s ? 'tela' : null));

    cal.setL2csInputSizeEfetivo(224);
    expect(cal.isCalibrated()).toBe(true);
    expect(invalidacoes).toEqual([]);
    expect(cal.getSuspensaoDaCalibracao()?.recorte).toEqual({ calibracao: 448, atual: 224 });
    expect(eventos).toEqual(['recorte 448→224']);
    expect(cliquesNaEmergencia()).toBeGreaterThanOrEqual(1);
    // Suspenso, nada de rodada que misture os lados.
    expect(cal.podeRecoletarAlvos()).toBe(false);
    expect(cal.iniciarRodadaDeReforco({ piores: 3 })).toEqual([]);
    // Um reinício que leve o recorte a 448 de novo tira a suspensão.
    expect(cal.ladoDoRecorteAPreservar()).toBe(448);
    cal.setL2csInputSizeEfetivo(448);
    expect(cal.getSuspensaoDaCalibracao()).toBeNull();
    expect(eventos).toEqual(['recorte 448→224', null]);
    expect(sonda()).toEqual(antes);
    expect(cal.podeRecoletarAlvos()).toBe(true);
    pararI();
    pararS();
  });

  it('com perfil do lado novo no disco: ele toma o lugar, sem suspensão e sem invalidação', () => {
    EXPERIMENT.persistirCalibracao = true;
    // Uma calibração em 224 (máquina sem WebGPU, ontem) …
    cal.setL2csInputSizeEfetivo(224);
    calibrar(5);
    const em224 = sonda();
    // … e uma em 448 (hoje, com a WebGPU de volta).
    cal.setL2csInputSizeEfetivo(448);
    expect(cal.getSuspensaoDaCalibracao()?.recorte).toEqual({ calibracao: 224, atual: 448 });
    calibrar(7);
    expect(cal.getSuspensaoDaCalibracao()).toBeNull();
    const em448 = sonda();
    expect(em448).not.toEqual(em224);
    const invalidacoes: string[] = [];
    const parar = cal.onCalibrationInvalidated((e) => invalidacoes.push(e.reason));

    cal.setL2csInputSizeEfetivo(224);
    expect(cal.isCalibrated()).toBe(true);
    expect(cal.getSuspensaoDaCalibracao()).toBeNull();
    expect(sonda()).toEqual(em224);
    expect(invalidacoes).toEqual([]);
    parar();
  });

  it('janela fora do tamanho + lado novo sem perfil: o modelo não some em silêncio, e as duas causas aparecem', () => {
    EXPERIMENT.persistirCalibracao = true;
    calibrar();
    const eventos: (string | null)[] = [];
    const parar = cal.onSuspensaoDaCalibracao((s) => eventos.push(s ? (s.recorte ? 'recorte' : 'tela') : null));
    cal.checarMudancaDeViewport(1600, H);
    expect(eventos).toEqual(['tela']);
    cal.setL2csInputSizeEfetivo(224);
    expect(cal.isCalibrated()).toBe(true);
    expect(eventos).toEqual(['tela', 'recorte']);
    // A janela volta: segue suspensa pelo recorte — não "valendo de novo".
    cal.checarMudancaDeViewport(W, H);
    expect(eventos).toEqual(['tela', 'recorte', 'recorte']);
    expect(cal.getSuspensaoDaCalibracao()?.recorte).toEqual({ calibracao: 448, atual: 224 });
    parar();
  });

  it('lado novo no MEIO de uma calibração: a coleta é interrompida com aviso, e a calibração de antes volta (suspensa)', () => {
    calibrar();
    const antes = sonda();
    const interrupcoes: cal.ColetaInterrompida[] = [];
    const parar = cal.onColetaInterrompida((e) => interrupcoes.push(e));
    expect(cal.startCalibrationMode()).toBe(true);
    const olho = olhoCom(gerador(9));
    cal.getCalibrationTargets().slice(0, 4).forEach((t) => coletar(t, olho));
    expect(cal.ladoDoRecorteAPreservar()).toBe(448);

    cal.setL2csInputSizeEfetivo(224);
    expect(interrupcoes).toHaveLength(1);
    expect(interrupcoes[0]).toMatchObject({ motivo: 'lado_do_recorte', rodada: 'calibracao' });
    expect(cal.getCalibrationMode()).toBeNull();
    expect(cal.isCalibrated()).toBe(true);
    expect(sonda()).toEqual(antes);
    expect(cal.getSuspensaoDaCalibracao()?.recorte).toEqual({ calibracao: 448, atual: 224 });
    // Um ponto pedido depois disto não abre coleta nenhuma.
    let chamado = 0;
    cal.startCollectingPoint(0.5, 0.5, () => { chamado++; });
    expect(chamado).toBe(0);
    parar();
  });

  it('lado novo no MEIO de uma recoleta: a rodada sai com aviso e o modelo é o de antes, bit a bit', () => {
    calibrar();
    const antes = sonda();
    const interrupcoes: cal.ColetaInterrompida[] = [];
    const parar = cal.onColetaInterrompida((e) => interrupcoes.push(e));
    expect(cal.iniciarRecoletaDeAlvos([{ x: 0.05, y: 0.05 }])).toHaveLength(1);
    cal.startCollectingPoint(0.05, 0.05, () => {});
    for (let i = 0; i < 20; i++) { relogio += 33; cal.feedRawData(semRuido(0.5, 0.5), semRuido(0.5, 0.5), QUALIDADE); }

    cal.setL2csInputSizeEfetivo(224);
    expect(interrupcoes.map((e) => e.rodada)).toEqual(['recoleta']);
    expect(cal.recoletaEmAndamento()).toBe(false);
    expect(cal.isCalibrated()).toBe(true);
    expect(sonda()).toEqual(antes);
    parar();
  });

  it('sem modelo, o disco é consultado como sempre (e nada é suspenso)', () => {
    expect(cal.isCalibrated()).toBe(false);
    cal.setL2csInputSizeEfetivo(224);
    expect(cal.getSuspensaoDaCalibracao()).toBeNull();
    expect(cal.ladoDoRecorteAPreservar()).toBeNull();
  });
});

describe('o modelo que sai leva a suspensão junto', () => {
  beforeAll(() => {
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => W });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => H });
    vi.spyOn(performance, 'now').mockImplementation(() => relogio);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterAll(() => {
    vi.restoreAllMocks();
    cal.clearCalibration();
  });

  it('um `loadProfile` que não acha perfil avisa quem ouve a suspensão (antes a faixa ficava de pé)', () => {
    const p = EXPERIMENT.persistirCalibracao;
    EXPERIMENT.persistirCalibracao = false;
    try {
      cal.clearCalibration();
      calibrar();
      const eventos: (string | null)[] = [];
      const parar = cal.onSuspensaoDaCalibracao((s) => eventos.push(s ? 'suspensa' : null));
      cal.checarMudancaDeViewport(1600, H);
      expect(cal.loadProfile()).toBe(false);
      expect(cal.isCalibrated()).toBe(false);
      expect(eventos).toEqual(['suspensa', null]);
      expect(cal.getCalibrationTimestampMs()).toBeNull();
      parar();
    } finally {
      EXPERIMENT.persistirCalibracao = p;
    }
  });
});

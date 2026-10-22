import { describe, it, expect } from 'vitest';
import {
  stepDwell,
  createDwellState,
  DEFAULT_DWELL_CONFIG,
  type DwellSample,
  type DwellTarget,
  type DwellState,
} from './dwell';

/**
 * Posição NÃO medida (relato de 19/10/2026): a última válida, repetida — por
 * contraluz forte, predição que falhou ou coordenada não finita. Imóvel, ela é
 * exatamente o que o dwell leria como "olhando firme". Contar sobre ela
 * completava qualquer botão sob o ponto congelado e, em degradado, a
 * Emergência — disparada por ninguém.
 */

const EMERGENCIA: DwellTarget = {
  key: 'sos', customDwellMs: null, isEmergency: true, isRecovery: false, isDisabled: false,
};
const BOTAO: DwellTarget = {
  key: 'ok', customDwellMs: null, isEmergency: false, isRecovery: false, isDisabled: false,
};

function amostra(t: number, over: Partial<DwellSample> = {}): DwellSample {
  return { x: 100, y: 100, timestamp: t, hasFace: true, degraded: false, uncalibrated: false, eyeState: 'open', ...over };
}

/** Roda amostras a ~30 Hz de `de` até `ate`; devolve o estado e se houve clique. */
function rodar(
  estado: DwellState, de: number, ate: number, alvo: DwellTarget, over: Partial<DwellSample> = {},
): { estado: DwellState; clicou: boolean; bloqueios: Set<string | null> } {
  let s = estado;
  let clicou = false;
  const bloqueios = new Set<string | null>();
  for (let t = de; t <= ate; t += 33) {
    const r = stepDwell(s, amostra(t, over), alvo, DEFAULT_DWELL_CONFIG);
    s = r.state;
    bloqueios.add(r.blockedBy);
    if (r.effect.type === 'click') clicou = true;
  }
  return { estado: s, clicou, bloqueios };
}

describe('dwell — posição não medida', () => {
  it('a Emergência sob uma posição congelada NÃO completa, por mais que dure', () => {
    // O cenário da contraluz antes da correção, agora com os olhos `unknown`:
    // degradado (só a Emergência aceitaria) e a posição parada em cima dela.
    const r = rodar(createDwellState(), 0, 20_000, EMERGENCIA, {
      degraded: true, eyeState: 'unknown', posicaoMedida: false,
    });
    expect(r.clicou).toBe(false);
    expect(r.bloqueios).toEqual(new Set(['sem-medida']));
  });

  it('um botão comum também não: nem antes de o estado virar degradado', () => {
    // Os 500 ms em que o timer de degradação ainda não virou eram suficientes
    // para completar um dwell já começado.
    let r = rodar(createDwellState(), 0, 1200, BOTAO);
    expect(r.clicou).toBe(false);
    r = rodar(r.estado, 1233, 4000, BOTAO, { posicaoMedida: false });
    expect(r.clicou).toBe(false);
  });

  it('lacuna curta PAUSA (o progresso volta); passado o lostResetMs, ZERA', () => {
    const DW = DEFAULT_DWELL_CONFIG.dwellMs;
    // Meio dwell olhando de verdade.
    let r = rodar(createDwellState(), 0, DW / 2, BOTAO);
    const antes = r.estado.elapsedMs;
    expect(antes).toBeGreaterThan(DW / 2 - 50);
    // 200 ms sem medida: pausa, não zera.
    r = rodar(r.estado, DW / 2 + 33, DW / 2 + 233, BOTAO, { posicaoMedida: false });
    expect(r.estado.targetKey).toBe('ok');
    expect(r.estado.elapsedMs).toBe(antes);
    // Medida de novo: retoma de onde parou e completa no tempo que faltava.
    const retoma = rodar(r.estado, DW / 2 + 266, DW + 400, BOTAO);
    expect(retoma.clicou).toBe(true);

    // Agora uma lacuna LONGA (> 500 ms) sem medida: o progresso some.
    let z = rodar(createDwellState(), 0, DW / 2, BOTAO);
    z = rodar(z.estado, DW / 2 + 33, DW / 2 + 900, BOTAO, { posicaoMedida: false });
    expect(z.estado.targetKey).toBeNull();
    expect(z.estado.elapsedMs).toBe(0);
  });

  it('amostra sem o campo (todas as normais) segue exatamente o caminho de antes', () => {
    const semCampo = rodar(createDwellState(), 0, 2000, BOTAO);
    const comTrue = rodar(createDwellState(), 0, 2000, BOTAO, { posicaoMedida: true });
    expect(semCampo.clicou).toBe(true);
    expect(comTrue.clicou).toBe(true);
    expect(comTrue.estado).toEqual(semCampo.estado);
  });

  it('olhos `unknown` com a posição MEDIDA (fase 3 da contraluz) só aceitam a Emergência, com o dwell longo', () => {
    const DW = DEFAULT_DWELL_CONFIG.dwellMs;
    const longo = DW * DEFAULT_DWELL_CONFIG.emergencyDegradedMult;
    const comum = rodar(createDwellState(), 0, 6000, BOTAO, { degraded: true });
    expect(comum.clicou).toBe(false);
    const antesDoTempo = rodar(createDwellState(), 0, longo - 100, EMERGENCIA, { degraded: true });
    expect(antesDoTempo.clicou).toBe(false);
    const sos = rodar(createDwellState(), 0, longo + 100, EMERGENCIA, { degraded: true });
    expect(sos.clicou).toBe(true);
  });
});

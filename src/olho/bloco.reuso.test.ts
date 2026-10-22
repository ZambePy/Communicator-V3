import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildBlocoOcular,
  CONFIANCA_MIN_OCULAR,
  reiniciarReusoDoBlocoOcular,
  ultimoDiagnosticoDoBlocoOcular,
  type SaidaDoRamoOcular,
} from './bloco';
import { REUSO_DESVANECIMENTO_MS, REUSO_MAX_MS } from '../l2cs/block';

// Reuso do último ângulo válido no bloco ocular (relato de 19/10/2026,
// auditoria A4). Antes o bloco zerava no primeiro quadro sem leitura válida —
// e zero, depois do StandardScaler, é um olhar no centro, não "sem
// informação". Agora vale a regra do bloco do rosto: reuso até 600 ms, rampa
// de 200 ms, depois os zeros de sempre.

const boa: SaidaDoRamoOcular = { yaw: 0.2, pitch: -0.1, confianca: 0.8, valid: true, timestamp: 1 };
const tangentes = (yaw: number, pitch: number) => [Math.tan(yaw), Math.tan(pitch)];

beforeEach(() => {
  reiniciarReusoDoBlocoOcular();
});

describe('reuso do último ângulo válido, por olho', () => {
  it('dentro da janela, a leitura que falta reutiliza o último ângulo inteiro', () => {
    buildBlocoOcular(boa, 'esquerdo', 1000);
    const b = buildBlocoOcular(null, 'esquerdo', 1000 + REUSO_MAX_MS - 100);
    expect(b.motivo).toBe('stale-reuso');
    expect(b.valores[0]).toBeCloseTo(Math.tan(0.2), 12);
    expect(b.valores[1]).toBeCloseTo(Math.tan(-0.1), 12);
    expect(ultimoDiagnosticoDoBlocoOcular().esquerdo).toEqual({ motivo: 'stale-reuso', pesoDoAngulo: 1 });
  });

  it('na rampa, o ÂNGULO desvanece (metade da rampa = metade do ângulo)', () => {
    buildBlocoOcular(boa, 'esquerdo', 0);
    const b = buildBlocoOcular(null, 'esquerdo', REUSO_MAX_MS + REUSO_DESVANECIMENTO_MS / 2);
    expect(b.motivo).toBe('stale-reuso');
    const [x, y] = tangentes(0.2 * 0.5, -0.1 * 0.5);
    expect(b.valores[0]).toBeCloseTo(x, 12);
    expect(b.valores[1]).toBeCloseTo(y, 12);
    // A calibração lê este número para tirar peso da amostra (S1).
    expect(ultimoDiagnosticoDoBlocoOcular().esquerdo.pesoDoAngulo).toBeCloseTo(0.5, 12);
  });

  it('acabada a rampa, os zeros de sempre, com o motivo de sempre', () => {
    buildBlocoOcular(boa, 'esquerdo', 0);
    expect(buildBlocoOcular(null, 'esquerdo', REUSO_MAX_MS + REUSO_DESVANECIMENTO_MS))
      .toEqual({ valores: [0, 0], motivo: 'stale' });
    expect(ultimoDiagnosticoDoBlocoOcular().esquerdo).toEqual({ motivo: 'stale', pesoDoAngulo: 0 });
  });

  it('a saída não muda de degrau ao longo da janela e da rampa', () => {
    buildBlocoOcular(boa, 'esquerdo', 0);
    let anterior = buildBlocoOcular(null, 'esquerdo', 0).valores[0];
    for (let t = 10; t <= REUSO_MAX_MS + REUSO_DESVANECIMENTO_MS; t += 10) {
      const v = buildBlocoOcular(null, 'esquerdo', t).valores[0];
      // A 10 ms por passo, a rampa suave muda bem menos que 0,02 por passo.
      expect(Math.abs(v - anterior)).toBeLessThan(0.02);
      anterior = v;
    }
    expect(anterior).toBe(0);
  });

  it('confiança baixa também reutiliza (a leitura existe, mas não vale)', () => {
    buildBlocoOcular(boa, 'direito', 0);
    const b = buildBlocoOcular({ ...boa, yaw: -0.3, confianca: CONFIANCA_MIN_OCULAR - 0.01 }, 'direito', 200);
    expect(b.motivo).toBe('stale-reuso');
    expect(b.valores[0]).toBeCloseTo(Math.tan(0.2), 12);
  });

  it('ângulo implausível NÃO é reutilizado nem vira o último válido: é lixo, não atraso', () => {
    buildBlocoOcular(boa, 'esquerdo', 0);
    expect(buildBlocoOcular({ ...boa, yaw: 1.2 }, 'esquerdo', 100)).toEqual({ valores: [0, 0], motivo: 'implausivel' });
    expect(ultimoDiagnosticoDoBlocoOcular().esquerdo).toEqual({ motivo: 'implausivel', pesoDoAngulo: 0 });
    // O guardado continua o de antes (t=0), não o implausível.
    const b = buildBlocoOcular(null, 'esquerdo', 200);
    expect(b.motivo).toBe('stale-reuso');
    expect(b.valores[0]).toBeCloseTo(Math.tan(0.2), 12);
  });

  it('cada olho reutiliza o SEU ângulo: o direito sem leitura nenhuma não herda o esquerdo', () => {
    buildBlocoOcular(boa, 'esquerdo', 0);
    buildBlocoOcular({ ...boa, yaw: -0.25, pitch: 0.05 }, 'direito', 0);
    const e = buildBlocoOcular(null, 'esquerdo', 100);
    const d = buildBlocoOcular(null, 'direito', 100);
    expect(e.valores[0]).toBeCloseTo(Math.tan(0.2), 12);
    expect(d.valores[0]).toBeCloseTo(Math.tan(-0.25), 12);

    reiniciarReusoDoBlocoOcular();
    buildBlocoOcular(boa, 'esquerdo', 0);
    expect(buildBlocoOcular(null, 'direito', 100)).toEqual({ valores: [0, 0], motivo: 'stale' });
    const diag = ultimoDiagnosticoDoBlocoOcular();
    expect(diag.esquerdo.pesoDoAngulo).toBe(1);
    expect(diag.direito.pesoDoAngulo).toBe(0);
  });

  it('reiniciar esquece os ângulos guardados (sessão nova)', () => {
    buildBlocoOcular(boa, 'esquerdo', 0);
    reiniciarReusoDoBlocoOcular();
    expect(buildBlocoOcular(null, 'esquerdo', 100)).toEqual({ valores: [0, 0], motivo: 'stale' });
    expect(ultimoDiagnosticoDoBlocoOcular().direito).toEqual({ motivo: null, pesoDoAngulo: 1 });
  });

  it('relógio que volta atrás não reutiliza (idade negativa não é "recente")', () => {
    buildBlocoOcular(boa, 'esquerdo', 5000);
    expect(buildBlocoOcular(null, 'esquerdo', 4000)).toEqual({ valores: [0, 0], motivo: 'stale' });
  });
});

describe('sem olho ou sem instante: o comportamento de antes', () => {
  it('sem `olho`, zera no primeiro quadro sem leitura, mesmo com um ângulo guardado', () => {
    buildBlocoOcular(boa, 'esquerdo', 0);
    expect(buildBlocoOcular(null)).toEqual({ valores: [0, 0], motivo: 'stale' });
    expect(buildBlocoOcular({ ...boa, confianca: 0 }).motivo).toBe('confianca');
  });

  it('sem `nowMs` (gravações antigas), não guarda nem reutiliza', () => {
    buildBlocoOcular(boa, 'esquerdo');
    expect(buildBlocoOcular(null, 'esquerdo', 100)).toEqual({ valores: [0, 0], motivo: 'stale' });
    buildBlocoOcular(boa, 'esquerdo', 0);
    expect(buildBlocoOcular(null, 'esquerdo')).toEqual({ valores: [0, 0], motivo: 'stale' });
  });

  it('a leitura válida dá a mesma saída com ou sem reuso habilitado', () => {
    expect(buildBlocoOcular(boa, 'esquerdo', 0)).toEqual(buildBlocoOcular(boa));
  });
});

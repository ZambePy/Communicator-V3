import { describe, it, expect } from 'vitest';
import { DWELL_MAX_MS, DWELL_MIN_MS } from '../../dwellMs';
import {
  proximoDwellMs,
  proximoBrilho,
  podeAumentarDwell,
  podeDiminuirDwell,
  emSegundos,
  emPorcento,
} from './ajustes';

describe('passos do tempo de permanência (Acessibilidade)', () => {
  it('anda 0,1 s por olhar', () => {
    expect(proximoDwellMs(1500, 1)).toBe(1600);
    expect(proximoDwellMs(1500, -1)).toBe(1400);
  });

  it('um valor fora da grade (slider de 50 ms) alinha NA direção pedida', () => {
    expect(proximoDwellMs(1550, 1)).toBe(1600);
    expect(proximoDwellMs(1550, -1)).toBe(1500);
  });

  it('respeita os MESMOS limites do slider de Configurações', () => {
    expect(proximoDwellMs(DWELL_MAX_MS, 1)).toBe(DWELL_MAX_MS);
    expect(proximoDwellMs(DWELL_MIN_MS, -1)).toBe(DWELL_MIN_MS);
    expect(podeAumentarDwell(DWELL_MAX_MS)).toBe(false);
    expect(podeDiminuirDwell(DWELL_MIN_MS)).toBe(false);
    expect(podeDiminuirDwell(1500)).toBe(true);
  });

  it('NaN vindo do disco vira o padrão, não um dwell que nunca completa', () => {
    expect(proximoDwellMs(Number.NaN, 1)).toBe(1600);
  });

  it('formata em segundos com vírgula', () => {
    expect(emSegundos(1500)).toBe('1,5 s');
  });
});

describe('passos do brilho', () => {
  it('anda de 5 em 5 %, dentro de 40–100 %', () => {
    expect(proximoBrilho(1, -1)).toBe(0.95);
    expect(proximoBrilho(0.95, 1)).toBe(1);
    expect(proximoBrilho(1, 1)).toBe(1);
    expect(proximoBrilho(0.4, -1)).toBe(0.4);
  });

  it('não grava ruído de ponto flutuante', () => {
    expect(proximoBrilho(0.45, -1)).toBe(0.4);
    expect(String(proximoBrilho(0.7, 1))).toBe('0.75');
  });

  it('formata em %', () => {
    expect(emPorcento(0.75)).toBe('75%');
  });
});

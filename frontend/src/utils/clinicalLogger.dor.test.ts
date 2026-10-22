import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  setConsent, getClinicalData, logDor, getRegistrosDeDor, definirPerfilAtivo, chaveDoPerfil,
  logSentence, MAX_DORES_NO_HISTORICO,
} from './clinicalLogger';

// Relatos do mapa da dor no histórico clínico (19/10/2026): dado estruturado
// (lugar e nível), com o resultado honesto da gravação.

const relato = (nivel: number, local = 'braco-esquerdo', lugar = 'Braço esquerdo') => ({
  local, lugar, nivel, frase: `Dor no ${lugar.toLowerCase()}, nível ${nivel} de 10`,
});

describe('histórico de dores', () => {
  beforeEach(() => {
    localStorage.clear();
    definirPerfilAtivo('paciente-de-teste');
  });
  afterEach(() => vi.restoreAllMocks());

  it('sem consentimento não guarda, e diz por quê', () => {
    expect(logDor(relato(7))).toBe('sem_consentimento');
    expect(getClinicalData().dores).toEqual([]);
  });

  it('com consentimento guarda lugar, nível e frase, do mais recente para o mais antigo', () => {
    setConsent(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T08:00:00Z'));
    expect(logDor(relato(3))).toBe('gravado');
    vi.setSystemTime(new Date('2026-10-19T09:00:00Z'));
    expect(logDor(relato(8, 'cabeca', 'Cabeça'))).toBe('gravado');
    vi.useRealTimers();
    const r = getRegistrosDeDor();
    expect(r.map((d) => [d.local, d.nivel])).toEqual([['cabeca', 8], ['braco-esquerdo', 3]]);
    expect(r[0].lugar).toBe('Cabeça');
    expect(typeof r[0].id).toBe('string');
    // As frases continuam no lugar delas: o relato de dor é outro registro.
    expect(getClinicalData().sentences).toEqual([]);
  });

  it('o nível gravado fica sempre entre 0 e 10', () => {
    setConsent(true);
    logDor(relato(12));
    logDor(relato(-3));
    expect(getRegistrosDeDor().map((d) => d.nivel).sort()).toEqual([0, 10]);
  });

  it('sem paciente escolhido não grava em lugar nenhum', () => {
    setConsent(true);
    definirPerfilAtivo(null);
    expect(logDor(relato(5))).toBe('sem_perfil');
  });

  it('armazenamento cheio: "falhou", em vez de dar por gravado', () => {
    setConsent(true);
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === chaveDoPerfil('paciente-de-teste')) throw new DOMException('cheio', 'QuotaExceededError');
      return original.call(this, k, v);
    });
    expect(logDor(relato(6))).toBe('falhou');
  });

  it('históricos antigos (sem o campo) abrem vazios e continuam recebendo frases', () => {
    setConsent(true);
    localStorage.setItem(chaveDoPerfil('paciente-de-teste'), JSON.stringify({ sentences: [], calibrations: [] }));
    expect(getClinicalData().dores).toEqual([]);
    logSentence('Oi');
    expect(logDor(relato(4))).toBe('gravado');
    const d = getClinicalData();
    expect(d.sentences).toHaveLength(1);
    expect(d.dores).toHaveLength(1);
  });

  it('o histórico de dores tem teto: guarda só os mais recentes', () => {
    setConsent(true);
    const muitos = Array.from({ length: MAX_DORES_NO_HISTORICO }, (_, i) => ({
      id: String(i), local: 'cabeca', lugar: 'Cabeça', nivel: 1, frase: 'x', timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    }));
    localStorage.setItem(chaveDoPerfil('paciente-de-teste'), JSON.stringify({ sentences: [], calibrations: [], dores: muitos }));
    logDor(relato(9));
    const d = getClinicalData().dores;
    expect(d).toHaveLength(MAX_DORES_NO_HISTORICO);
    expect(d[d.length - 1].nivel).toBe(9);
    expect(d[0].id).toBe('1');
  });
});

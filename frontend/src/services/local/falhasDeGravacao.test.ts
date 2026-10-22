import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EVENTO_DE_FALHA_DE_GRAVACAO,
  _redefinirFalhasDeGravacao,
  dispensarFalhasDeGravacao,
  falhasDeGravacaoVisiveis,
  registrarFalhaDeGravacao,
  registrarGravacaoOk,
} from './falhasDeGravacao';
import { definirPerfilAtivo, logCalibrationAccuracy, logSentence, setConsent } from '../../utils/clinicalLogger';

// -----------------------------------------------------------------------------
// Relato de 18/10/2026 (auditoria de falhas silenciosas, item 15): calibração,
// ajustes e histórico que o disco recusava eram tratados como salvos — um
// `console.warn` e mais nada. Agora as gravações devolvem `boolean` e o que
// falhou fica registrado para o aviso "não foi possível salvar".
// -----------------------------------------------------------------------------

const cotaCheia = () =>
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('cota excedida', 'QuotaExceededError');
  });

beforeEach(() => {
  _redefinirFalhasDeGravacao();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  definirPerfilAtivo(null);
});

describe('registro do que não foi gravado', () => {
  it('falha aparece; gravação que volta a dar certo tira o aviso daquele item', () => {
    registrarFalhaDeGravacao('ajustes');
    registrarFalhaDeGravacao('historico');
    expect(falhasDeGravacaoVisiveis()).toEqual(['ajustes', 'historico']);
    registrarGravacaoOk('ajustes');
    expect(falhasDeGravacaoVisiveis()).toEqual(['historico']);
  });

  it('"Entendi" esconde até um item NOVO falhar; o mesmo item falhando de novo não volta a insistir', () => {
    registrarFalhaDeGravacao('ajustes');
    dispensarFalhasDeGravacao();
    expect(falhasDeGravacaoVisiveis()).toEqual([]);
    registrarFalhaDeGravacao('ajustes');
    expect(falhasDeGravacaoVisiveis()).toEqual([]);
    registrarFalhaDeGravacao('calibracao');
    expect(falhasDeGravacaoVisiveis()).toEqual(['calibracao']);
  });

  it('depois de gravar de novo, uma falha nova do mesmo item volta a avisar', () => {
    registrarFalhaDeGravacao('ajustes');
    dispensarFalhasDeGravacao();
    registrarGravacaoOk('ajustes');
    registrarFalhaDeGravacao('ajustes');
    expect(falhasDeGravacaoVisiveis()).toEqual(['ajustes']);
  });

  it('avisa a tela por evento (fora do fluxo de quem gravou) e loga uma vez, não a cada gravação', async () => {
    const ouvinte = vi.fn();
    window.addEventListener(EVENTO_DE_FALHA_DE_GRAVACAO, ouvinte);
    registrarFalhaDeGravacao('historico', new Error('cota'));
    registrarFalhaDeGravacao('historico', new Error('cota'));
    registrarFalhaDeGravacao('historico', new Error('cota'));
    expect(ouvinte).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTO_DE_FALHA_DE_GRAVACAO, ouvinte);
  });
});

describe('histórico (clinicalLogger)', () => {
  beforeEach(() => {
    localStorage.clear();
    setConsent(true);
    definirPerfilAtivo('p1');
  });

  it('gravou: devolve true', () => {
    expect(logSentence('Quero água')).toBe(true);
    expect(logCalibrationAccuracy(1.2)).toBe(true);
    expect(falhasDeGravacaoVisiveis()).toEqual([]);
  });

  it('cota cheia: devolve false e registra a falha do histórico', () => {
    cotaCheia();
    expect(logSentence('Quero água')).toBe(false);
    expect(logCalibrationAccuracy(1.2)).toBe(false);
    expect(falhasDeGravacaoVisiveis()).toEqual(['historico']);
  });

  it('sem consentimento não há o que gravar: não é falha', () => {
    setConsent(false);
    cotaCheia();
    expect(logSentence('Quero água')).toBe(true);
    expect(falhasDeGravacaoVisiveis()).toEqual([]);
  });
});

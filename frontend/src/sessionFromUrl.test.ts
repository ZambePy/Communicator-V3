import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { aplicarSessaoDaUrl } from './sessionFromUrl';

/**
 * A URL é o contrato da sessão de medição: é ela que declara a condição e é
 * ela que vai colada ao relatório. Um parâmetro aplicado pela metade, ou
 * aceito com valor inválido, produz um relatório que AFIRMA uma condição e
 * mede outra — e isso não é detectável depois, olhando o JSON.
 *
 * O plano de medição (docs/MEDICOES.md §4) depende destes quatro parâmetros:
 * `filtro` separa M1/M2/M3, `compTranslacao` define M4, `ep` e `l2cs` são as
 * constantes que precisam valer igual nas quatro.
 */
const CHAVE_EXP = 'irisflow.experiment';
const CHAVE_SETTINGS = 'irisflow_settings';

function exp(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(CHAVE_EXP) ?? '{}');
}

describe('aplicarSessaoDaUrl', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('filtro — o que separa M1, M2 e M3', () => {
    it.each(['oneEuro', 'kalman', 'kalmanEma'])('aceita %s', (modo) => {
      expect(aplicarSessaoDaUrl(`?filtro=${modo}`, '')).toBe(true);
      expect(exp().filterMode).toBe(modo);
    });

    it('ignora modo inválido em vez de aplicar pela metade', () => {
      const avisos: string[] = [];
      vi.spyOn(console, 'warn').mockImplementation((m: unknown) => { avisos.push(String(m)); });
      expect(aplicarSessaoDaUrl('?filtro=medianaMagica', '')).toBe(false);
      expect(exp().filterMode).toBeUndefined();
      expect(avisos.join(' ')).toContain('filtro=medianaMagica');
    });
  });

  describe('compTranslacao — o que define M4', () => {
    it('=1 liga a compensação de translação lateral', () => {
      expect(aplicarSessaoDaUrl('?compTranslacao=1', '')).toBe(true);
      expect(exp().lateralTranslationCompensation).toBe(true);
    });

    it('=0 desliga — dá para voltar à condição base pela mesma URL', () => {
      aplicarSessaoDaUrl('?compTranslacao=1', '');
      expect(aplicarSessaoDaUrl('?compTranslacao=0', '')).toBe(true);
      expect(exp().lateralTranslationCompensation).toBe(false);
    });

    it('valor inválido não liga nada', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      aplicarSessaoDaUrl('?compTranslacao=sim', '');
      expect(exp().lateralTranslationCompensation).toBeUndefined();
    });
  });

  it('a condição inteira de uma sessão cabe numa URL só', () => {
    const mudou = aplicarSessaoDaUrl(
      '?ep=webgpu&l2cs=448&filtro=kalman&diagonal=23.6&compTranslacao=0', '',
    );
    expect(mudou).toBe(true);
    const e = exp();
    expect(e.l2cs).toBe('webgpu');
    expect(e.l2csInputSize).toBe(448);
    expect(e.filterMode).toBe('kalman');
    expect(e.lateralTranslationCompensation).toBe(false);
    const s = JSON.parse(localStorage.getItem(CHAVE_SETTINGS) ?? '{}');
    expect(s.screenDiagonalIn).toBe(23.6);
    // `manual` e não `default`: quem escreveu a URL AFIRMOU a diagonal, e é
    // isso que faz `geometry.assumed` sair `false` no relatório.
    expect(s.screenGeometrySource).toBe('manual');
  });

  it('reaplicar a MESMA URL não pede reload — evita laço de recarga', () => {
    const url = '?ep=webgpu&l2cs=448&filtro=kalman&diagonal=23.6';
    expect(aplicarSessaoDaUrl(url, '')).toBe(true);
    expect(aplicarSessaoDaUrl(url, '')).toBe(false);
  });

  describe('pipeline e flags do V3 (docs/ROTEIRO_DE_MEDICAO.md)', () => {
    it('?pipeline=base e ?pipeline=v3 gravam o interruptor', () => {
      expect(aplicarSessaoDaUrl('?pipeline=base', '')).toBe(true);
      expect(exp().pipeline).toBe('base');
      expect(aplicarSessaoDaUrl('?pipeline=v3', '')).toBe(true);
      expect(exp().pipeline).toBe('v3');
    });

    it('?pipeline com valor inválido não grava nada', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(aplicarSessaoDaUrl('?pipeline=v4', '')).toBe(false);
      expect(exp().pipeline).toBeUndefined();
    });

    it('?exp.<flag>=1|0 liga ou desliga uma flag do V3 de cada vez', () => {
      expect(aplicarSessaoDaUrl('?exp.alvoInferiorCentral=1&exp.estimadorDeFixacao=0', '')).toBe(true);
      expect(exp().alvoInferiorCentral).toBe(true);
      expect(exp().estimadorDeFixacao).toBe(false);
    });

    it('M14 aceita o nome do modo, não 1/0', () => {
      const avisos: string[] = [];
      vi.spyOn(console, 'warn').mockImplementation((m: unknown) => { avisos.push(String(m)); });
      expect(aplicarSessaoDaUrl('?exp.suavizacaoDoLandmarker=desligada', '')).toBe(true);
      expect(exp().suavizacaoDoLandmarker).toBe('desligada');
      expect(aplicarSessaoDaUrl('?exp.suavizacaoDoLandmarker=1', '')).toBe(false);
      expect(avisos.join(' ')).toContain('suavizacaoDoLandmarker=1');
    });

    it('só flags do V3 passam por ?exp. — nem outras flags, nem chaves herdadas do objeto', () => {
      const avisos: string[] = [];
      vi.spyOn(console, 'warn').mockImplementation((m: unknown) => { avisos.push(String(m)); });
      expect(aplicarSessaoDaUrl('?exp.polynomialFeatures=0&exp.toString=1', '')).toBe(false);
      expect(exp().polynomialFeatures).toBeUndefined();
      expect(avisos.join(' ')).toContain('exp.polynomialFeatures');
      expect(avisos.join(' ')).toContain('exp.toString');
    });
  });

  it('lê da query do hash também (o app usa HashRouter)', () => {
    expect(aplicarSessaoDaUrl('', '#/calibration-check?filtro=kalmanEma')).toBe(true);
    expect(exp().filterMode).toBe('kalmanEma');
  });
});

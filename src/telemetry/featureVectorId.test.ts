import { describe, it, expect } from 'vitest';
import { FEATURE_VECTOR_ID, ACTIVE_FEATURE_SET, activeFeatureDims, sufixoSemantico } from '../extractor';
import { EXPERIMENT, VALORES_DA_BASE } from '../config/experiment';
import { startRecording, stopRecording, clearRecording, getRecording, parseJSONL, exportAsJSONL, recordFrame } from './recorder';

// O identificador do vetor existe para que uma gravação nunca seja medida
// contra um build diferente do que a produziu, em silêncio.
describe('FEATURE_VECTOR_ID', () => {
  it('descreve o conjunto ativo, a dimensão e o significado das features', () => {
    expect(FEATURE_VECTOR_ID).toBe(`${ACTIVE_FEATURE_SET}:${activeFeatureDims()}${sufixoSemantico()}`);
    // Literal de propósito: este é o teste que torna uma mudança de conjunto
    // ativo DELIBERADA e visível no diff, em vez de silenciosa. Mudou de
    // `irisCore+l2cs:6` para `irisAbs+l2cs:4` quando `dimsDaIris` passou a
    // 'absolutas', e ganhou `+rl+cab` com o pipeline V3: a dimensão é a
    // mesma, mas o L2CS desrolado com o sinal dele (M3) e girado para a cabeça
    // (M4) são OUTRAS features — um perfil treinado antes não pode ser
    // carregado depois. A íris em referencial isotrópico (M2, `+iso`) está
    // desligada por padrão.
    expect(FEATURE_VECTOR_ID).toBe('irisAbs+l2cs:4+rl+cab');
  });

  it('com o pipeline base o identificador é o de antes (perfis antigos continuam valendo)', () => {
    expect(sufixoSemantico(ACTIVE_FEATURE_SET, { ...EXPERIMENT, ...VALORES_DA_BASE })).toBe('');
    // Sem bloco do L2CS, só a marca da íris conta.
    expect(sufixoSemantico('irisCore', { ...EXPERIMENT, referencialIsotropico: true })).toBe('+iso');
    expect(sufixoSemantico('irisAbs+l2cs', { ...EXPERIMENT, ...VALORES_DA_BASE, nivelarRecorteCorrigido: true }))
      .toBe('+rc');
  });

  it('`compact` não promete dimensão fixa', () => {
    // 37 sem bloco L2CS, 44 com. Quem grava em `compact` não pode comparar por
    // dimensão — tem de recomputar.
    expect(activeFeatureDims('compact')).toBe('var');
    expect(activeFeatureDims('irisCore')).toBe(4);
  });

  it('muda quando o conjunto ativo muda — é o ponto do identificador', () => {
    expect(`irisCore:${activeFeatureDims('irisCore')}`).not.toBe(`irisCore+l2cs:${activeFeatureDims('irisCore+l2cs')}`);
    expect(`irisCore:${activeFeatureDims('irisCore')}`).not.toBe(`compact:${activeFeatureDims('compact')}`);
  });
});

describe('cabeçalho da gravação', () => {
  it('grava o identificador do vetor sem o caller poder errar', () => {
    clearRecording();
    startRecording({
      resolution: { w: 1920, h: 1080 },
      videoResolution: { w: 1920, h: 1080 },
    });
    stopRecording();
    expect(getRecording()?.header.featureVectorId).toBe(FEATURE_VECTOR_ID);
  });

  it('sobrevive à ida e volta pelo JSONL — é lá que consumidores lêem', () => {
    clearRecording();
    startRecording({
      resolution: { w: 1920, h: 1080 },
      videoResolution: { w: 1920, h: 1080 },
    });
    recordFrame({ captureTs: 0, emitTs: 0, frameIdx: 0, hasFace: false, blink: false });
    stopRecording();
    const round = parseJSONL(exportAsJSONL());
    expect(round?.header.featureVectorId).toBe(FEATURE_VECTOR_ID);
  });

  it('gravação anterior à mudança não tem o campo — e isso é detectável', () => {
    // Consumidores devem tratar ausência como "vetor desconhecido" e abortar
    // em vez de assumir compatibilidade. Este teste trava esse contrato.
    const antiga = parseJSONL(
      JSON.stringify({ formatVersion: 2, startedAt: 'x', resolution: { w: 1, h: 1 }, videoResolution: { w: 1, h: 1 } }) + String.fromCharCode(10),
    );
    expect(antiga?.header.featureVectorId).toBeUndefined();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  chaveDoContextoAtual,
  clearCalibration,
  haCalibracaoNoDisco,
  isCalibrated,
  loadProfile,
  PROFILES_STORAGE_KEY,
} from './calibration';
import { EXPERIMENT } from './config/experiment';
import type { StoredCalibrationProfile } from './calibrationProfiles';

// -----------------------------------------------------------------------------
// "Existe calibração salva?" precisava de uma resposta que NÃO dependa do
// engine já ter subido.
//
// `isCalibrated()` responde sobre os regressores em memória, que só existem
// depois do `loadProfile()` do engine. A tela de abertura decide para onde ir
// antes disso — e usando `isCalibrated()` ela mandaria para o menu um usuário
// que tem calibração, pulando a conferência justamente na abertura em que ela
// serve.
//
// E a resposta tem que ser a MESMA que o carregamento vai dar. Um perfil de
// outra tela ou de outra versão do vetor de features existe no disco, mas não
// carrega: responder "sim" para ele mandava a abertura para a conferência, que
// media o olhar sem modelo e dizia "Tudo como antes. Pode usar." — e o menu
// abria sem calibração. É o que toda atualização que muda o vetor (como a do
// V3) faria com todo paciente.
//
// Esta função lê o disco e não carrega nada: nenhum efeito colateral no
// caminho de uma decisão de rota.
// -----------------------------------------------------------------------------

function perfil(over: Partial<StoredCalibrationProfile> = {}): StoredCalibrationProfile {
  const modelo = {
    betaX: [0, 1], betaY: [0, 1], numFeatures: 1,
    lambda: 1, lambdaX: 1, lambdaY: 1,
    nearSingularCols: [] as number[], penalty: 'isotropic' as const,
  };
  return {
    meta: { id: 'p1', label: 'p1', createdAt: new Date(Date.now() - 60_000).toISOString(), opticalCondition: 'sem_oculos' },
    contextKey: chaveDoContextoAtual(),
    schemaVersion: 2,
    modelLeft: modelo,
    modelRight: { ...modelo },
    scalerParamsLeft: { means: [0], stds: [1] },
    scalerParamsRight: { means: [0], stds: [1] },
    reference: {
      pose: null, center: null,
      cameraDistanceCm: null, screenDistanceCm: null,
      refDistance: null, eyeReliability: null,
    },
    ...over,
  };
}

const gravar = (v: unknown) => localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(v));

/** A resposta da abertura e a do carregamento, lado a lado. */
function asDuas(): { abertura: boolean; carrega: boolean } {
  const abertura = haCalibracaoNoDisco();
  const carrega = loadProfile();
  clearCalibration();
  return { abertura, carrega };
}

const l2csAntes = EXPERIMENT.l2cs;
beforeEach(() => {
  localStorage.clear();
  clearCalibration();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  EXPERIMENT.l2cs = l2csAntes;
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('há calibração no disco?', () => {
  it('não, quando nunca houve calibração', () => {
    expect(haCalibracaoNoDisco()).toBe(false);
  });

  it('sim, quando há um perfil que carrega nesta tela', () => {
    gravar([perfil()]);
    expect(asDuas()).toEqual({ abertura: true, carrega: true });
  });

  it('não, com a lista vazia', () => {
    gravar([]);
    expect(haCalibracaoNoDisco()).toBe(false);
  });
});

describe('só vale o perfil que o carregamento aceitaria', () => {
  it('perfil de outra tela (outro tamanho de janela): não', () => {
    const chave = chaveDoContextoAtual().replace(/^\d+x\d+_/, '800x600_');
    gravar([perfil({ contextKey: chave })]);
    expect(asDuas()).toEqual({ abertura: false, carrega: false });
  });

  it('perfil de outra versão do vetor de features: não', () => {
    // O que a atualização para o V3 faz com todo perfil salvo.
    const chave = chaveDoContextoAtual().replace(/_[^_]+_v/, '_irisAbs+l2cs:4_v');
    expect(chave).not.toBe(chaveDoContextoAtual());
    gravar([perfil({ contextKey: chave })]);
    expect(asDuas()).toEqual({ abertura: false, carrega: false });
  });

  it('perfil de schema antigo, sem estado de referência: não', () => {
    gravar([perfil({ reference: undefined })]);
    expect(asDuas()).toEqual({ abertura: false, carrega: false });
  });

  it('entre um velho e um bom, o bom decide: sim', () => {
    const velha = chaveDoContextoAtual().replace(/^\d+x\d+_/, '800x600_');
    gravar([perfil({ contextKey: velha, meta: { ...perfil().meta, id: 'velho' } }), perfil()]);
    expect(asDuas()).toEqual({ abertura: true, carrega: true });
  });
});

describe('o lado do recorte do L2CS ainda não é conhecido na abertura', () => {
  const noOutroLado = () => chaveDoContextoAtual().replace(/l2cs448/, 'l2cs224');

  it('com o L2CS ligado, um perfil gravado em 224² conta (o worker decide o lado depois)', () => {
    EXPERIMENT.l2cs = 'auto';
    expect(noOutroLado()).not.toBe(chaveDoContextoAtual());
    gravar([perfil({ contextKey: noOutroLado() })]);
    expect(haCalibracaoNoDisco()).toBe(true);
  });

  it('com o L2CS desligado o lado é o configurado, e o outro não conta', () => {
    EXPERIMENT.l2cs = 'off';
    gravar([perfil({ contextKey: noOutroLado() })]);
    expect(haCalibracaoNoDisco()).toBe(false);
  });

  it.each(['webgpu', 'wasm'] as const)(
    'com o provider forçado (%s) o lado não muda, e o outro não conta',
    (provider) => {
      // A política por provider só troca o lado em `auto`. Contar o outro lado
      // mandava a abertura conferir um perfil que nunca carrega.
      EXPERIMENT.l2cs = provider;
      gravar([perfil({ contextKey: noOutroLado() })]);
      expect(asDuas()).toEqual({ abertura: false, carrega: false });
    },
  );
});

describe('armazenamento corrompido não vira "sim"', () => {
  it('JSON quebrado', () => {
    // Responder "sim" mandaria o usuário conferir uma calibração que não
    // existe, e a conferência mediria o modelo genérico.
    localStorage.setItem(PROFILES_STORAGE_KEY, '{isso não é json');
    expect(haCalibracaoNoDisco()).toBe(false);
  });

  it('JSON válido que não é uma lista', () => {
    gravar(perfil());
    expect(haCalibracaoNoDisco()).toBe(false);
  });

  it('lista de entradas sem `meta` ou sem modelos', () => {
    gravar([null, 42, {}, { meta: null }, { meta: { id: 'p1' } }]);
    expect(haCalibracaoNoDisco()).toBe(false);
  });
});

describe('não carrega nada', () => {
  it('perguntar não ativa o perfil', () => {
    // Uma consulta que ativasse o modelo mudaria o estado do rastreador a
    // partir de uma decisão de rota — e o efeito apareceria longe da causa.
    gravar([perfil()]);
    expect(haCalibracaoNoDisco()).toBe(true);
    expect(haCalibracaoNoDisco()).toBe(true);
    // Quem carrega continua sendo o `init()` do engine.
    expect(isCalibrated()).toBe(false);
  });
});

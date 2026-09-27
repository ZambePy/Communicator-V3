import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as calib from './calibration';
import { profileRegistry, type StoredCalibrationProfile } from './calibrationProfiles';

// -----------------------------------------------------------------------------
// Calibração por paciente.
//
// O mapeamento olho→tela é de UMA pessoa. Antes o núcleo restaurava a
// calibração mais recente, de quem fosse: depois de o paciente B calibrar, o
// paciente A perdia a dele — e só não usava a de B porque a interface guardava
// à parte quem tinha feito a última.
// -----------------------------------------------------------------------------

function perfil(id: string, createdAt: string, paciente?: string | null): StoredCalibrationProfile {
  const modelo = {
    betaX: [0, 1], betaY: [0, 1], numFeatures: 1,
    lambda: 1, lambdaX: 1, lambdaY: 1,
    nearSingularCols: [] as number[], penalty: 'isotropic' as const,
  };
  return {
    meta: {
      id, label: id, createdAt, opticalCondition: 'sem_oculos',
      ...(paciente !== undefined ? { paciente } : {}),
    },
    contextKey: calib.chaveDoContextoAtual(),
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
  };
}

const gravar = (lista: StoredCalibrationProfile[]) =>
  localStorage.setItem(calib.PROFILES_STORAGE_KEY, JSON.stringify(lista));
const doDisco = (): StoredCalibrationProfile[] =>
  JSON.parse(localStorage.getItem(calib.PROFILES_STORAGE_KEY) ?? '[]');

const ONTEM = new Date(Date.now() - 24 * 3600_000 + 60_000).toISOString();
const HOJE = new Date(Date.now() - 60_000).toISOString();

function zerar() {
  calib.definirPacienteDaCalibracao(null);
  profileRegistry.clear();
  calib.clearCalibration();
  localStorage.clear();
}

describe('cada paciente carrega a PRÓPRIA calibração', () => {
  beforeEach(zerar);
  afterEach(zerar);

  it('com as de A e de B no disco, A recebe a dele — mesmo sendo a mais antiga', () => {
    gravar([perfil('a1', ONTEM, 'A'), perfil('b1', HOJE, 'B')]);

    expect(calib.definirPacienteDaCalibracao('A')).toBe(true);
    expect(calib.getCalibrationTimestampMs()).toBe(Date.parse(ONTEM));
    expect(calib.calibracaoEmUsoEhDoPaciente('A')).toBe(true);
    expect(calib.calibracaoEmUsoEhDoPaciente('B')).toBe(false);

    // Trocar para B troca o modelo.
    expect(calib.definirPacienteDaCalibracao('B')).toBe(true);
    expect(calib.getCalibrationTimestampMs()).toBe(Date.parse(HOJE));
    expect(calib.calibracaoEmUsoEhDoPaciente('B')).toBe(true);
  });

  it('paciente que ainda não calibrou fica SEM modelo — nunca com o de outro', () => {
    gravar([perfil('a1', HOJE, 'A')]);
    calib.definirPacienteDaCalibracao('A');
    expect(calib.isCalibrated()).toBe(true);

    expect(calib.definirPacienteDaCalibracao('C')).toBe(false);
    expect(calib.isCalibrated()).toBe(false);
    expect(calib.haCalibracaoNoDisco()).toBe(false);
  });

  it('"há calibração no disco?" responde pelo paciente em uso', () => {
    gravar([perfil('a1', HOJE, 'A')]);
    calib.definirPacienteDaCalibracao('A');
    expect(calib.haCalibracaoNoDisco()).toBe(true);
    calib.definirPacienteDaCalibracao('B');
    expect(calib.haCalibracaoNoDisco()).toBe(false);
    // Sem paciente escolhido (abertura), vale qualquer uma.
    calib.definirPacienteDaCalibracao(null);
    expect(calib.haCalibracaoNoDisco()).toBe(true);
  });
});

describe('calibrações antigas, sem dono', () => {
  beforeEach(zerar);
  afterEach(zerar);

  it('passam a ser do primeiro paciente que as carrega, e somem para os outros', () => {
    gravar([perfil('antigo', HOJE)]);

    expect(calib.definirPacienteDaCalibracao('A')).toBe(true);
    expect(doDisco()[0].meta.paciente).toBe('A');

    expect(calib.definirPacienteDaCalibracao('B')).toBe(false);
  });

  it('a do próprio paciente vence uma antiga mais recente', () => {
    gravar([perfil('meu', ONTEM, 'A'), perfil('antigo', HOJE)]);
    calib.definirPacienteDaCalibracao('A');
    expect(calib.getCalibrationTimestampMs()).toBe(Date.parse(ONTEM));
  });

  it('o dono registrado pela interface recebe todas de uma vez (migração)', () => {
    gravar([perfil('x', ONTEM), perfil('y', HOJE), perfil('b', HOJE, 'B')]);
    expect(calib.atribuirCalibracoesSemDono('A')).toBe(2);
    const donos = doDisco().map((p) => p.meta.paciente).sort();
    expect(donos).toEqual(['A', 'A', 'B']);
  });
});

describe('gravar não apaga a calibração dos outros pacientes', () => {
  beforeEach(zerar);
  afterEach(zerar);

  it('remover as calibrações de um paciente mantém as dos outros', () => {
    gravar([perfil('a1', ONTEM, 'A'), perfil('b1', HOJE, 'B')]);
    calib.definirPacienteDaCalibracao('B');
    expect(calib.removerCalibracoesDoPaciente('B')).toBe(1);
    expect(calib.isCalibrated()).toBe(false);
    expect(doDisco().map((p) => p.meta.id)).toEqual(['a1']);
  });

  it('guarda as mais recentes de cada paciente, sem que um tome o lugar do outro', () => {
    const muitasDeA = Array.from({ length: 6 }, (_, i) =>
      perfil(`a${i}`, new Date(Date.now() - (i + 1) * 60_000).toISOString(), 'A'),
    );
    gravar([...muitasDeA, perfil('b1', ONTEM, 'B'), perfil('x1', ONTEM, 'X')]);
    // Qualquer gravação poda: aqui, a remoção das de X.
    calib.removerCalibracoesDoPaciente('X');
    const disco = doDisco();
    expect(disco.filter((p) => p.meta.paciente === 'A')).toHaveLength(calib.PERFIS_POR_PACIENTE);
    expect(disco.filter((p) => p.meta.paciente === 'A').map((p) => p.meta.id)).toEqual(['a0', 'a1', 'a2']);
    // A de B continua, mesmo mais antiga que todas as de A.
    expect(disco.some((p) => p.meta.id === 'b1')).toBe(true);
  });

  it('apagar um perfil pelo registry não o traz de volta do disco', () => {
    gravar([perfil('a1', HOJE, 'A')]);
    calib.definirPacienteDaCalibracao('A');
    expect(calib.deleteCalibrationProfile('a1')).toBe(true);
    expect(doDisco()).toEqual([]);
  });
});

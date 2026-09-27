import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import * as calib from '@tracker/calibration';
import { profileRegistry, type StoredCalibrationProfile } from '@tracker/calibrationProfiles';
import { AuthProvider, useAuth } from './AuthContext';

// A interface diz ao núcleo quem é o paciente — na hora em que ele é escolhido,
// para a conferência da calibração, que renderiza logo em seguida, perguntar
// pela calibração DELE (e nunca oferecer a do paciente anterior).

function perfil(id: string, createdAt: string, paciente: string): StoredCalibrationProfile {
  const modelo = {
    betaX: [0, 1], betaY: [0, 1], numFeatures: 1,
    lambda: 1, lambdaX: 1, lambdaY: 1,
    nearSingularCols: [] as number[], penalty: 'isotropic' as const,
  };
  return {
    meta: { id, label: id, createdAt, opticalCondition: 'sem_oculos', paciente },
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

const T_ANA = new Date(Date.now() - 3 * 3600_000).toISOString();
const T_BRUNO = new Date(Date.now() - 60_000).toISOString();

let auth: ReturnType<typeof useAuth> | null = null;
const Espiao = () => {
  auth = useAuth();
  return null;
};

function zerar() {
  calib.definirPacienteDaCalibracao(null);
  profileRegistry.clear();
  calib.clearCalibration();
  localStorage.clear();
  auth = null;
}

describe('AuthContext → calibração do paciente escolhido', () => {
  beforeEach(() => {
    zerar();
    localStorage.setItem(
      calib.PROFILES_STORAGE_KEY,
      JSON.stringify([perfil('c-ana', T_ANA, 'ana'), perfil('c-bruno', T_BRUNO, 'bruno')]),
    );
  });
  afterEach(zerar);

  it('escolher o paciente carrega a calibração dele na hora; trocar troca', () => {
    render(
      <AuthProvider>
        <Espiao />
      </AuthProvider>,
    );
    act(() => auth!.selectProfile({ id: 'ana', name: 'Ana' }));
    expect(calib.calibracaoEmUsoEhDoPaciente('ana')).toBe(true);
    expect(calib.getCalibrationTimestampMs()).toBe(Date.parse(T_ANA));

    act(() => auth!.selectProfile({ id: 'bruno', name: 'Bruno' }));
    expect(calib.calibracaoEmUsoEhDoPaciente('bruno')).toBe(true);
    expect(calib.calibracaoEmUsoEhDoPaciente('ana')).toBe(false);
    expect(calib.getCalibrationTimestampMs()).toBe(Date.parse(T_BRUNO));
  });

  it('paciente que reabre o app volta com a própria calibração', () => {
    localStorage.setItem('irisflow_auth', JSON.stringify({ currentProfile: { id: 'ana', name: 'Ana' } }));
    render(
      <AuthProvider>
        <Espiao />
      </AuthProvider>,
    );
    expect(calib.getPacienteDaCalibracao()).toBe('ana');
    expect(calib.getCalibrationTimestampMs()).toBe(Date.parse(T_ANA));
  });

  it('remover o paciente apaga as calibrações dele e mantém as dos outros', () => {
    render(
      <AuthProvider>
        <Espiao />
      </AuthProvider>,
    );
    act(() => auth!.selectProfile({ id: 'bruno', name: 'Bruno' }));
    act(() => auth!.removeProfile('bruno'));
    const ids = (JSON.parse(localStorage.getItem(calib.PROFILES_STORAGE_KEY) ?? '[]') as StoredCalibrationProfile[]).map(
      (p) => p.meta.id,
    );
    expect(ids).toEqual(['c-ana']);
    // O modelo do Bruno saiu da memória junto (sem paciente escolhido, o núcleo
    // pode ficar com o de outro — que só serve a quem for escolhido depois).
    expect(calib.calibracaoEmUsoEhDoPaciente('bruno')).toBe(false);
    expect(calib.getCalibrationTimestampMs()).not.toBe(Date.parse(T_BRUNO));
  });
});

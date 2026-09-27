import { afterEach, describe, expect, it } from 'vitest';
import { LICENSE_KEY } from '../../context/LicenseContext';
import { lazerLiberadoPelaLicenca } from './index';

const gravar = (features: Record<string, boolean> | undefined) =>
  localStorage.setItem(LICENSE_KEY, JSON.stringify({ plan: { id: 'x', name: 'IrisFlow X', validUntil: null, deviceLimit: 1, features } }));

afterEach(() => localStorage.clear());

describe('lazerLiberadoPelaLicenca', () => {
  it('segue features.lazer da licença gravada', () => {
    gravar({ relatorios: true, multiplos_dispositivos: true, assistente: true, voz: false, lazer: true });
    expect(lazerLiberadoPelaLicenca()).toBe(true);
    gravar({ relatorios: false, multiplos_dispositivos: false, assistente: false, voz: false, lazer: false });
    expect(lazerLiberadoPelaLicenca()).toBe(false);
  });

  it('sem licença, sem features ou sem a chave (servidor antigo): liberado', () => {
    expect(lazerLiberadoPelaLicenca()).toBe(true);
    gravar(undefined);
    expect(lazerLiberadoPelaLicenca()).toBe(true);
    gravar({ relatorios: false, multiplos_dispositivos: false, assistente: false, voz: false });
    expect(lazerLiberadoPelaLicenca()).toBe(true);
  });

  it('licença ilegível não bloqueia o paciente', () => {
    localStorage.setItem(LICENSE_KEY, '{quebrado');
    expect(lazerLiberadoPelaLicenca()).toBe(true);
  });
});

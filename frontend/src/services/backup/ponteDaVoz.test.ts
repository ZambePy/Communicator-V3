import { describe, it, expect } from 'vitest';
import { ponteDoBackupDaVoz } from './ponteDaVoz';

// A ponte do Electron (`window.irisflowVozGuardada`) é a única porta para as
// gravações guardadas na pasta do app. Sem ela (navegador) ou com ela incompleta,
// o backup não pode fingir que sabe levar a voz.

const janela = (ponte: unknown) => ({ irisflowVozGuardada: ponte }) as unknown as Window;
const fn = async () => ({ ok: true });

describe('ponteDoBackupDaVoz', () => {
  it('sem ponte na janela (navegador, desenvolvimento): null', () => {
    expect(ponteDoBackupDaVoz({} as unknown as Window)).toBeNull();
    expect(ponteDoBackupDaVoz(undefined)).toBeNull();
  });

  it('uma ponte sem as três chamadas do backup (aplicativo mais antigo) não serve: null — melhor sem a voz, dito, do que um erro no meio', () => {
    expect(ponteDoBackupDaVoz(janela({ listar: fn, salvar: fn, ler: fn }))).toBeNull();
    expect(ponteDoBackupDaVoz(janela({ backupListar: fn, backupLer: fn }))).toBeNull(); // falta restaurar
    expect(ponteDoBackupDaVoz(janela({ backupListar: fn, backupLer: fn, backupRestaurar: 'não é função' }))).toBeNull();
  });

  it('a ponte completa é devolvida', () => {
    const ponte = { backupListar: fn, backupLer: fn, backupRestaurar: fn, listar: fn };

    expect(ponteDoBackupDaVoz(janela(ponte))).toBe(ponte);
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { cofre } from './armazenamento';

type Janela = { irisflowCloud?: unknown };

function ponte(appInfo: () => Promise<unknown>) {
  (window as unknown as Janela).irisflowCloud = {
    secureGet: async () => null,
    secureSet: async () => true,
    secureRemove: async () => true,
    appInfo,
  };
}

afterEach(() => {
  delete (window as unknown as Janela).irisflowCloud;
});

describe('cofre.protecao — o que o cofre faz de verdade', () => {
  it('fora do Electron é o localStorage do navegador', async () => {
    expect(await cofre.protecao()).toBe('navegador');
  });

  it('no Electron com safeStorage disponível: cifrado', async () => {
    ponte(async () => ({ version: '1.0.0', hostname: 'pc', platform: 'win32', encryptionAvailable: true }));
    expect(await cofre.protecao()).toBe('cifrado');
  });

  it('no Electron SEM safeStorage (o processo principal grava em texto): sem-cifra, e não "cifrado"', async () => {
    ponte(async () => ({ version: '1.0.0', hostname: 'pc', platform: 'linux', encryptionAvailable: false }));
    expect(await cofre.protecao()).toBe('sem-cifra');
  });

  it('se o processo principal não responder, não afirma nada', async () => {
    ponte(async () => { throw new Error('ipc fora'); });
    expect(await cofre.protecao()).toBe('desconhecida');
    ponte(async () => ({ version: '1.0.0' }));
    expect(await cofre.protecao()).toBe('desconhecida');
  });
});

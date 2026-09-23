import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./CloudContext', () => ({
  useCloud: () => ({
    configurada: true, online: true, realtime: 'conectado', filaPendente: 0, naoFaladas: 0,
    vinculo: { device_id: 'd1', device_key: 'k', beneficiary_id: 'b1', beneficiary_name: 'Carlos', email: 'f@x.com', pareado_em: '2026-09-23T00:00:00Z' },
  }),
}));
vi.mock('../services/license', () => ({ licenseBackend: 'supabase' }));

import { CloudStatusLines, TEXTO_DA_PROTECAO } from './CloudStatusLines';

type Janela = { irisflowCloud?: unknown };
const Linha: React.FC<{ icone: React.ReactNode; children: React.ReactNode }> = ({ children }) => <p>{children}</p>;

function ponte(encryptionAvailable: boolean) {
  (window as unknown as Janela).irisflowCloud = {
    secureGet: async () => null,
    secureSet: async () => true,
    secureRemove: async () => true,
    appInfo: async () => ({ version: '1.0.0', hostname: 'pc', platform: 'linux', encryptionAvailable }),
  };
}

afterEach(() => {
  delete (window as unknown as Janela).irisflowCloud;
});

describe('CloudStatusLines — a linha do cofre diz o estado real', () => {
  it('safeStorage disponível: "cifradas pelo sistema"', async () => {
    ponte(true);
    render(<CloudStatusLines Linha={Linha} />);
    expect(await screen.findByText(new RegExp(TEXTO_DA_PROTECAO.cifrado.replace(/[()]/g, '\\$&')))).toBeInTheDocument();
  });

  it('Electron sem safeStorage: diz que está SEM cifra, em vez de "cifradas"', async () => {
    ponte(false);
    render(<CloudStatusLines Linha={Linha} />);
    expect(await screen.findByText(/guardadas SEM cifra/)).toBeInTheDocument();
    expect(screen.queryByText(/cifradas pelo sistema/)).toBeNull();
  });

  it('fora do Electron: navegador (modo de desenvolvimento)', async () => {
    render(<CloudStatusLines Linha={Linha} />);
    expect(await screen.findByText(/guardadas no navegador/)).toBeInTheDocument();
  });
});

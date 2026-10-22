import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { SettingsProvider, useSettings } from './SettingsContext';
import { CONTAGEM_MAX_S, CONTAGEM_MIN_S, CONTAGEM_PADRAO_S } from '../services/emergencia/contagemDaEmergencia';

// -----------------------------------------------------------------------------
// Três ajustes da rodada 3 (21/10/2026): a varredura falada do Plano B, a
// contagem da Emergência (3–10 s, padrão 5) e o modo hospital. Campos novos:
// o disco de antes não os tem, e o que vier de um arquivo editado à mão (ou de
// um backup de outra versão) não pode sair da faixa segura — uma contagem de
// 0 s mandaria o socorro na hora, sem CANCELAR.
// -----------------------------------------------------------------------------

const Sonda: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  return (
    <div>
      <span data-testid="falada">{String(settings.varreduraFalada)}</span>
      <span data-testid="contagem">{String(settings.contagemDaEmergenciaS)}</span>
      <span data-testid="hospital">{String(settings.modoHospital)}</span>
      <button data-testid="ligar" onClick={() => updateSettings({ varreduraFalada: true, modoHospital: true, contagemDaEmergenciaS: 8 })}>ligar</button>
    </div>
  );
};

const gravar = (campos: Record<string, unknown>) =>
  localStorage.setItem('irisflow_settings', JSON.stringify({ ...campos, schemaVersion: 1 }));
const montar = () => render(<SettingsProvider><Sonda /></SettingsProvider>);
const valor = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('padrões', () => {
  it('sem nada gravado: varredura falada desligada, contagem de 5 s, modo hospital desligado', () => {
    montar();
    expect(valor('falada')).toBe('false');
    expect(valor('contagem')).toBe(String(CONTAGEM_PADRAO_S));
    expect(CONTAGEM_PADRAO_S).toBe(5);
    expect(valor('hospital')).toBe('false');
  });

  it('disco de antes dos campos: os padrões (e o resto continua valendo)', () => {
    gravar({ acionadorPassoMs: 2000 });
    montar();
    expect(valor('falada')).toBe('false');
    expect(valor('contagem')).toBe('5');
    expect(valor('hospital')).toBe('false');
  });
});

describe('o que foi gravado volta', () => {
  it('os três ajustes', () => {
    gravar({ varreduraFalada: true, contagemDaEmergenciaS: 8, modoHospital: true });
    montar();
    expect(valor('falada')).toBe('true');
    expect(valor('contagem')).toBe('8');
    expect(valor('hospital')).toBe('true');
  });

  it.each([3, 10])('os limites da contagem (%i s) passam como estão', (s) => {
    gravar({ contagemDaEmergenciaS: s });
    montar();
    expect(valor('contagem')).toBe(String(s));
  });

  it('mudar em Configurações grava no disco', () => {
    montar();
    act(() => { screen.getByTestId('ligar').click(); });
    expect(valor('falada')).toBe('true');
    expect(valor('contagem')).toBe('8');
    expect(valor('hospital')).toBe('true');
    const gravado = JSON.parse(localStorage.getItem('irisflow_settings')!);
    expect(gravado.varreduraFalada).toBe(true);
    expect(gravado.contagemDaEmergenciaS).toBe(8);
    expect(gravado.modoHospital).toBe(true);
  });
});

describe('o que vem fora da faixa volta para dentro dela', () => {
  it('contagem abaixo do mínimo sobe para 3 s — nunca 0, que mandaria o socorro na hora', () => {
    for (const ruim of [2, 1, 0, -4]) {
      gravar({ contagemDaEmergenciaS: ruim });
      const { unmount } = montar();
      expect(valor('contagem'), String(ruim)).toBe(String(CONTAGEM_MIN_S));
      unmount();
    }
  });

  it('contagem acima do máximo desce para 10 s', () => {
    gravar({ contagemDaEmergenciaS: 99_000 });
    montar();
    expect(valor('contagem')).toBe(String(CONTAGEM_MAX_S));
  });

  it.each([['texto', '8'], ['nulo', null], ['objeto', { s: 8 }], ['lista', [8]], ['verdadeiro', true]])(
    'contagem que não é número (%s) volta ao padrão',
    (_nome, ruim) => {
      gravar({ contagemDaEmergenciaS: ruim });
      montar();
      expect(valor('contagem')).toBe('5');
    },
  );

  it.each([['texto', 'true'], ['número', 1], ['nulo', null], ['objeto', {}]])(
    'varredura falada e modo hospital que não são booleanos (%s) voltam a desligados',
    (_nome, ruim) => {
      gravar({ varreduraFalada: ruim, modoHospital: ruim });
      montar();
      expect(valor('falada')).toBe('false');
      expect(valor('hospital')).toBe('false');
    },
  );
});

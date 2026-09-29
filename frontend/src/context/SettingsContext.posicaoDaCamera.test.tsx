import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { SettingsProvider, useSettings } from './SettingsContext';

// A posição da câmera (saída 6DoF, M12) vem do disco: um valor adulterado ou de
// outra versão não pode chegar à geometria — vira "não respondida" (null), e a
// saída fica no caminho clássico.

const wrapper = ({ children }: { children: React.ReactNode }) => <SettingsProvider>{children}</SettingsProvider>;

describe('posicaoDaCamera salva', () => {
  beforeEach(() => localStorage.clear());

  it('uma posição válida volta como foi salva', () => {
    localStorage.setItem('irisflow_settings', JSON.stringify({ posicaoDaCamera: 'notebook' }));
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settings.posicaoDaCamera).toBe('notebook');
  });

  it('valor desconhecido ou de tipo errado vira null', () => {
    for (const v of ['teto', 3, { lado: 'topo' }]) {
      localStorage.setItem('irisflow_settings', JSON.stringify({ posicaoDaCamera: v }));
      const { result, unmount } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.settings.posicaoDaCamera).toBeNull();
      unmount();
    }
  });

  it('sem nada salvo, não respondida', () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.settings.posicaoDaCamera).toBeNull();
  });
});

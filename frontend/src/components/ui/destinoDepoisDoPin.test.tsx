import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import { lerDestinoDepoisDoPin, useSeguirDepoisDoPin } from './destinoDepoisDoPin';

// O portão do PIN fica nas Configurações. Quem chegava a ele vindo de uma rota
// do cuidador (o guia, a partir da falha da calibração) digitava o PIN e ficava
// nas Configurações; o destino se perdia no caminho.

function Portao({ aberta }: { aberta: boolean }) {
  useSeguirDepoisDoPin(aberta);
  return <div>{aberta ? 'configurações abertas' : 'portão do PIN'}</div>;
}

const montar = (aberta: boolean, state?: unknown) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/settings', state }]}>
      <Routes>
        <Route path="/settings" element={<Portao aberta={aberta} />} />
        <Route path="/caregiver/guide" element={<div>guia do cuidador</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('depois do PIN, o destino que o portão guardou', () => {
  it('com a área destravada, segue para o destino', () => {
    montar(true, { depoisDoPin: '/caregiver/guide?from=/calibration-check' });
    expect(screen.getByText('guia do cuidador')).toBeTruthy();
  });

  it('com a área fechada, fica no portão', () => {
    montar(false, { depoisDoPin: '/caregiver/guide' });
    expect(screen.getByText('portão do PIN')).toBeTruthy();
  });

  it('sem destino guardado, as Configurações abrem como sempre', () => {
    montar(true);
    expect(screen.getByText('configurações abertas')).toBeTruthy();
  });

  it('só aceita caminhos do próprio app', () => {
    expect(lerDestinoDepoisDoPin({ depoisDoPin: '/conta' })).toBe('/conta');
    expect(lerDestinoDepoisDoPin({ depoisDoPin: '//exemplo.com' })).toBeNull();
    expect(lerDestinoDepoisDoPin({ depoisDoPin: 'https://exemplo.com' })).toBeNull();
    expect(lerDestinoDepoisDoPin({ depoisDoPin: 42 })).toBeNull();
    expect(lerDestinoDepoisDoPin(null)).toBeNull();
  });
});

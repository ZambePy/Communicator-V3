import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import i18n from '../../../i18n';
import { Posicionamento } from './Posicionamento';

// O enquadramento lê o engine a 10 Hz; aqui só interessa o que o passo instrui.
vi.mock('../../../components/ui/FramingIndicator', () => ({ FramingIndicator: () => null }));

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

describe('Posicionamento', () => {
  it('instrui a altura da tela e o que fazer com a pálpebra caída', () => {
    render(<Posicionamento checks={[]} distanciaCm={60} msEstavel={0} verde={false} />);
    expect(screen.getByText(/topo da tela na altura dos olhos/i)).toBeInTheDocument();
    // Com ptose, subir a tela levanta a pálpebra (docs/PESQUISA.md §4.1).
    expect(screen.getByText(/pálpebra cobre parte do olho, suba um pouco a tela/i)).toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { DoresRelatadas } from './DoresRelatadas';

// Relatório clínico: as dores relatadas no mapa da dor (19/10/2026).

const AGORA = Date.parse('2026-10-19T12:00:00Z');
const dor = (id: string, horasAtras: number, nivel: number, lugar = 'Braço esquerdo') => ({
  id, local: 'braco-esquerdo', lugar, nivel, frase: `Dor, nível ${nivel} de 10`,
  timestamp: new Date(AGORA - horasAtras * 3600_000).toISOString(),
});

describe('Dores relatadas (Configurações → histórico clínico)', () => {
  it('vazio diz que não há relato', () => {
    render(<DoresRelatadas dores={[]} agora={AGORA} />);
    expect(screen.getByText('Nenhuma dor relatada no mapa da dor.')).toBeInTheDocument();
  });

  it('mais recente primeiro, com lugar, número e palavra; resume a última semana', () => {
    render(
      <DoresRelatadas
        agora={AGORA}
        dores={[dor('a', 30, 3), dor('b', 2, 9, 'Cabeça'), dor('c', 24 * 10, 10, 'Costas')]}
      />,
    );
    const itens = screen.getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('Cabeça');
    expect(itens[0]).toHaveTextContent('9/10 · forte');
    expect(itens[1]).toHaveTextContent('3/10 · leve');
    expect(itens[2]).toHaveTextContent('10/10 · pior dor possível');
    // O relato de 10 dias atrás não entra no resumo da semana.
    expect(screen.getByText('2 relatos nos últimos 7 dias · maior nível: 9 de 10')).toBeInTheDocument();
  });

  it('registro malformado (editado à mão) não derruba o cartão', () => {
    render(<DoresRelatadas agora={AGORA} dores={[dor('a', 1, 4), { ...dor('x', 1, 5), timestamp: 'ontem' }]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});

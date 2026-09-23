import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { LeiturasSection } from './LeiturasSection';
import { CHAVE_DAS_LEITURAS, lerLeituras } from '../entertainment/NewsScreen';

/**
 * O contrato desta seção é o mesmo que a tela de Leituras do paciente lê:
 * `localStorage['irisflow_leituras']` com `{ id, titulo, texto, criadoEm }`.
 * Se o formato divergir, o cuidador guarda e o paciente não vê nada.
 */
describe('Leituras em Configurações', () => {
  beforeEach(() => localStorage.clear());

  it('começa vazia e diz o que fazer', () => {
    render(<LeiturasSection />);
    expect(screen.getByTestId('leituras-vazio')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guardar leitura/i })).toBeDisabled();
  });

  it('grava uma leitura no formato que a tela do paciente lê', () => {
    render(<LeiturasSection />);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Carta da Ana' } });
    fireEvent.change(screen.getByLabelText('Texto'), {
      target: { value: 'Querido pai, hoje o dia amanheceu bonito.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar leitura/i }));

    const salvas = lerLeituras();
    expect(salvas).toHaveLength(1);
    expect(salvas[0]).toMatchObject({
      titulo: 'Carta da Ana',
      texto: 'Querido pai, hoje o dia amanheceu bonito.',
    });
    expect(typeof salvas[0].id).toBe('string');
    expect(salvas[0].id.length).toBeGreaterThan(0);
    // `criadoEm` é ISO 8601 válido.
    expect(new Date(salvas[0].criadoEm).toISOString()).toBe(salvas[0].criadoEm);

    // O bruto no disco é um array de objetos com as quatro chaves.
    const bruto = JSON.parse(localStorage.getItem(CHAVE_DAS_LEITURAS)!);
    expect(Array.isArray(bruto)).toBe(true);
    expect(Object.keys(bruto[0]).sort()).toEqual(['criadoEm', 'id', 'texto', 'titulo']);

    // Aparece na lista e o formulário limpa.
    expect(screen.getByText('Carta da Ana')).toBeInTheDocument();
    expect(screen.getByLabelText('Texto')).toHaveValue('');
    expect(screen.queryByTestId('leituras-vazio')).toBeNull();
  });

  it('sem título, ganha um título padrão; sem texto, não grava', () => {
    render(<LeiturasSection />);
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'Só o texto.' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar leitura/i }));
    expect(lerLeituras()[0].titulo).toBe('Leitura 1');

    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: /guardar leitura/i })).toBeDisabled();
    expect(lerLeituras()).toHaveLength(1);
  });

  it('apaga uma leitura guardada e mantém as outras', () => {
    localStorage.setItem(
      CHAVE_DAS_LEITURAS,
      JSON.stringify([
        { id: 'a', titulo: 'Primeira', texto: 'um', criadoEm: new Date().toISOString() },
        { id: 'b', titulo: 'Segunda', texto: 'dois', criadoEm: new Date().toISOString() },
      ])
    );
    render(<LeiturasSection />);
    expect(screen.getByText('Primeira')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /apagar leitura: primeira/i }));
    expect(screen.queryByText('Primeira')).toBeNull();
    expect(screen.getByText('Segunda')).toBeInTheDocument();
    expect(lerLeituras().map((l) => l.id)).toEqual(['b']);
  });
});

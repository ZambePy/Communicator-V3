import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import i18n from '../../i18n';
import { PortaoDoPin, ALTURA_DA_TECLA_PX } from './PortaoDoPin';

// -----------------------------------------------------------------------------
// O portão do PIN precisa ser LEGÍVEL no tema escuro, que é o padrão do app.
// A versão anterior tinha título e "Cancelar" com cores cravadas do tema
// claro: no escuro o título sumia e a única saída por olhar ficava sem rótulo.
// -----------------------------------------------------------------------------

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

const montar = (aoEntrar = vi.fn(() => false), aoCancelar = vi.fn()) => {
  render(
    <PortaoDoPin
      titulo="Acesso do Cuidador"
      dica="Insira o PIN."
      aoEntrar={aoEntrar}
      mensagemDeErro="PIN incorreto"
      aoCancelar={aoCancelar}
    />
  );
  return { aoEntrar, aoCancelar };
};

describe('legibilidade no tema', () => {
  it('o título e a dica usam a cor de texto do tema, não um literal claro', () => {
    montar();
    const titulo = screen.getByRole('heading', { name: 'Acesso do Cuidador' });
    expect(titulo.style.color).toBe('var(--color-text-base)');
    expect(screen.getByText('Insira o PIN.').style.color).toBe('var(--color-text-muted)');
  });

  it('o Cancelar tem rótulo na cor do tema sobre o cartão do tema', () => {
    montar();
    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancelar.style.color).toBe('var(--color-text-base)');
    expect(cancelar.style.background).toBe('var(--color-card-bg)');
    expect(cancelar.style.opacity).toBe('1');
  });

  it('as teclas numéricas são cartões escuros do tema, com alvo de 88 px', () => {
    montar();
    const tecla = screen.getByRole('button', { name: '5' });
    expect(tecla.style.background).toBe('var(--color-card-bg)');
    expect(tecla.style.color).toBe('var(--color-text-base)');
    expect(parseInt(tecla.style.minHeight, 10)).toBeGreaterThanOrEqual(88);
    expect(ALTURA_DA_TECLA_PX).toBeGreaterThanOrEqual(88);
  });
});

describe('comportamento', () => {
  it('digita pelo teclado, envia e limpa o campo', () => {
    const { aoEntrar } = montar(vi.fn(() => true));
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(aoEntrar).toHaveBeenCalledWith('12');
    expect((screen.getByPlaceholderText('••••') as HTMLInputElement).value).toBe('');
  });

  it('mostra o erro quando o PIN não abre a porta', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('PIN incorreto');
  });

  it('Apagar remove o último dígito e Limpar zera', () => {
    const { aoEntrar } = montar();
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(aoEntrar).toHaveBeenLastCalledWith('1');
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(aoEntrar).toHaveBeenLastCalledWith('');
  });

  it('Cancelar chama a saída', () => {
    const { aoCancelar } = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(aoCancelar).toHaveBeenCalled();
  });
});

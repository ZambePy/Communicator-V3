import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BotaoDeEmergencia } from './BotaoDeEmergencia';

/**
 * "Não quero ensaiar agora" precisa FAZER alguma coisa.
 *
 * Antes chamava `aoEnsaiar(false)`, que o wizard descartava: o botão não
 * fazia nada. Para quem só tem o olhar, um botão que não responde ensina que
 * o app não responde — no passo que ensina a pedir socorro.
 */
const emergencia = vi.hoisted(() => ({
  setModoEnsaio: vi.fn(),
  ensaioDisparado: false,
}));
vi.mock('../../../context/EmergencyContext', () => ({
  useEmergency: () => ({
    setModoEnsaio: emergencia.setModoEnsaio,
    ensaioDisparado: emergencia.ensaioDisparado,
  }),
}));

describe('BotaoDeEmergencia', () => {
  beforeEach(() => {
    emergencia.setModoEnsaio.mockClear();
    emergencia.ensaioDisparado = false;
  });

  it('"não quero ensaiar agora" avança, e é um alvo de olhar de 76 px', () => {
    const aoPular = vi.fn();
    const aoEnsaiar = vi.fn();
    render(<BotaoDeEmergencia aoEnsaiar={aoEnsaiar} aoPular={aoPular} />);

    const pular = screen.getByRole('button', { name: /tutorial\.emergencia\.pular/ });
    expect(pular.className).toContain('gaze-button');
    expect(pular.style.height).toBe('76px');

    fireEvent.click(pular);
    expect(aoPular).toHaveBeenCalledTimes(1);
    // Pular não é ensaiar.
    expect(aoEnsaiar).not.toHaveBeenCalled();
  });

  it('liga o modo de ensaio ao entrar e desliga ao sair', () => {
    const { unmount } = render(<BotaoDeEmergencia aoEnsaiar={vi.fn()} aoPular={vi.fn()} />);
    expect(emergencia.setModoEnsaio).toHaveBeenLastCalledWith(true);
    unmount();
    expect(emergencia.setModoEnsaio).toHaveBeenLastCalledWith(false);
  });

  it('avisa que ensaiou quando o ensaio dispara', () => {
    emergencia.ensaioDisparado = true;
    const aoEnsaiar = vi.fn();
    render(<BotaoDeEmergencia aoEnsaiar={aoEnsaiar} aoPular={vi.fn()} />);
    expect(aoEnsaiar).toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(/tutorial\.emergencia\.ensaiado/);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { SettingsProvider, useSettings } from '../../context/SettingsContext';
import { ControleDeDwell } from '../../components/ui/ControleDeDwell';
import { AccessibilityScreen } from './AcessibilidadeScreen';

vi.mock('../../context/ReminderContext', () => ({
  useReminders: () => ({ activeReminder: null, dismissActiveReminder: vi.fn() }),
}));
vi.mock('../../cloud/CloudContext', () => ({ useCloud: () => ({ ajustesRemotos: { emergency_timeout_s: 30 } }) }));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

/** O controle de Configurações, montado ao lado: a prova de que é UM estado só. */
const ControleDeConfiguracoes: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  return (
    <div data-testid="configuracoes">
      <ControleDeDwell valorMs={settings.dwellMs} aoMudar={(ms) => updateSettings({ dwellMs: ms })} />
      <span data-testid="brilho">{settings.brightnessLevel}</span>
      <span data-testid="som">{String(settings.soundEnabled)}</span>
      <span data-testid="ambar">{String(settings.amberFilter)}</span>
    </div>
  );
};

const montar = () =>
  render(
    <SettingsProvider>
      <MemoryRouter>
        <AccessibilityScreen />
        <ControleDeConfiguracoes />
      </MemoryRouter>
    </SettingsProvider>
  );

const slider = () => screen.getByRole('slider') as HTMLInputElement;

describe('Acessibilidade', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('pt-BR');
    navigate.mockClear();
  });

  it('é uma tela de verdade, não mais o "Em breve"', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Acessibilidade' })).toBeInTheDocument();
    expect(screen.queryByText(/em breve/i)).toBeNull();
    expect(screen.getByRole('group', { name: /Tempo de permanência: 1,5 s/ })).toBeInTheDocument();
  });

  it('mudar o tempo aqui muda o MESMO ajuste que Configurações usa', () => {
    montar();
    expect(slider().value).toBe('1500');
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar o tempo de permanência' }));
    expect(slider().value).toBe('1600');
    expect(screen.getByRole('group', { name: /Tempo de permanência: 1,6 s/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir o tempo de permanência' }));
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir o tempo de permanência' }));
    expect(slider().value).toBe('1400');
    // E persiste no mesmo lugar de sempre.
    expect(JSON.parse(localStorage.getItem('irisflow_settings') ?? '{}').dwellMs).toBe(1400);
  });

  it('e o contrário: mexer no slider de Configurações aparece aqui', () => {
    montar();
    fireEvent.change(slider(), { target: { value: '2500' } });
    expect(screen.getByRole('group', { name: /Tempo de permanência: 2,5 s/ })).toBeInTheDocument();
  });

  it('brilho, som e filtro âmbar escrevem nos ajustes compartilhados', () => {
    montar();
    // Brilho já está no máximo: "mais claro" desabilitado, "mais escuro" anda 5 %.
    expect(screen.getByRole('button', { name: 'Aumentar o brilho da tela' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Diminuir o brilho da tela' }));
    expect(screen.getByTestId('brilho')).toHaveTextContent('0.95');

    fireEvent.click(screen.getByRole('switch', { name: 'Som ao selecionar' }));
    expect(screen.getByTestId('som')).toHaveTextContent('false');

    fireEvent.click(screen.getByRole('switch', { name: 'Filtro âmbar' }));
    expect(screen.getByTestId('ambar')).toHaveTextContent('true');
  });

  it('todos os controles são alvos de olhar grandes (GazeButton), não sliders', () => {
    montar();
    const grade = screen.getByTestId('acessibilidade-grade');
    expect(grade.querySelector('input[type="range"]')).toBeNull();
    for (const b of grade.querySelectorAll('button')) expect(b.className).toContain('gaze-button');
  });

  it('a segunda página tem idioma, atalhos e o prazo da emergência (só leitura)', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Mais ajustes/ }));
    expect(screen.getByRole('group', { name: /Alerta de emergência: 30 s/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Calibrar o olhar/ }));
    expect(navigate).toHaveBeenCalledWith('/calibration-check');
    fireEvent.click(screen.getByRole('button', { name: /Todas as configurações/ }));
    expect(navigate).toHaveBeenCalledWith('/settings');
    fireEvent.click(screen.getByRole('button', { name: /Tempo e tela/ }));
    expect(screen.getByRole('button', { name: 'Aumentar o tempo de permanência' })).toBeInTheDocument();
  });
});

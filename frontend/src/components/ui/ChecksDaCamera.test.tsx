import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import i18n from '../../i18n';
import { ChecksDaCamera, resumirChecks } from './ChecksDaCamera';
import type { ReadinessReport, ReadinessCheck, CheckStatus } from '@tracker/setupReadiness';

// -----------------------------------------------------------------------------
// A pessoa sentada na frente da câmera vê o sistema entendendo-a: três linhas,
// ✓ ou ○, ligadas ao que o `evaluateReadiness` já mede. Continuar habilita
// quando as três passam — ou depois da espera máxima, com aviso. E NUNCA
// prende quem o software não conseguiu medir.
// -----------------------------------------------------------------------------

vi.mock('../../context/GazeContext', () => ({ useGaze: () => ({ getDiagnostics: () => null }) }));
vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({ settings: { cameraHorizontalFovDeg: 60 } }),
}));

const check = (id: ReadinessCheck['id'], status: CheckStatus, message = ''): ReadinessCheck => ({
  id,
  status,
  value: null,
  message,
});

const relatorio = (checks: ReadinessCheck[]): ReadinessReport =>
  ({ checks, canStart: true, blockedHard: false }) as unknown as ReadinessReport;

const TUDO_OK = relatorio([
  check('face', 'ok'),
  check('lighting', 'ok'),
  check('contrast', 'ok'),
  check('distance', 'ok'),
  check('centering', 'ok'),
  check('headPose', 'ok'),
]);

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('resumirChecks', () => {
  it('sem relatório, ainda não há o que resumir', () => {
    expect(resumirChecks(null)).toBeNull();
  });

  it('cada linha só passa quando TODOS os checks dela passam', () => {
    const r = resumirChecks(
      relatorio([
        check('face', 'ok'),
        check('lighting', 'ok'),
        check('contrast', 'warn', 'Aumente o contraste.'),
        check('distance', 'fail', 'Aproxime-se da tela.'),
        check('centering', 'ok'),
      ])
    )!;
    expect(r.find((i) => i.id === 'rosto')!.estado).toBe('ok');
    expect(r.find((i) => i.id === 'iluminacao')).toMatchObject({
      estado: 'pendente',
      dica: 'Aumente o contraste.',
    });
    expect(r.find((i) => i.id === 'enquadramento')).toMatchObject({
      estado: 'pendente',
      dica: 'Aproxime-se da tela.',
    });
  });
});

describe('a lista viva', () => {
  it('mostra as três linhas com ✓ quando tudo passa e libera o Continuar', () => {
    const onPronto = vi.fn();
    render(<ChecksDaCamera avaliar={() => TUDO_OK} onPronto={onPronto} />);
    expect(screen.getByText('Rosto encontrado')).toBeInTheDocument();
    expect(screen.getByText('Iluminação adequada')).toBeInTheDocument();
    expect(screen.getByText('Distância e enquadramento')).toBeInTheDocument();
    expect(
      screen.getByTestId('checks-da-camera').querySelectorAll('[data-estado="ok"]')
    ).toHaveLength(3);
    expect(onPronto).toHaveBeenLastCalledWith(true);
  });

  it('com um check pendente, segura o Continuar e mostra ○ com a dica', () => {
    const onPronto = vi.fn();
    render(
      <ChecksDaCamera
        avaliar={() =>
          relatorio([
            check('face', 'fail', 'Centralize o rosto.'),
            check('lighting', 'ok'),
            check('distance', 'ok'),
          ])
        }
        onPronto={onPronto}
      />
    );
    expect(screen.getByText('Centralize o rosto.')).toBeInTheDocument();
    expect(
      screen.getByTestId('checks-da-camera').querySelector('[data-check="rosto"]')
    ).toHaveAttribute('data-estado', 'pendente');
    expect(onPronto).toHaveBeenLastCalledWith(false);
    expect(screen.queryByTestId('checks-aviso')).toBeNull();
  });

  it('depois da espera máxima libera com aviso, em vez de prender a pessoa', () => {
    const onPronto = vi.fn();
    render(
      <ChecksDaCamera
        avaliar={() => relatorio([check('face', 'fail', 'x')])}
        onPronto={onPronto}
        esperaMaximaMs={3000}
      />
    );
    expect(onPronto).toHaveBeenLastCalledWith(false);
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(onPronto).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId('checks-aviso')).toBeInTheDocument();
  });

  it('sem medição nenhuma não bloqueia: o beco sem saída é proibido', () => {
    const onPronto = vi.fn();
    render(<ChecksDaCamera avaliar={() => null} onPronto={onPronto} />);
    expect(onPronto).toHaveBeenLastCalledWith(true);
    expect(
      screen.getByTestId('checks-da-camera').querySelectorAll('[data-estado="pendente"]')
    ).toHaveLength(3);
  });

  it('atualiza ao vivo quando a condição muda', () => {
    let atual = relatorio([check('face', 'fail', 'x')]);
    render(<ChecksDaCamera avaliar={() => atual} />);
    expect(
      screen.getByTestId('checks-da-camera').querySelectorAll('[data-estado="ok"]')
    ).toHaveLength(0);
    atual = TUDO_OK;
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(
      screen.getByTestId('checks-da-camera').querySelectorAll('[data-estado="ok"]')
    ).toHaveLength(3);
  });
});

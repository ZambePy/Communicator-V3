import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import React from 'react';
import { EmergencyProvider, PRAZO_DO_ENSAIO_MS, useEmergency } from './EmergencyContext';
import { EmergencyEscalation } from '../pages/output/EmergencyEscalation';

// -----------------------------------------------------------------------------
// O ensaio de emergência do tutorial.
//
// O paciente precisa saber o que vai acontecer ANTES de precisar — mas um
// ensaio que vaze dispara alerta real para um cuidador que não está lá
// esperando. Depois de uma ou duas dessas, o alerta de verdade passa a ser
// tratado como possível engano, e é aí que ele deixa de funcionar.
//
// O envio não mora neste contexto: `triggerEmergencyImmediately` navega para
// `/emergency?autoTrigger=other`, e é o `EmergencyEscalation` que emite o
// pedido de ajuda no barramento da nuvem. Por isso o teste que importa monta a
// tela de emergência DE VERDADE nessa rota e espiona o ENVIO, e não a
// navegação: uma asserção de "não navegou" passaria com o alerta saindo por
// outro caminho.
// -----------------------------------------------------------------------------

const emitirPedidoDeAjuda = vi.fn();
vi.mock('../cloud/eventos', async (original) => ({
  ...(await original<typeof import('../cloud/eventos')>()),
  emitirPedidoDeAjuda: (...a: unknown[]) => emitirPedidoDeAjuda(...a),
}));

vi.mock('../cloud/CloudContext', () => ({
  useCloud: () => ({ ajustesRemotos: null, reconhecimento: null }),
}));

vi.mock('../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../utils/emergencyAudio', () => ({
  playTickSound: vi.fn(),
  playCancelSound: vi.fn(),
  playTone: vi.fn(),
  getSharedAudioContext: () => null,
}));

vi.mock('./GazeContext', () => ({
  useGaze: () => ({ isDegraded: false }),
}));

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ currentProfile: { id: 'p1' } }),
}));

const enviou = () => emitirPedidoDeAjuda.mock.calls.length;
const naTelaDeEmergencia = () => screen.queryByText(/Alerta disparado/i) !== null;

let rota = '';

const Sonda: React.FC<{ ensaio: boolean }> = ({ ensaio }) => {
  const { triggerEmergencyImmediately, setModoEnsaio, ensaioDisparado } = useEmergency();
  const loc = useLocation();
  rota = loc.pathname;

  React.useEffect(() => {
    setModoEnsaio(ensaio);
  }, [ensaio, setModoEnsaio]);

  return (
    <div>
      <button data-testid="disparar" onClick={triggerEmergencyImmediately}>
        disparar
      </button>
      <span data-testid="ensaiou">{String(ensaioDisparado)}</span>
    </div>
  );
};

const montar = (ensaio: boolean) =>
  render(
    <MemoryRouter initialEntries={['/menu']}>
      <EmergencyProvider>
        <Routes>
          <Route path="/menu" element={<Sonda ensaio={ensaio} />} />
          <Route path="/emergency" element={<EmergencyEscalation />} />
        </Routes>
      </EmergencyProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  rota = '';
});

describe('modo de ensaio ligado', () => {
  it('NÃO envia alerta nenhum', () => {
    // A asserção que importa. Se esta falhar, um paciente aprendendo a usar o
    // app chama socorro de verdade sem querer.
    montar(true);
    act(() => {
      screen.getByTestId('disparar').click();
    });
    expect(enviou()).toBe(0);
  });

  it('não navega para a tela de emergência', () => {
    montar(true);
    act(() => {
      screen.getByTestId('disparar').click();
    });
    expect(naTelaDeEmergencia()).toBe(false);
    expect(rota).toBe('/menu');
  });

  it('registra que o ensaio aconteceu, para o tutorial saber', () => {
    // O paciente precisa de retorno: um botão que não faz nada não ensina que
    // ele funciona.
    montar(true);
    act(() => {
      screen.getByTestId('disparar').click();
    });
    expect(screen.getByTestId('ensaiou').textContent).toBe('true');
  });
});

describe('modo de ensaio desligado', () => {
  it('o caminho real continua funcionando: tela de emergência e UM pedido de ajuda', () => {
    // Também prova que o espião enxerga o envio — sem isto, o "0" dos testes
    // do ensaio passaria mesmo com o espião no lugar errado.
    montar(false);
    act(() => {
      screen.getByTestId('disparar').click();
    });
    expect(naTelaDeEmergencia()).toBe(true);
    expect(enviou()).toBe(1);
    expect(emitirPedidoDeAjuda).toHaveBeenCalledWith('emergencia', expect.any(String), expect.any(String));
  });
});

describe('o modo não sobrevive à saída do tutorial', () => {
  it('desmontar volta ao comportamento real', () => {
    // Um ensaio que ficasse ligado transformaria o botão de emergência num
    // enfeite pelo resto da sessão — a falha mais perigosa possível aqui.
    const r = montar(true);
    act(() => {
      screen.getByTestId('disparar').click();
    });
    expect(enviou()).toBe(0);
    r.unmount();

    montar(false);
    act(() => {
      screen.getByTestId('disparar').click();
    });
    expect(naTelaDeEmergencia()).toBe(true);
    expect(enviou()).toBe(1);
  });
});

// FE-14: o ensaio era um estado do passo do tutorial — valia enquanto o passo
// estivesse aberto, sem limite de tempo nem de vezes. Um paciente parado ali
// ficava com o socorro inoperante.
describe('o ensaio vale UMA vez e tem prazo', () => {
  it('depois do primeiro acionamento, o próximo é de verdade', () => {
    montar(true);
    act(() => {
      screen.getByTestId('disparar').click();
    });
    expect(enviou()).toBe(0);
    expect(screen.getByTestId('ensaiou').textContent).toBe('true');

    act(() => {
      screen.getByTestId('disparar').click();
    });
    expect(naTelaDeEmergencia()).toBe(true);
    expect(enviou()).toBe(1);
  });

  it('passado o prazo, o botão volta a valer sozinho (mesmo sem sair do passo)', () => {
    vi.useFakeTimers();
    try {
      montar(true);
      act(() => {
        vi.advanceTimersByTime(PRAZO_DO_ENSAIO_MS);
      });
      act(() => {
        screen.getByTestId('disparar').click();
      });
      expect(enviou()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('confirmação aberta como ensaio termina como ensaio, mesmo se o prazo vencer no meio da contagem', () => {
    vi.useFakeTimers();
    try {
      montar(true);
      act(() => {
        vi.advanceTimersByTime(PRAZO_DO_ENSAIO_MS - 2_000);
      });
      act(() => {
        screen.getByLabelText('Disparar Emergência Médica').click();
      });
      expect(screen.getByText('ENSAIO — NADA SERÁ ENVIADO')).toBeInTheDocument();
      // O prazo vence durante a contagem de 5 s; o título que o paciente viu vale.
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      expect(enviou()).toBe(0);
      expect(screen.getByTestId('ensaiou').textContent).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });
});

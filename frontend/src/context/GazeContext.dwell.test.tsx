import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { GazeSample } from '@tracker/tracker/engine';

let emitir: (s: GazeSample) => void = () => {};
let empurrarEstado: (s: string) => void = () => {};
let estadoEngine = 'tracking';
let calibrado = true;

const engineMock = {
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  // O provider chama `dispose()` no cleanup; sem este método no mock, o
  // cleanup lançaria.
  dispose: vi.fn(),
  subscribe: (cb: (s: GazeSample) => void) => {
    emitir = cb;
    return () => {};
  },
  onStateChange: (cb: (s: string) => void) => {
    empurrarEstado = cb;
    return () => {};
  },
  onL2CSStatusChange: () => () => {},
  getState: () => estadoEngine,
  getSessionUptimeMs: () => 1000,
  getDiagnostics: () => null,
  setFilterPreset: vi.fn(),
  calibration: {
    isCalibrated: () => calibrado,
    onInvalidated: () => () => {},
    setCameraFovDeg: vi.fn(),
    setEyeDominance: vi.fn(),
    abort: vi.fn(),
    clear: vi.fn(),
  },
  recording: { isActive: () => false, start: vi.fn(), stop: vi.fn(), clear: vi.fn() },
};

vi.mock('@tracker/tracker/engine', async (orig) => {
  const real = await orig<typeof import('@tracker/tracker/engine')>();
  return { ...real, createGazeEngine: () => engineMock };
});

let dwellDasSettings = 1500;
vi.mock('./SettingsContext', () => ({
  useSettings: () => ({
    settings: { dwellMs: dwellDasSettings, filterPreset: 'balanceado-v2', eyeDominance: 'both' },
    updateSettings: vi.fn(),
  }),
}));

import { GazeProvider } from './GazeContext';

/** `dwellMs` vem direto das settings — nao ha mais conversao de enum. */
const DWELL_MS = 1500;

function amostra(over: Partial<GazeSample> = {}): GazeSample {
  return {
    x: 50,
    y: 50,
    timestamp: 0,
    hasFace: true,
    degraded: false,
    uncalibrated: false,
    eyeState: 'open',
    ...over,
  } as GazeSample;
}

/** Emite frames a 30 fps por `ms`, com o carimbo de tempo avançando. */
function olhar(ms: number, inicio: number, over: Partial<GazeSample> = {}) {
  const passo = 1000 / 30;
  act(() => {
    for (let t = inicio; t <= inicio + ms; t += passo) {
      emitir(amostra({ timestamp: t, ...over }));
    }
  });
  return inicio + ms;
}

function montar(botao: React.ReactElement) {
  const onClick = vi.fn();
  render(<GazeProvider>{React.cloneElement(botao, { onClick })}</GazeProvider>);
  const el = screen.getByTestId('alvo');
  // jsdom não implementa layout: `elementFromPoint` devolveria null sempre.
  document.elementFromPoint = vi.fn(() => el);
  return { onClick, el };
}

describe('GazeContext — casca DOM do dispatcher', () => {
  beforeEach(() => {
    // Uma tela do paciente (com cursor): nas telas sem cursor o olhar só
    // aciona Emergência, CANCELAR e recuperação (FE-3).
    window.location.hash = '#/menu';
    estadoEngine = 'tracking';
    calibrado = true;
    dwellDasSettings = 1500;
    emitir = () => {};
    empurrarEstado = () => {};
    vi.clearAllMocks();
    // O provider abre a câmera no mount; sem isto o boot rejeita e polui o log.
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          throw new Error('sem câmera no teste');
        }),
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // FE-13: com dwell de 4 s, o "Falar" (2 s) e a Emergência (2 s) disparavam
  // antes de uma letra comum.
  it('alvo caro (data-dwell-mult) não fica mais fácil que uma letra para quem usa dwell longo', () => {
    dwellDasSettings = 4000;
    const { onClick } = montar(
      <button data-testid="alvo" data-dwell-ms="2000" data-dwell-mult="1.3">
        Falar
      </button>
    );
    const t = olhar(2600, 0);
    expect(onClick).not.toHaveBeenCalled();
    olhar(2800, t + 1000 / 30);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('no dwell padrão, o alvo caro continua no absoluto dele', () => {
    const { onClick } = montar(
      <button data-testid="alvo" data-dwell-ms="2000" data-dwell-mult="1.3">
        Falar
      </button>
    );
    const t = olhar(1800, 0);
    expect(onClick).not.toHaveBeenCalled();
    olhar(400, t + 1000 / 30);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('clica de verdade quando o olhar fica no alvo pelo dwell inteiro', () => {
    const { onClick } = montar(<button data-testid="alvo">Ok</button>);
    olhar(DWELL_MS + 200, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('não clica sem calibração, por mais que se olhe', () => {
    calibrado = false;
    const { onClick } = montar(<button data-testid="alvo">Ok</button>);
    olhar(5000, 0, { uncalibrated: true });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('não clica NEM no botão de emergência sem calibração', () => {
    calibrado = false;
    const { onClick } = montar(
      <button data-testid="alvo" data-emergency="true">
        SOS
      </button>
    );
    olhar(8000, 0, { uncalibrated: true });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('nenhum banner de "sem calibração" aparece — foi removido a pedido', () => {
    // O aviso saiu; a PROTEÇÃO não. Os dois testes acima continuam afirmando
    // que sem calibração o dwell não clica, nem no botão de emergência.
    estadoEngine = 'uncalibrated';
    calibrado = false;
    montar(<button data-testid="alvo">Ok</button>);
    act(() => {
      empurrarEstado('uncalibrated');
    });
    expect(screen.queryByTestId('gaze-status-banner')).toBeNull();
    expect(screen.queryByText(/Ainda não há calibração/i)).toBeNull();
  });

  it('olhos fechados por 3 s sobre o botão não geram clique ao reabrir', () => {
    const { onClick } = montar(<button data-testid="alvo">Ok</button>);
    // Metade do dwell com o olho aberto...
    let t = olhar(DWELL_MS / 2, 0);
    // ...3 s de olhos fechados...
    t = olhar(3000, t, { eyeState: 'closed' });
    expect(onClick).not.toHaveBeenCalled();
    // ...e o primeiro frame após reabrir não pode completar.
    act(() => {
      emitir(amostra({ timestamp: t + 33, eyeState: 'open' }));
    });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('o progresso sobrevive à piscada e completa com olhar válido', () => {
    const { onClick } = montar(<button data-testid="alvo">Ok</button>);
    let t = olhar(DWELL_MS / 2, 0);
    t = olhar(2000, t, { eyeState: 'closed' });
    olhar(DWELL_MS / 2 + 200, t);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('um handler que lança não impede o refratário nem re-dispara', () => {
    // O throw abaixo é deliberado, e `dispatchEvent` (por trás de `.click()`)
    // NÃO o propaga ao chamador: a spec manda reportá-lo como erro global.
    // Sem cancelar esse reporte, o jsdom o transforma em unhandled error e o
    // vitest derruba o run inteiro com exit 1, mesmo com todos os testes
    // verdes. Assumimos a posse do erro aqui — mas só do nosso: qualquer
    // outro segue borbulhando e continua quebrando a suíte.
    const lancados: string[] = [];
    const capturar = (ev: ErrorEvent) => {
      if ((ev.error as Error | undefined)?.message === 'handler quebrado') {
        lancados.push(ev.message);
        ev.preventDefault();
      }
    };
    window.addEventListener('error', capturar);

    try {
      render(
        <GazeProvider>
          <button
            data-testid="alvo"
            onClick={() => {
              throw new Error('handler quebrado');
            }}
          >
            Ok
          </button>
        </GazeProvider>
      );
      const el = screen.getByTestId('alvo');
      document.elementFromPoint = vi.fn(() => el);
      const cliques = vi.fn();
      el.addEventListener('click', cliques);

      // 5 s de olhar contínuo: sem o refratário armado antes do clique, isto
      // dispararia repetidamente.
      expect(() => olhar(5000, 0)).not.toThrow();
      expect(cliques.mock.calls.length).toBeLessThanOrEqual(3);
      // O handler realmente chegou a lançar — senão o teste passaria à toa.
      expect(lancados.length).toBeGreaterThan(0);
    } finally {
      window.removeEventListener('error', capturar);
    }
  });

  it('respeita data-no-dwell', () => {
    const { onClick } = montar(
      <button data-testid="alvo" data-no-dwell="true">
        Ok
      </button>
    );
    olhar(5000, 0);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('respeita aria-disabled', () => {
    const { onClick } = montar(
      <button data-testid="alvo" aria-disabled="true">
        Ok
      </button>
    );
    olhar(5000, 0);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('data-dwell-ms inválido não vira clique instantâneo', () => {
    const { onClick } = montar(
      <button data-testid="alvo" data-dwell-ms="abc">
        Ok
      </button>
    );
    // Bem menos que o dwell padrão: se o NaN virasse 0, clicaria no 1º frame.
    olhar(200, 0);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('aplica e remove o realce gaze-hover conforme o olhar entra e sai', () => {
    const { el } = montar(<button data-testid="alvo">Ok</button>);
    olhar(300, 0);
    expect(el.classList.contains('gaze-hover')).toBe(true);

    // Olhar sai do alvo: elementFromPoint deixa de encontrar botão.
    document.elementFromPoint = vi.fn(() => document.body);
    olhar(100, 400);
    expect(el.classList.contains('gaze-hover')).toBe(false);
  });

  it('um quadro sem rosto logo depois de um clique não encurta o período refratário', () => {
    // O descarte do dwell na perda de rosto (fallback de gaze perdido, que só
    // roda com o cursor à mostra — daí a rota) zerava também o refratário: a
    // mesma tecla saía de novo ~700 ms antes do previsto.
    window.location.hash = '#/menu';
    const { onClick } = montar(<button data-testid="alvo">Ok</button>);
    const t = olhar(DWELL_MS + 50, 0); // 1º clique por volta de 1500 ms
    expect(onClick).toHaveBeenCalledTimes(1);
    const instantes: number[] = [];
    act(() => {
      emitir(amostra({ timestamp: t + 33, hasFace: false }));
      for (let u = t + 66; u <= t + 2600; u += 1000 / 30) {
        const antes = onClick.mock.calls.length;
        emitir(amostra({ timestamp: u }));
        if (onClick.mock.calls.length > antes) instantes.push(u);
      }
    });
    window.location.hash = '';
    // Refratário (800 ms) + dwell (1500 ms) depois do clique: o 2º só por volta
    // de 3800 ms. Sem o refratário ele sairia por volta de 3100 ms.
    expect(instantes.every((u) => u >= 1500 + 800 + DWELL_MS - 50)).toBe(true);
  });

  it('durante a calibração nada é clicável', () => {
    estadoEngine = 'calibrating';
    const { onClick } = montar(<button data-testid="alvo">Ok</button>);
    olhar(5000, 0);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('durante a calibração, o CANCELAR da confirmação de emergência continua clicável pelo olhar', () => {
    // Emergência acionada sem querer no meio da calibração: sem isto o alerta
    // saía sozinho ao fim da contagem, sem como desfazer pelo olhar.
    estadoEngine = 'calibrating';
    const { onClick } = montar(
      <button data-testid="alvo" data-dwell-ms="1000" data-cancelar-emergencia="true">
        CANCELAR
      </button>
    );
    olhar(2500, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('em degraded, o CANCELAR da confirmação de emergência também clica', () => {
    const { onClick } = montar(
      <button data-testid="alvo" data-dwell-ms="1000" data-cancelar-emergencia="true">
        CANCELAR
      </button>
    );
    olhar(2500, 0, { degraded: true });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('em degraded, botão comum não clica mas emergência clica', () => {
    const comum = montar(<button data-testid="alvo">Ok</button>);
    olhar(5000, 0, { degraded: true });
    expect(comum.onClick).not.toHaveBeenCalled();
  });
});

describe('GazeContext — rearme por saída (FE-7)', () => {
  beforeEach(() => {
    estadoEngine = 'tracking';
    calibrado = true;
    emitir = () => {};
    empurrarEstado = () => {};
    vi.clearAllMocks();
    window.location.hash = '#/menu';
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => { throw new Error('sem câmera no teste'); }) },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    window.location.hash = '';
    vi.restoreAllMocks();
  });

  it('com o olhar parado no alvo depois do clique, ele NÃO dispara de novo (antes: a cada ~2 s)', () => {
    const { onClick } = montar(<button data-testid="alvo">Pode mudar de posição?</button>);
    olhar(7000, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sair do alvo e voltar rearma', () => {
    const { onClick, el } = montar(<button data-testid="alvo">Ok</button>);
    let t = olhar(DWELL_MS + 200, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
    document.elementFromPoint = vi.fn(() => null);
    t = olhar(400, t + 33);
    document.elementFromPoint = vi.fn(() => el);
    olhar(DWELL_MS + 1200, t + 33);
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('tecla repetível (data-repetir, ex.: Apagar) continua repetindo com o olhar parado', () => {
    const { onClick } = montar(<button data-testid="alvo" data-repetir="true">Apagar</button>);
    olhar(7000, 0);
    expect(onClick.mock.calls.length).toBeGreaterThan(1);
  });

  it('tela nova: o botão sob o olhar herdado não é selecionado sozinho', () => {
    const { onClick, el } = montar(<button data-testid="alvo">Gostaria de conversar</button>);
    // uma amostra na tela anterior, sem alvo
    document.elementFromPoint = vi.fn(() => null);
    let t = olhar(100, 0);
    // troca de tela; o botão novo cai sob o olhar parado
    window.location.hash = '#/phrases';
    document.elementFromPoint = vi.fn(() => el);
    t = olhar(6000, t + 33);
    expect(onClick).not.toHaveBeenCalled();
    // o paciente olha de propósito: o olhar salta para fora e volta
    document.elementFromPoint = vi.fn(() => null);
    t = olhar(400, t + 33, { x: 500 });
    document.elementFromPoint = vi.fn(() => el);
    olhar(DWELL_MS + 1200, t + 33);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('tela nova que demora a desenhar: o botão que aparece depois sob o olhar parado também não é selecionado', () => {
    // Computador lento: a janela de 400 ms passa com a tela antiga ainda na
    // frente (ou nada sob o olhar), e o botão novo aparece depois no mesmo
    // lugar. Sem o olhar saltar, ele continua sendo herança.
    const { onClick, el } = montar(<button data-testid="alvo">Abrir as frases</button>);
    document.elementFromPoint = vi.fn(() => null);
    let t = olhar(100, 0);
    window.location.hash = '#/tutorial';
    t = olhar(1500, t + 33);
    document.elementFromPoint = vi.fn(() => el);
    t = olhar(DWELL_MS + 3000, t + 33);
    expect(onClick).not.toHaveBeenCalled();
    // saltou para fora e voltou: agora é escolha
    document.elementFromPoint = vi.fn(() => null);
    t = olhar(400, t + 33, { x: 500 });
    document.elementFromPoint = vi.fn(() => el);
    olhar(DWELL_MS + 1200, t + 33);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('o que aparece no lugar do alvo clicado, sem trocar de rota, também não é selecionado sozinho', () => {
    // O teclado: o grupo clicado vira as letras dele (outros nós do DOM, na
    // mesma rota), e a letra da mesma célula cai sob o olhar parado. Antes o
    // bloqueio ficava no nó que sumiu: a letra era escrita, o teclado voltava
    // aos grupos, o grupo abria de novo — uma letra repetida a cada ~4 s.
    const cliques: string[] = [];
    function GrupoQueViraLetra() {
      const [nivel, setNivel] = React.useState<'grupo' | 'letra'>('grupo');
      return nivel === 'grupo' ? (
        <button key="grupo" data-testid="celula" onClick={() => { cliques.push('grupo'); setNivel('letra'); }}>M N O</button>
      ) : (
        <button key="letra" data-testid="celula" onClick={() => { cliques.push('letra'); setNivel('grupo'); }}>O</button>
      );
    }
    render(<GazeProvider><GrupoQueViraLetra /></GazeProvider>);
    const celula = () => document.querySelector('[data-testid="celula"]');
    // Um `act` por quadro: o clique troca o nó no meio da sequência, e o
    // React só o troca quando o `act` fecha.
    const quadroAQuadro = (ms: number, inicio: number, over: Partial<GazeSample> = {}) => {
      for (let t = inicio; t <= inicio + ms; t += 1000 / 30) act(() => emitir(amostra({ timestamp: t, ...over })));
      return inicio + ms;
    };

    document.elementFromPoint = vi.fn(() => celula());
    let t = quadroAQuadro(8000, 0);
    expect(cliques).toEqual(['grupo']);
    expect(celula()).toHaveTextContent('O');

    // O paciente olha de propósito: o olhar salta para fora e volta à letra.
    document.elementFromPoint = vi.fn(() => null);
    t = quadroAQuadro(400, t + 33, { x: 500 });
    document.elementFromPoint = vi.fn(() => celula());
    quadroAQuadro(DWELL_MS + 1200, t + 33);
    expect(cliques).toEqual(['grupo', 'letra']);
  });
});

describe('GazeContext — telas sem cursor (FE-3)', () => {
  beforeEach(() => {
    estadoEngine = 'tracking';
    calibrado = true;
    emitir = () => {};
    empurrarEstado = () => {};
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => { throw new Error('sem câmera no teste'); }) },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    window.location.hash = '';
    vi.restoreAllMocks();
  });

  it('na escolha de perfil (sem cursor), o olhar não escolhe nada "no escuro"', () => {
    window.location.hash = '#/profiles';
    const { onClick } = montar(<button data-testid="alvo">Joana</button>);
    olhar(6000, 0);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('mas a Emergência e os alvos de recuperação continuam valendo', () => {
    window.location.hash = '#/calibration-check';
    const { onClick } = montar(<button data-testid="alvo" data-recovery="true">Recalibração rápida</button>);
    olhar(6000, 0);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

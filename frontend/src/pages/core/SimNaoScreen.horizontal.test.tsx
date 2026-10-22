import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { stepDwell, createDwellState, configComTolerancia, DEFAULT_DWELL_CONFIG, type DwellState } from '@tracker/interaction/dwell';
import { criarRearme, filtrarAlvo, aoClicar, type EstadoDoRearme } from '@tracker/interaction/rearmePorSaida';

// Sim · Não no modo só horizontal (pedido de 21/10/2026): NÃO à esquerda e SIM
// à direita, escolhidos pela coluna do olhar.

const falar = vi.fn(async () => ({ origem: 'sistema' as const }));
vi.mock('../../services/voz', () => ({ falar: (...a: unknown[]) => falar(...(a as [])) }));
const emitirFalaDoPaciente = vi.fn();
const emitirPedidoDeAjuda = vi.fn();
vi.mock('../../cloud/eventos', async (original) => {
  const real = await original<typeof import('../../cloud/eventos')>();
  return {
    ...real,
    emitirFalaDoPaciente: (...a: Parameters<typeof real.emitirFalaDoPaciente>) => { emitirFalaDoPaciente(...a); },
    emitirPedidoDeAjuda: (...a: Parameters<typeof real.emitirPedidoDeAjuda>) => { emitirPedidoDeAjuda(...a); },
  };
});
vi.mock('../../utils/clinicalLogger', () => ({ logSentence: vi.fn() }));
vi.mock('../../utils/emergencyAudio', () => ({ playTone: vi.fn() }));
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children, subtitulo }: { children: React.ReactNode; subtitulo?: string }) => <div><p data-testid="subtitulo">{subtitulo}</p>{children}</div>,
}));
type Amostra = { hasFace: boolean; eyeState?: 'open' | 'closed'; x?: number; y?: number };
let emitir: (s: Amostra) => void = () => {};
const assinar = (cb: (s: Amostra) => void) => { emitir = cb; return () => { if (emitir === cb) emitir = () => {}; }; };
vi.mock('../../context/GazeContext', () => ({ useGaze: () => ({ subscribe: assinar }) }));
const ajustes = { simNaoPorPiscada: false, piscadaLongaMs: 700, modoHorizontal: true };
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ settings: ajustes }) }));

const { SimNaoScreen } = await import('./SimNaoScreen');
const { _limparZonasLaterais } = await import('../../components/ui/zonasLaterais');
const { definirPerguntaNaTela } = await import('../../services/perguntaNaTela');
const { marcarTelaLateral, telaLateralDeOrigem, _reiniciarTelaLateralParaTestes } = await import('../../services/telaLateral');

type Caixa = { left: number; top: number; right: number; bottom: number };
function comCaixa(el: HTMLElement, c: Caixa) {
  el.getBoundingClientRect = () =>
    ({ ...c, x: c.left, y: c.top, width: c.right - c.left, height: c.bottom - c.top, toJSON: () => c }) as DOMRect;
}
const CAIXA_NAO = { left: 0, top: 150, right: 380, bottom: 740 };
const CAIXA_SIM = { left: 640, top: 150, right: 940, bottom: 740 };

const montar = () => {
  const r = render(<MemoryRouter><SimNaoScreen /></MemoryRouter>);
  const nao = screen.getByRole('button', { name: 'Não' });
  const sim = screen.getByRole('button', { name: 'Sim' });
  comCaixa(nao, CAIXA_NAO);
  comCaixa(sim, CAIXA_SIM);
  // O "elementFromPoint" do teste: o y do paciente cai ACIMA da tela (o olhar
  // vertical se foi) — ali não há elemento nenhum.
  document.elementFromPoint = (x: number, y: number) => {
    if (y < 0) return null;
    for (const [el, c] of [[nao, CAIXA_NAO], [sim, CAIXA_SIM]] as const) {
      if (x >= c.left && x < c.right && y >= c.top && y < c.bottom) return el;
    }
    return null;
  };
  return { ...r, nao, sim };
};

// O despachante em miniatura (o mesmo do teste da tela comum): no modo só
// horizontal o alvo do dwell é a zona da coluna, aqui `olharEm`.
let olharEm: HTMLElement | null = null;
let dwell: DwellState = createDwellState();
let rearme: EstadoDoRearme = criarRearme();
const configDoDwell = configComTolerancia({ ...DEFAULT_DWELL_CONFIG, dwellMs: 1500 }, true);
function despacharDwell(t: number, eyeState: 'open' | 'closed') {
  const alvo = olharEm;
  const filtro = filtrarAlvo(rearme, alvo, t, { x: 10, y: 10 });
  rearme = filtro.estado;
  const r = stepDwell(
    dwell,
    { x: 10, y: 10, timestamp: t, hasFace: true, degraded: false, uncalibrated: false, eyeState },
    alvo ? { key: alvo, customDwellMs: null, isEmergency: false, isRecovery: false, isDisabled: alvo.dataset.noDwell === 'true' || filtro.bloqueado } : null,
    configDoDwell,
  );
  dwell = r.state;
  if (r.effect.type === 'click') {
    const clicado = r.effect.targetKey as HTMLElement;
    rearme = aoClicar(clicado, false);
    clicado.click();
  }
}
const quadro = (eyeState: 'open' | 'closed', x: number) => act(() => {
  vi.advanceTimersByTime(33);
  despacharDwell(performance.now(), eyeState);
  emitir({ hasFace: true, eyeState, x, y: -80 });
});
const quadros = (eyeState: 'open' | 'closed', ms: number, x: number) => {
  for (let t = 0; t < ms; t += 33) quadro(eyeState, x);
};
const falas = () => emitirFalaDoPaciente.mock.calls.map((c) => c[0]);

describe('Sim · Não no modo só horizontal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    falar.mockClear(); emitirFalaDoPaciente.mockClear(); emitirPedidoDeAjuda.mockClear();
    ajustes.simNaoPorPiscada = false;
    ajustes.modoHorizontal = true;
    emitir = () => {};
    olharEm = null;
    dwell = createDwellState();
    rearme = criarRearme();
    _limparZonasLaterais();
    definirPerguntaNaTela(false);
    _reiniciarTelaLateralParaTestes();
  });
  afterEach(() => {
    vi.useRealTimers();
    _limparZonasLaterais();
    definirPerguntaNaTela(false);
    _reiniciarTelaLateralParaTestes();
  });

  it('NÃO à esquerda e SIM à direita, as duas pela coluna do olhar', () => {
    const { nao, sim } = montar();
    expect(nao.getAttribute('data-dwell-eixo')).toBe('x');
    expect(sim.getAttribute('data-dwell-eixo')).toBe('x');
    expect(nao.dataset.lado).toBe('esquerda');
    expect(sim.dataset.lado).toBe('direita');
  });

  it('responder fala e vai ao celular como sim/não, como na tela comum', () => {
    const { sim } = montar();
    fireEvent.click(sim);
    expect(falar).toHaveBeenCalledWith('Sim', expect.anything());
    expect(emitirFalaDoPaciente).toHaveBeenCalledWith('Sim', 'simnao');
  });

  it('sem o "Chamar atenção" (pede olhar vertical); o meio aponta a faixa da Emergência', () => {
    montar();
    expect(screen.queryByRole('button', { name: 'Chamar atenção' })).toBeNull();
    expect(screen.getByText(/faixa vermelha/i)).toBeInTheDocument();
  });

  it('com a piscada ligada, o olhar parado no NÃO pela coluna (y fora da tela) e uma piscada longa: só "Sim"', () => {
    ajustes.simNaoPorPiscada = true;
    const { nao } = montar();
    olharEm = nao;
    quadros('open', 600, 100);
    quadros('closed', 900, 100);
    quadros('open', 9000, 100);
    expect(falas()).toEqual(['Sim']);
    expect(nao.dataset.noDwell).toBe('true');
  });

  // Revisão de 21/10/2026 (Minor 3): a pergunta do cuidador abre por cima do
  // Sim · Não; uma piscada longa embaixo dela respondia um "Sim" solto.
  it('com a pergunta do cuidador por cima, a piscada longa não responde o Sim · Não de baixo (e volta a responder depois)', () => {
    ajustes.simNaoPorPiscada = true;
    montar();
    // A pergunta cobre as metades: o olhar não está em nenhuma delas.
    act(() => definirPerguntaNaTela(true));
    quadros('open', 600, 512);
    quadros('closed', 900, 512);
    quadros('open', 9000, 512);
    expect(falas()).toEqual([]);
    act(() => definirPerguntaNaTela(false));
    quadros('open', 600, 512);
    quadros('closed', 900, 512);
    quadros('open', 9000, 512);
    expect(falas()).toEqual(['Sim']);
  });

  it('uma piscada começada sob a pergunta não vira resposta quando a pergunta sai', () => {
    ajustes.simNaoPorPiscada = true;
    montar();
    act(() => definirPerguntaNaTela(true));
    quadros('open', 600, 512);
    quadros('closed', 400, 512);
    // A pergunta sai com o olho ainda fechado; ele segue fechado e reabre.
    act(() => definirPerguntaNaTela(false));
    quadros('closed', 900, 512);
    quadros('open', 9000, 512);
    expect(falas()).toEqual([]);
  });

  // Revisão de 21/10/2026 (Important 1): a saída da tela de socorro volta
  // para a tela lateral de onde o paciente veio.
  it('no modo só horizontal, o Sim · Não fica marcado como a tela lateral de origem; na tela comum, não', () => {
    marcarTelaLateral('/teclado-lateral');
    const { unmount } = montar();
    expect(telaLateralDeOrigem()).toBe('/sim-nao');
    unmount();
    marcarTelaLateral('/teclado-lateral');
    ajustes.modoHorizontal = false;
    render(<MemoryRouter><SimNaoScreen /></MemoryRouter>);
    expect(telaLateralDeOrigem()).toBe('/teclado-lateral');
  });

  it('fora do modo só horizontal, a tela comum continua igual (três botões, com o Chamar atenção)', () => {
    ajustes.modoHorizontal = false;
    render(<MemoryRouter><SimNaoScreen /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Chamar atenção' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sim' }).getAttribute('data-dwell-eixo')).toBeNull();
  });
});

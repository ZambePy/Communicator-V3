import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { stepDwell, createDwellState, configComTolerancia, DEFAULT_DWELL_CONFIG, type DwellState } from '@tracker/interaction/dwell';
import { criarRearme, filtrarAlvo, aoClicar, type EstadoDoRearme } from '@tracker/interaction/rearmePorSaida';

// Tela rápida Sim · Não · Chamar atenção (pedido de 18/10/2026).

const falar = vi.fn(async () => ({ origem: 'sistema' as const }));
vi.mock('../../services/voz', () => ({ falar: (...a: unknown[]) => falar(...(a as [])) }));
const emitirFalaDoPaciente = vi.fn();
const emitirPedidoDeAjuda = vi.fn();
vi.mock('../../cloud/eventos', async (original) => {
  // O registro de entrega (informarEntrega / ouvirEntrega) e o barramento são
  // os de verdade; os emissores também, com espiões na frente.
  const real = await original<typeof import('../../cloud/eventos')>();
  return {
    ...real,
    emitirFalaDoPaciente: (...a: Parameters<typeof real.emitirFalaDoPaciente>) => { emitirFalaDoPaciente(...a); return real.emitirFalaDoPaciente(...a); },
    emitirPedidoDeAjuda: (...a: Parameters<typeof real.emitirPedidoDeAjuda>) => { emitirPedidoDeAjuda(...a); return real.emitirPedidoDeAjuda(...a); },
  };
});
vi.mock('../../utils/clinicalLogger', () => ({ logSentence: vi.fn() }));
vi.mock('../../utils/emergencyAudio', () => ({ playTone: vi.fn() }));
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children, subtitulo }: { children: React.ReactNode; subtitulo?: string }) => <div><p data-testid="subtitulo">{subtitulo}</p>{children}</div>,
}));
type Amostra = { hasFace: boolean; eyeState?: 'open' | 'closed'; x?: number; y?: number };
let emitir: (s: Amostra) => void = () => {};
// Estável entre renders, como o `subscribe` do GazeContext (um `useCallback`).
const assinar = (cb: (s: Amostra) => void) => { emitir = cb; return () => { if (emitir === cb) emitir = () => {}; }; };
vi.mock('../../context/GazeContext', () => ({ useGaze: () => ({ subscribe: assinar }) }));
const ajustes: { simNaoPorPiscada: boolean; piscadaLongaMs: number; modoDeEntrada?: 'olhar' | 'acionador' } = { simNaoPorPiscada: false, piscadaLongaMs: 700 };
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ settings: ajustes }) }));

const { SimNaoScreen } = await import('./SimNaoScreen');
const { informarEntrega, ouvir, _limparOuvintes } = await import('../../cloud/eventos');

const montar = () => render(<MemoryRouter><SimNaoScreen /></MemoryRouter>);

// -----------------------------------------------------------------------------
// O despachante do olhar, em miniatura: a MESMA política de dwell do app
// (`stepDwell`, com a tolerância de saída de 400 ms) e o mesmo rearme por saída
// dos cliques (`rearmePorSaida`), lendo as marcas do DOM como o GazeContext lê
// (`data-no-dwell`). Como no app, a amostra passa pelo dwell ANTES de chegar às
// telas inscritas.
// -----------------------------------------------------------------------------
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

const quadro = (eyeState: 'open' | 'closed') => act(() => {
  vi.advanceTimersByTime(33);
  despacharDwell(performance.now(), eyeState);
  emitir({ hasFace: true, eyeState, x: 10, y: 10 });
});
const quadros = (eyeState: 'open' | 'closed', ms: number) => {
  for (let t = 0; t < ms; t += 33) quadro(eyeState);
};
const falas = () => emitirFalaDoPaciente.mock.calls.map((c) => c[0]);

describe('Sim · Não · Chamar atenção', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    falar.mockClear(); emitirFalaDoPaciente.mockClear(); emitirPedidoDeAjuda.mockClear();
    ajustes.simNaoPorPiscada = false;
    ajustes.modoDeEntrada = undefined;
    emitir = () => {};
    _limparOuvintes();
    olharEm = null;
    dwell = createDwellState();
    rearme = criarRearme();
    // O jsdom não tem `elementFromPoint`: o "olhar" do teste é `olharEm`.
    document.elementFromPoint = () => olharEm;
  });
  afterEach(() => vi.useRealTimers());

  it('SIM e NÃO falam, vão para o celular como sim/não e aparecem em destaque', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    expect(falar).toHaveBeenCalledWith('Sim', expect.anything());
    expect(emitirFalaDoPaciente).toHaveBeenCalledWith('Sim', 'simnao');
    fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    expect(emitirFalaDoPaciente).toHaveBeenLastCalledWith('Não', 'simnao');
  });

  it('CHAMAR toca o chamado, fala e manda um pedido de AJUDA (não a emergência) — sem repetir em 20 s', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Chamar atenção' }));
    expect(emitirPedidoDeAjuda).toHaveBeenCalledWith('ajuda', expect.any(String), expect.stringMatching(/^[0-9a-f-]{36}$/));
    act(() => { vi.advanceTimersByTime(1200); });
    expect(falar).toHaveBeenCalledWith('Por favor, venha aqui.', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Chamar atenção' }));
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
  });

  it('com a piscada longa ligada: duas piscadas longas respondem NÃO', () => {
    ajustes.simNaoPorPiscada = true;
    montar();
    expect(screen.getByText(/uma vez = SIM, duas = NÃO/)).toBeInTheDocument();
    quadros('open', 300);
    quadros('closed', 900);
    quadros('open', 600);
    quadros('closed', 900);
    quadros('open', 300);
    expect(emitirFalaDoPaciente).toHaveBeenCalledWith('Não', 'simnao');
    expect(emitirFalaDoPaciente).toHaveBeenCalledTimes(1);
  });

  it('com a piscada longa desligada, piscar não responde nada', () => {
    montar();
    for (let t = 0; t < 4000; t += 33) act(() => { vi.advanceTimersByTime(33); emitir({ hasFace: true, eyeState: t > 300 && t < 1300 ? 'closed' : 'open' }); });
    expect(emitirFalaDoPaciente).not.toHaveBeenCalled();
  });
});

// Revisão de UX de 19/10/2026, achado 4: com a piscada ligada a tela respondia
// duas vezes, com respostas opostas — o dwell guardado com o olho fechado
// completava "Não" ao reabrir, e a piscada dizia "Sim" 2,5 s depois.
describe('Sim · Não com a piscada ligada: uma resposta por vez (achado 4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    falar.mockClear(); emitirFalaDoPaciente.mockClear(); emitirPedidoDeAjuda.mockClear();
    ajustes.simNaoPorPiscada = true;
    ajustes.modoDeEntrada = undefined;
    emitir = () => {};
    _limparOuvintes();
    olharEm = null;
    dwell = createDwellState();
    rearme = criarRearme();
    document.elementFromPoint = () => olharEm;
  });
  afterEach(() => vi.useRealTimers());

  it('olhar parado no NÃO e uma piscada longa para dizer SIM: só "Sim" — nem ao reabrir, nem depois da trava', () => {
    montar();
    olharEm = screen.getByRole('button', { name: 'Não' });
    quadros('open', 600);   // o dwell no NÃO começa (600 de 1500 ms)
    quadros('closed', 900); // a piscada longa: o olho fechado pausava o dwell guardando o progresso
    // Espera a segunda piscada (2,5 s), a trava (3 s) e mais: o olhar continua no NÃO.
    quadros('open', 9000);
    expect(falas()).toEqual(['Sim']);
    expect(screen.getByRole('button', { name: 'Não' }).dataset.noDwell).toBe('true');
  });

  it('o SIM/NÃO continua acionável pelo olhar: saindo do botão e voltando, o dwell responde', () => {
    montar();
    const nao = screen.getByRole('button', { name: 'Não' });
    olharEm = nao;
    quadros('open', 300);
    quadros('closed', 900);
    quadros('open', 6500);  // "Sim" pela piscada, e a trava acaba
    expect(falas()).toEqual(['Sim']);
    olharEm = null;         // o olhar sai do NÃO…
    quadros('open', 400);
    olharEm = nao;          // …e volta: agora é uma escolha nova
    quadros('open', 1700);
    expect(falas()).toEqual(['Sim', 'Não']);
  });

  it('uma resposta trava a outra por 3 s, com o botão respondido em destaque', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    expect(screen.getByRole('button', { name: 'Não' }).dataset.noDwell).toBe('true');
    expect(screen.getByTestId('subtitulo').textContent).toMatch(/Você respondeu SIM/);
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    expect(falas()).toEqual(['Sim']);
    act(() => { vi.advanceTimersByTime(2100); });
    expect(screen.getByRole('button', { name: 'Não' }).dataset.noDwell).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    expect(falas()).toEqual(['Sim', 'Não']);
  });

  it('sem dwell não é "desabilitado": a resposta em destaque não sai apagada, e o mouse continua valendo', () => {
    // O CSS do GazeButton pinta `data-no-dwell` como desabilitado (opacidade)
    // e desliga o ponteiro; aqui a tela assume os dois.
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    const sim = screen.getByRole('button', { name: 'Sim' });
    const nao = screen.getByRole('button', { name: 'Não' });
    expect(sim.dataset.noDwell).toBe('true');
    expect(sim.style.opacity).toBe('1');
    expect(nao.style.opacity).toBe('0.45');
    for (const b of [sim, nao, screen.getByRole('button', { name: 'Chamar atenção' })]) expect(b.style.pointerEvents).toBe('auto');
  });

  it('resposta pelo olhar e, logo depois, uma piscada longa: a piscada não responde por cima', () => {
    montar();
    olharEm = screen.getByRole('button', { name: 'Sim' });
    quadros('open', 1700);  // o dwell responde "Sim"
    expect(falas()).toEqual(['Sim']);
    olharEm = null;
    quadros('open', 600);
    quadros('closed', 900); // piscada longa dentro da trava (que ia virar "Sim" de novo 2,5 s depois)
    quadros('open', 4000);
    expect(falas()).toEqual(['Sim']);
  });

  it('a piscada longa em curso tira o dwell dos três botões; a espontânea (curta) não', () => {
    montar();
    olharEm = screen.getByRole('button', { name: 'Chamar atenção' });
    quadros('open', 300);
    quadros('closed', 250); // piscada espontânea: o dwell só pausa, como sempre
    for (const nome of ['Sim', 'Não', 'Chamar atenção']) expect(screen.getByRole('button', { name: nome }).dataset.noDwell).toBeUndefined();
    quadros('closed', 700); // agora é longa
    for (const nome of ['Sim', 'Não', 'Chamar atenção']) expect(screen.getByRole('button', { name: nome }).dataset.noDwell).toBe('true');
    // E o dwell guardado no "Chamar atenção" não chama o cuidador ao reabrir.
    quadros('open', 8000);
    expect(emitirPedidoDeAjuda).not.toHaveBeenCalled();
    expect(falas()).toEqual(['Sim']);
  });

  it('esperando a segunda piscada, a tela diz o que acontece', () => {
    montar();
    quadros('open', 300);
    quadros('closed', 900);
    quadros('open', 300);
    expect(screen.getByTestId('subtitulo').textContent).toMatch(/pisque longo de novo/);
  });

  it('com a piscada desligada nada disso vale: duas respostas seguidas pelo toque valem as duas', () => {
    ajustes.simNaoPorPiscada = false;
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    expect(screen.getByRole('button', { name: 'Não' }).dataset.noDwell).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    expect(falas()).toEqual(['Sim', 'Não']);
  });
});

// Revisão de UX de 19/10/2026, achado 14: "Chamar atenção" mostrava
// "CHAMANDO…" igual sem celular ligado, sem internet ou sem push; e o segundo
// toque em menos de 20 s mostrava "CHAMANDO…" sem fazer nada.
describe('Chamar atenção diz se o celular foi avisado (achado 14)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    falar.mockClear(); emitirFalaDoPaciente.mockClear(); emitirPedidoDeAjuda.mockClear();
    ajustes.simNaoPorPiscada = false;
    emitir = () => {};
    _limparOuvintes();
  });
  afterEach(() => vi.useRealTimers());

  const chamar = () => fireEvent.click(screen.getByRole('button', { name: 'Chamar atenção' }));
  const botaoChamar = () => screen.getByRole('button', { name: 'Chamar atenção' });

  it('sem celular ligado a este computador: diz que só tocou aqui', () => {
    montar();
    chamar(); // ninguém ouvindo o barramento = sem nuvem
    expect(botaoChamar().textContent).toMatch(/Nenhum celular de cuidador está ligado a este computador/);
    expect(botaoChamar().textContent).not.toMatch(/foi avisado/);
  });

  it('com a nuvem: "avisando" até a resposta, depois o que ela disse', () => {
    ouvir(() => {});
    montar();
    chamar();
    const id = emitirPedidoDeAjuda.mock.calls[0][2] as string;
    expect(botaoChamar().textContent).toMatch(/Avisando o celular do cuidador/);
    act(() => informarEntrega(id, 'enviado'));
    expect(botaoChamar().textContent).toMatch(/O celular do cuidador foi avisado/);
  });

  it.each([
    ['na_fila', /Sem internet/],
    ['sem_push', /Nenhum celular de cuidador foi avisado/],
    ['limitado', /Você chamou várias vezes; o celular não recebe novos avisos por alguns minutos\. Se for urgente, use a Emergência\./],
    ['push_incerto', /não deu para confirmar/],
    ['falhou', /Não deu para avisar o celular/],
  ] as const)('entrega %s: em palavras simples, sem dizer que avisou', (entrega, esperado) => {
    ouvir(() => {});
    montar();
    chamar();
    act(() => informarEntrega(emitirPedidoDeAjuda.mock.calls[0][2] as string, entrega));
    expect(botaoChamar().textContent).toMatch(esperado);
    expect(botaoChamar().textContent).not.toMatch(/O celular do cuidador foi avisado/);
  });

  it('a entrega de OUTRO pedido não muda o que o botão diz', () => {
    ouvir(() => {});
    montar();
    chamar();
    act(() => informarEntrega('00000000-0000-4000-8000-000000000000', 'enviado'));
    expect(botaoChamar().textContent).toMatch(/Avisando o celular do cuidador/);
  });

  it('segundo toque em menos de 20 s: não manda outro e diz há quanto tempo foi o pedido', () => {
    ouvir(() => {});
    montar();
    chamar();
    act(() => informarEntrega(emitirPedidoDeAjuda.mock.calls[0][2] as string, 'enviado'));
    act(() => { vi.advanceTimersByTime(8000); });
    chamar();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    expect(botaoChamar().textContent).toMatch(/Você já chamou há 8 s/);
    expect(botaoChamar().textContent).toMatch(/O celular do cuidador foi avisado/);
    // Passados os 20 s, um toque é um chamado novo.
    act(() => { vi.advanceTimersByTime(12_500); });
    chamar();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(2);
  });
});

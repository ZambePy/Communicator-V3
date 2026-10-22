import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import i18n from '../../i18n';
import { EXPERIMENT } from '@tracker/config/experiment';
import type { ColetaInterrompida } from '@tracker/calibration';
import { definirEmergenciaAtiva, _reiniciarParaTeste as reiniciarEstadoDaEmergencia } from '../../services/estadoDeEmergencia';

/**
 * A tela de calibração com os pedidos de 19/10/2026:
 *
 *  - a recoleta dos alvos ruins (M22): logo depois do treino, UMA vez, antes
 *    do reforço (S4) e do teste de precisão; sem alvo ruim, o caminho é
 *    exatamente o de antes;
 *  - a recoleta PEDIDA na tela de resultado ("Refazer só os cantos"): refaz
 *    só aqueles pontos e volta ao resultado, sem outro teste de precisão;
 *  - a pergunta de UMA vez sobre como ver o resultado (palavras ou números);
 *  - o alvo de fixação de Thaler et al. (2013) no lugar da bola lisa.
 */

const GRADE = Array.from({ length: 9 }, (_, i) => ({
  x: 0.1 + (i % 3) * 0.4,
  y: 0.1 + Math.floor(i / 3) * 0.4,
}));
const CANTO_RUIM = { x: 0.1, y: 0.9, borda: true, motivos: ['erro'] as const };

const startAccuracyTest = vi.fn();
vi.mock('@tracker/accuracy', () => ({
  startAccuracyTest: (...a: unknown[]) => startAccuracyTest(...a),
  abortAccuracyTest: vi.fn(),
}));
vi.mock('../../utils/autoTestMeta', () => ({
  buildAutoTestMeta: () => ({}),
  montarMetaDeMedicao: () => ({}),
}));

/** O ouvinte que a tela registrou para a coleta interrompida pelo núcleo. */
let ouvinteDaInterrupcao: ((e: ColetaInterrompida) => void) | null = null;
vi.mock('@tracker/calibration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tracker/calibration')>()),
  onColetaInterrompida: (cb: (e: ColetaInterrompida) => void) => {
    ouvinteDaInterrupcao = cb;
    return () => {
      if (ouvinteDaInterrupcao === cb) ouvinteDaInterrupcao = null;
    };
  },
}));

/** Coleta em curso, quando o teste quer segurá-la. */
let segurarColeta = false;
let concluirColeta: ((ok: boolean) => void) | null = null;
const startCollectingPoint = vi.fn((_x: number, _y: number, done: (ok: boolean) => void) => {
  if (segurarColeta) {
    concluirColeta = done;
    return;
  }
  done(true);
});

let paraRecoletar: { x: number; y: number; borda: boolean; motivos: readonly string[] }[] = [];
const alvosParaRecoletar = vi.fn(() => paraRecoletar);
const iniciarRecoletaDeAlvos = vi.fn((alvos: { x: number; y: number }[]) =>
  alvos.map((a) => ({ x: a.x, y: a.y })),
);
const concluirRecoletaDeAlvos = vi.fn((cb?: (r: { aceito: boolean }) => void) => cb?.({ aceito: true }));
const iniciarRodadaDeReforco = vi.fn(() => [] as { x: number; y: number }[]);
const completeCalibration = vi.fn((cb?: (o: { ok: true }) => void) => cb?.({ ok: true }));
/** O que o núcleo diz de poder refazer pontos (a flag M22 e o modelo em uso). */
let podeRecoletar = true;

// Identidade estável, como o `useMemo([])` do GazeContext real.
const calibration = {
  startCalibrationMode: vi.fn(),
  getCalibrationTargets: () => GRADE,
  getCalibrationMode: () => 'full',
  startCollectingPoint: (...a: unknown[]) =>
    startCollectingPoint(...(a as [number, number, (ok: boolean) => void])),
  completeCalibration: (cb?: (o: { ok: true }) => void) => completeCalibration(cb),
  getPoseDriftVerdict: () => null,
  getTargetsSkipped: () => [],
  setCalibrationDistancesCm: vi.fn(),
  setCameraFovDeg: vi.fn(),
  getCurrentCameraDistanceCm: () => null,
  isCalibrated: () => true,
  clear: vi.fn(),
  abort: vi.fn(),
  getActiveOpticalCondition: () => 'desconhecido',
  iniciarRodadaDeReforco: () => iniciarRodadaDeReforco(),
  alvosParaRecoletar: () => alvosParaRecoletar(),
  iniciarRecoletaDeAlvos: (a: { x: number; y: number }[], o?: { automatica?: boolean }) =>
    iniciarRecoletaDeAlvos(a, o as never),
  concluirRecoletaDeAlvos: (cb?: (r: { aceito: boolean }) => void) => concluirRecoletaDeAlvos(cb),
  podeRecoletarAlvos: () => podeRecoletar,
};

const recording = {
  isActive: () => false,
  start: vi.fn(),
  stop: vi.fn(),
  getStats: () => ({ frames: 0, dropped: 0 }),
  exportAsJSONL: () => '',
  clear: vi.fn(),
};

vi.mock('../../context/GazeContext', () => ({
  useGaze: () => ({
    l2csStatus: 'ready',
    getSessionUptimeMs: () => 1000,
    getDiagnostics: () => null,
    recording,
    calibration,
  }),
}));

/** A escolha de linguagem guardada; `updateSettings` a muda, como o contexto real. */
let linguagem: 'simples' | 'tecnica' | null = 'tecnica';
const updateSettings = vi.fn((s: { linguagemDoRelatorio?: 'simples' | 'tecnica' | null }) => {
  if ('linguagemDoRelatorio' in s) linguagem = s.linguagemDoRelatorio ?? null;
});
vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({
    settings: {
      screenDiagonalIn: 23.6,
      viewingDistanceCm: 60,
      screenGeometrySource: 'default',
      screenScaleFactor: 1,
      linguagemDoRelatorio: linguagem,
    },
    updateSettings,
  }),
}));

import { CalibrationCheck } from './CalibrationCheck';

const avancar = (passos: number, ms = 1300) => {
  for (let i = 0; i < passos; i++) act(() => { vi.advanceTimersByTime(ms); });
};

function calibrar() {
  act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
  avancar(16);
}

const coletados = () =>
  startCollectingPoint.mock.calls.map((c) => [
    Math.round((c[0] as number) * 100) / 100,
    Math.round((c[1] as number) * 100) / 100,
  ]);

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
  vi.useFakeTimers();
  segurarColeta = false;
  concluirColeta = null;
  paraRecoletar = [];
  podeRecoletar = true;
  linguagem = 'tecnica';
  calibration.abort.mockClear();
  startAccuracyTest.mockClear();
  startCollectingPoint.mockClear();
  alvosParaRecoletar.mockClear();
  iniciarRecoletaDeAlvos.mockClear();
  concluirRecoletaDeAlvos.mockClear();
  iniciarRodadaDeReforco.mockClear();
  completeCalibration.mockClear();
  updateSettings.mockClear();
});
afterEach(() => {
  reiniciarEstadoDaEmergencia();
  vi.useRealTimers();
});

describe('CalibrationCheck — recoleta automática dos alvos ruins (M22)', () => {
  it('sem alvo ruim, o caminho é o de antes: nove alvos, um treino, o teste', () => {
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    calibrar();
    expect(alvosParaRecoletar).toHaveBeenCalledTimes(1);
    expect(iniciarRecoletaDeAlvos).not.toHaveBeenCalled();
    expect(concluirRecoletaDeAlvos).not.toHaveBeenCalled();
    expect(startCollectingPoint).toHaveBeenCalledTimes(GRADE.length);
    expect(completeCalibration).toHaveBeenCalledTimes(1);
    expect(startAccuracyTest).toHaveBeenCalledTimes(1);
  });

  it('com um canto ruim, refaz SÓ ele, uma vez, antes do reforço e do teste', () => {
    paraRecoletar = [CANTO_RUIM];
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    calibrar();
    avancar(8);

    // Nove da calibração + o canto refeito.
    expect(coletados()).toHaveLength(GRADE.length + 1);
    expect(coletados()[GRADE.length]).toEqual([0.1, 0.9]);
    expect(iniciarRecoletaDeAlvos).toHaveBeenCalledTimes(1);
    expect(iniciarRecoletaDeAlvos.mock.calls[0][1]).toEqual({ automatica: true });
    expect(concluirRecoletaDeAlvos).toHaveBeenCalledTimes(1);
    // A recoleta não chama o treino da calibração: quem retreina é o núcleo,
    // com a trava de aceitação.
    expect(completeCalibration).toHaveBeenCalledTimes(1);
    // Uma rodada só, mesmo com o detector ainda apontando o canto.
    expect(alvosParaRecoletar).toHaveBeenCalledTimes(1);
    // A ordem: recoleta → reforço → teste.
    expect(concluirRecoletaDeAlvos.mock.invocationCallOrder[0]).toBeLessThan(
      iniciarRodadaDeReforco.mock.invocationCallOrder[0],
    );
    expect(startAccuracyTest).toHaveBeenCalledTimes(1);
    expect(iniciarRodadaDeReforco.mock.invocationCallOrder[0]).toBeLessThan(
      startAccuracyTest.mock.invocationCallOrder[0],
    );
  });

  it('durante a recoleta, a tela diz quantos pontos vai refazer, com calma', () => {
    paraRecoletar = [CANTO_RUIM];
    iniciarRecoletaDeAlvos.mockImplementationOnce((alvos: { x: number; y: number }[]) => {
      segurarColeta = true;
      return alvos.map((a) => ({ x: a.x, y: a.y }));
    });
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
    // Passos curtos até a recoleta abrir: o aviso aparece no preparo dela,
    // como o "Siga o ponto" aparece no preparo da calibração.
    for (let i = 0; i < 400 && iniciarRecoletaDeAlvos.mock.calls.length === 0; i++) avancar(1, 100);
    expect(iniciarRecoletaDeAlvos).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Vamos refazer 1 ponto que ficou impreciso/)).toBeInTheDocument();
    expect(screen.getByTestId('calib-progress-total')).toHaveTextContent('01');
    avancar(3);

    // Fecha o ponto: o retreino aparece como "Atualizando", não como teste.
    let devolver: ((r: { aceito: boolean }) => void) | undefined;
    concluirRecoletaDeAlvos.mockImplementationOnce((cb) => { devolver = cb; });
    segurarColeta = false;
    act(() => { concluirColeta?.(true); });
    avancar(4);
    expect(concluirRecoletaDeAlvos).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Atualizando a calibração')).toBeInTheDocument();
    expect(screen.queryByText('Iniciando teste de precisão')).toBeNull();
    expect(startAccuracyTest).not.toHaveBeenCalled();

    act(() => { devolver?.({ aceito: true }); });
    avancar(2);
    expect(startAccuracyTest).toHaveBeenCalledTimes(1);
  });

  // Revisão do pipeline de 19/10/2026: depois dos 13 pontos a calibração já
  // está treinada e gravada, e o núcleo descarta só as amostras da rodada.
  // Antes a tela dizia "A calibração foi interrompida… Comece de novo" e
  // mandava refazer tudo.
  it('sair da janela no meio da recoleta: a calibração fica, a tela diz isso e segue quando a janela volta', () => {
    paraRecoletar = [CANTO_RUIM];
    iniciarRecoletaDeAlvos.mockImplementationOnce((alvos: { x: number; y: number }[]) => {
      segurarColeta = true;
      return alvos.map((a) => ({ x: a.x, y: a.y }));
    });
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    calibrar();
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(calibration.abort).toHaveBeenCalledTimes(1);
    expect(concluirRecoletaDeAlvos).not.toHaveBeenCalled();
    expect(startAccuracyTest).not.toHaveBeenCalled();
    expect(screen.queryByText(/janela perdeu o foco/i)).toBeNull();
    expect(screen.queryByTestId('start-calibration-full')).toBeNull();
    expect(screen.getByTestId('pausa-calibracao-salva')).toHaveTextContent('A calibração está salva');

    // A janela volta: segue o caminho de sempre (reforço, teste), sem refazer
    // os pontos nem abrir outra recoleta.
    segurarColeta = false;
    act(() => { window.dispatchEvent(new Event('focus')); });
    avancar(4);
    expect(screen.queryByTestId('pausa-calibracao-salva')).toBeNull();
    expect(iniciarRodadaDeReforco).toHaveBeenCalledTimes(1);
    expect(startAccuracyTest).toHaveBeenCalledTimes(1);
    expect(iniciarRecoletaDeAlvos).toHaveBeenCalledTimes(1);
    expect(completeCalibration).toHaveBeenCalledTimes(1);
    expect(coletados()).toHaveLength(GRADE.length + 1);
  });

  it('sair da janela no meio do reforço (S4): a calibração fica e o "Continuar" leva ao teste', () => {
    iniciarRodadaDeReforco.mockImplementationOnce(() => {
      segurarColeta = true;
      return [{ x: 0.3, y: 0.7 }];
    });
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    calibrar();
    expect(iniciarRodadaDeReforco).toHaveBeenCalledTimes(1);
    expect(coletados()).toHaveLength(GRADE.length + 1);
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(calibration.abort).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Comece de novo/i)).toBeNull();

    // A saída pelo olhar (recuperação, dwell longo) e pelo mouse.
    const continuar = screen.getByTestId('pausa-continuar');
    expect(continuar.dataset.recovery).toBe('true');
    expect(Number(continuar.dataset.dwellMs)).toBeGreaterThanOrEqual(2000);
    segurarColeta = false;
    act(() => { fireEvent.click(continuar); });
    avancar(2);
    expect(startAccuracyTest).toHaveBeenCalledTimes(1);
    // Nem outro reforço, nem o treino do reforço cancelado.
    expect(iniciarRodadaDeReforco).toHaveBeenCalledTimes(1);
    expect(completeCalibration).toHaveBeenCalledTimes(1);
  });

  it('sair da janela nos 13 pontos continua abortando e voltando ao início, como antes', () => {
    segurarColeta = true;
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
    avancar(2);
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(calibration.abort).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/janela perdeu o foco/i)).toBeInTheDocument();
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
    expect(screen.queryByTestId('pausa-calibracao-salva')).toBeNull();
    // A janela volta: nada segue sozinho.
    act(() => { window.dispatchEvent(new Event('focus')); });
    avancar(4);
    expect(completeCalibration).not.toHaveBeenCalled();
    expect(startAccuracyTest).not.toHaveBeenCalled();
  });

  it('um passo já agendado não segue depois da perda de foco (não treina a sessão cancelada)', () => {
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
    // O último alvo fecha; o passo seguinte (o treino) fica agendado.
    for (let i = 0; i < 2000 && startCollectingPoint.mock.calls.length < GRADE.length; i++) avancar(1, 20);
    expect(startCollectingPoint).toHaveBeenCalledTimes(GRADE.length);
    expect(completeCalibration).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new Event('blur')); });
    avancar(6);
    expect(completeCalibration).not.toHaveBeenCalled();
    expect(startAccuracyTest).not.toHaveBeenCalled();
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
  });
});

describe('CalibrationCheck — a coleta interrompida pelo núcleo (revisão do pipeline de 19/10/2026)', () => {
  // O recorte do modelo do rosto mudou no meio da coleta (um reinício do
  // modelo): o núcleo aborta e avisa. Antes a tela ficava presa no alvo,
  // esperando um `onDone` que nunca vinha.
  const interromper = (rodada: ColetaInterrompida['rodada']) =>
    act(() => {
      ouvinteDaInterrupcao?.({ motivo: 'lado_do_recorte', rodada, detalhe: 'recorte 448² → 224²', em: 0 });
    });

  it('na calibração: volta ao início e diz o que houve, sem culpar a pessoa', () => {
    segurarColeta = true;
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
    avancar(2);
    expect(ouvinteDaInterrupcao).not.toBeNull();
    interromper('calibracao');
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
    expect(screen.getByText(/precisou reiniciar a leitura do rosto/)).toBeInTheDocument();
    expect(screen.getByText(/Não foi nada que você fez/)).toBeInTheDocument();
    avancar(6);
    expect(completeCalibration).not.toHaveBeenCalled();
    expect(startAccuracyTest).not.toHaveBeenCalled();
  });

  it('na recoleta: a calibração continua salva', () => {
    paraRecoletar = [CANTO_RUIM];
    iniciarRecoletaDeAlvos.mockImplementationOnce((alvos: { x: number; y: number }[]) => {
      segurarColeta = true;
      return alvos.map((a) => ({ x: a.x, y: a.y }));
    });
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    calibrar();
    interromper('recoleta');
    expect(screen.getByText(/A calibração continua salva/)).toBeInTheDocument();
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
    avancar(6);
    expect(concluirRecoletaDeAlvos).not.toHaveBeenCalled();
    expect(startAccuracyTest).not.toHaveBeenCalled();
  });
});

describe('CalibrationCheck — recoleta pedida na tela de resultado', () => {
  const Resultado = () => {
    const estado = useLocation().state as { destino?: string } | null;
    return <span data-testid="tela-resultado">{estado?.destino ?? 'sem destino'}</span>;
  };
  const abrirComPedido = () =>
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/calibration-check', state: { recoletar: true, destino: '/tutorial' } }]}
      >
        <Routes>
          <Route path="/calibration-check" element={<CalibrationCheck />} />
          <Route path="/calibration/resultado" element={<Resultado />} />
        </Routes>
      </MemoryRouter>,
    );

  it('refaz só os pontos ruins e volta ao resultado, sem outro teste de precisão', () => {
    paraRecoletar = [CANTO_RUIM];
    abrirComPedido();
    expect(iniciarRecoletaDeAlvos).toHaveBeenCalledTimes(1);
    expect(iniciarRecoletaDeAlvos.mock.calls[0][1]).toEqual({ automatica: false });
    avancar(8);
    expect(coletados()).toEqual([[0.1, 0.9]]);
    expect(concluirRecoletaDeAlvos).toHaveBeenCalledTimes(1);
    expect(completeCalibration).not.toHaveBeenCalled();
    expect(startAccuracyTest).not.toHaveBeenCalled();
    expect(screen.getByTestId('tela-resultado')).toHaveTextContent('/tutorial');
  });

  it('sair da janela no meio dela: a calibração fica e, de volta, vai ao resultado (revisão do pipeline de 19/10/2026)', () => {
    paraRecoletar = [CANTO_RUIM];
    segurarColeta = true;
    abrirComPedido();
    avancar(3);
    expect(coletados()).toEqual([[0.1, 0.9]]);
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(calibration.abort).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pausa-calibracao-salva')).toBeInTheDocument();
    act(() => { window.dispatchEvent(new Event('focus')); });
    avancar(2);
    expect(screen.getByTestId('tela-resultado')).toHaveTextContent('/tutorial');
    expect(concluirRecoletaDeAlvos).not.toHaveBeenCalled();
    expect(startAccuracyTest).not.toHaveBeenCalled();
  });

  it('sem pontos a refazer, fica no início e diz isso', () => {
    paraRecoletar = [];
    abrirComPedido();
    expect(iniciarRecoletaDeAlvos).not.toHaveBeenCalled();
    expect(screen.getByTestId('recoleta-sem-pontos')).toHaveTextContent(/não há pontos para refazer/i);
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
  });
});

describe('CalibrationCheck — a pergunta de uma vez: palavras ou números', () => {
  it('sem escolha ainda, pergunta antes do "Começar" — e o "Começar" espera a resposta', () => {
    linguagem = null;
    const { rerender } = render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    expect(screen.getByTestId('pergunta-linguagem')).toBeInTheDocument();
    expect(screen.queryByTestId('start-calibration-full')).toBeNull();

    // Acionável pelo olhar numa rota sem cursor: alvo de recuperação, dwell longo.
    const simples = screen.getByTestId('linguagem-simples');
    expect(simples.dataset.recovery).toBe('true');
    expect(Number(simples.dataset.dwellMs)).toBeGreaterThanOrEqual(2000);

    fireEvent.click(simples);
    expect(updateSettings).toHaveBeenCalledWith({ linguagemDoRelatorio: 'simples' });
    rerender(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    expect(screen.queryByTestId('pergunta-linguagem')).toBeNull();
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
  });

  it('com a escolha feita, não pergunta de novo', () => {
    linguagem = 'simples';
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    expect(screen.queryByTestId('pergunta-linguagem')).toBeNull();
  });

  it('a escolha vai para o painel do teste de precisão', () => {
    linguagem = 'simples';
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    calibrar();
    expect(startAccuracyTest).toHaveBeenCalledTimes(1);
    expect(startAccuracyTest.mock.calls[0][3]).toEqual({ linguagem: 'simples', resultadoDepois: true });
  });

  // Revisão do pipeline de 19/10/2026: com a recoleta desligada
  // (`?exp.recoletaDeAlvosRuins=0`) o painel prometia "na próxima tela dá para
  // refazer só os cantos", e a próxima tela não tinha o botão.
  it('sem como refazer pontos, o painel não promete a próxima tela', () => {
    linguagem = 'simples';
    podeRecoletar = false;
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    calibrar();
    expect(startAccuracyTest).toHaveBeenCalledTimes(1);
    expect(startAccuracyTest.mock.calls[0][3]).toEqual({ linguagem: 'simples', resultadoDepois: false });
  });
});

describe('CalibrationCheck — o alvo de fixação (Thaler et al., 2013)', () => {
  it('é o alvo ABC: disco, cruz e centro, a mesma marcação do teste de precisão', () => {
    segurarColeta = true;
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
    avancar(2);
    const alvo = screen.getByTestId('calib-bola').querySelector('.cf-bola') as HTMLElement;
    expect(alvo.classList.contains('alvo-abc')).toBe(true);
    for (const parte of ['.alvo-abc__disco', '.alvo-abc__cruz', '.alvo-abc__centro']) {
      expect(alvo.querySelector(parte)).not.toBeNull();
    }
  });

  it('coletando: tamanho final e azul; ponto fechado: verde, crescendo para o próximo', () => {
    segurarColeta = true;
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
    avancar(2);
    const alvo = () => screen.getByTestId('calib-bola').querySelector('.cf-bola') as HTMLElement;
    expect(alvo().classList.contains('cf-bola--coletando')).toBe(true);
    expect(alvo().classList.contains('alvo-abc--chegando')).toBe(false);
    expect(alvo().classList.contains('alvo-abc--confirmado')).toBe(false);

    // A confirmação é a COR; o tamanho muda com transição, nunca de golpe.
    act(() => { concluirColeta?.(true); });
    expect(alvo().classList.contains('alvo-abc--confirmado')).toBe(true);
    expect(alvo().classList.contains('alvo-abc--chegando')).toBe(true);
    expect(screen.getByTestId('calib-bola')).toHaveAttribute('data-confirmado', 'true');
  });

  it('o padrão é o fundo azul-marinho', () => {
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    expect(screen.getByRole('main').style.background).toBe('rgb(9, 27, 51)');
  });

  // Revisão do pipeline de 19/10/2026: o "antes" do estímulo, no MESMO build.
  it('com `estimuloAntigo`: a bola lisa de antes, sobre preto — azul coletando, verde ao fechar', () => {
    EXPERIMENT.estimuloAntigo = true;
    try {
      segurarColeta = true;
      render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
      expect(screen.getByRole('main').style.background).toBe('rgb(0, 0, 0)');
      expect(screen.getByTestId('calib-alvo-preview').dataset.estimulo).toBe('antigo');
      act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
      avancar(2);
      const bola = screen.getByTestId('calib-bola');
      expect(bola.querySelector('.alvo-abc')).toBeNull();
      const antiga = () => bola.querySelector('.cf-bola-antiga') as HTMLElement;
      expect(antiga()).not.toBeNull();
      expect(antiga().classList.contains('cf-bola-antiga--coletando')).toBe(true);
      expect(antiga().style.backgroundColor).toBe('rgb(27, 84, 168)');
      act(() => { concluirColeta?.(true); });
      expect(antiga().style.backgroundColor).toBe('rgb(34, 197, 94)');
    } finally {
      EXPERIMENT.estimuloAntigo = false;
    }
  });
});

// Revisão de UX de 20/10/2026, achados 6 e 7. A contagem da emergência aberta
// por cima dos alvos (pela pressão longa do acionador, pelo mouse, pelo
// teclado) não pausava a coleta: o paciente olhava o CANCELAR e o núcleo
// rotulava esse olhar com o alvo da vez. E o "Continuar" da pausa era um
// <button> comum de 220×64 px, numa rota que não mostra o cursor.
describe('CalibrationCheck — a contagem da emergência por cima da coleta', () => {
  const abrirContagem = () => act(() => { definirEmergenciaAtiva(true, 'confirmacao'); });
  const fecharContagem = () => act(() => { definirEmergenciaAtiva(false, 'confirmacao'); });

  it('nos 13 pontos: a coleta para pelo caminho da perda de foco, e a tela diz por quê, com calma', () => {
    segurarColeta = true;
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    act(() => { fireEvent.click(screen.getByTestId('start-calibration-full')); });
    avancar(2);
    expect(startCollectingPoint).toHaveBeenCalled();
    abrirContagem();
    expect(calibration.abort).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls.some((c) => String(c[0]).includes('calibração abortada por emergencia'))).toBe(true);
    expect(screen.getByText('A calibração parou porque a emergência foi acionada. Quando quiser, comece de novo.')).toBeInTheDocument();
    expect(screen.queryByText(/janela perdeu o foco/i)).toBeNull();
    expect(screen.getByTestId('start-calibration-full')).toBeInTheDocument();
    // A contagem fecha (cancelada): nada segue sozinho.
    fecharContagem();
    avancar(4);
    expect(completeCalibration).not.toHaveBeenCalled();
    expect(startAccuracyTest).not.toHaveBeenCalled();
    aviso.mockRestore();
  });

  it('no reforço: a calibração fica salva; com a contagem aberta nada recomeça, e depois o "Continuar" segue para o teste', () => {
    iniciarRodadaDeReforco.mockImplementationOnce(() => {
      segurarColeta = true;
      return [{ x: 0.3, y: 0.7 }];
    });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    calibrar();
    expect(coletados()).toHaveLength(GRADE.length + 1);
    abrirContagem();
    expect(calibration.abort).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pausa-calibracao-salva')).toHaveTextContent('A emergência foi acionada durante os últimos pontos');
    expect(screen.getByTestId('pausa-calibracao-salva')).not.toHaveTextContent(/janela/);
    // A janela volta a ter o foco no meio da contagem: a coleta não recomeça por baixo dela.
    segurarColeta = false;
    act(() => { window.dispatchEvent(new Event('focus')); });
    avancar(2);
    expect(screen.getByTestId('pausa-calibracao-salva')).toBeInTheDocument();
    expect(startAccuracyTest).not.toHaveBeenCalled();
    // A contagem fecha: a pausa espera a pessoa (o "Continuar").
    fecharContagem();
    avancar(2);
    expect(screen.getByTestId('pausa-calibracao-salva')).toBeInTheDocument();
    act(() => { fireEvent.click(screen.getByTestId('pausa-continuar')); });
    avancar(2);
    expect(startAccuracyTest).toHaveBeenCalledTimes(1);
    expect(iniciarRodadaDeReforco).toHaveBeenCalledTimes(1);
    expect(completeCalibration).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });

  it('o "Continuar" da pausa é um alvo do olhar: recuperação, com o alvo mínimo nos dois eixos', () => {
    iniciarRodadaDeReforco.mockImplementationOnce(() => {
      segurarColeta = true;
      return [{ x: 0.3, y: 0.7 }];
    });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<BrowserRouter><CalibrationCheck /></BrowserRouter>);
    calibrar();
    act(() => { window.dispatchEvent(new Event('blur')); });
    const continuar = screen.getByTestId('pausa-continuar');
    // GazeButton: zona de acerto e anel de progresso (a rota não mostra o cursor).
    expect(continuar).toHaveClass('gaze-button');
    expect(continuar.querySelector('.gaze-button-hit-area')).not.toBeNull();
    expect(continuar.querySelector('.gaze-button-progress-ring')).not.toBeNull();
    expect(continuar.dataset.recovery).toBe('true');
    // Não vira rótulo da correção por dwell (o rastreamento não muda).
    expect(continuar.dataset.isolado).toBeUndefined();
    expect(Number(continuar.dataset.dwellMs)).toBeGreaterThanOrEqual(2000);
    // Era 220×64 px.
    expect(continuar.style.minHeight).toContain('--gaze-target-min');
    expect(continuar.style.minWidth).toContain('--gaze-target-min');
    // O texto da perda de foco continua o de antes.
    expect(screen.getByTestId('pausa-calibracao-salva')).toHaveTextContent('A janela saiu da frente');
    aviso.mockRestore();
  });
});

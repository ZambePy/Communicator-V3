import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import React from 'react';
import { VOLUME_DA_VARREDURA_FALADA, ROTULO_SEM_NOME, _reiniciarAvisosDaVarreduraFalada } from '../services/interaction/varreduraFalada';
import { falar } from '../services/voz';
import { _reiniciarFalaEmCurso } from '../services/voz/falaEmCurso';
import { _redefinirVozDoSistema } from '../services/voz/sistema';
import { definirEmergenciaAtiva, _reiniciarParaTeste } from '../services/estadoDeEmergencia';

// -----------------------------------------------------------------------------
// A varredura FALADA do Plano B (rodada 3, 21/10/2026): a voz do computador diz
// o nome do botão destacado, baixinho. Aqui valem a varredura de verdade, a voz
// do sistema de verdade e o caminho de verdade da fala do paciente (`falar`);
// só o `speechSynthesis` é falso.
//
// O que o paciente não pode perder por causa dela: a frase dele. A voz do
// computador começa com `cancel()`, que corta TUDO — então a escolha de um
// botão que faz o paciente falar, seguida dos passos da varredura, é o caso
// que mais importa.
// -----------------------------------------------------------------------------

const olhar = { state: 'tracking', calibrado: true };
vi.mock('../context/GazeContext', () => ({
  DWELL_SELECTOR: 'button, a, [role="button"], [role="link"]',
  suspenderDwell: vi.fn(),
  useGaze: () => ({ state: olhar.state, calibration: { isCalibrated: () => olhar.calibrado } }),
}));
const ajustes = {
  modoDeEntrada: 'acionador' as 'olhar' | 'acionador',
  acionador: null as null,
  acionadorPassoMs: 1000,
  acionadorDesligaOlhar: true,
  acionadorPressaoLongaMs: 2000,
  varreduraFalada: true,
  soundEnabled: false,
};
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }) }));
vi.mock('../utils/emergencyAudio', () => ({ playTone: vi.fn() }));

const { VarreduraComAcionador } = await import('./VarreduraComAcionador');

// jsdom não tem layout: cada botão ganha uma caixa na primeira vez que é medido.
const retangulos = new Map<Element, DOMRect>();
let proximoTopo = 0;
const caixaOriginal = HTMLElement.prototype.getBoundingClientRect;
const caixa = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

// O sintetizador falso: guarda o que foi falado e em que ordem, e o `cancel()`
// interrompe a fala em curso, como o de verdade.
type Fala = {
  text: string; lang: string; rate: number; volume: number; pitch: number;
  onstart?: () => void; onend?: () => void; onerror?: (e: { error: string }) => void;
};
let falas: Fala[] = [];
let tocando: Fala | null = null;
let ordem: string[] = [];
const sintetizador = {
  cancel: vi.fn(() => {
    ordem.push('cancel');
    const u = tocando;
    tocando = null;
    u?.onerror?.({ error: 'interrupted' });
  }),
  speak: vi.fn((u: Fala) => {
    ordem.push(`fala:${u.text}`);
    falas.push(u);
    tocando = u;
    u.onstart?.();
  }),
};
function ligarVoz() {
  vi.stubGlobal('speechSynthesis', sintetizador);
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    text: string; lang = ''; rate = 1; volume = 1; pitch = 1;
    onstart?: () => void; onend?: () => void; onerror?: () => void;
    constructor(t: string) { this.text = t; }
  });
}
/** A fala em curso termina de verdade (chega o `onend`). */
const terminarFala = () => {
  const u = tocando;
  tocando = null;
  u?.onend?.();
};
const ditos = () => falas.map((f) => f.text);

function montar(conteudo: React.ReactNode) {
  return render(<>{conteudo}<VarreduraComAcionador /></>);
}
const tecla = (tipo: 'keydown' | 'keyup', code = 'Space') =>
  act(() => { window.dispatchEvent(new KeyboardEvent(tipo, { code, bubbles: true, cancelable: true })); });
const avancar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
/** Avança e deixa as promessas (a fala do paciente passa por vários `await`) correrem. */
const avancarAsync = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe('varredura falada', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ajustes.modoDeEntrada = 'acionador';
    ajustes.varreduraFalada = true;
    olhar.state = 'tracking';
    olhar.calibrado = true;
    falas = [];
    tocando = null;
    ordem = [];
    sintetizador.cancel.mockClear();
    sintetizador.speak.mockClear();
    retangulos.clear();
    proximoTopo = 0;
    _redefinirVozDoSistema();
    _reiniciarFalaEmCurso();
    _reiniciarParaTeste();
    _reiniciarAvisosDaVarreduraFalada();
    HTMLElement.prototype.getBoundingClientRect = function () {
      const r = retangulos.get(this);
      if (r) return r;
      if (this.tagName !== 'BUTTON') return caixaOriginal.call(this);
      const nova = caixa(10, proximoTopo, 200, 80);
      proximoTopo += 100;
      retangulos.set(this, nova);
      return nova;
    };
    ligarVoz();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = caixaOriginal;
    vi.unstubAllGlobals();
    _reiniciarFalaEmCurso();
    _reiniciarParaTeste();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('anuncia o botão destacado em volume baixo e, ao avançar, corta o anterior antes de falar o novo', () => {
    montar(<><button>Sede</button><button>Dor</button><button>Frio</button></>);
    avancar(150); // primeiro destaque: Sede
    expect(ditos()).toEqual(['Sede']);
    expect(falas[0].volume).toBeCloseTo(VOLUME_DA_VARREDURA_FALADA);
    expect(falas[0].lang).toBe('pt-BR');
    avancar(1000); // Dor
    avancar(1000); // Frio
    expect(ditos()).toEqual(['Sede', 'Dor', 'Frio']);
    expect(ordem).toEqual(['cancel', 'fala:Sede', 'cancel', 'fala:Dor', 'cancel', 'fala:Frio']);
  });

  // `cancel()` + `speak()` da voz do computador podem segurar a thread (a primeira
  // fala acorda o sintetizador, ~1 s no Windows). O anel do destaque é o que o
  // paciente vê: a voz é chamada num turno à parte, depois de o anel ser desenhado.
  // Cada timer corre no seu próprio `act`, para o React desenhar entre um e outro.
  describe('o anel do destaque não espera pela voz', () => {
    const original = sintetizador.speak.getMockImplementation() as (u: Fala) => void;
    afterEach(() => { sintetizador.speak.mockImplementation(original); });

    it('quando a voz é chamada, o anel já está desenhado no botão que ela vai dizer', () => {
      const aoFalar: { texto: string; topoDoAnel: string | null }[] = [];
      sintetizador.speak.mockImplementation((u: Fala) => {
        aoFalar.push({ texto: u.text, topoDoAnel: screen.queryByTestId('destaque-do-acionador')?.style.top ?? null });
        original(u);
      });
      montar(<><button>Sede</button><button>Dor</button></>);
      // O primeiro tique já desenhou o anel; a voz fica para o turno seguinte.
      expect(screen.getByTestId('destaque-do-acionador')).toBeInTheDocument();
      expect(ditos()).toEqual([]);
      for (let i = 0; i < 60 && ditos().length < 2; i++) act(() => { vi.advanceTimersToNextTimer(); });
      expect(aoFalar).toEqual([
        { texto: 'Sede', topoDoAnel: '-8px' }, // o botão está em top 0; o anel sobra 8 px
        { texto: 'Dor', topoDoAnel: '92px' }, //  o botão está em top 100
      ]);
    });

    it('sair da tela antes desse turno: a voz nem chega a ser chamada, e nada fica agendado', () => {
      const { unmount } = montar(<><button>Sede</button><button>Dor</button></>);
      unmount();
      expect(vi.getTimerCount()).toBe(0); // nem o tique, nem o turno da voz
      avancar(500);
      expect(sintetizador.speak).not.toHaveBeenCalled();
    });
  });

  it('desligada (o padrão), a varredura anda em silêncio', () => {
    ajustes.varreduraFalada = false;
    montar(<><button>Sede</button><button>Dor</button></>);
    avancar(3500);
    expect(screen.getByTestId('destaque-do-acionador')).toBeInTheDocument();
    expect(sintetizador.speak).not.toHaveBeenCalled();
    expect(sintetizador.cancel).not.toHaveBeenCalled();
  });

  it('o nome vem do aria-label quando o botão é só um ícone; sem nome nenhum, a voz diz isso', () => {
    montar(<><button aria-label="Chamar a enfermagem">🔔</button><button><svg /></button></>);
    avancar(150);
    avancar(1000);
    expect(ditos()).toEqual(['Chamar a enfermagem', ROTULO_SEM_NOME]);
  });

  it('desligar o ajuste no meio corta o anúncio que toca e a varredura segue muda; ligar de novo volta a falar', () => {
    montar(<><button>Sede</button><button>Dor</button></>);
    avancar(150);
    expect(tocando?.text).toBe('Sede');
    ajustes.varreduraFalada = false;
    avancar(100);
    expect(tocando).toBeNull();
    avancar(2500);
    expect(ditos()).toEqual(['Sede']);
    ajustes.varreduraFalada = true;
    avancar(100);
    expect(ditos().length).toBeGreaterThan(1);
  });

  it('a pausa (Esc) corta o anúncio, e pausada a varredura fica muda', () => {
    montar(<><button>Sede</button><button>Dor</button></>);
    avancar(150);
    expect(tocando?.text).toBe('Sede');
    tecla('keydown', 'Escape');
    avancar(100);
    expect(tocando).toBeNull();
    avancar(5000);
    expect(ditos()).toEqual(['Sede']);
  });

  it('sair da varredura (desmontar) corta o anúncio que ainda toca', () => {
    const { unmount } = montar(<><button>Sede</button><button>Dor</button></>);
    avancar(150);
    expect(tocando?.text).toBe('Sede');
    unmount();
    expect(tocando).toBeNull();
  });

  describe('nunca fala por cima do paciente', () => {
    it('escolher um botão que faz o paciente falar: a varredura NÃO corta a frase dele, nem anuncia por cima dela', async () => {
      const dizer = vi.fn(() => { void falar('Quero água', { sistema: true }); });
      montar(<><button onClick={dizer}>Água</button><button>Dor</button></>);
      avancar(150); // Água destacada e anunciada
      expect(ditos()).toEqual(['Água']);

      tecla('keydown');
      avancar(120);
      tecla('keyup'); // escolhe: o paciente começa a falar
      expect(dizer).toHaveBeenCalledTimes(1);
      await avancarAsync(0); // a fala do paciente chega à voz do sistema
      expect(ditos()).toEqual(['Água', 'Quero água']);
      expect(tocando?.text).toBe('Quero água');
      const aoComecarAFrase = ordem.length;

      // A varredura volta (depois de 0,7 s) e dá vários passos enquanto o
      // paciente fala: nenhum corte, nenhum anúncio.
      await avancarAsync(5000);
      expect(ordem.slice(aoComecarAFrase)).toEqual([]);
      expect(tocando?.text).toBe('Quero água');

      // A frase termina: a varredura volta a falar no passo seguinte.
      terminarFala();
      await avancarAsync(2500);
      expect(ditos().length).toBeGreaterThan(2);
      expect(ditos().at(-1)).toMatch(/^(Água|Dor)$/);
    });

    it('com o pedido de socorro em andamento a varredura fica muda (o alarme fala)', () => {
      definirEmergenciaAtiva(true, 'pedido');
      montar(<><button>Sim, parar</button><button>Voltar</button></>);
      avancar(3500);
      expect(screen.getByTestId('destaque-do-acionador')).toBeInTheDocument();
      expect(sintetizador.speak).not.toHaveBeenCalled();
      expect(sintetizador.cancel).not.toHaveBeenCalled();
    });

    it('a contagem da emergência aberta NÃO cala a varredura: o CANCELAR é anunciado', () => {
      definirEmergenciaAtiva(true, 'confirmacao');
      montar(<><button>Fundo</button><div role="alertdialog"><button data-cancelar-emergencia="true">CANCELAR</button></div></>);
      avancar(150);
      expect(ditos()).toEqual(['CANCELAR']);
    });
  });

  describe('quando a voz do computador não responde', () => {
    it('a faixa avisa o cuidador (e o console, uma vez); quando a voz volta, o aviso some', async () => {
      vi.unstubAllGlobals(); // este computador não tem voz nenhuma
      montar(<><button>Sede</button><button>Dor</button></>);
      expect(screen.queryByTestId('varredura-falada-sem-som')).toBeNull();
      await avancarAsync(150);
      const aviso = screen.getByTestId('varredura-falada-sem-som');
      expect(aviso).toHaveTextContent(/sem som/i);
      expect(console.warn).toHaveBeenCalledTimes(1);

      ligarVoz();
      await avancarAsync(1000);
      expect(ditos().length).toBeGreaterThan(0);
      expect(screen.queryByTestId('varredura-falada-sem-som')).toBeNull();
    });

    it('com a varredura falada desligada não há aviso nenhum, mesmo sem voz', async () => {
      vi.unstubAllGlobals();
      ajustes.varreduraFalada = false;
      montar(<><button>Sede</button><button>Dor</button></>);
      await avancarAsync(3000);
      expect(screen.queryByTestId('varredura-falada-sem-som')).toBeNull();
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});

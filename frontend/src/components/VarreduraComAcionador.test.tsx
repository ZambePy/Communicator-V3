import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { PAUSA_APOS_SELECAO_MS, PRESSAO_LONGA_EMERGENCIA_MS } from '@tracker/interaction/varreduraPorAcionador';
import { ReancoragemOverlay } from './ReancoragemOverlay';

// Plano B (pedido de 18/10/2026): varredura com acionador. O acionador chega
// como tecla (Espaço/Enter por padrão) ou botão do mouse.

const suspenderDwell = vi.fn();
const olhar = { state: 'tracking', calibrado: true };
vi.mock('../context/GazeContext', () => ({
  DWELL_SELECTOR: 'button, a, [role="button"], [role="link"]',
  suspenderDwell: (v: boolean) => suspenderDwell(v),
  useGaze: () => ({ state: olhar.state, calibration: { isCalibrated: () => olhar.calibrado } }),
}));
const ajustes = {
  modoDeEntrada: 'acionador' as 'olhar' | 'acionador',
  acionador: null as null | { tipo: 'tecla'; codigo: string } | { tipo: 'mouse'; botao: number },
  acionadorPassoMs: 1000,
  acionadorDesligaOlhar: true,
  acionadorPressaoLongaMs: 2000,
};
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings: ajustes, updateSettings: vi.fn() }) }));
vi.mock('../utils/emergencyAudio', () => ({ playTone: vi.fn() }));

const { VarreduraComAcionador, PAUSA_MAXIMA_MS, AVISO_DA_VOLTA_MS } = await import('./VarreduraComAcionador');

// jsdom não tem layout: cada botão ganha uma caixa na primeira vez que é
// medido, uma linha por botão — inclusive os que aparecem depois da montagem
// (o CANCELAR da contagem). Outras caixas (o overlay do reajuste) vão à mão.
let retangulos = new Map<Element, DOMRect>();
let proximoTopo = 0;
const caixaOriginal = HTMLElement.prototype.getBoundingClientRect;
const caixa = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const TELA_INTEIRA = caixa(0, 0, 1280, 800);

function montar(conteudo: React.ReactNode) {
  return render(<>{conteudo}<VarreduraComAcionador /></>);
}

const tecla = (tipo: 'keydown' | 'keyup', code = 'Space') =>
  act(() => { window.dispatchEvent(new KeyboardEvent(tipo, { code, bubbles: true, cancelable: true })); });
/** Tecla disparada NUM elemento (com o foco nele); devolve se o efeito padrão foi impedido. */
function teclaNo(el: Element, tipo: 'keydown' | 'keyup', code = 'Space', extra: KeyboardEventInit = {}): boolean {
  const key = code === 'Space' ? ' ' : code;
  const ev = new KeyboardEvent(tipo, { code, key, bubbles: true, cancelable: true, ...extra });
  act(() => { el.dispatchEvent(ev); });
  return ev.defaultPrevented;
}
const avancar = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const faixa = () => screen.getByRole('status');

describe('varredura com acionador', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ajustes.modoDeEntrada = 'acionador';
    ajustes.acionador = null;
    ajustes.acionadorDesligaOlhar = true;
    ajustes.acionadorPressaoLongaMs = 2000;
    olhar.state = 'tracking';
    olhar.calibrado = true;
    suspenderDwell.mockClear();
    retangulos = new Map();
    proximoTopo = 0;
    HTMLElement.prototype.getBoundingClientRect = function () {
      const r = retangulos.get(this);
      if (r) return r;
      if (this.tagName !== 'BUTTON') return caixaOriginal.call(this);
      const nova = caixa(10, proximoTopo, 200, 80);
      proximoTopo += 100;
      retangulos.set(this, nova);
      return nova;
    };
  });
  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = caixaOriginal;
    document.getElementById('accuracy-dot')?.remove();
    vi.useRealTimers();
  });

  it('percorre os botões e o Espaço (padrão dos acionadores) escolhe o destacado', () => {
    const a = vi.fn(); const b = vi.fn(); const c = vi.fn();
    montar(<><button onClick={a}>A</button><button onClick={b}>B</button><button onClick={c}>C</button></>);
    avancar(150); // primeiro destaque: A
    avancar(1000); // B
    expect(screen.getByTestId('destaque-do-acionador')).toBeInTheDocument();
    tecla('keydown');
    avancar(120);
    tecla('keyup');
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
    expect(c).not.toHaveBeenCalled();
  });

  it('o botão de Emergência não entra na volta; segurar 2 s o aciona', () => {
    const emergencia = vi.fn(); const a = vi.fn();
    montar(<><button data-emergency="true" onClick={emergencia}>Emergência</button><button onClick={a}>A</button></>);
    avancar(150); // destaque em A (a emergência foi pulada)
    tecla('keydown');
    avancar(2100);
    expect(emergencia).toHaveBeenCalledTimes(1);
    tecla('keyup');
    // O soltar depois da pressão longa não seleciona nada.
    expect(a).not.toHaveBeenCalled();
  });

  it('com uma janela de diálogo aberta, só os botões dela entram na volta (o CANCELAR da emergência)', () => {
    const fora = vi.fn(); const cancelar = vi.fn();
    montar(<>
      <button onClick={fora}>Fora</button>
      <div role="alertdialog"><button onClick={cancelar}>CANCELAR</button></div>
    </>);
    avancar(150);
    tecla('keydown'); avancar(100); tecla('keyup');
    expect(cancelar).toHaveBeenCalledTimes(1);
    expect(fora).not.toHaveBeenCalled();
  });

  it('Esc pausa (o cuidador usa o mouse e o teclado) e volta', () => {
    const a = vi.fn();
    montar(<button onClick={a}>A</button>);
    avancar(150);
    tecla('keydown', 'Escape');
    tecla('keydown'); avancar(100); tecla('keyup');
    expect(a).not.toHaveBeenCalled();
    expect(screen.getByText(/Varredura pausada/)).toBeInTheDocument();
    tecla('keydown', 'Escape');
    avancar(150);
    tecla('keydown'); avancar(100); tecla('keyup');
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('acionador configurado: só ele vale (Espaço passa a ser tecla comum)', () => {
    ajustes.acionador = { tipo: 'tecla', codigo: 'F9' };
    const a = vi.fn();
    montar(<button onClick={a}>A</button>);
    avancar(150);
    tecla('keydown'); avancar(100); tecla('keyup');
    expect(a).not.toHaveBeenCalled();
    tecla('keydown', 'F9'); avancar(100); tecla('keyup', 'F9');
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('desliga o clique pelo olhar enquanto estiver ativo, e religa ao sair', () => {
    const r = montar(<button>A</button>);
    expect(suspenderDwell).toHaveBeenCalledWith(true);
    r.unmount();
    expect(suspenderDwell).toHaveBeenLastCalledWith(false);
  });

  it('desligado no ajuste: nada acontece', () => {
    ajustes.modoDeEntrada = 'olhar';
    const a = vi.fn();
    montar(<button onClick={a}>A</button>);
    avancar(1500);
    tecla('keydown'); avancar(100); tecla('keyup');
    expect(a).not.toHaveBeenCalled();
    expect(screen.queryByTestId('destaque-do-acionador')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Revisão de UX de 19/10/2026. Os cenários vieram da revisão (os testes de
  // reprodução dela afirmavam o defeito; aqui afirmam a correção).
  // ---------------------------------------------------------------------------

  describe('item 3: a pausa pelo Esc não deixa o paciente sem entrada', () => {
    it('pausada, segurar o acionador ainda chama a Emergência (e o soltar não escolhe nada)', () => {
      const emergencia = vi.fn(); const a = vi.fn();
      montar(<><button data-emergency="true" onClick={emergencia}>Emergência</button><button onClick={a}>A</button></>);
      avancar(150);
      tecla('keydown', 'Escape');
      expect(screen.getByText(/Varredura pausada/)).toBeInTheDocument();
      tecla('keydown');
      expect(faixa()).toHaveTextContent('Segure 2 s para chamar a emergência');
      avancar(2100);
      expect(emergencia).toHaveBeenCalledTimes(1);
      tecla('keyup');
      expect(a).not.toHaveBeenCalled();
    });

    it('pausada, um aperto curto não escolhe nada e a tecla segue para a página; a repetição automática não', () => {
      const a = vi.fn();
      montar(<button onClick={a}>A</button>);
      avancar(150);
      tecla('keydown', 'Escape');
      expect(teclaNo(document.body, 'keydown', 'Enter')).toBe(false);
      // Segurar para pedir socorro não pode virar uma rajada de Enter no botão com foco.
      expect(teclaNo(document.body, 'keydown', 'Enter', { repeat: true })).toBe(true);
      avancar(100);
      expect(teclaNo(document.body, 'keyup', 'Enter')).toBe(false);
      expect(a).not.toHaveBeenCalled();
    });

    it('a emergência aberta com a varredura pausada traz a varredura de volta — o CANCELAR fica ao alcance', () => {
      function Tela() {
        const [aberta, setAberta] = React.useState(false);
        return aberta
          ? <div role="alertdialog" aria-modal="true"><button onClick={() => setAberta(false)}>CANCELAR</button></div>
          : <><button data-emergency="true" onClick={() => setAberta(true)}>Emergência</button><button>A</button></>;
      }
      montar(<Tela />);
      avancar(150);
      tecla('keydown', 'Escape');
      tecla('keydown'); avancar(2100); tecla('keyup');
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      expect(screen.queryByText(/Varredura pausada/)).toBeNull();
      avancar(PAUSA_APOS_SELECAO_MS + 200);
      tecla('keydown'); avancar(100); tecla('keyup');
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('pausada com a calibração valendo, o clique pelo olhar volta; quando a varredura volta, ele sai de novo', () => {
      montar(<button>A</button>);
      expect(suspenderDwell).toHaveBeenLastCalledWith(true);
      tecla('keydown', 'Escape');
      expect(suspenderDwell).toHaveBeenLastCalledWith(false);
      tecla('keydown', 'Escape');
      expect(suspenderDwell).toHaveBeenLastCalledWith(true);
    });

    it('pausada SEM calibração, o olhar não é religado à toa', () => {
      olhar.calibrado = false;
      olhar.state = 'uncalibrated';
      montar(<button>A</button>);
      tecla('keydown', 'Escape');
      expect(screen.getByText(/Varredura pausada/)).toBeInTheDocument();
      expect(suspenderDwell).not.toHaveBeenCalledWith(false);
    });

    it('a pausa acaba sozinha em 2 min, com o aviso grande 10 s antes', () => {
      expect(PAUSA_MAXIMA_MS).toBe(120_000);
      expect(AVISO_DA_VOLTA_MS).toBe(10_000);
      const a = vi.fn();
      montar(<button onClick={a}>A</button>);
      avancar(150);
      tecla('keydown', 'Escape');
      avancar(PAUSA_MAXIMA_MS - AVISO_DA_VOLTA_MS - 500);
      expect(screen.queryByTestId('aviso-da-volta')).toBeNull();
      avancar(600);
      expect(screen.getByTestId('aviso-da-volta')).toHaveTextContent('A varredura volta em 10 s');
      avancar(5000);
      expect(screen.getByTestId('aviso-da-volta')).toHaveTextContent('A varredura volta em 5 s');
      avancar(5000);
      expect(screen.queryByTestId('aviso-da-volta')).toBeNull();
      expect(screen.queryByText(/Varredura pausada/)).toBeNull();
      expect(suspenderDwell).toHaveBeenLastCalledWith(true);
      avancar(150);
      tecla('keydown'); avancar(100); tecla('keyup');
      expect(a).toHaveBeenCalledTimes(1);
    });

    it('no aviso, "Continuar pausada" dá mais 2 min a quem está usando o mouse', () => {
      const a = vi.fn();
      montar(<button onClick={a}>A</button>);
      tecla('keydown', 'Escape');
      avancar(PAUSA_MAXIMA_MS - 5000);
      const continuar = screen.getByRole('button', { name: 'Continuar pausada' });
      // Caminho do cuidador: o olhar e a varredura não a alcançam.
      expect(continuar).toHaveAttribute('data-no-dwell', 'true');
      act(() => { fireEvent.click(continuar); });
      expect(screen.queryByTestId('aviso-da-volta')).toBeNull();
      avancar(PAUSA_MAXIMA_MS - AVISO_DA_VOLTA_MS - 1000);
      expect(screen.getByText(/Varredura pausada/)).toBeInTheDocument();
      expect(screen.queryByTestId('aviso-da-volta')).toBeNull();
      avancar(AVISO_DA_VOLTA_MS + 1500);
      expect(screen.queryByText(/Varredura pausada/)).toBeNull();
    });

    it.each([
      ['num campo de texto', <input key="i" aria-label="frase" />, 'input'],
      ['numa janela de diálogo', <div key="d" role="dialog" aria-modal="true"><button>OK</button></div>, '[role="dialog"] button'],
    ])('Esc com o foco %s é do campo ou do diálogo: não pausa a varredura', (_nome, conteudo, seletor) => {
      montar(<><button>A</button>{conteudo}</>);
      const alvo = document.querySelector<HTMLElement>(seletor)!;
      alvo.focus();
      teclaNo(alvo, 'keydown', 'Escape');
      expect(screen.queryByText(/Varredura pausada/)).toBeNull();
    });
  });

  describe('item 7: pressão longa sem o botão de Emergência e limiar ajustável', () => {
    // Com a contagem aberta ou o pedido em andamento a regra mudou (revisão de
    // UX de 20/10/2026, achado 1): ver `VarreduraComAcionador.socorro.test.tsx`.
    it('sem o botão de Emergência e sem socorro em curso (a tela de emergência antes do pedido), segurar 2 s escolhe o destacado', () => {
      const dor = vi.fn();
      montar(<button onClick={dor}>Dor</button>);
      avancar(150); // destaque em "Dor" (único item)
      tecla('keydown');
      expect(faixa()).toHaveTextContent('Solte para escolher');
      avancar(PRESSAO_LONGA_EMERGENCIA_MS + 100);
      // Na hora: segurar é o gesto do socorro, e aqui ele escolhe o tipo dele.
      expect(dor).toHaveBeenCalledTimes(1);
      tecla('keyup');
      expect(dor).toHaveBeenCalledTimes(1);
      // Um aperto curto, depois da pausa de sempre, continua escolhendo.
      avancar(PAUSA_APOS_SELECAO_MS + 200);
      tecla('keydown'); avancar(300); tecla('keyup');
      expect(dor).toHaveBeenCalledTimes(2);
    });

    it('o limiar vem do ajuste: com 3 s, segurar 2,5 s não chama a emergência', () => {
      ajustes.acionadorPressaoLongaMs = 3000;
      const emergencia = vi.fn();
      montar(<><button data-emergency="true" onClick={emergencia}>Emergência</button><button>A</button></>);
      avancar(150);
      expect(faixa()).toHaveTextContent('segure 3 s para emergência');
      tecla('keydown');
      expect(faixa()).toHaveTextContent('Segure 3 s para chamar a emergência');
      avancar(2500);
      expect(emergencia).not.toHaveBeenCalled();
      avancar(600);
      expect(emergencia).toHaveBeenCalledTimes(1);
      tecla('keyup');
    });

    it('valor fora da faixa no ajuste vale o limite (nunca uma emergência num aperto comum)', () => {
      ajustes.acionadorPressaoLongaMs = 50;
      const emergencia = vi.fn();
      montar(<><button data-emergency="true" onClick={emergencia}>Emergência</button><button>A</button></>);
      avancar(150);
      tecla('keydown'); avancar(600); tecla('keyup');
      expect(emergencia).not.toHaveBeenCalled();
    });
  });

  describe('item 8: Espaço e Enter num campo de texto são do campo', () => {
    it.each([
      ['input de texto', <input key="i" aria-label="frase" />],
      ['textarea', <textarea key="t" aria-label="texto" />],
      ['select', <select key="s" aria-label="opção"><option>um</option></select>],
      ['contenteditable', <div key="c" contentEditable suppressContentEditableWarning tabIndex={0} aria-label="nota" />],
    ])('num(a) %s: não viram seleção da varredura e não são engolidos', (_nome, campo) => {
      const salvar = vi.fn();
      montar(<><button onClick={salvar}>Salvar</button>{campo}</>);
      avancar(150); // destaque em "Salvar"
      const alvo = document.querySelector<HTMLElement>('input, textarea, select, [contenteditable]')!;
      alvo.focus();
      for (const code of ['Space', 'Enter']) {
        expect(teclaNo(alvo, 'keydown', code)).toBe(false);
        avancar(100);
        expect(teclaNo(alvo, 'keyup', code)).toBe(false);
      }
      expect(salvar).not.toHaveBeenCalled();
    });

    it('num campo de texto, segurar o acionador ainda chama a emergência (o foco pode ter ficado preso ali)', () => {
      const emergencia = vi.fn();
      montar(<><button data-emergency="true" onClick={emergencia}>Emergência</button><button>A</button><input aria-label="frase" /></>);
      avancar(150);
      const campo = document.querySelector('input')!;
      campo.focus();
      expect(teclaNo(campo, 'keydown')).toBe(false); // o primeiro Espaço vai para o campo
      avancar(2100);
      expect(emergencia).toHaveBeenCalledTimes(1);
      // Depois disso, o resto do aperto não escreve mais no campo.
      expect(teclaNo(campo, 'keydown', 'Space', { repeat: true })).toBe(true);
      expect(teclaNo(campo, 'keyup')).toBe(true);
    });

    it('com o foco num campo de texto, a faixa avisa que o acionador está escrevendo nele', () => {
      montar(<><button>A</button><input aria-label="frase" /></>);
      document.querySelector('input')!.focus();
      avancar(150);
      expect(faixa()).toHaveTextContent(/escrevendo no campo de texto/);
    });

    it('caixa de seleção com o foco (depois de um clique) não tira o acionador do paciente', () => {
      const salvar = vi.fn();
      montar(<><button onClick={salvar}>Salvar</button><input type="checkbox" aria-label="marcar" /></>);
      avancar(150);
      const marcar = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
      marcar.focus();
      expect(teclaNo(marcar, 'keydown')).toBe(true);
      avancar(100);
      teclaNo(marcar, 'keyup');
      expect(salvar).toHaveBeenCalledTimes(1);
    });
  });

  describe('item 9: na calibração e no teste de precisão', () => {
    it.each([
      ['na calibração', () => { olhar.state = 'calibrating'; }],
      ['no teste de precisão', () => {
        const ponto = document.createElement('div');
        ponto.id = 'accuracy-dot';
        document.body.appendChild(ponto);
      }],
    ])('%s, segurar o acionador abre a contagem da Emergência', (_nome, preparar) => {
      preparar();
      const emergencia = vi.fn(); const calibrar = vi.fn();
      montar(<><button data-emergency="true" onClick={emergencia}>Emergência</button><button onClick={calibrar}>Calibrar de novo</button></>);
      avancar(150);
      // A volta espera a medição: nenhum destaque, nada escolhido.
      expect(screen.queryByTestId('destaque-do-acionador')).toBeNull();
      expect(faixa()).toHaveTextContent('segure 2 s para emergência');
      tecla('keydown');
      avancar(2100);
      expect(emergencia).toHaveBeenCalledTimes(1);
      tecla('keyup');
      expect(calibrar).not.toHaveBeenCalled();
    });

    it('na medição, a tecla não é engolida além do necessário', () => {
      olhar.state = 'calibrating';
      const daPagina = vi.fn();
      montar(<><button data-emergency="true">Emergência</button><button>Calibrar de novo</button></>);
      avancar(150);
      document.addEventListener('keydown', daPagina);
      try {
        // Sem o efeito padrão (o botão com foco, escondido sob a medição, não
        // é clicado), mas a tecla ainda chega à página.
        expect(teclaNo(document.body, 'keydown')).toBe(true);
        expect(daPagina).toHaveBeenCalledTimes(1);
        teclaNo(document.body, 'keyup');
        // No botão de Emergência com o foco (quem conduz a medição usa o
        // teclado), a tecla é dele, inteira.
        const botao = screen.getByText('Emergência');
        botao.focus();
        expect(teclaNo(botao, 'keydown', 'Enter')).toBe(false);
        expect(teclaNo(botao, 'keyup', 'Enter')).toBe(false);
      } finally {
        document.removeEventListener('keydown', daPagina);
      }
    });

    it('na medição com a contagem da emergência aberta, a varredura percorre o CANCELAR', () => {
      olhar.state = 'calibrating';
      const cancelar = vi.fn();
      montar(<div role="alertdialog" aria-modal="true"><button onClick={cancelar}>CANCELAR</button></div>);
      avancar(150);
      tecla('keydown'); avancar(100); tecla('keyup');
      expect(cancelar).toHaveBeenCalledTimes(1);
    });
  });

  describe('item 17: a varredura fica no diálogo modal de cima', () => {
    it('durante o reajuste rápido, não passa pelos botões escondidos sob ele', () => {
      const escondido = vi.fn();
      montar(<><button onClick={escondido}>Escondido</button><ReancoragemOverlay /></>);
      retangulos.set(screen.getByTestId('reancoragem-overlay'), TELA_INTEIRA);
      avancar(150);
      expect(screen.queryByTestId('destaque-do-acionador')).toBeNull();
      tecla('keydown'); avancar(100); tecla('keyup');
      expect(escondido).not.toHaveBeenCalled();
    });

    it('com dois diálogos abertos vale o de cima (a camada), não o último no DOM', () => {
      // O reajuste mora no GazeProvider, ANTES do resto do app no DOM; uma
      // confirmação aberta debaixo dele vem depois.
      const apagar = vi.fn();
      montar(<>
        <ReancoragemOverlay />
        <div style={{ position: 'fixed', zIndex: 99985 }}>
          <div role="alertdialog" aria-modal="true"><button onClick={apagar}>Apagar</button></div>
        </div>
      </>);
      retangulos.set(screen.getByTestId('reancoragem-overlay'), TELA_INTEIRA);
      avancar(150);
      tecla('keydown'); avancar(100); tecla('keyup');
      expect(apagar).not.toHaveBeenCalled();
    });

    it('um diálogo escondido não prende a varredura', () => {
      const a = vi.fn();
      montar(<><button onClick={a}>A</button><div role="alertdialog" aria-modal="true" hidden><button>Fantasma</button></div></>);
      avancar(150);
      tecla('keydown'); avancar(100); tecla('keyup');
      expect(a).toHaveBeenCalledTimes(1);
    });
  });
});

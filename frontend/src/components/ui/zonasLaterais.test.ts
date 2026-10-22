import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registrarZonaLateral,
  haZonasLaterais,
  zonaLateralNoX,
  ehZonaLateral,
  alvoComZonasLaterais,
  _limparZonasLaterais,
} from './zonasLaterais';

// Modo só horizontal (pedido de 21/10/2026): o alvo vale pela coluna do olhar,
// qualquer que seja o `y`.

type Caixa = { left: number; top: number; right: number; bottom: number };

function caixa(el: HTMLElement, c: Caixa): HTMLElement {
  el.getBoundingClientRect = () =>
    ({ ...c, x: c.left, y: c.top, width: c.right - c.left, height: c.bottom - c.top, toJSON: () => c }) as DOMRect;
  return el;
}

function botao(nome: string, c: Caixa, dados: Record<string, string> = {}): HTMLElement {
  const b = document.createElement('button');
  b.textContent = nome;
  for (const [k, v] of Object.entries(dados)) b.setAttribute(k, v);
  document.body.appendChild(b);
  return caixa(b, c);
}

/** O "topo" de cada ponto: o último elemento registrado aqui cuja caixa contém o ponto. */
let camadas: HTMLElement[] = [];
function hitTest(x: number, y: number): Element | null {
  for (let i = camadas.length - 1; i >= 0; i--) {
    const r = camadas[i].getBoundingClientRect();
    if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return camadas[i];
  }
  return null;
}

const ESQUERDA = { left: 0, top: 200, right: 400, bottom: 700 };
const DIREITA = { left: 600, top: 200, right: 1000, bottom: 700 };

describe('zonas laterais — o alvo pela coluna do olhar', () => {
  beforeEach(() => {
    _limparZonasLaterais();
    document.body.innerHTML = '';
    camadas = [];
    document.elementFromPoint = (x: number, y: number) => hitTest(x, y);
  });
  afterEach(() => _limparZonasLaterais());

  it('sem zona registrada: nada muda (nenhuma zona, nenhum alvo)', () => {
    expect(haZonasLaterais()).toBe(false);
    expect(zonaLateralNoX(100)).toBeNull();
  });

  it('a zona vale pelo x, com o y em qualquer lugar (inclusive fora dela e fora da tela)', () => {
    const esq = botao('Não', ESQUERDA);
    const dir = botao('Sim', DIREITA);
    camadas = [esq, dir];
    registrarZonaLateral(esq);
    registrarZonaLateral(dir);
    expect(haZonasLaterais()).toBe(true);
    expect(ehZonaLateral(esq)).toBe(true);
    expect(zonaLateralNoX(50)).toBe(esq);
    expect(zonaLateralNoX(399)).toBe(esq);
    expect(zonaLateralNoX(700)).toBe(dir);
    // O vão do meio não é de ninguém.
    expect(zonaLateralNoX(500)).toBeNull();
    // Coordenada não finita não é coluna nenhuma.
    expect(zonaLateralNoX(Number.NaN)).toBeNull();
  });

  it('desregistrar tira a zona; elemento fora do documento não vale', () => {
    const esq = botao('Não', ESQUERDA);
    camadas = [esq];
    const tirar = registrarZonaLateral(esq);
    tirar();
    expect(haZonasLaterais()).toBe(false);
    expect(zonaLateralNoX(50)).toBeNull();

    registrarZonaLateral(esq);
    esq.remove();
    expect(zonaLateralNoX(50)).toBeNull();
  });

  it('zona coberta por uma sobreposição naquela coluna não vale (a de cima vale)', () => {
    const esq = botao('A–M', ESQUERDA);
    registrarZonaLateral(esq);
    // A pergunta do cuidador abre por cima do teclado lateral.
    const veu = document.createElement('div');
    document.body.appendChild(caixa(veu, { left: 0, top: 0, right: 1024, bottom: 768 }));
    const naoDaPergunta = botao('Não', { left: 0, top: 0, right: 350, bottom: 768 });
    camadas = [esq, veu, naoDaPergunta];
    registrarZonaLateral(naoDaPergunta);
    expect(zonaLateralNoX(50)).toBe(naoDaPergunta);
    // Na coluna 380 a zona da pergunta não chega, e a do teclado está coberta pelo véu.
    expect(zonaLateralNoX(380)).toBeNull();
  });
});

describe('o alvo do despachante com zonas laterais na tela', () => {
  beforeEach(() => {
    _limparZonasLaterais();
    document.body.innerHTML = '';
    camadas = [];
    document.elementFromPoint = (x: number, y: number) => hitTest(x, y);
  });
  afterEach(() => _limparZonasLaterais());

  function telaLateral() {
    const voltar = botao('Voltar', { left: 0, top: 0, right: 120, bottom: 120 });
    const esq = botao('Não', ESQUERDA);
    const dir = botao('Sim', DIREITA);
    camadas = [voltar, esq, dir];
    registrarZonaLateral(esq);
    registrarZonaLateral(dir);
    return { voltar, esq, dir };
  }

  it('modo só horizontal: o botão comum sob o ponto perde para a zona da coluna', () => {
    const { voltar, esq } = telaLateral();
    // O y do paciente caiu no Voltar do cabeçalho; o x está na metade esquerda.
    expect(alvoComZonasLaterais(voltar, 60, true)).toBe(esq);
  });

  it('modo só horizontal: fora das zonas, numa tela lateral, o olhar não aciona botão comum', () => {
    const { voltar } = telaLateral();
    const meio = botao('Ouvir', { left: 450, top: 0, right: 550, bottom: 100 });
    camadas.push(meio);
    expect(alvoComZonasLaterais(meio, 500, true)).toBeNull();
    expect(alvoComZonasLaterais(voltar, 500, true)).toBeNull();
  });

  it('a Emergência sob o ponto vale sempre pelo ponto', () => {
    const { esq } = telaLateral();
    const socorro = botao('Emergência', { left: 0, top: 0, right: 200, bottom: 90 }, { 'data-emergency': 'true' });
    expect(alvoComZonasLaterais(socorro, 60, true)).toBe(socorro);
    expect(alvoComZonasLaterais(socorro, 60, false)).toBe(socorro);
    expect(alvoComZonasLaterais(null, 60, true)).toBe(esq);
  });

  // Revisão de 21/10/2026 (Important 2): no modo só horizontal o y não diz
  // para onde o paciente olha. O CANCELAR do meio, logo abaixo do texto da
  // contagem, cancelava o próprio socorro de quem só lia; o "Recalibre aqui"
  // levava para a calibração. Os dois valem só como zona lateral.
  it('modo só horizontal: o CANCELAR e a recuperação sob o ponto NÃO valem pelo ponto (só como zona)', () => {
    const { esq } = telaLateral();
    const cancelar = botao('CANCELAR', { left: 0, top: 0, right: 200, bottom: 90 }, { 'data-cancelar-emergencia': 'true' });
    const recalibrar = botao('Recalibre', { left: 0, top: 0, right: 200, bottom: 90 }, { 'data-recovery': 'true' });
    for (const alvo of [cancelar, recalibrar]) {
      expect(alvoComZonasLaterais(alvo, 60, true)).toBe(esq);
      expect(alvoComZonasLaterais(alvo, 500, true)).toBeNull();
      // Fora do modo horizontal, como sempre: pelo ponto.
      expect(alvoComZonasLaterais(alvo, 60, false)).toBe(alvo);
    }
    // Como zona lateral (a faixa do CANCELAR, à esquerda), valem pela coluna.
    const faixaDoCancelar = botao('Cancelar a emergência', { left: 0, top: 0, right: 90, bottom: 768 }, { 'data-cancelar-emergencia': 'true' });
    camadas.push(faixaDoCancelar);
    registrarZonaLateral(faixaDoCancelar, 'faixa');
    expect(alvoComZonasLaterais(null, 40, true)).toBe(faixaDoCancelar);
  });

  // Revisão de 21/10/2026 (Important 3): um modal comum POR CIMA de uma tela
  // lateral (o lembrete, o aviso da fala) ficava sem resposta ao olhar — as
  // metades cobertas ainda contavam, e tudo o que não era zona virava nada.
  it('modo só horizontal: com as metades cobertas por um modal, o modal volta à regra de antes (o ponto vale)', () => {
    telaLateral();
    const veu = document.createElement('div');
    document.body.appendChild(caixa(veu, { left: 0, top: 0, right: 1024, bottom: 768 }));
    const confirmar = botao('Confirmar', { left: 380, top: 500, right: 640, bottom: 600 });
    camadas.push(veu, confirmar);
    expect(alvoComZonasLaterais(confirmar, 500, true)).toBe(confirmar);
    // E o x numa coluna de metade coberta não a aciona.
    expect(alvoComZonasLaterais(null, 60, true)).toBeNull();
  });

  it('fora do modo só horizontal: o que está sob o ponto vale como sempre; sem nada sob o ponto, a zona da coluna', () => {
    const { voltar, esq } = telaLateral();
    expect(alvoComZonasLaterais(voltar, 60, false)).toBe(voltar);
    expect(alvoComZonasLaterais(null, 60, false)).toBe(esq);
    expect(alvoComZonasLaterais(null, 500, false)).toBeNull();
  });

  it('modo só horizontal só com a faixa da Emergência (tela comum): fora dela, o ponto vale como antes', () => {
    const faixa = botao('Emergência', { left: 942, top: 0, right: 1024, bottom: 768 }, { 'data-emergency': 'true' });
    const cartao = botao('Teclado', { left: 100, top: 100, right: 400, bottom: 300 });
    camadas = [cartao, faixa];
    registrarZonaLateral(faixa, 'faixa');
    expect(alvoComZonasLaterais(cartao, 200, true)).toBe(cartao);
    // Na coluna da faixa, ela vale com o y em qualquer lugar.
    expect(alvoComZonasLaterais(null, 1000, true)).toBe(faixa);
  });
});

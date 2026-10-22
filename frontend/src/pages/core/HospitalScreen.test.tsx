import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { alvoMinimoPx } from '../../design/gazeMetrics';
import { EVENTO_DE_FALA_QUE_NAO_SAIU, type DetalheDaFalaQueNaoSaiu } from '../../services/voz/falaDoPaciente';

// -----------------------------------------------------------------------------
// Tela do modo hospital (rodada 3, 21/10/2026): a tela inicial de quem está num
// leito de UTI ou enfermaria. Nove necessidades e a saída para o menu completo,
// em alvos grandes: dor (abre o mapa da dor), chamar a enfermagem (pedido de
// ajuda), aspirar, sim/não, posição, sede, frio, calor e família.
//
// Os cliques daqui são os mesmos `onClick` que o dwell do olhar e o acionador da
// varredura acionam. O barramento da nuvem é o de verdade, com espiões na frente.
// -----------------------------------------------------------------------------

const falar = vi.fn(async (..._a: unknown[]) => ({ origem: 'sistema' as 'sistema' | 'nenhuma', motivo: undefined as string | undefined }));
vi.mock('../../services/voz', () => ({ falar: (...a: unknown[]) => falar(...a) }));
const emitirFalaDoPaciente = vi.fn();
const emitirPedidoDeAjuda = vi.fn();
vi.mock('../../cloud/eventos', async (original) => {
  const real = await original<typeof import('../../cloud/eventos')>();
  return {
    ...real,
    emitirFalaDoPaciente: (...a: Parameters<typeof real.emitirFalaDoPaciente>) => { emitirFalaDoPaciente(...a); return real.emitirFalaDoPaciente(...a); },
    emitirPedidoDeAjuda: (...a: Parameters<typeof real.emitirPedidoDeAjuda>) => { emitirPedidoDeAjuda(...a); return real.emitirPedidoDeAjuda(...a); },
  };
});
const logSentence = vi.fn();
vi.mock('../../utils/clinicalLogger', () => ({ logSentence: (...a: unknown[]) => logSentence(...a) }));
const playTone = vi.fn();
vi.mock('../../utils/emergencyAudio', () => ({ playTone: (...a: unknown[]) => playTone(...a) }));
let layout: { showBack?: boolean; backRoute?: string; titulo?: string; subtitulo?: string } = {};
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: (p: { children: React.ReactNode; showBack?: boolean; backRoute?: string; titulo?: string; subtitulo?: string }) => {
    layout = { showBack: p.showBack, backRoute: p.backRoute, titulo: p.titulo, subtitulo: p.subtitulo };
    return <div>{p.children}</div>;
  },
}));

const { HospitalScreen, CARTOES_DO_HOSPITAL } = await import('./HospitalScreen');
const { informarEntrega, ouvir, _limparOuvintes } = await import('../../cloud/eventos');
const { _reiniciarChamadoDaEnfermagem, textoDaEntrega, textoCurtoDaEntrega } = await import('./hospital/chamadoDaEnfermagem');

const ROTAS = ['/dor', '/sim-nao', '/menu-completo'];
const montar = () =>
  render(
    <MemoryRouter initialEntries={['/hospital']}>
      <Routes>
        <Route path="/hospital" element={<HospitalScreen />} />
        {ROTAS.map((r) => <Route key={r} path={r} element={<p>destino {r}</p>} />)}
      </Routes>
    </MemoryRouter>,
  );

const botao = (nome: string) => screen.getByRole('button', { name: nome });
const tocar = async (nome: string) => { await act(async () => { fireEvent.click(botao(nome)); }); };
const passar = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => {
  vi.useFakeTimers();
  // A `GazeGrid` avisa, só em desenvolvimento, que são mais de 6 alvos (são 10,
  // de propósito) e mede 0 × 0 no jsdom; o aviso não diz nada sobre o teste.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  falar.mockReset();
  falar.mockImplementation(async () => ({ origem: 'sistema', motivo: undefined }));
  emitirFalaDoPaciente.mockClear();
  emitirPedidoDeAjuda.mockClear();
  logSentence.mockClear();
  playTone.mockClear();
  _limparOuvintes();
  _reiniciarChamadoDaEnfermagem();
  layout = {};
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('tela do hospital: o que ela tem', () => {
  it('são dez botões, nesta ordem: a dor e a enfermagem primeiro, a saída para o menu completo por último', () => {
    montar();
    const nomes = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(nomes).toEqual([
      'Dor', 'Chamar a enfermagem', 'Aspirar', 'Sim · Não', 'Posição',
      'Sede', 'Frio', 'Calor', 'Família', 'Mais opções',
    ]);
    // A tabela que a tela usa tem a mesma ordem (a varredura passa por ela).
    expect(CARTOES_DO_HOSPITAL.map((c) => c.titulo)).toEqual(nomes);
  });

  it('é a tela inicial do quarto: não tem botão Voltar e o título pergunta o que a pessoa precisa', () => {
    montar();
    expect(layout.showBack).toBe(false);
    expect(layout.titulo).toBe('O que você precisa?');
    // Serve a quem olha e a quem usa o acionador (a varredura falada é de quem o usa).
    expect(layout.subtitulo).toBe('Escolha o botão que quiser');
  });

  it('alvos grandes: sem medida da janela (o jsdom não tem layout), a grade é a de sempre, 5 × 2; cada botão preenche a célula e as linhas partem do piso de 5°', () => {
    const { container } = montar();
    const grade = container.querySelector('.gaze-grid') as HTMLElement;
    expect(grade.style.gridTemplateColumns).toBe('repeat(5, minmax(0, 1fr))');
    expect(grade.style.gridTemplateRows).toBe(`repeat(2, minmax(${alvoMinimoPx()}px, 1fr))`);
    for (const b of screen.getAllByRole('button')) {
      expect(b.style.height).toBe('100%');
      expect(b.className).toContain('gaze-button');
    }
  });

  it('o texto de cada botão é calmo e diz o que ele faz: as necessidades mostram a frase que vão falar', () => {
    montar();
    expect(botao('Sede').textContent).toContain('Estou com sede.');
    expect(botao('Dor').textContent).toMatch(/onde e quanto/i);
    expect(botao('Mais opções').textContent).toMatch(/menu completo/i);
  });
});

describe('tela do hospital: os botões que abrem outra tela', () => {
  it.each([
    ['Dor', '/dor'],
    ['Sim · Não', '/sim-nao'],
    ['Mais opções', '/menu-completo'],
  ])('%s abre %s', (nome, rota) => {
    montar();
    fireEvent.click(botao(nome));
    expect(screen.getByText(`destino ${rota}`)).toBeInTheDocument();
    // Abrir outra tela não fala, não grava e não avisa ninguém.
    expect(falar).not.toHaveBeenCalled();
    expect(emitirFalaDoPaciente).not.toHaveBeenCalled();
    expect(emitirPedidoDeAjuda).not.toHaveBeenCalled();
  });
});

describe('tela do hospital: as necessidades falam pelo paciente', () => {
  it.each([
    ['Sede', 'Estou com sede.'],
    ['Aspirar', 'Preciso de aspiração.'],
    ['Posição', 'Preciso mudar de posição.'],
    ['Frio', 'Estou com frio.'],
    ['Calor', 'Estou com calor.'],
    ['Família', 'Chame a minha família, por favor.'],
  ])('%s fala "%s", anota no histórico e manda ao celular do cuidador — sem ser pedido de ajuda', async (nome, frase) => {
    montar();
    await tocar(nome);
    expect(falar).toHaveBeenCalledWith(frase, expect.objectContaining({ rate: 0.9 }));
    expect(logSentence).toHaveBeenCalledWith(frase);
    expect(emitirFalaDoPaciente).toHaveBeenCalledWith(frase, 'frase');
    // Sede não é emergência nem chamado: nada de alarme, nada de pedido de ajuda.
    expect(emitirPedidoDeAjuda).not.toHaveBeenCalled();
    expect(playTone).not.toHaveBeenCalled();
  });

  it('o botão diz o que aconteceu com a fala: falando, depois "falei", e volta ao normal', async () => {
    let terminar: (r: { origem: 'sistema'; motivo: undefined }) => void = () => {};
    falar.mockImplementationOnce(() => new Promise((resolve) => { terminar = resolve as typeof terminar; }));
    montar();
    await tocar('Sede');
    expect(botao('Sede').textContent).toContain('Falando…');
    await act(async () => { terminar({ origem: 'sistema', motivo: undefined }); });
    expect(botao('Sede').textContent).toContain('Falei em voz alta');
    expect(botao('Sede').textContent).not.toContain('Falando…');
    await passar(3500);
    expect(botao('Sede').textContent).toContain('Estou com sede.');
    expect(botao('Sede').textContent).not.toContain('Falei');
  });

  it('a mesma informação vai para quem usa leitor de tela, numa região de aviso', async () => {
    montar();
    await tocar('Frio');
    expect(screen.getByRole('status')).toHaveTextContent('Frio: falei em voz alta.');
  });

  it('se a voz não sai: o botão diz, o texto vai para a tela em letra grande — e o pedido não se perde', async () => {
    falar.mockImplementation(async () => ({ origem: 'nenhuma', motivo: 'sem_voz' }));
    const avisos: DetalheDaFalaQueNaoSaiu[] = [];
    const ouvinte = (e: Event) => avisos.push((e as CustomEvent<DetalheDaFalaQueNaoSaiu>).detail);
    window.addEventListener(EVENTO_DE_FALA_QUE_NAO_SAIU, ouvinte);
    try {
      montar();
      await tocar('Sede');
      expect(avisos.map((a) => a.texto)).toEqual(['Estou com sede.']);
      expect(botao('Sede').textContent).toContain('Sem som');
      expect(botao('Sede').textContent).not.toContain('Falei em voz alta');
      expect(screen.getByRole('status')).toHaveTextContent('Sede: sem som');
      // Quem estiver no celular do cuidador ainda recebe o pedido.
      expect(emitirFalaDoPaciente).toHaveBeenCalledWith('Estou com sede.', 'frase');
      expect(logSentence).toHaveBeenCalledWith('Estou com sede.');
    } finally {
      window.removeEventListener(EVENTO_DE_FALA_QUE_NAO_SAIU, ouvinte);
    }
  });

  it('uma fala que toma o lugar de outra não herda o resultado dela', async () => {
    let terminarDaSede: (r: { origem: 'sistema'; motivo: undefined }) => void = () => {};
    falar.mockImplementationOnce(() => new Promise((resolve) => { terminarDaSede = resolve as typeof terminarDaSede; }));
    montar();
    await tocar('Sede');
    await tocar('Frio');
    expect(botao('Frio').textContent).toContain('Falei em voz alta');
    // A fala antiga termina depois: não pode mexer no que a tela mostra agora.
    await act(async () => { terminarDaSede({ origem: 'sistema', motivo: undefined }); });
    expect(botao('Frio').textContent).toContain('Falei em voz alta');
    expect(botao('Sede').textContent).not.toContain('Falei');
    expect(botao('Sede').textContent).not.toContain('Falando');
  });

  it('desmontar a tela com o resultado de uma fala na tela não deixa temporizador nem erro para trás', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = montar();
    await tocar('Sede');
    expect(vi.getTimerCount()).toBeGreaterThan(0); // o "falei" volta ao normal em 3 s
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await passar(5000);
    expect(erro).not.toHaveBeenCalled();
  });
});

describe('tela do hospital: chamar a enfermagem', () => {
  const chamar = async () => { await tocar('Chamar a enfermagem'); };
  const cartao = () => botao('Chamar a enfermagem');

  it('toca o chamado, fala e manda um pedido de AJUDA (não a emergência) ao celular', async () => {
    montar();
    await chamar();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    expect(emitirPedidoDeAjuda).toHaveBeenCalledWith('ajuda', expect.stringMatching(/enfermagem/i), expect.stringMatching(/^[0-9a-f-]{36}$/));
    // Três notas, como o "Chamar atenção" da tela Sim · Não.
    expect(playTone).toHaveBeenCalledTimes(3);
    // A voz espera o chamado tocar.
    expect(falar).not.toHaveBeenCalled();
    await passar(1200);
    expect(falar).toHaveBeenCalledWith('Por favor, chame a enfermagem.', expect.anything());
    // Não é a Emergência: sem contagem, sem alarme contínuo, sem frase no histórico de falas.
    expect(emitirFalaDoPaciente).not.toHaveBeenCalled();
  });

  it('diz "CHAMANDO…" enquanto o chamado toca e volta ao nome do botão depois', async () => {
    montar();
    await chamar();
    expect(cartao().textContent).toContain('CHAMANDO…');
    await passar(2700);
    expect(cartao().textContent).not.toContain('CHAMANDO…');
    expect(cartao().textContent).toContain('Chamar a enfermagem');
  });

  // O que o botão mostra é CURTO: numa célula de ~200 px a frase inteira da
  // entrega passava de cinco linhas e empurrava o título para fora. A frase
  // inteira continua na região de aviso, para o leitor de tela.
  it('sem celular ligado a este computador: o botão diz que só tocou aqui, e o leitor de tela ouve a frase inteira', async () => {
    montar();
    await chamar(); // ninguém ouvindo o barramento = sem nuvem
    expect(cartao().textContent).toContain('Sem celular: tocou só aqui.');
    expect(cartao().textContent).not.toMatch(/avisado/);
    expect(cartao().textContent).not.toMatch(/Nenhum celular de cuidador/);
    expect(screen.getByRole('status')).toHaveTextContent(/Nenhum celular de cuidador está ligado a este computador. O chamado tocou só aqui./);
  });

  it('com a nuvem: "avisando" até a resposta, depois o que ela disse', async () => {
    ouvir(() => {});
    montar();
    await chamar();
    const id = emitirPedidoDeAjuda.mock.calls[0][2] as string;
    expect(cartao().textContent).toContain('Avisando o celular…');
    act(() => informarEntrega(id, 'enviado'));
    expect(cartao().textContent).toContain('Cuidador avisado.');
    expect(screen.getByRole('status')).toHaveTextContent(/O celular do cuidador foi avisado/);
  });

  it.each([
    ['na_fila', 'Sem internet. Avisa ao voltar.', /Sem internet agora: o celular do cuidador será avisado quando a internet voltar/],
    ['sem_push', 'Ninguém avisado. Tocou só aqui.', /Nenhum celular de cuidador foi avisado/],
    ['limitado', 'Já chamou. Urgente? Emergência.', /Você chamou várias vezes; o celular não recebe novos avisos por alguns minutos\. Se for urgente, use a Emergência\./],
    ['push_incerto', 'Enviado. Aviso não confirmado.', /não deu para confirmar/],
    ['falhou', 'Não avisou. Tocou só aqui.', /Não deu para avisar o celular do cuidador/],
    ['ensaio', 'Apresentação: nada enviado.', /Modo apresentação: nada foi enviado/],
  ] as const)('entrega %s: o botão diz "%s" (sem dizer que avisou) e o leitor de tela ouve a frase inteira', async (entrega, curto, inteira) => {
    ouvir(() => {});
    montar();
    await chamar();
    act(() => informarEntrega(emitirPedidoDeAjuda.mock.calls[0][2] as string, entrega));
    expect(cartao().textContent).toContain(curto);
    expect(cartao().textContent).not.toContain('Cuidador avisado.');
    expect(screen.getByRole('status')).toHaveTextContent(inteira);
  });

  it('o texto do botão é curto para toda entrega: duas linhas de uma célula do tamanho mínimo, e a frase inteira é maior', () => {
    // Uma célula no piso de 5° (198 px) com 12 px de margem de cada lado deixa
    // 174 px: a 16 px de letra, uns 18 caracteres por linha. Duas linhas = 36;
    // 32 deixa folga para a quebra entre palavras.
    for (const entrega of [null, 'enviando', 'enviado', 'na_fila', 'sem_nuvem', 'sem_push', 'limitado', 'push_incerto', 'falhou', 'ensaio'] as const) {
      const curto = textoCurtoDaEntrega(entrega);
      expect(curto.length, `"${curto}" passa de duas linhas`).toBeLessThanOrEqual(32);
      expect(curto.length).toBeLessThan(textoDaEntrega(entrega).length);
    }
    expect(textoCurtoDaEntrega(null)).toBe('Avisando o celular…');
  });

  it('a entrega de OUTRO pedido não muda o que o botão diz', async () => {
    ouvir(() => {});
    montar();
    await chamar();
    act(() => informarEntrega('00000000-0000-4000-8000-000000000000', 'enviado'));
    expect(cartao().textContent).toContain('Avisando o celular…');
  });

  it('segundo toque em menos de 20 s: não manda outro, não toca de novo e diz há quanto tempo foi o pedido', async () => {
    ouvir(() => {});
    montar();
    await chamar();
    act(() => informarEntrega(emitirPedidoDeAjuda.mock.calls[0][2] as string, 'enviado'));
    await passar(8000);
    playTone.mockClear();
    await chamar();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    expect(playTone).not.toHaveBeenCalled();
    // O botão cabe uma frase só: a resposta ao toque. O leitor de tela ouve as duas.
    expect(cartao().textContent).toContain('Você já chamou há 8 s.');
    expect(cartao().textContent).not.toContain('Cuidador avisado.');
    expect(screen.getByRole('status')).toHaveTextContent(/Você já chamou há 8 s\. O celular do cuidador foi avisado/);
    // O aviso do segundo toque some sozinho; o estado do chamado continua.
    await passar(4500);
    expect(cartao().textContent).not.toMatch(/Você já chamou/);
    expect(cartao().textContent).toContain('Cuidador avisado.');
    // Passados os 20 s do primeiro chamado, um toque é um chamado novo.
    await passar(8000);
    await chamar();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(2);
    expect(emitirPedidoDeAjuda.mock.calls[1][2]).not.toBe(emitirPedidoDeAjuda.mock.calls[0][2]);
  });

  it('passados os 20 s o botão volta ao texto de sempre, sem o estado do chamado antigo', async () => {
    ouvir(() => {});
    montar();
    await chamar();
    act(() => informarEntrega(emitirPedidoDeAjuda.mock.calls[0][2] as string, 'enviado'));
    expect(cartao().textContent).toContain('Cuidador avisado.');
    await passar(20_500);
    expect(cartao().textContent).not.toContain('Cuidador avisado.');
    expect(cartao().textContent).toMatch(/Toca o chamado e avisa o celular/);
  });

  it('as necessidades não mexem no chamado em curso (cada botão cuida do seu estado)', async () => {
    ouvir(() => {});
    montar();
    await chamar();
    act(() => informarEntrega(emitirPedidoDeAjuda.mock.calls[0][2] as string, 'enviado'));
    await tocar('Sede');
    expect(cartao().textContent).toContain('Cuidador avisado.');
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
  });

  it('desmontar a tela limpa os temporizadores do chamado, mas a voz do chamado ainda sai', async () => {
    const { unmount } = montar();
    await chamar();
    unmount();
    // Sobra só a voz, agendada para 1,1 s: o pedido já saiu, e quem está no
    // corredor precisa ouvir o chamado inteiro mesmo que a tela mude agora.
    expect(vi.getTimerCount()).toBe(1);
    expect(falar).not.toHaveBeenCalled();
    await passar(1200);
    expect(falar).toHaveBeenCalledWith('Por favor, chame a enfermagem.', expect.anything());
    expect(vi.getTimerCount()).toBe(0);
  });
});

// Revisão da Task 6, menor 1: abrir a Dor ou o Sim · Não e voltar remonta a
// tela. A trava de 20 s e o estado do chamado moravam na montagem — o toque
// seguinte mandava OUTRO pedido de ajuda ao celular do cuidador e o "você já
// chamou há N s" sumia. Agora o último chamado fica fora da tela.
describe('tela do hospital: sair da tela e voltar no meio do chamado', () => {
  const chamar = async () => { await tocar('Chamar a enfermagem'); };
  const cartao = () => botao('Chamar a enfermagem');

  it('voltar da Dor em menos de 20 s: a tela lembra a entrega e o toque seguinte NÃO manda outro pedido', async () => {
    ouvir(() => {});
    const primeira = montar();
    await chamar();
    const id = emitirPedidoDeAjuda.mock.calls[0][2] as string;
    act(() => informarEntrega(id, 'enviado'));
    primeira.unmount(); // abriu a Dor
    await passar(6000);
    playTone.mockClear();

    montar(); // voltou
    expect(cartao().textContent).toContain('Cuidador avisado.');
    expect(cartao().textContent).not.toContain('CHAMANDO…');
    await chamar();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    expect(playTone).not.toHaveBeenCalled();
    expect(cartao().textContent).toContain('Você já chamou há 6 s.');
  });

  it('a trava continua contando de onde estava: aos 20 s do primeiro chamado, um toque é um chamado novo', async () => {
    ouvir(() => {});
    const primeira = montar();
    await chamar();
    primeira.unmount();
    await passar(5000);
    montar();
    await passar(14_000); // 19 s do primeiro chamado
    await chamar();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    await passar(2000); // 21 s
    expect(cartao().textContent).toMatch(/Toca o chamado e avisa o celular/); // a janela fechou sozinha, sem toque
    await chamar();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(2);
  });

  it('a entrega que chega enquanto a tela está fechada aparece na volta', async () => {
    ouvir(() => {});
    const primeira = montar();
    await chamar();
    const id = emitirPedidoDeAjuda.mock.calls[0][2] as string;
    primeira.unmount();
    informarEntrega(id, 'na_fila');
    await passar(3000);
    montar();
    expect(cartao().textContent).toContain('Sem internet. Avisa ao voltar.');
  });

  it('voltar depois dos 20 s: a tela começa limpa e o toque chama de novo', async () => {
    ouvir(() => {});
    const primeira = montar();
    await chamar();
    primeira.unmount();
    await passar(21_000);
    montar();
    expect(cartao().textContent).toMatch(/Toca o chamado e avisa o celular/);
    expect(cartao().textContent).not.toContain('Avisando');
    await chamar();
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(2);
  });

  it('voltar com o chamado ainda tocando: o "CHAMANDO…" termina quando terminaria', async () => {
    const primeira = montar();
    await chamar();
    primeira.unmount();
    await passar(1000);
    montar();
    expect(cartao().textContent).toContain('CHAMANDO…');
    await passar(1700); // 2,7 s do chamado
    expect(cartao().textContent).not.toContain('CHAMANDO…');
  });

  it('desmontar de novo, depois da volta, também não deixa temporizador para trás', async () => {
    const primeira = montar();
    await chamar();
    primeira.unmount();
    await passar(1200); // a voz do primeiro chamado já saiu
    const segunda = montar();
    expect(vi.getTimerCount()).toBeGreaterThan(0); // a janela de 20 s, rearmada
    segunda.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// As colunas seguem a largura de que a grade dispõe (revisão da Task 6, importante 1).
//
// A grade era sempre 5 × 2 e só a ALTURA das células tinha o piso de 5°: a 1280 px
// de janela cada célula dava 196 px de largura e a 1024 px, 147 px. O jsdom não
// tem layout, então a janela é simulada pelo que a tela lê dela: `clientWidth` e
// `clientHeight` da área da grade, e o `ResizeObserver` que avisa da mudança.
// -----------------------------------------------------------------------------
describe('tela do hospital: as colunas seguem a largura de que a grade dispõe', () => {
  const entre = (minimo: number, valor: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));
  /**
   * A área da grade numa janela de `w` × `h`, como o `GazePageLayout` a deixa:
   * margens de `clamp(1rem, 2,5vw, 3rem)`, topo de `clamp(6,5rem, 4rem + 7vh,
   * 9,5rem)` (o cabeçalho é absoluto) e pé de `clamp(1rem, 3vh, 3rem)`.
   */
  const areaDaGrade = (w: number, h: number) => ({
    largura: Math.round(w - 2 * entre(16, 0.025 * w, 48)),
    altura: Math.round(h - entre(104, 64 + 0.07 * h, 152) - entre(16, 0.03 * h, 48)),
  });

  let area = { largura: 0, altura: 0 };
  const avisarQuandoMudaOTamanho = new Set<() => void>();
  const abrirJanela = (w: number, h: number) => { area = areaDaGrade(w, h); };
  /** O usuário redimensiona a janela com a tela aberta. */
  const redimensionar = (w: number, h: number) => act(() => {
    abrirJanela(w, h);
    avisarQuandoMudaOTamanho.forEach((avisar) => avisar());
  });

  const grade = (c: HTMLElement) => c.querySelector('.gaze-grid') as HTMLElement;
  const colunasDe = (g: HTMLElement) => Number(/^repeat\((\d+), minmax\(0, 1fr\)\)$/.exec(g.style.gridTemplateColumns)?.[1]);
  const linhasDe = (g: HTMLElement) => Number(/^repeat\((\d+), /.exec(g.style.gridTemplateRows)?.[1]);

  /** O piso que o app deixou no <html> (o de 5° da geometria de referência): volta ao que era depois de cada teste. */
  let pisoDeAntes = '';
  /** Muda o piso do alvo, como a calibração em uso ou a acurácia medida fazem; `null` devolve o de antes. */
  const definirPiso = (px: number | null) => {
    if (px !== null) document.documentElement.style.setProperty('--gaze-target-min', `${px}px`);
    else if (pisoDeAntes) document.documentElement.style.setProperty('--gaze-target-min', pisoDeAntes);
    else document.documentElement.style.removeProperty('--gaze-target-min');
  };

  beforeEach(() => {
    pisoDeAntes = document.documentElement.style.getPropertyValue('--gaze-target-min');
    area = { largura: 0, altura: 0 };
    avisarQuandoMudaOTamanho.clear();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => area.largura);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => area.altura);
    vi.stubGlobal('ResizeObserver', class {
      private avisar: () => void;
      constructor(avisar: () => void) { this.avisar = avisar; }
      observe() { avisarQuandoMudaOTamanho.add(this.avisar); }
      unobserve() {}
      disconnect() { avisarQuandoMudaOTamanho.delete(this.avisar); }
    });
  });
  afterEach(() => {
    // A tela sai antes de a janela e o piso voltarem ao que eram: com ela ainda
    // aberta, essa volta seria uma mudança de tamanho, medida fora do teste.
    cleanup();
    vi.unstubAllGlobals();
    definirPiso(null);
  });

  it.each([
    // janela (largura × altura), colunas, linhas, largura de cada célula
    [1366, 768, 5, 2, 212], // o desenho de sempre
    [1280, 720, 4, 3, 258], // a 5 colunas seriam 196 px: abaixo do piso de 198
    [1024, 768, 3, 4, 283], // a 5 seriam 147 px; a 4, 197,5 px (com a barra de rolagem)
  ])('janela de %i × %i: %i colunas em %i linhas, e cada célula (%i px) tem o piso de 5° na largura e na altura', (w, h, colunas, linhas, larguraDaCelula) => {
    abrirJanela(w, h);
    const { container } = montar();
    const g = grade(container);
    const piso = alvoMinimoPx();
    expect(colunasDe(g)).toBe(colunas);
    expect(linhasDe(g)).toBe(linhas);
    // Na altura: as linhas partem do piso (e a grade rola o que não couber).
    expect(g.style.gridTemplateRows).toBe(`repeat(${linhas}, minmax(${piso}px, 1fr))`);
    // Na largura: o que sobra depois do espaço entre as colunas e, se a grade
    // rola, da barra de rolagem. A decisão de rolar é a da própria `GazeGrid`.
    const rola = g.style.overflowY === 'auto';
    const celula = (area.largura - (rola ? 6 : 0) - (colunas - 1) * 59) / colunas;
    expect(g.style.gap).toBe('59px');
    expect(celula).toBeGreaterThanOrEqual(piso);
    expect(Math.round(celula)).toBe(larguraDaCelula);
  });

  it('com o piso maior (olhar menos preciso, 260 px) cabem menos colunas', () => {
    definirPiso(260);
    for (const [w, h, colunas, linhas] of [[1920, 1080, 5, 2], [1366, 768, 4, 3], [1280, 720, 3, 4]]) {
      abrirJanela(w, h);
      const { container, unmount } = montar();
      const g = grade(container);
      expect(colunasDe(g), `janela de ${w} × ${h}`).toBe(colunas);
      expect(g.style.gridTemplateRows, `janela de ${w} × ${h}`).toBe(`repeat(${linhas}, minmax(260px, 1fr))`);
      const celula = (area.largura - (g.style.overflowY === 'auto' ? 6 : 0) - (colunas - 1) * 59) / colunas;
      expect(celula, `janela de ${w} × ${h}`).toBeGreaterThanOrEqual(260);
      unmount();
    }
  });

  it('a ordem dos botões (a da varredura) é a mesma com 5, 4 ou 3 colunas, e a grade preenche linha por linha', () => {
    const ordem = CARTOES_DO_HOSPITAL.map((c) => c.titulo);
    for (const [w, h] of [[1366, 768], [1280, 720], [1024, 768]]) {
      abrirJanela(w, h);
      const { container, unmount } = montar();
      const g = grade(container);
      expect(Array.from(g.children).map((b) => b.getAttribute('aria-label')), `janela de ${w} × ${h}`).toEqual(ordem);
      // Nenhum botão tem lugar marcado, e o fluxo é o de linha em linha (o padrão):
      // a leitura de cima para baixo e da esquerda para a direita é a do DOM.
      expect(g.style.gridAutoFlow).toBe('');
      for (const b of Array.from(g.children) as HTMLElement[]) {
        expect([b.style.gridColumn, b.style.gridRow, b.style.order]).toEqual(['', '', '']);
      }
      unmount();
    }
  });

  it('a janela muda de tamanho com a tela aberta: as colunas acompanham, nos dois sentidos', async () => {
    abrirJanela(1920, 1080);
    const { container } = montar();
    expect(colunasDe(grade(container))).toBe(5);
    await redimensionar(1280, 720);
    expect(colunasDe(grade(container))).toBe(4);
    await redimensionar(1024, 768);
    expect(colunasDe(grade(container))).toBe(3);
    expect(linhasDe(grade(container))).toBe(4);
    await redimensionar(1366, 768);
    expect(colunasDe(grade(container))).toBe(5);
    expect(linhasDe(grade(container))).toBe(2);
  });

  it('o piso sobe com a tela aberta (a acurácia medida chega depois), sem a janela mexer: as colunas acompanham', async () => {
    abrirJanela(1366, 768);
    const { container } = montar();
    expect(colunasDe(grade(container))).toBe(5);
    await act(async () => { definirPiso(260); });
    expect(colunasDe(grade(container))).toBe(4);
    expect(grade(container).style.gridTemplateRows).toBe('repeat(3, minmax(260px, 1fr))');
    await act(async () => { definirPiso(null); });
    expect(colunasDe(grade(container))).toBe(5);
  });

  it('mudar as colunas não mexe no que a tela faz: o chamado e as falas seguem valendo', async () => {
    abrirJanela(1024, 768);
    ouvir(() => {});
    montar();
    await tocar('Chamar a enfermagem');
    expect(emitirPedidoDeAjuda).toHaveBeenCalledTimes(1);
    await tocar('Sede');
    expect(falar).toHaveBeenCalledTimes(1);
    expect(emitirFalaDoPaciente).toHaveBeenCalledWith('Estou com sede.', 'frase');
  });

  it('ao sair da tela, nenhum observador fica para trás', () => {
    const desligar = vi.spyOn(MutationObserver.prototype, 'disconnect');
    abrirJanela(1366, 768);
    const { unmount } = montar();
    expect(avisarQuandoMudaOTamanho.size).toBeGreaterThan(0);
    unmount();
    expect(avisarQuandoMudaOTamanho.size).toBe(0);
    expect(desligar).toHaveBeenCalled();
  });
});

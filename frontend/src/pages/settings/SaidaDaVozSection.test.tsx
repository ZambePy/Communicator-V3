import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import React from 'react';

// -----------------------------------------------------------------------------
// Configurações → "Voz nas chamadas" (roadmap 3, rodada 3, de 21/10/2026).
//
// Em chamadas de WhatsApp e Meet, a voz do paciente vai para um cabo de áudio
// virtual (VB-CABLE: "CABLE Input"), e o aplicativo da chamada usa "CABLE
// Output" como microfone. A tela explica isso em 3 linhas, deixa escolher a
// saída (com o olhar, com o mouse ou com o teclado), testa, e diz com todas as
// letras o que NÃO segue a escolha (a voz do sistema não tem roteamento).
// -----------------------------------------------------------------------------

const voz = vi.hoisted(() => ({
  tocarWav: vi.fn(),
  usarSaidaDaVoz: vi.fn(),
  /** A ponte da voz clonada: um objeto no aplicativo instalado, `null` no navegador. */
  ponte: {} as object | null,
}));
vi.mock('../../services/voz/local', () => ({
  tocarWav: voz.tocarWav,
  usarSaidaDaVoz: voz.usarSaidaDaVoz,
  ponteDaVoz: () => voz.ponte,
}));

import { SaidaDaVozSection } from './SaidaDaVozSection';
import { SettingsProvider } from '../../context/SettingsContext';
import { alvoMinimoPx } from '../../design/gazeMetrics';
import {
  EVENTO_DA_SAIDA_DA_VOZ,
  ROTULO_DA_SAIDA_PADRAO,
  definirSaidaDaVoz,
  registrarAlvoDaVoz,
  _redefinirSaida,
} from '../../services/voz/saida';

type MD = EventTarget & { lista: Array<Partial<MediaDeviceInfo>>; enumerateDevices: () => Promise<MediaDeviceInfo[]> };

/** Instala um `navigator.mediaDevices` que o teste controla. */
function instalarDispositivos(lista: Array<Partial<MediaDeviceInfo>>): MD {
  const md = new EventTarget() as MD;
  md.lista = lista;
  md.enumerateDevices = async () => md.lista as MediaDeviceInfo[];
  Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
  return md;
}

const SPK = { kind: 'audiooutput', deviceId: 'spk1', label: 'Alto-falantes (Realtek)' } as const;
const CABO = { kind: 'audiooutput', deviceId: 'cabo1', label: 'CABLE Input (VB-Audio Virtual Cable)' } as const;

const montar = () => render(<SettingsProvider><SaidaDaVozSection cardStyle={{}} /></SettingsProvider>);
/** Deixa a lista de saídas chegar. */
const assentar = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
/** O que ficou no disco para `saidaDaVoz` (`undefined`: nada — a escolha é só da sessão, B1). */
const gravado = () => JSON.parse(localStorage.getItem('irisflow_settings') ?? '{}').saidaDaVoz;
/** Um valor que uma versão anterior deixou no disco: ao abrir o app ele NÃO vale (B1). */
const salvar = (id: string | null) =>
  localStorage.setItem('irisflow_settings', JSON.stringify({ saidaDaVoz: id, schemaVersion: 1 }));
/** Escolhe o aparelho como a pessoa faz: tocando na opção. */
const escolher = (nome: RegExp) => fireEvent.click(screen.getByRole('radio', { name: nome }));

beforeEach(() => {
  _redefinirSaida();
  voz.tocarWav.mockReset().mockResolvedValue(true);
  voz.usarSaidaDaVoz.mockReset();
  voz.ponte = {};
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  _redefinirSaida();
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
  delete (window as unknown as { irisflowVozGuardada?: unknown }).irisflowVozGuardada;
  vi.restoreAllMocks();
});

describe('só no aplicativo instalado', () => {
  it('no navegador (sem as pontes do aplicativo) a seção nem aparece, e o sistema não é consultado', async () => {
    voz.ponte = null;
    const md = instalarDispositivos([SPK, CABO]);
    const listar = vi.spyOn(md, 'enumerateDevices');
    montar();
    await assentar();
    expect(screen.queryByTestId('saida-da-voz')).toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(listar).not.toHaveBeenCalled();
  });

  it('no aplicativo instalado ela aparece (controle do teste acima)', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    expect(screen.getByTestId('saida-da-voz')).toBeInTheDocument();
  });

  it('só com a ponte das mensagens guardadas (sem a da voz clonada) também aparece', async () => {
    voz.ponte = null;
    (window as unknown as { irisflowVozGuardada?: unknown }).irisflowVozGuardada = {};
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    expect(screen.getByTestId('saida-da-voz')).toBeInTheDocument();
  });
});

describe('a explicação', () => {
  it('diz em 3 linhas simples como a voz chega a uma chamada', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    const passos = within(screen.getByTestId('saida-da-voz')).getAllByRole('listitem');
    expect(passos).toHaveLength(3);
    const [um, dois, tres] = passos.map((p) => p.textContent ?? '');
    // 1: o cabo e os dois nomes que ele cria.
    expect(um).toContain('VB-CABLE');
    expect(um).toContain('CABLE Input');
    expect(um).toContain('CABLE Output');
    // 2: escolher a saída e testar.
    expect(dois).toContain('CABLE Input');
    expect(dois).toMatch(/Testar/);
    // 3: o microfone no aplicativo da chamada.
    expect(tres).toMatch(/WhatsApp/);
    expect(tres).toContain('CABLE Output');
    expect(tres).toMatch(/microfone/);
  });

  it('é uma seção com título, para quem navega por teclado ou leitor de tela', async () => {
    instalarDispositivos([SPK]);
    montar();
    await assentar();
    expect(screen.getByRole('region', { name: 'Voz nas chamadas' })).toBeInTheDocument();
  });
});

describe('a escolha vale só até fechar o IrisFlow (B1)', () => {
  const LINHA = 'Ao fechar o IrisFlow, a voz volta ao alto-falante.';

  it('a tela diz isso em uma linha, antes mesmo de escolher qualquer coisa', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    const linha = screen.getByTestId('saida-so-na-sessao');
    expect(linha.textContent).toBe(LINHA);
  });

  it('continua na tela com o cabo escolhido', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    escolher(/CABLE Input/);
    expect(screen.getByTestId('saida-so-na-sessao').textContent).toBe(LINHA);
    expect(screen.getByTestId('saida-so-no-cabo')).toBeInTheDocument();
  });

  it('é só um parágrafo, não um aviso que o paciente tenha de dispensar', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    const linha = screen.getByTestId('saida-so-na-sessao');
    expect(linha.tagName).toBe('P');
    expect(linha.querySelector('button')).toBeNull();
  });
});

describe('a lista de saídas', () => {
  it('começa na saída padrão, seguida das saídas do computador (com o CABLE Input)', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    const opcoes = screen.getAllByRole('radio');
    expect(opcoes.map((o) => o.textContent)).toEqual([
      expect.stringContaining(ROTULO_DA_SAIDA_PADRAO),
      expect.stringContaining('Alto-falantes (Realtek)'),
      expect.stringContaining('CABLE Input (VB-Audio Virtual Cable)'),
    ]);
    expect(opcoes[0]).toHaveAttribute('aria-checked', 'true');
    expect(opcoes[1]).toHaveAttribute('aria-checked', 'false');
    expect(opcoes[2]).toHaveAttribute('aria-checked', 'false');
  });

  it('um aparelho sem nome (antes da permissão de mídia) aparece como "Saída 2", não some', async () => {
    instalarDispositivos([SPK, { kind: 'audiooutput', deviceId: 'cabo1', label: '' }]);
    montar();
    await assentar();
    expect(screen.getByRole('radio', { name: /Saída 2/ })).toBeInTheDocument();
  });

  it('com nomes genéricos, a tela explica como achar o cabo; com nomes de verdade, não enche de aviso', async () => {
    instalarDispositivos([SPK, { kind: 'audiooutput', deviceId: 'cabo1', label: '' }]);
    const { unmount } = montar();
    await assentar();
    const dica = screen.getByTestId('saida-sem-nomes');
    expect(dica.textContent).toMatch(/não informou o nome/);
    expect(dica.textContent).toMatch(/Testar/);
    expect(dica.textContent).toMatch(/alto-falante/);
    unmount();

    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    expect(screen.getByRole('radio', { name: /CABLE Input/ })).toBeInTheDocument();
    expect(screen.queryByTestId('saida-sem-nomes')).toBeNull();
  });

  it('o aparelho escolhido na sessão aparece marcado', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    escolher(/CABLE Input/);
    expect(screen.getByRole('radio', { name: /CABLE Input/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: new RegExp(ROTULO_DA_SAIDA_PADRAO) })).toHaveAttribute('aria-checked', 'false');
  });

  // B1 (revisão final, rodada 2, 21/10/2026): o cabo é da sessão. Um cabo que ficou no disco de
  // uma chamada de ontem não vem marcado, e a tela não acusa nada.
  it('um cabo que ficou salvo no disco de antes NÃO vem marcado: ao abrir o app a voz está na saída padrão', async () => {
    salvar('cabo1');
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    expect(screen.getByRole('radio', { name: new RegExp(ROTULO_DA_SAIDA_PADRAO) })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /CABLE Input/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('saida-so-no-cabo')).toBeNull();
    expect(screen.queryByTestId('saida-perdida')).toBeNull();
  });

  it('plugar o cabo com a tela aberta atualiza a lista (devicechange)', async () => {
    const md = instalarDispositivos([SPK]);
    montar();
    await assentar();
    expect(screen.queryByRole('radio', { name: /CABLE Input/ })).toBeNull();
    md.lista = [SPK, CABO];
    await act(async () => { md.dispatchEvent(new Event('devicechange')); });
    await assentar();
    expect(screen.getByRole('radio', { name: /CABLE Input/ })).toBeInTheDocument();
  });

  it('sem conseguir listar: diz isso com calma e a saída padrão continua lá', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { enumerateDevices: () => Promise.reject(new Error('bloqueado')) },
      configurable: true,
    });
    montar();
    await assentar();
    expect(screen.getByText(/Não encontrei nenhuma outra saída de áudio/)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Testar/ })).toBeInTheDocument();
  });
});

describe('escolher a saída', () => {
  it('escolher o cabo põe a saída em vigor — e vale só para a sessão: nada vai para o disco', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    fireEvent.click(screen.getByRole('radio', { name: /CABLE Input/ }));
    expect(gravado()).toBeUndefined();
    expect(voz.usarSaidaDaVoz).toHaveBeenCalledWith('cabo1');
    expect(screen.getByRole('radio', { name: /CABLE Input/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('voltar à saída padrão põe a padrão em vigor', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    escolher(/CABLE Input/);
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(ROTULO_DA_SAIDA_PADRAO) }));
    expect(gravado()).toBeUndefined();
    expect(voz.usarSaidaDaVoz).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('radio', { name: new RegExp(ROTULO_DA_SAIDA_PADRAO) })).toHaveAttribute('aria-checked', 'true');
  });

  it('tocar de novo no aparelho já marcado repete o pedido (é como "tentar outra vez")', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    escolher(/CABLE Input/);
    voz.usarSaidaDaVoz.mockClear();
    fireEvent.click(screen.getByRole('radio', { name: /CABLE Input/ }));
    expect(voz.usarSaidaDaVoz).toHaveBeenCalledWith('cabo1');
  });
});

describe('enquanto uma saída está escolhida', () => {
  it('lembra que a voz não sai no alto-falante e como voltar (quem está na sala não a ouve)', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    escolher(/CABLE Input/);
    const lembrete = screen.getByTestId('saida-so-no-cabo');
    expect(lembrete.textContent).toContain('CABLE Input (VB-Audio Virtual Cable)');
    expect(lembrete.textContent).toMatch(/não pelo alto-falante/);
    expect(lembrete.textContent).toMatch(/Depois da chamada/);
    expect(lembrete.textContent).toContain(ROTULO_DA_SAIDA_PADRAO);
  });

  it('escolher o cabo mostra o lembrete na hora; voltar à saída padrão o tira', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.queryByTestId('saida-so-no-cabo')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /CABLE Input/ }));
    expect(screen.getByTestId('saida-so-no-cabo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(ROTULO_DA_SAIDA_PADRAO) }));
    expect(screen.queryByTestId('saida-so-no-cabo')).toBeNull();
  });

  it('com o aparelho fora do ar vale o aviso de que ele sumiu, não o lembrete', async () => {
    const md = instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    escolher(/CABLE Input/);
    md.lista = [SPK]; // o cabo foi desligado com a tela aberta
    await act(async () => { md.dispatchEvent(new Event('devicechange')); });
    await assentar();
    expect(screen.getByTestId('saida-perdida')).toBeInTheDocument();
    expect(screen.queryByTestId('saida-so-no-cabo')).toBeNull();
  });
});

describe('funciona só com o olhar', () => {
  it('as opções e o "Testar" são GazeButtons com o tamanho mínimo de 5° (zona de acerto incluída)', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    const alvos = [...screen.getAllByRole('radio'), screen.getByRole('button', { name: /Testar/ })];
    expect(alvos).toHaveLength(4);
    for (const alvo of alvos) {
      expect(alvo.className).toContain('gaze-button');
      // A zona de acerto invisível soma 12 px de cada lado ao botão desenhado.
      expect(parseFloat(alvo.style.height) + 24).toBeGreaterThanOrEqual(alvoMinimoPx());
    }
  });

  it('as opções também respondem ao teclado (são botões de verdade)', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    for (const o of screen.getAllByRole('radio')) expect(o.tagName).toBe('BUTTON');
  });
});

describe('o limite da voz do sistema', () => {
  it('diz, perto da lista, o que NÃO segue a escolha', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    const nota = screen.getByTestId('saida-limite');
    const texto = nota.textContent ?? '';
    expect(texto).toContain('voz do sistema');
    expect(texto).toMatch(/alarme da emergência/);
    expect(texto).toMatch(/saem sempre pelo alto-falante/);
    // E o que segue.
    expect(texto).toContain('voz personalizada');
    expect(texto).toContain('Minha voz');
    // Perto do seletor: depois da lista e antes do botão de testar.
    const lista = screen.getByRole('radiogroup');
    const testar = screen.getByRole('button', { name: /Testar/ });
    expect(lista.compareDocumentPosition(nota) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(nota.compareDocumentPosition(testar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Testar', () => {
  it('toca um sinal curto pelo mesmo caminho da voz e diz onde tocou', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    escolher(/CABLE Input/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Testar/ })); });
    expect(voz.tocarWav).toHaveBeenCalledTimes(1);
    const wav = voz.tocarWav.mock.calls[0][0] as ArrayBuffer;
    expect(wav.byteLength).toBeGreaterThan(1000);
    const resultado = screen.getByTestId('saida-teste-resultado');
    expect(resultado.textContent).toContain('CABLE Input (VB-Audio Virtual Cable)');
    expect(resultado.textContent).toMatch(/sinal/);
  });

  it('na saída padrão, diz que tocou na saída padrão', async () => {
    instalarDispositivos([SPK]);
    montar();
    await assentar();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Testar/ })); });
    expect(screen.getByTestId('saida-teste-resultado').textContent).toMatch(/saída padrão do computador/);
  });

  it('enquanto toca, o botão não aceita outro toque', async () => {
    instalarDispositivos([SPK]);
    let acabar!: (v: boolean) => void;
    voz.tocarWav.mockReturnValue(new Promise<boolean>((r) => { acabar = r; }));
    montar();
    await assentar();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Testar/ })); });
    expect(screen.getByRole('button', { name: /Tocando/ })).toBeDisabled();
    await act(async () => { acabar(true); });
    expect(screen.getByRole('button', { name: /Testar/ })).not.toBeDisabled();
  });

  it('se não deu para tocar, a tela diz (nada de falha calada)', async () => {
    instalarDispositivos([SPK]);
    voz.tocarWav.mockRejectedValue(new Error('Web Audio indisponível.'));
    montar();
    await assentar();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Testar/ })); });
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toMatch(/Não consegui tocar o sinal de teste/);
  });

  it('se a saída escolhida não abriu, o teste diz que saiu pelo alto-falante padrão', async () => {
    instalarDispositivos([SPK, CABO]);
    // A perda de verdade, pelo serviço: o cabo não abre.
    registrarAlvoDaVoz({ setSinkId: () => Promise.reject(new DOMException('some', 'NotFoundError')) } as unknown as AudioContext);
    definirSaidaDaVoz('cabo1');
    await assentar();
    montar();
    await assentar();
    escolher(/CABLE Input/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Testar/ })); });
    expect(screen.getByTestId('saida-teste-resultado').textContent).toMatch(/alto-falante padrão/);
  });

  it('trocar a escolha limpa o resultado do teste anterior', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Testar/ })); });
    expect(screen.getByTestId('saida-teste-resultado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /CABLE Input/ }));
    expect(screen.queryByTestId('saida-teste-resultado')).toBeNull();
  });
});

describe('o aparelho escolhido não está mais lá', () => {
  it('a lista deixa de trazer o aparelho escolhido: avisa, diz onde a voz está saindo e oferece voltar à padrão', async () => {
    const md = instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    escolher(/CABLE Input/);
    md.lista = [SPK];
    await act(async () => { md.dispatchEvent(new Event('devicechange')); });
    await assentar();
    const caixa = screen.getByTestId('saida-perdida');
    expect(caixa.textContent).toMatch(/não está disponível|não abriu/);
    expect(caixa.textContent).toMatch(/alto-falante padrão/);
    fireEvent.click(within(caixa).getByRole('button', { name: /Usar a saída padrão/ }));
    expect(gravado()).toBeUndefined();
    expect(voz.usarSaidaDaVoz).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId('saida-perdida')).toBeNull();
  });

  it('a perda avisada pelo serviço enquanto a tela está aberta aparece, e some quando o cabo volta', async () => {
    instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    escolher(/CABLE Input/);
    expect(screen.queryByTestId('saida-perdida')).toBeNull();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(EVENTO_DA_SAIDA_DA_VOZ, { detail: { perdida: true } }));
    });
    expect(screen.getByTestId('saida-perdida')).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new CustomEvent(EVENTO_DA_SAIDA_DA_VOZ, { detail: { perdida: false } }));
    });
    expect(screen.queryByTestId('saida-perdida')).toBeNull();
  });

  it('com a saída padrão escolhida não há aviso nenhum, mesmo com a lista vazia', async () => {
    instalarDispositivos([]);
    montar();
    await assentar();
    // Controle positivo: a seção está na tela, e já terminou de ler a lista (vazia).
    expect(screen.getByText(/Não encontrei nenhuma outra saída de áudio/)).toBeInTheDocument();
    expect(screen.queryByTestId('saida-perdida')).toBeNull();
  });

  it('a lista veio vazia com um aparelho escolhido: não dá para dizer que sumiu, então não acusa', async () => {
    const md = instalarDispositivos([SPK, CABO]);
    montar();
    await assentar();
    escolher(/CABLE Input/);
    md.lista = []; // o sistema não soube dizer (lista vazia = "não sei")
    await act(async () => { md.dispatchEvent(new Event('devicechange')); });
    await assentar();
    // Controle positivo: a seção está na tela, já leu a lista (vazia) e nenhuma opção está marcada.
    expect(screen.getByText(/Não encontrei nenhuma outra saída de áudio/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: new RegExp(ROTULO_DA_SAIDA_PADRAO) })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('saida-perdida')).toBeNull();
  });
});

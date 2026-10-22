import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ConversationScreen } from './ConversationScreen';
import { _limparOuvintes, ouvir, type EventoDoPaciente } from '../../cloud/eventos';
import type { CloudState, CloudActions } from '../../cloud/CloudContext';
import type { Message } from '../../cloud/types';
import { _reiniciarParaTeste, definirEmergenciaAtiva } from '../../services/estadoDeEmergencia';
import {
  definirAssistenteDesligado,
  registrarFalaDoPaciente,
  resumoDoModelo,
  sugerirRespostas,
} from '../../services/assistente';
import { reiniciarParaTeste } from '../../services/assistente/armazenamento';
import { lerAceitacao } from '../../services/assistente/aceitacao';

// Respostas sugeridas na Conversa (roadmap 1, rodada 3, 21/10/2026). O que
// importa aqui é a fronteira: a faixa só OFERECE; falar, enviar ao celular e
// aprender acontecem depois da escolha do paciente e em nenhum outro momento.

const estado: Partial<CloudState & CloudActions> = {};
vi.mock('../../cloud/CloudContext', () => ({ useCloud: () => estado }));
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/ui/GazeButton', () => ({
  GazeButton: ({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { width?: number; height?: number }) => {
    const { width: _w, height: _h, ...attrs } = rest;
    return <button onClick={onClick} {...attrs}>{children}</button>;
  },
}));
const fala = vi.hoisted(() => ({ falarDoPaciente: vi.fn(async () => null) }));
vi.mock('../../services/voz/falaDoPaciente', () => ({
  falarDoPaciente: fala.falarDoPaciente,
  falaSaiu: () => true,
  falaFalhou: () => false,
}));

const mensagem = (id: string, sender: 'cuidador' | 'paciente', kind: Message['kind'], text: string): Message => ({
  id,
  beneficiary_id: 'b',
  sender,
  kind,
  text,
  created_at: new Date().toISOString(),
  read_at: null,
  spoken: true,
});

const base = (mensagens: Message[]): Partial<CloudState & CloudActions> => ({
  configurada: true,
  online: true,
  realtime: 'conectado',
  filaPendente: 0,
  frasesRemotas: [],
  mensagens,
  vinculo: { device_id: 'd', device_key: 'k', beneficiary_id: 'b', beneficiary_name: 'Carlos', email: 'a@b.c', pareado_em: '' },
  carregarConversa: vi.fn(async () => {}),
  repetirUltimaMensagem: vi.fn(),
});

function abrir(mensagens: Message[]) {
  Object.assign(estado, base(mensagens));
  const recebidos: EventoDoPaciente[] = [];
  ouvir((e) => recebidos.push(e));
  render(
    <MemoryRouter initialEntries={['/conversation']}>
      <Routes>
        <Route path="/conversation" element={<ConversationScreen />} />
        <Route path="/keyboard" element={<div>TELA DO TECLADO</div>} />
      </Routes>
    </MemoryRouter>,
  );
  return recebidos;
}

/** Como `abrir`, e devolve um jeito de a conversa receber mensagens novas com a tela aberta. */
function abrirComRerender(mensagens: Message[]) {
  Object.assign(estado, base(mensagens));
  // Uma árvore nova a cada vez: o React não redesenha um elemento idêntico, e o
  // `useCloud` deste teste é um objeto simples, não um estado que avise a tela.
  const arvore = () => (
    <MemoryRouter initialEntries={['/conversation']}>
      <Routes>
        <Route path="/conversation" element={<ConversationScreen />} />
        <Route path="/keyboard" element={<div>TELA DO TECLADO</div>} />
      </Routes>
    </MemoryRouter>
  );
  const visual = render(arvore());
  return {
    rerender: (novas: Message[]) => {
      Object.assign(estado, base(novas));
      visual.rerender(arvore());
    },
  };
}

const sugestoes = () => screen.queryAllByRole('button', { name: /^Sugestão de resposta:/ });
const faixa = () => screen.queryByRole('region', { name: 'Respostas sugeridas' });

beforeEach(() => {
  _limparOuvintes();
  _reiniciarParaTeste();
  localStorage.clear();
  reiniciarParaTeste();
  fala.falarDoPaciente.mockClear();
  for (const k of Object.keys(estado)) delete (estado as Record<string, unknown>)[k];
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() });
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
});

describe('a faixa de respostas sugeridas na Conversa', () => {
  it('uma pergunta no ar ganha a faixa — e NADA é falado nem enviado enquanto o paciente não escolhe', () => {
    const recebidos = abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    expect(faixa()).toBeInTheDocument();
    expect(sugestoes()).toHaveLength(4);
    expect(fala.falarDoPaciente).not.toHaveBeenCalled();
    expect(recebidos).toEqual([]);
    expect(resumoDoModelo()).toMatchObject({ frases: 0, perguntas: 0 });
  });

  it('escolher uma sugestão fala com a voz do paciente, envia como frase, conta como aceita e ensina o par pergunta→resposta', () => {
    const recebidos = abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    fireEvent.click(screen.getByRole('button', { name: 'Sugestão de resposta: Não, obrigado' }));

    expect(fala.falarDoPaciente).toHaveBeenCalledTimes(1);
    expect(fala.falarDoPaciente).toHaveBeenCalledWith('Não, obrigado', { rate: 1 });
    expect(recebidos).toEqual([{ tipo: 'fala', texto: 'Não, obrigado', kind: 'frase' }]);
    expect(lerAceitacao()).toMatchObject({ mostradas: 1, aceitas: 1 });
    // O assistente aprendeu PARA QUE pergunta essa resposta serviu.
    expect(resumoDoModelo().perguntas).toBe(1);
    expect(sugerirRespostas('Você quer água?')[0]).toBe('Não, obrigado');
  });

  it('o Nenhuma leva ao teclado sem falar nada', () => {
    const recebidos = abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    fireEvent.click(screen.getByRole('button', { name: /Nenhuma/ }));
    expect(screen.getByText('TELA DO TECLADO')).toBeInTheDocument();
    expect(fala.falarDoPaciente).not.toHaveBeenCalled();
    expect(recebidos).toEqual([]);
  });

  it('não repete o Sim e o Não que a tela já tem; sobram as respostas que só a faixa oferece', () => {
    abrir([mensagem('1', 'cuidador', 'texto', 'Você vai sair?')]);
    expect(sugestoes().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Sugestão de resposta: Não sei',
      'Sugestão de resposta: Espere um pouco',
    ]);
    expect(screen.getAllByText('Sim')).toHaveLength(1);
    expect(screen.getAllByText('Não')).toHaveLength(1);
  });

  it('as frases rápidas da grade são só as do cuidador (ou as de fábrica): o assistente não se mistura a elas', () => {
    abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    // Antes as sugestões do assistente tomavam as primeiras casas da grade; agora
    // cada uma aparece UMA vez, na faixa que se diz "sugestão".
    for (const resposta of ['Sim, por favor', 'Não, obrigado', 'Só um pouco', 'Mais tarde']) {
      expect(screen.getAllByText(resposta)).toHaveLength(1);
    }
    expect(sugestoes()).toHaveLength(4);
    // E a grade segue com as seis frases de fábrica, na ordem de sempre.
    for (const frase of ['Estou bem', 'Preciso de ajuda', 'Obrigado', 'Depois', 'Estou com sede', 'Quero descansar']) {
      expect(screen.getAllByText(frase)).toHaveLength(1);
    }
  });

  it('o Sim/Não do cuidador (simnao) fica sem faixa — a tela dele é a da Task 5', () => {
    abrir([mensagem('1', 'cuidador', 'simnao', 'Você está com frio?')]);
    expect(faixa()).toBeNull();
    expect(lerAceitacao().mostradas).toBe(0);
  });

  it('uma mensagem do sistema depois da pergunta não esconde a faixa nem vira a pergunta', () => {
    abrir([
      mensagem('1', 'cuidador', 'texto', 'Você quer água?'),
      mensagem('2', 'cuidador', 'sistema', 'Seu cuidador viu o pedido às 10:32'),
    ]);
    expect(sugestoes().map((b) => b.getAttribute('aria-label'))).toContain('Sugestão de resposta: Não, obrigado');
  });

  it('depois que o paciente responde, a faixa some', () => {
    abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?'), mensagem('2', 'paciente', 'frase', 'Sim, por favor')]);
    expect(faixa()).toBeNull();
  });

  it('escolher uma sugestão recolhe a faixa na hora, sem esperar a resposta voltar do celular', () => {
    // Sem internet a resposta do paciente não volta para a lista de mensagens:
    // os botões não podem ficar na tela, parados, depois de a pergunta ser respondida.
    abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    fireEvent.click(screen.getByRole('button', { name: 'Sugestão de resposta: Não, obrigado' }));
    expect(faixa()).toBeNull();
    expect(fala.falarDoPaciente).toHaveBeenCalledTimes(1);
  });

  it('responder por outro caminho (o botão Sim) também recolhe a faixa: a pergunta já foi respondida', () => {
    const recebidos = abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    fireEvent.click(screen.getByText('Sim'));
    expect(recebidos).toEqual([{ tipo: 'fala', texto: 'Sim', kind: 'simnao' }]);
    expect(faixa()).toBeNull();
    // E a mesma sugestão não fica ali para ser dita por cima.
    expect(sugestoes()).toHaveLength(0);
  });

  it('uma pergunta nova volta a ter a faixa, mesmo depois de a anterior ter sido respondida', () => {
    const { rerender } = abrirComRerender([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    fireEvent.click(screen.getByText('Sim'));
    expect(faixa()).toBeNull();
    rerender([
      mensagem('1', 'cuidador', 'texto', 'Você quer água?'),
      mensagem('3', 'cuidador', 'texto', 'Está com frio?'),
    ]);
    expect(faixa()).toBeInTheDocument();
  });

  it('em emergência a faixa não aparece', () => {
    definirEmergenciaAtiva(true, 'pedido');
    abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    expect(faixa()).toBeNull();
    expect(lerAceitacao().mostradas).toBe(0);
  });

  it('com as sugestões desligadas nos ajustes a faixa não aparece, e as frases rápidas seguem iguais', () => {
    definirAssistenteDesligado(true);
    abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    expect(faixa()).toBeNull();
    expect(screen.getByText('Estou bem')).toBeInTheDocument();
  });

  it.each(['Está com dor?', 'A dor passou?', 'Onde dói?', 'Quanto dói de 0 a 10?', 'Está doendo?'])(
    'pergunta de dor ("%s"): sem faixa, nada falado, e as frases rápidas e o teclado seguem na tela',
    (texto) => {
      // Nunca na dor (21/10/2026): nem com o que o paciente já respondeu a ela antes.
      for (let i = 0; i < 3; i++) registrarFalaDoPaciente('Um pouco', texto);
      const recebidos = abrir([mensagem('1', 'cuidador', 'texto', texto)]);
      expect(faixa()).toBeNull();
      expect(sugestoes()).toHaveLength(0);
      expect(fala.falarDoPaciente).not.toHaveBeenCalled();
      expect(recebidos).toEqual([]);
      expect(lerAceitacao().mostradas).toBe(0);
      expect(screen.getByText('Estou bem')).toBeInTheDocument();
      expect(screen.getByText('Escrever')).toBeInTheDocument();
    },
  );

  it('pergunta aberta sem histórico: sem faixa, em vez de respostas que não servem', () => {
    abrir([mensagem('1', 'cuidador', 'texto', 'O que você quer comer hoje?')]);
    expect(faixa()).toBeNull();
  });

  it('escolher é a ÚNICA coisa que fala: reabrir a tela com a pergunta ainda no ar não fala nada', () => {
    const mensagens = [mensagem('1', 'cuidador', 'texto', 'Você quer água?')];
    abrir(mensagens);
    expect(fala.falarDoPaciente).not.toHaveBeenCalled();
    abrir(mensagens);
    expect(fala.falarDoPaciente).not.toHaveBeenCalled();
  });
});

// A faixa ocupa ~232 px da coluna do registro de mensagens. Medido num Chromium
// com a Conversa montada (21/10/2026): em 1093×614, na primeira visita (a dica
// "Entendi" aberta), o registro ficava com 34 px — o paciente veria as respostas
// e não a pergunta. A faixa espera até haver espaço; o resto da tela segue igual.
describe('a faixa e a altura da tela', () => {
  // O jsdom não tem layout nem ResizeObserver: estes testes simulam os dois para
  // cobrir o caminho que roda no app, inclusive a tela crescendo depois.
  const avisos: Array<() => void> = [];
  class Observador {
    constructor(aviso: () => void) {
      avisos.push(aviso);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const comMedida = (altura: number) => {
    avisos.length = 0;
    vi.stubGlobal('ResizeObserver', Observador);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    return vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(altura);
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('com altura para o registro e para a faixa, a faixa entra', () => {
    comMedida(500);
    abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    expect(faixa()).toBeInTheDocument();
    expect(sugestoes().length).toBeGreaterThan(0);
  });

  it('sem altura para ler a pergunta, a faixa espera — e nada é contado como mostrado', () => {
    comMedida(300);
    abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    expect(faixa()).toBeNull();
    expect(lerAceitacao().mostradas).toBe(0);
    // O resto da tela segue: a pergunta, o Sim e o Não, e o caminho do teclado.
    expect(screen.getByText('Você quer água?')).toBeInTheDocument();
    expect(screen.getByText('Sim')).toBeInTheDocument();
    expect(screen.getByText('Não')).toBeInTheDocument();
    expect(screen.getByText('Escrever')).toBeInTheDocument();
  });

  it('quando a tela ganha altura (a dica foi dispensada), a faixa volta — e só então conta como mostrada', () => {
    const altura = comMedida(300);
    abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
    expect(faixa()).toBeNull();
    altura.mockReturnValue(500);
    act(() => avisos.forEach((aviso) => aviso()));
    expect(faixa()).toBeInTheDocument();
    expect(lerAceitacao().mostradas).toBe(1);
  });

  // Medido num Chromium de verdade (1280x720, notebook de 15,6", 21/10/2026): ao
  // dispensar a dica "Entendi" o registro cresce, cabe inteiro e fica em 0; a
  // faixa volta e ele encolhe SEM sair de 0 — a pergunta, a última mensagem, vai
  // para baixo da dobra, e o paciente veria as respostas e não o que responde.
  // O navegador não avisa a rolagem quando o registro só encolhe.
  describe('o registro de mensagens continua no fim quando muda de altura', () => {
    const arrumar = () => {
      const altura = comMedida(300);
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900);
      return altura;
    };

    it('a faixa volta, o registro encolhe e a pergunta segue à vista: ele fica colado no fim', () => {
      const altura = arrumar();
      abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
      const log = screen.getByRole('log');
      expect(faixa()).toBeNull();
      expect(log.scrollTop).toBe(900);
      // O que o navegador faz quando o registro cresce e cabe inteiro: volta a 0.
      log.scrollTop = 0;
      altura.mockReturnValue(500);
      act(() => avisos.forEach((aviso) => aviso()));
      expect(faixa()).toBeInTheDocument();
      expect(log.scrollTop).toBe(900);
    });

    it('quem rolou para reler uma mensagem antiga não é puxado de volta', () => {
      const altura = arrumar();
      abrir([mensagem('1', 'cuidador', 'texto', 'Você quer água?')]);
      const log = screen.getByRole('log');
      // 900 - 100 - 300 = 500 px do fim: a pessoa saiu do fim de propósito.
      log.scrollTop = 100;
      fireEvent.scroll(log);
      altura.mockReturnValue(500);
      act(() => avisos.forEach((aviso) => aviso()));
      expect(faixa()).toBeInTheDocument();
      expect(log.scrollTop).toBe(100);
    });

    it('uma mensagem nova leva ao fim mesmo quem tinha rolado — e daí em diante o registro volta a seguir o fim', () => {
      comMedida(500);
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(900);
      const { rerender } = abrirComRerender([mensagem('1', 'cuidador', 'texto', 'Bom dia, Carlos!')]);
      const log = screen.getByRole('log');
      log.scrollTop = 100;
      fireEvent.scroll(log);
      rerender([mensagem('1', 'cuidador', 'texto', 'Bom dia, Carlos!'), mensagem('2', 'cuidador', 'texto', 'Você quer água?')]);
      expect(log.scrollTop).toBe(900);
      log.scrollTop = 0;
      act(() => avisos.forEach((aviso) => aviso()));
      expect(log.scrollTop).toBe(900);
    });
  });
});

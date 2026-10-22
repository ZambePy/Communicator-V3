/**
 * Pergunta sim/não do cuidador na Conversa (pedido de 21/10/2026): o cuidador
 * compõe a pergunta; a resposta do paciente aparece destacada, ligada à
 * pergunta que ela responde.
 */
import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import Conversa from '../../app/(tabs)/conversa';
import type { Message } from '@/data/types';

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: jest.fn() }),
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
  };
});

const mockApp = {
  patient: { id: 'b1', user_name: 'Carlos Souza' },
  messages: [] as Message[],
  sendMessage: jest.fn(async (_t: string, _k?: string) => undefined),
  markRead: jest.fn(async () => undefined),
  session: null,
  devices: [],
  unreadCount: 0,
  patientLoaded: true,
  patientVerified: true,
  refresh: jest.fn(async () => undefined),
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

const base = Date.parse('2026-10-21T13:00:00Z');
const msg = (id: string, minuto: number, extra: Partial<Message>): Message => ({
  id, beneficiary_id: 'b1', sender: 'cuidador', kind: 'simnao', text: '', created_at: new Date(base + minuto * 60_000).toISOString(), read_at: null, spoken: false, ...extra,
});

beforeEach(() => {
  (AppState as unknown as { currentState: string }).currentState = 'active';
  mockApp.messages = [];
  mockApp.sendMessage.mockClear();
});

// A lista rola para o fim 120 ms depois de cada mudança: espera dentro do
// `act`, para a rolagem não cair fora do teste.
afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 150));
  });
});

describe('Conversa — a pergunta sim/não e a resposta ligada a ela', () => {
  it('a resposta aparece destacada, com a pergunta que ela responde; a pergunta mostra que foi respondida', async () => {
    mockApp.messages = [
      msg('q1', 0, { text: 'Você está com dor?' }),
      msg('a1', 1, { sender: 'paciente', text: 'Não (Você está com dor?)', spoken: true }),
    ];
    await render(<Conversa />);
    const resposta = screen.getByTestId('resposta-da-pergunta');
    expect(resposta.props.accessibilityLabel).toMatch(/^Carlos respondeu NÃO à sua pergunta: Você está com dor\?/);
    expect(screen.getByText('NÃO')).toBeTruthy();
    expect(screen.getByText('“Você está com dor?”')).toBeTruthy();
    const pergunta = screen.getByTestId('pergunta-sim-nao');
    expect(pergunta.props.accessibilityLabel).toMatch(/^Você perguntou: Você está com dor\?\. Respondida: NÃO/);
  });

  it('pergunta ainda sem resposta: diz que espera a resposta do paciente', async () => {
    mockApp.messages = [msg('q1', 0, { text: 'Quer água?' })];
    await render(<Conversa />);
    expect(screen.getByText('Esperando a resposta de Carlos')).toBeTruthy();
    expect(screen.queryByTestId('resposta-da-pergunta')).toBeNull();
  });

  it('o "Sim" curto do cuidador e o "Sim" solto da tela Sim · Não continuam como antes (sem cartão de pergunta)', async () => {
    mockApp.messages = [
      msg('c1', 0, { text: 'Sim' }),
      msg('p1', 1, { sender: 'paciente', text: 'Sim', spoken: true }),
    ];
    await render(<Conversa />);
    expect(screen.queryByTestId('pergunta-sim-nao')).toBeNull();
    expect(screen.queryByTestId('resposta-da-pergunta')).toBeNull();
    // O balão do cuidador e o sim/não do paciente, como sempre foram.
    expect(screen.getByLabelText(/^Você: Sim\./)).toBeTruthy();
    expect(screen.getByLabelText(/^Carlos: Sim\./)).toBeTruthy();
  });

  it('compor: o chip liga a pergunta, o envio sai como sim/não, e o campo volta a ser mensagem', async () => {
    await render(<Conversa />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Escrever uma pergunta de sim ou não para Carlos'));
    });
    expect(screen.getByText(/responde olhando para um lado/)).toBeTruthy();
    const campo = screen.getByLabelText('Pergunta de sim ou não para Carlos');
    await act(async () => {
      fireEvent.changeText(campo, 'Você quer água?');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Enviar pergunta'));
    });
    expect(mockApp.sendMessage).toHaveBeenCalledWith('Você quer água?', 'simnao');
    expect(screen.getByLabelText('Mensagem para Carlos').props.value).toBe('');
  });

  it('a mensagem comum continua saindo como texto', async () => {
    await render(<Conversa />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Mensagem para Carlos'), 'Já vou');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Enviar'));
    });
    expect(mockApp.sendMessage).toHaveBeenCalledWith('Já vou', 'texto');
  });
});

/*
 * Revisão final de 21/10/2026 (M7): o `maxLength` do campo não corta o que já
 * estava escrito. Quem escreveu 300 letras de mensagem e depois tocava em
 * "Pergunta sim/não" mandava as 300 como pergunta, passando do limite de 160
 * que o app diz aceitar (a pergunta aparece grande na tela do computador).
 * Em vez de apagar o texto sem avisar, o envio fica desligado e o aviso diz
 * quanto passou; apagar até caber, ou desligar o chip, resolve.
 */
describe('Conversa — o limite de 160 letras vale também para o texto que já estava escrito', () => {
  const texto = (n: number) => 'a'.repeat(n);

  const ligarAPergunta = async () => {
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Escrever uma pergunta de sim ou não para Carlos'));
    });
  };

  it('300 letras escritas e depois a pergunta ligada: avisa quanto passa e não envia (nem pelo Enviar do teclado)', async () => {
    await render(<Conversa />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Mensagem para Carlos'), texto(300));
    });
    await ligarAPergunta();
    expect(screen.getByText(/A pergunta aceita até 160 letras/)).toBeTruthy();
    expect(screen.getByText(/passa em 140/)).toBeTruthy();
    expect(screen.getByLabelText('Enviar pergunta').props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Enviar pergunta'));
    });
    await act(async () => {
      fireEvent(screen.getByLabelText('Pergunta de sim ou não para Carlos'), 'submitEditing');
    });
    expect(mockApp.sendMessage).not.toHaveBeenCalled();
    // O texto do cuidador continua no campo: nada é apagado sem ele ver.
    expect(screen.getByLabelText('Pergunta de sim ou não para Carlos').props.value).toBe(texto(300));
  });

  it('apagando até 160 o aviso some e a pergunta sai', async () => {
    await render(<Conversa />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Mensagem para Carlos'), texto(165));
    });
    await ligarAPergunta();
    expect(screen.getByText(/passa em 5/)).toBeTruthy();
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Pergunta de sim ou não para Carlos'), texto(160));
    });
    expect(screen.queryByText(/A pergunta aceita até 160 letras/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Enviar pergunta'));
    });
    expect(mockApp.sendMessage).toHaveBeenCalledWith(texto(160), 'simnao');
  });

  it('desligar o chip devolve o texto comprido ao modo mensagem (limite de 500), sem aviso', async () => {
    await render(<Conversa />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Mensagem para Carlos'), texto(300));
    });
    await ligarAPergunta();
    expect(screen.getByText(/A pergunta aceita até 160 letras/)).toBeTruthy();
    await ligarAPergunta(); // o mesmo chip desliga
    expect(screen.queryByText(/A pergunta aceita até 160 letras/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Enviar'));
    });
    expect(mockApp.sendMessage).toHaveBeenCalledWith(texto(300), 'texto');
  });

  it('espaços no fim não contam (o envio já os tira): 159 letras + espaços cabem', async () => {
    await render(<Conversa />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Mensagem para Carlos'), `${texto(159)}      `);
    });
    await ligarAPergunta();
    expect(screen.queryByText(/A pergunta aceita até 160 letras/)).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Enviar pergunta'));
    });
    expect(mockApp.sendMessage).toHaveBeenCalledWith(texto(159), 'simnao');
  });

  it('exatamente 1 letra a mais: o aviso fala no singular', async () => {
    await render(<Conversa />);
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Mensagem para Carlos'), texto(161));
    });
    await ligarAPergunta();
    expect(screen.getByText(/passa em 1\. Apague 1 letra para enviar/)).toBeTruthy();
  });
});


/**
 * O overlay é a peça de segurança do app: o que ele diz sobre o prazo e sobre
 * o que foi (ou não) registrado precisa ser verdade. Três coisas são cobertas:
 *
 * 1. Com `escalated_at` vindo do servidor, mostra o horário do escalonamento —
 *    e não o cronômetro local, que é só uma estimativa.
 * 2. Sem `escalated_at`, mostra a contagem regressiva a partir de quando o
 *    servidor recebeu o pedido (`received_at`; sem a coluna, `created_at`) —
 *    e, se o pedido esperou na fila offline do computador, as duas horas.
 * 3. Quando `acknowledgeAlert` rejeita, a falha aparece e o botão vira
 *    "Tentar de novo" — em vez de fingir que o computador do paciente foi avisado.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { EspacoDoTopoProvider, Screen, ScreenHeader } from '@/components';
import type { HelpRequest, PatientSettings } from '@/data/types';
import { TRAVA_DO_BOTAO_MS } from '@/hooks/useTravaDosBotoes';
import { acaoDoVoltar, EmergencyOverlay, mancheteDoAlerta } from './EmergencyOverlay';

// `useApp` é a única entrada do overlay. Substituir o hook (e não o provider
// inteiro) mantém o teste sobre o componente, sem rede, sem realtime e sem os
// efeitos de carga do AppProvider.
const mockApp = {
  pendingAlert: null as HelpRequest | null,
  settings: null as PatientSettings | null,
  patient: { user_name: 'Carlos Souza' },
  acknowledgeAlert: jest.fn(),
  resolveAlert: jest.fn(),
  dismissPendingAlert: jest.fn(),
  pendingAlertMinimized: false,
  minimizePendingAlert: jest.fn(),
  restorePendingAlert: jest.fn(),
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

const AGORA = new Date('2026-09-10T15:00:00.000Z').getTime();

function alerta(extra: Partial<HelpRequest> = {}): HelpRequest {
  return {
    id: 'hr-1',
    beneficiary_id: 'b1',
    session_id: 's1',
    kind: 'emergencia',
    message: 'Carlos acionou o pedido de socorro na tela.',
    created_at: new Date(AGORA - 10_000).toISOString(), // apareceu há 10 s
    acknowledged_at: null,
    escalated_at: null,
    resolved_at: null,
    ...extra,
  };
}

function ajustes(extra: Partial<PatientSettings> = {}): PatientSettings {
  return {
    beneficiary_id: 'b1',
    dwell_ms: 1500,
    filter_preset: 'balanceado',
    keyboard_layout: 'frequencia',
    sensitivity: 5,
    voice: 'pt-BR padrão',
    emergency_timeout_s: 45,
    emergency_contacts: [{ name: 'Mariana (esposa)', phone: '11987654321' }],
    updated_at: new Date(AGORA).toISOString(),
    ...extra,
  };
}

beforeEach(() => {
  jest.useFakeTimers({ now: AGORA });
  mockApp.acknowledgeAlert.mockReset();
  mockApp.resolveAlert.mockReset();
  mockApp.dismissPendingAlert.mockReset();
  mockApp.minimizePendingAlert.mockReset();
  mockApp.restorePendingAlert.mockReset();
  mockApp.pendingAlertMinimized = false;
  mockApp.settings = ajustes();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('EmergencyOverlay', () => {
  it('não renderiza nada sem alerta pendente', async () => {
    mockApp.pendingAlert = null;
    await render(<EmergencyOverlay />);
    expect(screen.queryByText(/Pedido de socorro/)).toBeNull();
  });

  it('com escalated_at mostra o horário do escalonamento do servidor, não o cronômetro', async () => {
    // Reenviado às 15:00 UTC; o rótulo usa o fuso local, então o esperado é calculado do mesmo jeito.
    const escaladoEm = new Date(AGORA).toISOString();
    const horario = new Date(escaladoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    mockApp.pendingAlert = alerta({ escalated_at: escaladoEm });

    await render(<EmergencyOverlay />);

    const prazo = screen.getByTestId('prazo');
    expect(prazo).toHaveTextContent(`Reenviado às ${horario}`, { exact: false });
    expect(prazo).toHaveTextContent(/a todos os celulares desta conta: ninguém confirmou em 45 s/);
    expect(prazo).not.toHaveTextContent(/Prazo para alguém confirmar/);
    // O contato aparece já no escalonamento, antes do "Estou indo!": ligar é a ação real.
    expect(screen.getByText('Mariana (esposa)')).toBeTruthy();
    expect(screen.getByLabelText('Ligar para Mariana (esposa)')).toBeTruthy();
  });

  it('sem escalated_at mostra a contagem regressiva a partir de created_at', async () => {
    mockApp.pendingAlert = alerta();

    await render(<EmergencyOverlay />);

    // 45 s de prazo, alerta criado há 10 s → 35 s restantes.
    expect(screen.getByTestId('prazo')).toHaveTextContent(/Prazo para alguém confirmar: 35 s/);
    expect(screen.queryByText(/Escalado às/)).toBeNull();
    // Antes de estourar, o contato ainda não aparece (só depois de confirmar ou escalar).
    expect(screen.queryByText('Mariana (esposa)')).toBeNull();

    await act(() => {
      jest.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('prazo')).toHaveTextContent(/Prazo para alguém confirmar: 30 s/);
  });

  it('pedido que esperou na fila offline: o prazo conta da chegada ao servidor e o overlay diz as duas horas', async () => {
    const pedidoEm = new Date(AGORA - 3 * 3600_000).toISOString(); // pedido há 3 h, sem internet no PC
    const chegouEm = new Date(AGORA - 10_000).toISOString(); // chegou ao servidor há 10 s
    const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    mockApp.pendingAlert = alerta({ created_at: pedidoEm, received_at: chegouEm });

    await render(<EmergencyOverlay />);

    // Mesmo prazo que o servidor usa: 45 s a partir da chegada, não do pedido.
    expect(screen.getByTestId('prazo')).toHaveTextContent(/Prazo para alguém confirmar: 35 s/);
    expect(screen.getByTestId('atraso')).toHaveTextContent(
      `Pedido feito às ${hora(pedidoEm)} no computador do paciente; chegou às ${hora(chegouEm)}.`,
    );
    // O topo mostra a hora do pedido.
    expect(screen.getByText(new RegExp(`Emergência às ${hora(pedidoEm)}`))).toBeTruthy();
  });

  it('chegada logo depois do pedido não ganha nota de atraso', async () => {
    mockApp.pendingAlert = alerta({
      created_at: new Date(AGORA - 40_000).toISOString(),
      received_at: new Date(AGORA - 10_000).toISOString(),
    });

    await render(<EmergencyOverlay />);

    expect(screen.queryByTestId('atraso')).toBeNull();
    expect(screen.getByTestId('prazo')).toHaveTextContent(/Prazo para alguém confirmar: 35 s/);
  });

  it('quando o cronômetro local zera e o servidor ainda não escalou, diz que ele vai reenviar', async () => {
    mockApp.pendingAlert = alerta({ created_at: new Date(AGORA - 60_000).toISOString() });

    await render(<EmergencyOverlay />);

    const prazo = screen.getByTestId('prazo');
    expect(prazo).toHaveTextContent(/Passaram-se 45 s sem confirmação/);
    expect(prazo).toHaveTextContent(/será reenviado a todos os celulares em até um minuto/);
    expect(screen.getByText('Mariana (esposa)')).toBeTruthy();
  });

  it('falha no acknowledgeAlert: mostra o erro e o botão vira "Tentar de novo"', async () => {
    mockApp.pendingAlert = alerta();
    mockApp.acknowledgeAlert.mockRejectedValueOnce(new Error('Sem conexão.'));

    await render(<EmergencyOverlay />);

    await fireEvent.press(screen.getByText('Estou indo!'));

    await waitFor(() => expect(screen.getByText('Tentar de novo')).toBeTruthy());
    expect(mockApp.acknowledgeAlert).toHaveBeenCalledWith('hr-1');
    // O motivo chega em linguagem de gente, não o texto técnico do erro.
    expect(screen.getByText(/Não deu para registrar: Sem internet no momento/)).toBeTruthy();
    // A copy diz o que é verdade: nada foi gravado, e por isso o paciente não foi avisado.
    expect(screen.getByText(/A confirmação NÃO foi gravada/)).toBeTruthy();
    expect(screen.getByText(/o paciente não foi avisado/)).toBeTruthy();

    // Segunda tentativa, agora com sucesso: o erro some.
    mockApp.acknowledgeAlert.mockResolvedValueOnce(undefined);
    await fireEvent.press(screen.getByText('Tentar de novo'));
    await waitFor(() => expect(screen.queryByText(/Não deu para registrar/)).toBeNull());
    expect(mockApp.acknowledgeAlert).toHaveBeenCalledTimes(2);
  });

  it('socorro se reconhece com UM toque em "Estou indo!"', async () => {
    mockApp.pendingAlert = alerta();
    mockApp.acknowledgeAlert.mockResolvedValueOnce(undefined);

    await render(<EmergencyOverlay />);
    expect(screen.getByText('Carlos precisa de você agora.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Estou indo!'));

    await waitFor(() => expect(mockApp.acknowledgeAlert).toHaveBeenCalledTimes(1));
    expect(mockApp.acknowledgeAlert).toHaveBeenCalledWith('hr-1');
  });

  it('aviso da sessão (postura) não tem prazo de socorro e se confirma com "Entendi"', async () => {
    mockApp.pendingAlert = alerta({ kind: 'postura', message: 'Desvio postural lento (64 px).' });

    await render(<EmergencyOverlay />);

    expect(screen.getByText('Aviso de postura')).toBeTruthy();
    expect(screen.queryByTestId('prazo')).toBeNull();
    expect(screen.queryByText('Estou indo!')).toBeNull();
    expect(screen.getByText('Entendi')).toBeTruthy();
  });

  it('depois de confirmado, diz o que a confirmação fez (visto no servidor; a tela do paciente avisa com internet)', async () => {
    const confirmadoEm = new Date(AGORA - 5_000).toISOString();
    const horario = new Date(confirmadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    mockApp.pendingAlert = alerta({ acknowledged_at: confirmadoEm });

    await render(<EmergencyOverlay />);

    const nota = screen.getByTestId('confirmado');
    expect(nota).toHaveTextContent(`Confirmado às ${horario}`, { exact: false });
    expect(nota).toHaveTextContent(/tela do paciente avisa que você viu quando está com internet/);
    // Sem contagem regressiva nem "Estou indo!": o próximo passo é "Resolvido".
    expect(screen.queryByTestId('prazo')).toBeNull();
    expect(screen.getByText('Resolvido')).toBeTruthy();
  });

  // APP-1: em 360×568 com a fonte do sistema a 1,3× o botão saía da tela, nada
  // rolava e o Voltar do Android era ignorado — o cuidador ficava preso no alerta.
  describe('nunca prende o cuidador', () => {
    it('a resposta fica no rodapé fixo, fora da rolagem; o texto e os contatos rolam', async () => {
      mockApp.pendingAlert = alerta({ escalated_at: new Date(AGORA).toISOString() });

      await render(<EmergencyOverlay />);

      const rodape = screen.getByTestId('acoes-do-alerta');
      const rolagem = screen.getByTestId('rolagem-do-alerta');
      expect(within(rodape).getByText('Estou indo!')).toBeTruthy();
      expect(within(rolagem).queryByText('Estou indo!')).toBeNull();
      // Justamente quando os contatos aparecem (prazo estourado) é que o botão sumia.
      expect(within(rolagem).getByText('Mariana (esposa)')).toBeTruthy();
      expect(within(rolagem).getByTestId('prazo')).toBeTruthy();
    });

    it('depois de confirmado, "Resolvido" e "Ver depois" também ficam no rodapé', async () => {
      mockApp.pendingAlert = alerta({ acknowledged_at: new Date(AGORA - 5_000).toISOString() });

      await render(<EmergencyOverlay />);

      const rodape = screen.getByTestId('acoes-do-alerta');
      expect(within(rodape).getByText('Resolvido')).toBeTruthy();
      expect(within(rodape).getByText('Ver depois')).toBeTruthy();
      expect(within(screen.getByTestId('rolagem-do-alerta')).getByTestId('confirmado')).toBeTruthy();
    });

    it('"Minimizar" tira da tela cheia sem confirmar nada', async () => {
      mockApp.pendingAlert = alerta();

      await render(<EmergencyOverlay />);
      await fireEvent.press(screen.getByText('Minimizar'));

      expect(mockApp.minimizePendingAlert).toHaveBeenCalledTimes(1);
      expect(mockApp.acknowledgeAlert).not.toHaveBeenCalled();
    });

    it('Voltar do Android: minimiza um pedido sem resposta e vira "Ver depois" depois de confirmado', () => {
      expect(acaoDoVoltar(alerta())).toBe('minimizar');
      expect(acaoDoVoltar(alerta({ acknowledged_at: new Date(AGORA).toISOString() }))).toBe('ver-depois');
    });

    it('minimizado: só a faixa do topo, que reabre o alerta; sem vibrar e sem a tela cheia', async () => {
      mockApp.pendingAlert = alerta();
      mockApp.pendingAlertMinimized = true;

      await render(<EmergencyOverlay />);

      expect(screen.queryByTestId('acoes-do-alerta')).toBeNull();
      const faixa = screen.getByTestId('alerta-minimizado');
      expect(faixa).toHaveTextContent(/Pedido de socorro sem resposta/);
      expect(faixa).toHaveTextContent(/Carlos ainda espera/);
      await fireEvent.press(faixa);
      expect(mockApp.restorePendingAlert).toHaveBeenCalledTimes(1);
    });

    it('minimizado e confirmado em outro celular: a faixa não diz mais "sem resposta"', async () => {
      mockApp.pendingAlert = alerta({ acknowledged_at: new Date(AGORA).toISOString() });
      mockApp.pendingAlertMinimized = true;

      await render(<EmergencyOverlay />);

      const faixa = screen.getByTestId('alerta-minimizado');
      expect(faixa).not.toHaveTextContent(/sem resposta/);
      expect(faixa).toHaveTextContent(/confirmado/);
    });
  });

  // Achado no reteste do APP-1: com o rodapé fixo, "Resolvido" nasce no mesmo
  // lugar de "Estou indo!" — um toque duplo confirmava E resolvia o socorro.
  it('toque duplo em "Estou indo!" não resolve o socorro: "Resolvido" espera um instante', async () => {
    mockApp.pendingAlert = alerta();
    mockApp.acknowledgeAlert.mockResolvedValueOnce(undefined);
    mockApp.resolveAlert.mockResolvedValue(undefined);
    const tela = await render(<EmergencyOverlay />);

    await fireEvent.press(screen.getByText('Estou indo!'));
    await waitFor(() => expect(mockApp.acknowledgeAlert).toHaveBeenCalledTimes(1));
    // O servidor confirmou: o alerta chega confirmado (o segundo toque cai em "Resolvido").
    mockApp.pendingAlert = alerta({ acknowledged_at: new Date(AGORA).toISOString() });
    await tela.rerender(<EmergencyOverlay />);
    await fireEvent.press(screen.getByText('Resolvido'));
    expect(mockApp.resolveAlert).not.toHaveBeenCalled();

    await act(() => {
      jest.advanceTimersByTime(TRAVA_DO_BOTAO_MS);
    });
    await fireEvent.press(screen.getByText('Resolvido'));
    await waitFor(() => expect(mockApp.resolveAlert).toHaveBeenCalledWith('hr-1'));
  });

  // Revisão de UX de 19/10/2026 (achado 6): um socorro mais grave agora toma o
  // lugar de um "Chamar atenção" na tela — e, confirmado um pedido, o seguinte
  // sem resposta aparece no mesmo lugar. O "Estou indo!" do pedido novo nasce
  // onde o dedo estava: sem a trava, o segundo toque confirmava um socorro que
  // ninguém leu (e o computador do paciente diria "seu cuidador viu").
  it('outro pedido assume a tela: o "Estou indo!" dele espera um instante', async () => {
    mockApp.pendingAlert = alerta({ id: 'hr-ajuda', kind: 'ajuda', message: 'Está chamando você (tela Sim · Não)' });
    mockApp.acknowledgeAlert.mockResolvedValue(undefined);
    const tela = await render(<EmergencyOverlay />);

    mockApp.pendingAlert = alerta({ id: 'hr-socorro', kind: 'emergencia', message: 'FALTA DE AR' });
    await tela.rerender(<EmergencyOverlay />);
    expect(screen.getByText('Falta de ar')).toBeTruthy();
    await fireEvent.press(screen.getByText('Estou indo!'));
    expect(mockApp.acknowledgeAlert).not.toHaveBeenCalled();

    await act(() => {
      jest.advanceTimersByTime(TRAVA_DO_BOTAO_MS);
    });
    await fireEvent.press(screen.getByText('Estou indo!'));
    await waitFor(() => expect(mockApp.acknowledgeAlert).toHaveBeenCalledWith('hr-socorro'));
  });

  // Revisão de UX de 19/10/2026 (achado 20): a faixa do alerta minimizado
  // ficava exatamente sobre os botões Voltar/Fechar das telas (o mesmo topo de
  // `Screen`) até alguém confirmar.
  describe('faixa do alerta minimizado', () => {
    const ALTURA_DA_FAIXA = 76;
    const montarTela = () => (
      <EspacoDoTopoProvider>
        <Screen testID="tela">
          <ScreenHeader onBack={jest.fn()} title="Relatório de sessão" />
        </Screen>
        <EmergencyOverlay />
      </EspacoDoTopoProvider>
    );

    it('não cobre o Voltar/Fechar da tela: o conteúdo desce, e a faixa segue visível e tocável', async () => {
      mockApp.pendingAlert = alerta();
      mockApp.pendingAlertMinimized = true;
      await render(montarTela());

      const faixa = screen.getByTestId('alerta-minimizado');
      // A faixa informa a altura que ganhou na tela (fonte do sistema grande a faz crescer).
      await fireEvent(screen.getByTestId('faixa-do-alerta'), 'layout', { nativeEvent: { layout: { x: 20, y: 8, width: 280, height: ALTURA_DA_FAIXA } } });
      const topoDaFaixa = StyleSheet.flatten(screen.getByTestId('faixa-do-alerta').props.style).top as number;
      const topoDaTela = StyleSheet.flatten(screen.getByTestId('tela').props.contentContainerStyle).paddingTop as number;
      expect(topoDaTela).toBeGreaterThanOrEqual(topoDaFaixa + ALTURA_DA_FAIXA);
      expect(screen.getByLabelText('Voltar')).toBeTruthy();

      await fireEvent.press(faixa);
      expect(mockApp.restorePendingAlert).toHaveBeenCalledTimes(1);
    });

    it('sem a faixa, a tela volta ao topo de sempre', async () => {
      mockApp.pendingAlert = alerta();
      mockApp.pendingAlertMinimized = true;
      const tela = await render(montarTela());
      await fireEvent(screen.getByTestId('faixa-do-alerta'), 'layout', { nativeEvent: { layout: { x: 20, y: 8, width: 280, height: ALTURA_DA_FAIXA } } });

      mockApp.pendingAlert = null;
      mockApp.pendingAlertMinimized = false;
      await tela.rerender(montarTela());
      expect(StyleSheet.flatten(screen.getByTestId('tela').props.contentContainerStyle).paddingTop).toBe(8);
    });
  });

  it('alerta que já abre confirmado (outro celular confirmou antes): "Resolvido" responde na hora', async () => {
    mockApp.pendingAlert = alerta({ acknowledged_at: new Date(AGORA - 60_000).toISOString() });
    mockApp.resolveAlert.mockResolvedValue(undefined);
    await render(<EmergencyOverlay />);
    await fireEvent.press(screen.getByText('Resolvido'));
    await waitFor(() => expect(mockApp.resolveAlert).toHaveBeenCalledTimes(1));
  });

  // Redesenho de 19/10/2026: o motivo do pedido é a manchete, legível ao acordar.
  describe('manchete e prazo', () => {
    it('o motivo curto que o computador manda vira a manchete, em caixa de frase', async () => {
      mockApp.pendingAlert = alerta({ message: 'FALTA DE AR' });
      await render(<EmergencyOverlay />);
      expect(screen.getByText('Falta de ar')).toBeTruthy();
      // O tipo do pedido continua visível, no topo, com a hora.
      expect(screen.getByText(/^Pedido de socorro às \d{2}:\d{2}$/)).toBeTruthy();
      expect(screen.getByText('Carlos precisa de você agora.')).toBeTruthy();
    });

    it('motivo longo fica no texto; a manchete é o tipo do pedido', () => {
      expect(mancheteDoAlerta({ kind: 'emergencia', message: 'Carlos acionou o pedido de socorro na tela.' })).toEqual({ titulo: 'Pedido de socorro', motivoNaManchete: false });
      expect(mancheteDoAlerta({ kind: 'ajuda', message: 'OUTRA URGÊNCIA' })).toEqual({ titulo: 'Outra urgência', motivoNaManchete: true });
      // Aviso da sessão: sempre o tipo, mesmo com mensagem curta.
      expect(mancheteDoAlerta({ kind: 'postura', message: 'Desvio lento.' })).toEqual({ titulo: 'Aviso de postura', motivoNaManchete: false });
      expect(mancheteDoAlerta({ kind: 'emergencia', message: '' })).toEqual({ titulo: 'Pedido de socorro', motivoNaManchete: false });
    });

    it('a barra do prazo diminui com o tempo e some da tela depois da confirmação', async () => {
      mockApp.pendingAlert = alerta(); // 45 s de prazo, criado há 10 s
      const tela = await render(<EmergencyOverlay />);
      // A barra é escondida do leitor de tela (o texto do prazo já diz tudo).
      const largura = () => StyleSheet.flatten(screen.getByTestId('restante-do-prazo', { includeHiddenElements: true }).props.style).width;
      expect(largura()).toBe('78%'); // 35 de 45 s
      await act(() => {
        jest.advanceTimersByTime(17_000);
      });
      expect(largura()).toBe('40%'); // 18 de 45 s
      mockApp.pendingAlert = alerta({ acknowledged_at: new Date(AGORA).toISOString() });
      await tela.rerender(<EmergencyOverlay />);
      expect(screen.queryByTestId('barra-do-prazo', { includeHiddenElements: true })).toBeNull();
    });
  });
});


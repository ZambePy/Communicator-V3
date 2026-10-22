import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { _limparOuvintes } from './eventos';
import { definirModoApresentacao } from '../services/apresentacao';

// Pergunta sim/não do cuidador (pedido de 21/10/2026): o app manda uma
// mensagem `kind: 'simnao'` com a pergunta; o computador NÃO a trata como
// recado comum (falado na hora, cartão de 15 s) — ela entra na fila das
// perguntas, que a tela mostra quando for seguro. A resposta volta como
// `message.send` `simnao`, "Sim (pergunta)" ou "Não (pergunta)", uma vez.

vi.mock('./config', () => ({
  nuvemConfigurada: true,
  cloudConfig: {
    url: 'https://abc.supabase.co', anonKey: 'x'.repeat(30),
    desktopSyncUrl: 'https://abc.supabase.co/functions/v1/desktop-sync',
    siteUrl: 'https://irisflow.test', carenciaOfflineDias: 7, heartbeatMs: 30_000,
  },
}));

type Handler = (p: { new: unknown }) => void;
const realtime: { handlers: Record<string, Handler> } = { handlers: {} };
const from = vi.fn(() => ({
  select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }),
}));
const canal = {
  on: vi.fn((_t: string, cfg: { table: string }, h: Handler) => { realtime.handlers[cfg.table] = h; return canal; }),
  subscribe: vi.fn((cb: (s: string) => void) => { cb('SUBSCRIBED'); return canal; }),
};
vi.mock('./supabaseClient', () => ({
  supabase: () => ({ from, channel: () => canal, removeChannel: vi.fn(async () => 'ok') }),
}));
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({
    state: 'tracking', cameraError: null, getCameraStream: () => ({}), setFilterPreset: vi.fn(() => ({ aplicado: true, emVigor: 'oneEuro' })),
    calibration: { isCalibrated: () => true },
    getDiagnostics: () => ({ filtro: { preset: 'balanceado-v2', efetivo: 'oneEuro' } }),
  }),
}));
vi.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ settings: { dwellMs: 1500 }, updateSettings: vi.fn() }),
}));
const licencaMock: { status: string; license: unknown; reverificar: ReturnType<typeof vi.fn> } = {
  status: 'none', license: null, reverificar: vi.fn(),
};
vi.mock('../context/LicenseContext', () => ({ useLicense: () => licencaMock }));

import { CloudProvider, useCloud } from './CloudContext';
import { CHAVE_DAS_PERGUNTAS_RESPONDIDAS } from './perguntaDoCuidador';

const LICENCA_ATIVA = {
  account: { email: 'familia@exemplo.com', name: 'Carlos', beneficiaryId: 'ben-1', beneficiaryName: 'Carlos' },
  plan: { id: 'completo', name: 'IrisFlow Completo', validUntil: null, deviceLimit: null },
  token: 'CHAVE-SECRETA',
  devicesUsed: 1,
  thisDevice: { deviceId: 'local-1', deviceName: 'PC', boundAt: '2026-09-08T00:00:00Z' },
};

let acoes: ReturnType<typeof useCloud> | null = null;
const Sonda: React.FC = () => {
  const c = useCloud();
  acoes = c;
  return (
    <div>
      <span data-testid="vinculo">{c.vinculo?.beneficiary_name ?? '-'}</span>
      <span data-testid="banner">{c.mensagemNaTela?.text ?? '-'}</span>
      <span data-testid="perguntas">{c.perguntasDoCuidador.map((p) => p.text).join('|') || '-'}</span>
    </div>
  );
};

let pendentes: unknown[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
function chamadas() {
  return fetchMock.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
}

const pergunta = (id: string, text: string, extra: Record<string, unknown> = {}) => ({
  id, beneficiary_id: 'ben-1', sender: 'cuidador', kind: 'simnao', text, created_at: new Date().toISOString(), read_at: null, spoken: false, ...extra,
});

async function montar() {
  licencaMock.status = 'active';
  licencaMock.license = LICENCA_ATIVA;
  const r = render(<CloudProvider><Sonda /></CloudProvider>);
  await waitFor(() => expect(screen.getByTestId('vinculo').textContent).toBe('Carlos'));
  await new Promise((res) => setTimeout(res, 10));
  fetchMock.mockClear();
  return r;
}

describe('pergunta sim/não do cuidador no computador', () => {
  let speak: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    _limparOuvintes();
    realtime.handlers = {};
    pendentes = [];
    licencaMock.status = 'none';
    licencaMock.license = null;
    fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const corpo = JSON.parse(String(init?.body));
      const resposta = corpo.action === 'session.upsert' ? { ok: true, id: 'sess-1' }
        : corpo.action === 'message.send' ? { ok: true, id: corpo.id }
        : corpo.action === 'settings.get' ? { settings: null, phrases: [] }
        : corpo.action === 'messages.pending' ? { messages: pendentes }
        : { ok: true };
      return { ok: true, status: 200, json: async () => resposta } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    speak = vi.fn((u: { onend?: () => void }) => u.onend?.());
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak });
    vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; rate = 1; onend?: () => void; onerror?: () => void; constructor(t: string) { this.text = t; } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    definirModoApresentacao(false);
    acoes = null;
    localStorage.clear();
  });

  it('a pergunta entra na fila das perguntas: sem cartão de recado, sem fala na hora, sem "falada" para o celular', async () => {
    await montar();
    speak.mockClear();
    await act(async () => {
      realtime.handlers.messages({ new: pergunta('q-1', 'Você está com dor?') });
      realtime.handlers.messages({ new: pergunta('q-1', 'Você está com dor?') }); // reentrega
    });
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('Você está com dor?'));
    expect(screen.getByTestId('banner').textContent).toBe('-');
    expect(speak).not.toHaveBeenCalled();
    expect(chamadas().find((c) => c.action === 'message.spoken')).toBeUndefined();
  });

  it('o "Sim"/"Não" curto que o cuidador manda pelos botões do app continua sendo recado comum', async () => {
    await montar();
    await act(async () => {
      realtime.handlers.messages({ new: pergunta('r-1', 'Sim') });
    });
    await waitFor(() => expect(screen.getByTestId('banner').textContent).toBe('Sim'));
    expect(screen.getByTestId('perguntas').textContent).toBe('-');
  });

  it('a resposta vai uma vez, como sim/não com a pergunta entre parênteses; a pergunta sai da fila e vira "falada"', async () => {
    await montar();
    await act(async () => {
      realtime.handlers.messages({ new: pergunta('q-2', 'Quer água?') });
    });
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('Quer água?'));
    let id: string | null = null;
    let segunda: string | null = 'x';
    act(() => {
      id = acoes!.responderPerguntaDoCuidador('q-2', 'sim');
      segunda = acoes!.responderPerguntaDoCuidador('q-2', 'nao');
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(segunda).toBeNull();
    await waitFor(() => expect(chamadas().filter((c) => c.action === 'message.send')).toHaveLength(1));
    expect(chamadas().find((c) => c.action === 'message.send')).toMatchObject({ kind: 'simnao', text: 'Sim (Quer água?)', id });
    await waitFor(() => expect(chamadas()).toContainEqual(expect.objectContaining({ action: 'message.spoken', message_id: 'q-2' })));
    expect(screen.getByTestId('perguntas').textContent).toBe('-');
    expect(JSON.parse(localStorage.getItem(CHAVE_DAS_PERGUNTAS_RESPONDIDAS)!)).toContain('q-2');
  });

  it('respondida, ela não volta pela busca de pendentes (o "falada" que não chegou ao servidor é reenviado)', async () => {
    await montar();
    await act(async () => {
      realtime.handlers.messages({ new: pergunta('q-3', 'Posso desligar a TV?') });
    });
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('Posso desligar a TV?'));
    act(() => { acoes!.responderPerguntaDoCuidador('q-3', 'nao'); });
    fetchMock.mockClear();
    pendentes = [pergunta('q-3', 'Posso desligar a TV?')];
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId('perguntas').textContent).toBe('-');
    expect(chamadas().filter((c) => c.action === 'message.send')).toHaveLength(0);
    expect(chamadas()).toContainEqual(expect.objectContaining({ action: 'message.spoken', message_id: 'q-3' }));
  });

  it('a pergunta que esperava (não falada no servidor) chega pela busca de pendentes e entra na fila', async () => {
    pendentes = [pergunta('q-4', 'Está com frio?')];
    await montar();
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('Está com frio?'));
  });

  it('fechar sem responder (o cuidador, pelo mouse): sai da fila, vira "falada" e nenhuma RESPOSTA é enviada', async () => {
    await montar();
    await act(async () => {
      realtime.handlers.messages({ new: pergunta('q-5', 'Vamos passear?') });
    });
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('Vamos passear?'));
    act(() => { acoes!.fecharPerguntaDoCuidador('q-5'); });
    await waitFor(() => expect(chamadas()).toContainEqual(expect.objectContaining({ action: 'message.spoken', message_id: 'q-5' })));
    // Nem um "sim" nem um "não": só a nota de sistema (teste abaixo).
    expect(chamadas().filter((c) => c.action === 'message.send' && c.kind === 'simnao')).toEqual([]);
    expect(screen.getByTestId('perguntas').textContent).toBe('-');
    expect(acoes!.responderPerguntaDoCuidador('q-5', 'sim')).toBeNull();
  });

  // Revisão final, rodada 1 (M9, 21/10/2026): sem isto o app mostra a pergunta "mostrada na tela" e o
  // cuidador espera uma resposta que não vem. Uma nota curta, de sistema, diz que foi fechada.
  it('fechar sem responder manda UMA nota de sistema ao cuidador: a pergunta foi fechada sem resposta', async () => {
    await montar();
    await act(async () => {
      realtime.handlers.messages({ new: pergunta('q-8', 'Vamos passear?') });
    });
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('Vamos passear?'));
    act(() => { acoes!.fecharPerguntaDoCuidador('q-8'); });
    await waitFor(() => expect(chamadas().filter((c) => c.action === 'message.send')).toHaveLength(1));
    expect(chamadas().find((c) => c.action === 'message.send')).toMatchObject({
      action: 'message.send',
      kind: 'sistema',
      text: 'A pergunta foi fechada no computador sem resposta: “Vamos passear?”',
    });
    // Fechar de novo (o clique duplo) não manda outra nota.
    act(() => { acoes!.fecharPerguntaDoCuidador('q-8'); });
    await new Promise((r) => setTimeout(r, 20));
    expect(chamadas().filter((c) => c.action === 'message.send')).toHaveLength(1);
  });

  it('responder NÃO manda a nota de fechada, e uma pergunta que não existe aqui também não', async () => {
    await montar();
    await act(async () => {
      realtime.handlers.messages({ new: pergunta('q-9', 'Quer água?') });
    });
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('Quer água?'));
    act(() => { acoes!.responderPerguntaDoCuidador('q-9', 'sim'); });
    act(() => { acoes!.fecharPerguntaDoCuidador('q-9'); });
    act(() => { acoes!.fecharPerguntaDoCuidador('nao-existe'); });
    await new Promise((r) => setTimeout(r, 20));
    const enviadas = chamadas().filter((c) => c.action === 'message.send');
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0]).toMatchObject({ kind: 'simnao', text: 'Sim (Quer água?)' });
  });

  it('no modo apresentação a nota de fechada não sai do computador', async () => {
    await montar();
    await act(async () => {
      realtime.handlers.messages({ new: pergunta('q-10', 'Tudo bem?') });
    });
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('Tudo bem?'));
    definirModoApresentacao(true);
    act(() => { acoes!.fecharPerguntaDoCuidador('q-10'); });
    await new Promise((r) => setTimeout(r, 20));
    expect(chamadas().find((c) => c.action === 'message.send')).toBeUndefined();
  });

  it('trocou a conta deste computador (novo login): a pergunta da conta anterior sai da fila', async () => {
    const { rerender } = await montar();
    await act(async () => {
      realtime.handlers.messages({ new: pergunta('q-7', 'Quer dormir?') });
    });
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('Quer dormir?'));
    licencaMock.license = { ...LICENCA_ATIVA, token: 'OUTRA-CHAVE', account: { ...LICENCA_ATIVA.account, beneficiaryId: 'ben-2' } };
    await act(async () => {
      rerender(<CloudProvider><Sonda /></CloudProvider>);
      await new Promise((r) => setTimeout(r, 20));
    });
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('-'));
  });

  it('no modo apresentação a resposta não sai do computador', async () => {
    await montar();
    await act(async () => {
      realtime.handlers.messages({ new: pergunta('q-6', 'Tudo bem?') });
    });
    await waitFor(() => expect(screen.getByTestId('perguntas').textContent).toBe('Tudo bem?'));
    definirModoApresentacao(true);
    act(() => { acoes!.responderPerguntaDoCuidador('q-6', 'sim'); });
    await new Promise((r) => setTimeout(r, 20));
    expect(chamadas().find((c) => c.action === 'message.send')).toBeUndefined();
  });
});

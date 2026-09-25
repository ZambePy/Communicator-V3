import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { _limparOuvintes, emitirFalaDoPaciente, emitirPedidoDeAjuda } from './eventos';
import { definirModoApresentacao } from '../services/apresentacao';

// ---------- dublês ----------
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
const removeChannel = vi.fn(async () => 'ok');
vi.mock('./supabaseClient', () => ({
  supabase: () => ({ from, channel: () => canal, removeChannel }),
}));
const setFilterPreset = vi.fn();
/** Preset que o engine diz estar em vigor (formato do engine, com sufixo -v2). */
const diag = { preset: 'responsivo-v2' as string | null };
vi.mock('../context/GazeContext', () => ({
  useGaze: () => ({
    state: 'tracking', cameraError: null, getCameraStream: () => ({}), setFilterPreset,
    calibration: { isCalibrated: () => true },
    getDiagnostics: () => ({ filtro: { preset: diag.preset } }),
  }),
}));
const updateSettings = vi.fn();
vi.mock('../context/SettingsContext', () => ({
  useSettings: () => ({ settings: { dwellMs: 1500 }, updateSettings }),
}));

// A licença é do LicenseContext (Bloco 1); aqui é um dublê controlado pelo teste.
const licencaMock: { status: string; license: unknown; reverificar: ReturnType<typeof vi.fn> } = {
  status: 'none', license: null, reverificar: vi.fn(),
};
vi.mock('../context/LicenseContext', () => ({ useLicense: () => licencaMock }));

import { CloudProvider, useCloud } from './CloudContext';
import { cloudConfig } from './config';

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
      <span data-testid="nao-faladas">{c.naoFaladas}</span>
      <span data-testid="reconhecimento">{c.reconhecimento ? `${c.reconhecimento.id}@${c.reconhecimento.acknowledged_at}` : '-'}</span>
    </div>
  );
};

function chamadas(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((c) => {
    const init = c[1] as RequestInit;
    return { ...JSON.parse(String(init.body)), _chave: (init.headers as Record<string, string>)['x-device-key'] };
  });
}

async function montarComLicencaAtiva() {
  licencaMock.status = 'active';
  licencaMock.license = LICENCA_ATIVA;
  const r = render(<CloudProvider><Sonda /></CloudProvider>);
  await waitFor(() => expect(screen.getByTestId('vinculo').textContent).toBe('Carlos'));
  return r;
}

describe('CloudProvider — segue a licença e liga a conversa', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    _limparOuvintes();
    realtime.handlers = {};
    diag.preset = 'responsivo-v2';
    licencaMock.status = 'none';
    licencaMock.license = null;
    licencaMock.reverificar = vi.fn();
    fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const corpo = JSON.parse(String(init?.body));
      const resposta = corpo.action === 'session.upsert' ? { ok: true, id: 'sess-1' }
        : corpo.action === 'message.send' ? { ok: true, id: 'msg-servidor' }
        : corpo.action === 'settings.get' ? { settings: null, phrases: [] }
        : corpo.action === 'messages.pending' ? { messages: [] }
        : { ok: true };
      return { ok: true, status: 200, json: async () => resposta } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn((u: { onend?: () => void }) => u.onend?.()) });
    vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; lang = ''; rate = 1; onend?: () => void; onerror?: () => void; constructor(t: string) { this.text = t; } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    definirModoApresentacao(false);
    acoes = null;
  });

  it('sem licença ativa fica inerte: nenhuma chamada à Edge Function', async () => {
    render(<CloudProvider><Sonda /></CloudProvider>);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('vinculo').textContent).toBe('-');
  });

  it('licença ativa: usa o token como chave do computador e abre a sessão', async () => {
    await montarComLicencaAtiva();
    const abertura = chamadas(fetchMock).find((c) => c.action === 'session.upsert');
    expect(abertura).toBeDefined();
    expect(abertura._chave).toBe('CHAVE-SECRETA');
    expect(abertura.session.dwell_ms).toBe(1500);
    // O preset REAL do engine ('responsivo-v2' → 'responsivo'), não 'balanceado' fixo.
    expect(abertura.session.filter_preset).toBe('responsivo');
    expect(realtime.handlers.messages).toBeDefined();
    expect(realtime.handlers.help_requests).toBeDefined();
  });

  it('sem preset no engine (cadeia Kalman) a sessão abre com balanceado', async () => {
    diag.preset = null;
    await montarComLicencaAtiva();
    const abertura = chamadas(fetchMock).find((c) => c.action === 'session.upsert');
    expect(abertura.session.filter_preset).toBe('balanceado');
  });

  it('fala e socorro do paciente viram message.send e help.create com a sessão', async () => {
    await montarComLicencaAtiva();
    fetchMock.mockClear();
    await act(async () => {
      emitirFalaDoPaciente('Estou com sede', 'frase');
      emitirPedidoDeAjuda('emergencia', 'Dor');
      await Promise.resolve();
    });
    await waitFor(() => expect(chamadas(fetchMock).length).toBeGreaterThanOrEqual(2));
    const feitas = chamadas(fetchMock);
    expect(feitas).toContainEqual(expect.objectContaining({ action: 'message.send', text: 'Estou com sede', kind: 'frase', _chave: 'CHAVE-SECRETA' }));
    expect(feitas).toContainEqual(expect.objectContaining({ action: 'help.create', kind: 'emergencia', message: 'Dor', session_id: 'sess-1' }));
  });

  it('pedirAjuda passa pelo barramento: vira help.create com a sessão, e o modo apresentação corta', async () => {
    await montarComLicencaAtiva();
    fetchMock.mockClear();
    definirModoApresentacao(true);
    await act(async () => {
      await acoes!.pedirAjuda('emergencia', 'Demonstração');
      await Promise.resolve();
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(chamadas(fetchMock).find((c) => c.action === 'help.create')).toBeUndefined();

    definirModoApresentacao(false);
    await act(async () => {
      await acoes!.pedirAjuda('ajuda', 'Preciso de ajuda');
      await Promise.resolve();
    });
    await waitFor(() => expect(chamadas(fetchMock)).toContainEqual(expect.objectContaining({ action: 'help.create', kind: 'ajuda', message: 'Preciso de ajuda', session_id: 'sess-1', _chave: 'CHAVE-SECRETA' })));
    expect(chamadas(fetchMock).filter((c) => c.action === 'help.create')).toHaveLength(1);
  });

  it('mensagem do cuidador chega pelo realtime, é falada UMA vez, aparece na tela e é marcada como falada', async () => {
    await montarComLicencaAtiva();
    fetchMock.mockClear();
    const speak = (globalThis as unknown as { speechSynthesis: { speak: ReturnType<typeof vi.fn> } }).speechSynthesis.speak;
    speak.mockClear();
    const m = { id: 'm-9', beneficiary_id: 'ben-1', sender: 'cuidador', kind: 'texto', text: 'Já estou indo', created_at: new Date().toISOString(), read_at: null, spoken: false };
    await act(async () => {
      realtime.handlers.messages({ new: m });
      realtime.handlers.messages({ new: m }); // reentrega
    });
    await waitFor(() => expect(screen.getByTestId('banner').textContent).toBe('Já estou indo'));
    expect(speak).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(chamadas(fetchMock)).toContainEqual(expect.objectContaining({ action: 'message.spoken', message_id: 'm-9' })));
    await waitFor(() => expect(screen.getByTestId('nao-faladas').textContent).toBe('0'));
  });

  it('ajuste remoto: tempo de fixação em ms, preset -v2 e a sessão aberta é atualizada', async () => {
    await montarComLicencaAtiva();
    fetchMock.mockClear();
    await act(async () => {
      realtime.handlers.patient_settings({ new: { beneficiary_id: 'ben-1', dwell_ms: 800, filter_preset: 'estavel', updated_at: 't1' } });
    });
    expect(updateSettings).toHaveBeenCalledWith({ dwellMs: 800 });
    expect(setFilterPreset).toHaveBeenCalledWith('estavel-v2');
    // O registro da sessão passa a dizer o que valeu de fato.
    await waitFor(() => expect(chamadas(fetchMock)).toContainEqual(expect.objectContaining({ action: 'session.upsert', session: { id: 'sess-1', dwell_ms: 800, filter_preset: 'estavel' } })));
  });

  it('ajuste remoto PARCIAL (só contato/prazo, dwell e preset nulos): nada é aplicado por cima do local', async () => {
    await montarComLicencaAtiva();
    updateSettings.mockClear();
    setFilterPreset.mockClear();
    fetchMock.mockClear();
    await act(async () => {
      realtime.handlers.patient_settings({ new: { beneficiary_id: 'ben-1', dwell_ms: null, filter_preset: null, emergency_timeout_s: 90, updated_at: 't2' } });
    });
    expect(updateSettings).not.toHaveBeenCalled();
    expect(setFilterPreset).not.toHaveBeenCalled();
    expect(chamadas(fetchMock).find((c) => c.action === 'session.upsert')).toBeUndefined();
    expect(acoes?.ajustesRemotos?.emergency_timeout_s).toBe(90);
  });

  it('confirmação do cuidador (UPDATE em help_requests com acknowledged_at) vira `reconhecimento`', async () => {
    await montarComLicencaAtiva();
    const linha = { id: 'hr-7', beneficiary_id: 'ben-1', kind: 'emergencia', message: 'Dor', created_at: '2026-09-10T15:00:00Z', acknowledged_at: '2026-09-10T15:00:20Z', acknowledged_by: 'u1', escalated_at: null, resolved_at: null };
    await act(async () => {
      // UPDATE sem acknowledged_at (ex.: escalonamento) não conta.
      realtime.handlers.help_requests({ new: { ...linha, acknowledged_at: null, escalated_at: '2026-09-10T15:01:00Z' } });
    });
    expect(screen.getByTestId('reconhecimento').textContent).toBe('-');
    await act(async () => {
      realtime.handlers.help_requests({ new: linha });
      // Aviso de postura reconhecido não é resposta a socorro.
      realtime.handlers.help_requests({ new: { ...linha, id: 'hr-8', kind: 'postura' } });
    });
    expect(screen.getByTestId('reconhecimento').textContent).toBe('hr-7@2026-09-10T15:00:20Z');
  });

  it('só fala real conta em utterances/chars: "Estou bem" (kind sistema) não entra no session.end', async () => {
    const r = await montarComLicencaAtiva();
    await act(async () => {
      emitirFalaDoPaciente('Estou com sede', 'frase');
      emitirFalaDoPaciente('Estou bem', 'sistema');
      await Promise.resolve();
    });
    fetchMock.mockClear();
    licencaMock.status = 'none';
    licencaMock.license = null;
    r.rerender(<CloudProvider><Sonda /></CloudProvider>);
    await waitFor(() => expect(chamadas(fetchMock)).toContainEqual(expect.objectContaining({ action: 'session.end', session_id: 'sess-1', utterances: 1, chars_typed: 'Estou com sede'.length })));
  });

  it('chave recusada (computador desvinculado): fecha tudo e pede reverificação da licença', async () => {
    await montarComLicencaAtiva();
    fetchMock.mockImplementation(async () => ({ ok: false, status: 403, json: async () => ({ error: 'device_revoked' }) }) as unknown as Response);
    await act(async () => {
      emitirFalaDoPaciente('oi', 'texto');
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('vinculo').textContent).toBe('-'));
    expect(licencaMock.reverificar).toHaveBeenCalled();
    expect(removeChannel).toHaveBeenCalled();
  });

  it('licença some (saiu / revogada): encerra a sessão e desliga', async () => {
    const r = await montarComLicencaAtiva();
    fetchMock.mockClear();
    licencaMock.status = 'none';
    licencaMock.license = null;
    r.rerender(<CloudProvider><Sonda /></CloudProvider>);
    await waitFor(() => expect(screen.getByTestId('vinculo').textContent).toBe('-'));
    expect(chamadas(fetchMock)).toContainEqual(expect.objectContaining({ action: 'session.end', session_id: 'sess-1' }));
  });

  it('o heartbeat leva a sessão; se o servidor diz que ela foi encerrada (sessão órfã), abre outra', async () => {
    const original = cloudConfig.heartbeatMs;
    (cloudConfig as { heartbeatMs: number }).heartbeatMs = 60;
    let sessoes = 0;
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) => {
      const corpo = JSON.parse(String(init?.body));
      const resposta = corpo.action === 'session.upsert' ? { ok: true, id: `sess-${++sessoes}` }
        : corpo.action === 'settings.get' ? { settings: null, phrases: [] }
        : corpo.action === 'messages.pending' ? { messages: [] }
        // O job de sessões órfãs encerrou a primeira; as outras seguem abertas.
        : corpo.action === 'heartbeat' ? { ok: true, pending_messages: 0, sessao_aberta: corpo.session_id ? corpo.session_id !== 'sess-1' : undefined }
        : { ok: true };
      return { ok: true, status: 200, json: async () => resposta } as unknown as Response;
    });
    try {
      await montarComLicencaAtiva();
      await waitFor(() => expect(chamadas(fetchMock)).toContainEqual(expect.objectContaining({ action: 'heartbeat', session_id: 'sess-1' })));
      await waitFor(() => expect(sessoes).toBe(2));
      await waitFor(() => expect(chamadas(fetchMock)).toContainEqual(expect.objectContaining({ action: 'heartbeat', session_id: 'sess-2' })));
      // Aberta a nova, não abre uma terceira.
      await new Promise((r) => setTimeout(r, 200));
      expect(sessoes).toBe(2);
    } finally {
      (cloudConfig as { heartbeatMs: number }).heartbeatMs = original;
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

/**
 * Seção "Conectar o celular do cuidador" (pedido de 19/10/2026). O servidor
 * é um `fetch` falso que responde como a desktop-sync; o relógio é falso para
 * a contagem e a consulta de 2 em 2 segundos.
 */

const { nuvem, qrGerados } = vi.hoisted(() => ({
  nuvem: { configurada: true, vinculo: { device_key: 'chave-do-pc' } as { device_key: string } | null },
  qrGerados: [] as string[],
}));

vi.mock('../cloud/CloudContext', () => ({ useCloud: () => nuvem }));
vi.mock('../cloud/config', () => ({
  cloudConfig: {
    url: 'https://abc.supabase.co',
    anonKey: 'anon-123',
    desktopSyncUrl: 'https://abc.supabase.co/functions/v1/desktop-sync',
    siteUrl: 'https://irisflow.ia.br',
  },
  nuvemConfigurada: true,
}));
// O desenho do QR em si é do qrcode-generator; aqui interessa O QUE vai nele.
vi.mock('qrcode-generator', () => ({
  default: () => ({
    addData: (d: string) => qrGerados.push(d),
    make: () => undefined,
    getModuleCount: () => 21,
    isDark: (r: number, c: number) => (r + c) % 2 === 0,
  }),
}));

import { ParearCelular } from './ParearCelular';

const CODIGO_1 = 'Qx7_-k2LmN0pRsTuVwXyZ1a2b3c4d5e6f7g8h9i0jAB';
const CODIGO_2 = 'Zz9_-k2LmN0pRsTuVwXyZ1a2b3c4d5e6f7g8h9i0jAB';

type Resposta = { status: number; corpo: unknown } | 'sem-rede';
let respostas: Record<string, Resposta[]>;
let chamadas: Array<Record<string, unknown>>;

function responder(acao: string, ...lista: Resposta[]) {
  respostas[acao] = [...(respostas[acao] ?? []), ...lista];
}

const fetchFalso = vi.fn(async (_url: string, init?: RequestInit) => {
  const corpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
  chamadas.push(corpo);
  const fila = respostas[String(corpo.action)] ?? [];
  const r = fila.length > 1 ? fila.shift()! : fila[0];
  if (!r || r === 'sem-rede') throw new TypeError('Failed to fetch');
  return { ok: r.status < 300, status: r.status, json: async () => r.corpo } as unknown as Response;
});

const acoes = (nome: string) => chamadas.filter((c) => c.action === nome);
const criado = (id: string, codigo: string, restante = 180) => ({ status: 200, corpo: { ok: true, id, codigo, expira_em: 'x', restante_s: restante, validade_s: 180 } });
const estado = (e: string, extra: Record<string, unknown> = {}) => ({ status: 200, corpo: { ok: true, estado: e, ...extra } });

async function avancar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function mostrarCodigo() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar o código' }));
  });
  await avancar(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 19, 14, 30, 0));
  respostas = {};
  chamadas = [];
  qrGerados.length = 0;
  fetchFalso.mockClear();
  vi.stubGlobal('fetch', fetchFalso);
  nuvem.configurada = true;
  nuvem.vinculo = { device_key: 'chave-do-pc' };
  responder('pairing.cancel', { status: 200, corpo: { ok: true } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Conectar o celular do cuidador', () => {
  it('sem nuvem configurada (app 100% local), a seção nem aparece', () => {
    nuvem.configurada = false;
    const { container } = render(<ParearCelular />);
    expect(container).toBeEmptyDOMElement();
  });

  it('computador sem vínculo: explica o que falta, sem botão e sem chamar o servidor', () => {
    nuvem.vinculo = null;
    render(<ParearCelular />);
    expect(screen.getByText(/precisa estar conectado à conta da família/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('o QR só aparece depois do clique, com o endereço do site e o código no fragmento', async () => {
    responder('pairing.create', criado('id-1', CODIGO_1));
    responder('pairing.status', estado('aguardando', { restante_s: 178 }));
    render(<ParearCelular />);
    expect(screen.queryByTestId('qr-do-celular')).toBeNull();
    expect(fetchFalso).not.toHaveBeenCalled();
    await mostrarCodigo();
    expect(screen.getByTestId('qr-do-celular')).toBeInTheDocument();
    expect(qrGerados.at(-1)).toBe(`https://irisflow.ia.br/parear#t=${CODIGO_1}`);
    expect(screen.getByTestId('tempo-do-codigo')).toHaveTextContent('Vale por mais 3:00.');
    // A chave do computador vai no cabeçalho, e o código nunca volta ao servidor.
    expect((fetchFalso.mock.calls[0][1]?.headers as Record<string, string>)['x-device-key']).toBe('chave-do-pc');
    await avancar(2_000);
    expect(acoes('pairing.status')).toEqual([{ action: 'pairing.status', id: 'id-1' }]);
    expect(JSON.stringify(chamadas)).not.toContain(CODIGO_1);
    expect(screen.getByTestId('tempo-do-codigo')).toHaveTextContent('Vale por mais 2:58.');
  });

  it('celular usou o código e confirmou: "lido às…", depois "Celular conectado às 14:30"', async () => {
    const usado = new Date(2026, 9, 19, 14, 30, 3).toISOString();
    const conectado = new Date(2026, 9, 19, 14, 30, 5).toISOString();
    responder('pairing.create', criado('id-1', CODIGO_1));
    responder('pairing.status', estado('usado', { usado_em: usado }), estado('conectado', { usado_em: usado, conectado_em: conectado }));
    render(<ParearCelular />);
    await mostrarCodigo();
    await avancar(2_000);
    expect(screen.getByRole('status')).toHaveTextContent('O código foi lido às 14:30. Esperando o celular terminar de entrar…');
    expect(screen.queryByTestId('qr-do-celular')).toBeNull();
    await avancar(2_000);
    expect(screen.getByRole('status')).toHaveTextContent('Celular conectado às 14:30.');
    expect(screen.getByText(/troque a senha da conta no site/)).toBeInTheDocument();
    // Conectado: para de perguntar.
    const n = acoes('pairing.status').length;
    await avancar(10_000);
    expect(acoes('pairing.status').length).toBe(n);
  });

  it('usado sem confirmação por 30 s: não afirma que entrou, pede para conferir no celular', async () => {
    responder('pairing.create', criado('id-1', CODIGO_1));
    responder('pairing.status', estado('usado', { usado_em: new Date(2026, 9, 19, 14, 30, 2).toISOString() }));
    render(<ParearCelular />);
    await mostrarCodigo();
    await avancar(2_000);
    expect(screen.getByRole('status')).toHaveTextContent('Esperando o celular terminar de entrar');
    await avancar(31_000);
    expect(screen.getByRole('status')).toHaveTextContent('O código foi usado às 14:30. Confira no celular se ele entrou.');
    expect(screen.queryByText(/Celular conectado/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Gerar outro código' })).toBeInTheDocument();
  });

  it('Fechar cancela o código no servidor na hora', async () => {
    responder('pairing.create', criado('id-1', CODIGO_1));
    responder('pairing.status', estado('aguardando'));
    render(<ParearCelular />);
    await mostrarCodigo();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    });
    await avancar(0);
    expect(acoes('pairing.cancel')).toEqual([{ action: 'pairing.cancel', id: 'id-1' }]);
    expect(screen.queryByTestId('qr-do-celular')).toBeNull();
    expect(screen.getByRole('button', { name: 'Mostrar o código' })).toHaveFocus();
  });

  it('sair da tela com o QR aberto também cancela o código', async () => {
    responder('pairing.create', criado('id-1', CODIGO_1));
    responder('pairing.status', estado('aguardando'));
    const { unmount } = render(<ParearCelular />);
    await mostrarCodigo();
    unmount();
    await avancar(0);
    expect(acoes('pairing.cancel')).toEqual([{ action: 'pairing.cancel', id: 'id-1' }]);
  });

  it('Gerar outro: cancela o anterior e mostra o novo', async () => {
    responder('pairing.create', criado('id-1', CODIGO_1), criado('id-2', CODIGO_2));
    responder('pairing.status', estado('aguardando'));
    render(<ParearCelular />);
    await mostrarCodigo();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Gerar outro' }));
    });
    await avancar(0);
    expect(acoes('pairing.cancel')).toEqual([{ action: 'pairing.cancel', id: 'id-1' }]);
    expect(qrGerados.at(-1)).toBe(`https://irisflow.ia.br/parear#t=${CODIGO_2}`);
    expect(screen.getByRole('button', { name: 'Gerar outro' })).toHaveFocus();
  });

  it('no fim da contagem: cancela no servidor e só então diz que venceu', async () => {
    responder('pairing.create', criado('id-1', CODIGO_1, 5));
    responder('pairing.status', estado('aguardando', { restante_s: 1 }));
    render(<ParearCelular />);
    await mostrarCodigo();
    await avancar(6_000);
    expect(acoes('pairing.cancel')).toEqual([{ action: 'pairing.cancel', id: 'id-1' }]);
    expect(screen.getByText('O código venceu sem ser usado. Gere outro quando o celular estiver por perto.')).toBeInTheDocument();
    expect(screen.queryByTestId('qr-do-celular')).toBeNull();
  });

  it('usado no último segundo: a tela diz que foi usado, não que venceu', async () => {
    responder('pairing.create', criado('id-1', CODIGO_1, 3));
    responder(
      'pairing.status',
      estado('aguardando', { restante_s: 1 }),
      estado('usado', { usado_em: new Date(2026, 9, 19, 14, 30, 2).toISOString() }),
    );
    render(<ParearCelular />);
    await mostrarCodigo();
    await avancar(4_000);
    expect(screen.queryByText(/venceu/)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('O código foi lido às 14:30');
    expect(acoes('pairing.cancel')).toEqual([]);
  });

  it('sem resposta do servidor por mais de 10 s: avisa, e segue tentando', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    responder('pairing.create', criado('id-1', CODIGO_1));
    responder('pairing.status', 'sem-rede');
    render(<ParearCelular />);
    await mostrarCodigo();
    await avancar(8_000);
    expect(screen.queryByText(/Sem conexão para saber se o celular entrou/)).toBeNull();
    await avancar(4_000);
    expect(screen.getByText('Sem conexão para saber se o celular entrou. Tentando de novo…')).toBeInTheDocument();
    await avancar(10_000);
    // Uma linha no console, não uma a cada 2 s.
    expect(aviso.mock.calls.filter((c) => String(c[0]).includes('[pareamento]'))).toHaveLength(1);
    aviso.mockRestore();
  });

  it('código não gerado: o motivo em linguagem de gente e "Tentar de novo"', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    responder('pairing.create', { status: 429, corpo: { error: 'limite', tente_em: new Date(2026, 9, 19, 14, 40).toISOString() } });
    render(<ParearCelular />);
    await mostrarCodigo();
    expect(screen.getByRole('status')).toHaveTextContent('Já foram gerados vários códigos em pouco tempo. Dá para gerar outro a partir das 14:40.');
    expect(screen.queryByTestId('qr-do-celular')).toBeNull();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toHaveFocus();
    aviso.mockRestore();
  });

  it('conta sem e-mail confirmado e computador desvinculado: cada um com o seu texto', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    responder('pairing.create', { status: 409, corpo: { error: 'email_nao_confirmado' } });
    const { unmount } = render(<ParearCelular />);
    await mostrarCodigo();
    expect(screen.getByRole('status')).toHaveTextContent('o e-mail da conta precisa estar confirmado');
    unmount();
    respostas = {};
    responder('pairing.create', { status: 403, corpo: { error: 'device_revoked' } });
    render(<ParearCelular />);
    await mostrarCodigo();
    expect(screen.getByRole('status')).toHaveTextContent('Este computador não está mais conectado à conta da família');
    aviso.mockRestore();
  });
});

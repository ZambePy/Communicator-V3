import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConversationScreen } from './ConversationScreen';
import { _limparOuvintes, ouvir, type EventoDoPaciente } from '../../cloud/eventos';
import type { CloudState, CloudActions } from '../../cloud/CloudContext';
import type { PlanoDasRespostas } from './planoDasRespostas';

// A tela não conhece o Supabase: só lê o contexto e emite eventos.
const estado: Partial<CloudState & CloudActions> = {};
vi.mock('../../cloud/CloudContext', () => ({ useCloud: () => estado }));
// O jsdom não tem layout (tudo mede 0): o plano de verdade mostra todos os
// alvos. Para testar as páginas, um plano fixo entra no lugar.
const planoFixo = vi.hoisted(() => ({ valor: null as PlanoDasRespostas | null }));
vi.mock('./planoDasRespostas', async (importOriginal) => {
  const real = await importOriginal<typeof import('./planoDasRespostas')>();
  return {
    ...real,
    planejarRespostas: (args: Parameters<typeof real.planejarRespostas>[0]) => planoFixo.valor ?? real.planejarRespostas(args),
  };
});
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../../components/ui/GazeButton', () => ({
  GazeButton: ({ children, onClick, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { width?: number; height?: number }) => {
    const { width: _w, height: _h, ...attrs } = rest;
    return <button onClick={onClick} {...attrs}>{children}</button>;
  },
}));

const base = (): Partial<CloudState & CloudActions> => ({
  configurada: true,
  online: true,
  realtime: 'conectado',
  filaPendente: 0,
  frasesRemotas: [],
  mensagens: [],
  vinculo: { device_id: 'd', device_key: 'k', beneficiary_id: 'b', beneficiary_name: 'Carlos', email: 'a@b.c', pareado_em: '' },
  carregarConversa: vi.fn(async () => {}),
  repetirUltimaMensagem: vi.fn(),
});

describe('ConversationScreen', () => {
  beforeEach(() => {
    _limparOuvintes();
    planoFixo.valor = null;
    for (const k of Object.keys(estado)) delete (estado as Record<string, unknown>)[k];
    vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() });
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  });

  it('sem nuvem configurada explica o que falta, sem botão de login', () => {
    Object.assign(estado, base(), { configurada: false, vinculo: null });
    render(<MemoryRouter><ConversationScreen /></MemoryRouter>);
    expect(screen.getByText(/precisa da conta IrisFlow configurada/i)).toBeInTheDocument();
    expect(screen.queryByText(/Entrar com a conta/)).toBeNull();
  });

  it('configurada mas sem vínculo oferece o login', () => {
    Object.assign(estado, base(), { vinculo: null });
    render(<MemoryRouter><ConversationScreen /></MemoryRouter>);
    expect(screen.getByText(/Entrar com a conta/)).toBeInTheDocument();
  });

  it('mostra as mensagens dos dois lados e "Sim" vai para o cuidador como simnao', () => {
    Object.assign(estado, base(), {
      mensagens: [
        { id: '1', beneficiary_id: 'b', sender: 'cuidador', kind: 'texto', text: 'Quer água?', created_at: new Date().toISOString(), read_at: null, spoken: true },
        { id: '2', beneficiary_id: 'b', sender: 'paciente', kind: 'frase', text: 'Sim, por favor', created_at: new Date().toISOString(), read_at: null, spoken: true },
      ],
    });
    const recebidos: EventoDoPaciente[] = [];
    ouvir((e) => recebidos.push(e));
    render(<MemoryRouter><ConversationScreen /></MemoryRouter>);
    expect(screen.getByText('Quer água?')).toBeInTheDocument();
    expect(screen.getByText('Sim, por favor')).toBeInTheDocument();
    expect(estado.carregarConversa).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Sim'));
    expect(recebidos).toEqual([{ tipo: 'fala', texto: 'Sim', kind: 'simnao' }]);
  });

  it('usa as frases rápidas do cuidador quando existem', () => {
    Object.assign(estado, base(), {
      frasesRemotas: [{ id: 'f1', beneficiary_id: 'b', text: 'Quero ver TV', category: 'conforto', position: 0 }],
    });
    render(<MemoryRouter><ConversationScreen /></MemoryRouter>);
    expect(screen.getByText(/Quero ver TV/)).toBeInTheDocument();
    expect(screen.queryByText(/Estou com sede/)).toBeNull();
  });

  it('"Repetir" pede a última mensagem em voz alta', () => {
    Object.assign(estado, base());
    render(<MemoryRouter><ConversationScreen /></MemoryRouter>);
    fireEvent.click(screen.getByLabelText(/Repetir a última mensagem/));
    expect(estado.repetirUltimaMensagem).toHaveBeenCalled();
  });

  it('sem espaço para tudo: Escrever fica, as frases viram páginas e "Mais" passa de página', () => {
    Object.assign(estado, base());
    // O caso da tela com a faixa do tutorial e a dica abertas: uma linha de 4.
    planoFixo.valor = { alturaTopo: 218, colunas: 4, linhas: 1, porPagina: 2, fixos: 1 };
    render(<MemoryRouter><ConversationScreen /></MemoryRouter>);

    expect(screen.getByText('Sim')).toBeInTheDocument();
    expect(screen.getByText('Não')).toBeInTheDocument();
    expect(screen.getByText('Escrever')).toBeInTheDocument();
    expect(screen.getByText('Estou bem')).toBeInTheDocument();
    expect(screen.getByText('Preciso de ajuda')).toBeInTheDocument();
    expect(screen.queryByText('Obrigado')).toBeNull();

    // Seis frases + Repetir, duas por página: quatro páginas.
    fireEvent.click(screen.getByLabelText('Mais respostas, página 1 de 4'));
    expect(screen.getByText('Obrigado')).toBeInTheDocument();
    expect(screen.queryByText('Estou bem')).toBeNull();
    expect(screen.getByText('Escrever')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Mais respostas, página 2 de 4'));
    fireEvent.click(screen.getByLabelText('Mais respostas, página 3 de 4'));
    expect(screen.getByLabelText(/Repetir a última mensagem/)).toBeInTheDocument();

    // Da última volta para a primeira.
    fireEvent.click(screen.getByLabelText('Mais respostas, página 4 de 4'));
    expect(screen.getByText('Estou bem')).toBeInTheDocument();
  });
});

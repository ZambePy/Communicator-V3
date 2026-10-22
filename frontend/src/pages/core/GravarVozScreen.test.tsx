import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Guardar a própria voz (pedido de 19/10/2026): o termo antes de tudo, gravar,
// conferir em palavras simples, guardar — e as decisões do cuidador.

const TAXA = 16000;
/** Uma "voz" sintética entre silêncios (a mesma ideia do teste da checagem). */
function voz(pico = 0.5, falaS = 1.2): Float32Array {
  const antes = Math.round(0.4 * TAXA);
  const fala = Math.round(falaS * TAXA);
  const a = new Float32Array(antes + fala + Math.round(0.8 * TAXA));
  for (let i = 0; i < a.length; i++) a[i] = ((i * 7919) % 13) / 13e4 - 0.00005;
  for (let i = 0; i < fala; i++) {
    const t = i / TAXA;
    a[antes + i] += pico * Math.sin(Math.PI * 4 * t) ** 2 * (0.6 * Math.sin(2 * Math.PI * 140 * t) + 0.4 * Math.sin(2 * Math.PI * 280 * t));
  }
  return a;
}

let proximoAudio: Float32Array | null = voz();
let falhaDoMicrofone: string | null = null;
const fecharMicrofone = vi.fn();
vi.mock('../../services/voz/vozGuardada/gravador', async (original) => ({
  ...(await original<typeof import('../../services/voz/vozGuardada/gravador')>()),
  abrirMicrofone: async () => (falhaDoMicrofone ? { ok: false, motivo: falhaDoMicrofone } : { ok: true, stream: { getTracks: () => [] } }),
  fecharMicrofone: (s: unknown) => fecharMicrofone(s),
  iniciarGravacao: () => ({
    parar: async () => (proximoAudio ? { amostras: proximoAudio, taxa: TAXA } : null),
    cancelar: () => {},
  }),
}));
const tocarWav = vi.fn(async (_w: ArrayBuffer) => {});
vi.mock('../../services/voz/local', () => ({ tocarWav: (w: ArrayBuffer) => tocarWav(w) }));
let liberada = true;
let estadoDaVoz: { disponivel: boolean; voz: { importada: boolean } } | null = null;
vi.mock('../../services/voz', () => ({
  pararFala: () => {},
  falar: async () => ({ origem: 'sistema' }),
  useEstadoDaVoz: () => estadoDaVoz,
  vozClonadaLiberadaPelaLicenca: () => liberada,
}));
vi.mock('../settings/VozScreen', () => ({ TERMO_DE_CONSENTIMENTO: 'TERMO DA VOZ PERSONALIZADA — declaro que a voz é do próprio paciente.' }));
let perfilAtual = 'p1';
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: perfilAtual } }) }));
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children, subtitulo }: { children: React.ReactNode; subtitulo?: string }) => <div><p data-testid="subtitulo">{subtitulo}</p>{children}</div>,
}));

// O armazém de verdade (na memória), com a porta da voz clonada simulada.
const usarComoReferencia = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, duracaoS: 14, qualidade: 'aceitavel' as const, avisos: [] }));
let comPortaDaVozClonada = false;
vi.mock('../../services/voz/vozGuardada/armazem', async (original) => {
  const real = await original<typeof import('../../services/voz/vozGuardada/armazem')>();
  return {
    ...real,
    armazemDaVozGuardada: () => {
      const a = real.armazemDaVozGuardada();
      return comPortaDaVozClonada ? { ...a, onde: 'computador' as const, usarComoReferencia } : a;
    },
  };
});

const { GravarVozScreen, nivelEmFracao } = await import('./GravarVozScreen');
const { armazemDaVozGuardada, _zerarArmazemDaMemoria } = await import('../../services/voz/vozGuardada/armazem');
const { TERMO_DA_VOZ_GUARDADA, FRASES_PARA_GUARDAR } = await import('../../services/voz/vozGuardada/frases');

const arvore = () => (
  <MemoryRouter initialEntries={['/minha-voz/gravar']}>
    <Routes>
      <Route path="/minha-voz/gravar" element={<GravarVozScreen />} />
      <Route path="/minha-voz" element={<p>mensagens guardadas</p>} />
    </Routes>
  </MemoryRouter>
);
const montar = () => render(arvore());
const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome });
const consentirAntes = (perfilId = 'p1') =>
  armazemDaVozGuardada().consentir({ texto: TERMO_DA_VOZ_GUARDADA, aceitoEm: new Date().toISOString(), perfilId });

async function gravarEParar() {
  fireEvent.click(botao(/^Gravar$|^Gravar de novo$/));
  fireEvent.click(await screen.findByRole('button', { name: 'Parar a gravação' }));
  await screen.findByRole('button', { name: 'Ouvir a gravação' });
}

describe('Gravar a minha voz', () => {
  beforeEach(() => {
    _zerarArmazemDaMemoria();
    localStorage.clear();
    proximoAudio = voz();
    falhaDoMicrofone = null;
    liberada = true;
    estadoDaVoz = null;
    comPortaDaVozClonada = false;
    perfilAtual = 'p1';
    tocarWav.mockClear();
    usarComoReferencia.mockClear();
  });

  it('o termo vem antes de tudo; "Concordo" registra e abre a primeira frase', async () => {
    montar();
    expect(await screen.findByText(TERMO_DA_VOZ_GUARDADA.split('\n\n')[0])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gravar' })).toBeNull();
    fireEvent.click(botao('Concordo e quero gravar'));
    expect(await screen.findByTestId('frase-para-gravar')).toHaveTextContent(FRASES_PARA_GUARDAR[0]);
    const l = await armazemDaVozGuardada().listar();
    expect(l.ok && l.consentimentos.map((c) => [c.perfilId, c.texto])).toEqual([['p1', TERMO_DA_VOZ_GUARDADA]]);
    expect(screen.getByTestId('subtitulo')).toHaveTextContent(/^Frase 1 de \d+$/);
  });

  // Revisão de segurança de 20/10/2026: a tela ia direto para gravar se
  // QUALQUER perfil do computador tivesse aceitado o termo.
  it('o termo é de cada paciente: com o "Concordo" só de outro perfil, a tela pede o termo a este', async () => {
    await consentirAntes('p2');
    montar();
    expect(await screen.findByText(TERMO_DA_VOZ_GUARDADA.split('\n\n')[0])).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gravar' })).toBeNull();
    expect(screen.queryByTestId('frase-para-gravar')).toBeNull();
    fireEvent.click(botao('Concordo e quero gravar'));
    await screen.findByTestId('frase-para-gravar');
    // O aceite deste paciente não apaga o do outro.
    const l = await armazemDaVozGuardada().listar();
    expect(l.ok && l.consentimentos.map((c) => c.perfilId).sort()).toEqual(['p1', 'p2']);
  });

  it('trocar de paciente com a tela aberta: o novo vê o termo na hora, sem herdar o "Concordo" do anterior', async () => {
    await consentirAntes('p1');
    const { rerender } = montar();
    await screen.findByTestId('frase-para-gravar');
    perfilAtual = 'p2';
    rerender(arvore());
    expect(screen.queryByTestId('frase-para-gravar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Gravar' })).toBeNull();
    expect(await screen.findByText(TERMO_DA_VOZ_GUARDADA.split('\n\n')[0])).toBeInTheDocument();
  });

  it('"Agora não" volta sem gravar nada', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(screen.getByText('mensagens guardadas')).toBeInTheDocument();
  });

  it('grava, confere ("Ficou boa!"), deixa ouvir e guarda; depois a frase aparece como guardada', async () => {
    await consentirAntes();
    montar();
    await screen.findByTestId('frase-para-gravar');
    await gravarEParar();
    expect(screen.getByRole('status')).toHaveTextContent('Ficou boa!');
    fireEvent.click(botao('Ouvir a gravação'));
    expect(tocarWav).toHaveBeenCalledTimes(1);
    fireEvent.click(botao('Guardar'));
    expect(await screen.findByText('✓ Já guardada')).toBeInTheDocument();
    const l = await armazemDaVozGuardada().listar();
    expect(l.ok && l.gravacoes.map((g) => [g.texto, g.qualidade, g.perfilId])).toEqual([[FRASES_PARA_GUARDAR[0], 'boa', 'p1']]);
    // O microfone fecha depois de cada gravação (a luz dele não fica acesa).
    expect(fecharMicrofone).toHaveBeenCalled();
    expect(botao('Ouvir a gravação guardada')).toBeInTheDocument();
  });

  it('gravação sem voz: diz o que houve, sugere gravar de novo — e ainda deixa guardar', async () => {
    proximoAudio = new Float32Array(TAXA * 2);
    await consentirAntes();
    montar();
    await screen.findByTestId('frase-para-gravar');
    await gravarEParar();
    expect(screen.getByRole('status')).toHaveTextContent('Não ouvi a sua voz.');
    expect(botao('Gravar de novo').className).toContain('gaze-button--primaria');
    expect(botao('Guardar assim mesmo')).toBeInTheDocument();
  });

  it('volume baixo é dito em palavras simples', async () => {
    proximoAudio = voz(0.01);
    await consentirAntes();
    montar();
    await screen.findByTestId('frase-para-gravar');
    await gravarEParar();
    expect(screen.getByRole('status')).toHaveTextContent('Ficou baixinho.');
  });

  it('microfone bloqueado: explica o que fazer, sem fingir que gravou', async () => {
    falhaDoMicrofone = 'negado';
    await consentirAntes();
    montar();
    await screen.findByTestId('frase-para-gravar');
    fireEvent.click(botao('Gravar'));
    expect(await screen.findByText(/microfone está bloqueado/)).toBeInTheDocument();
    expect(botao('Gravar')).toBeInTheDocument();
  });

  it('o cuidador acrescenta uma frase própria e a tela vai para ela', async () => {
    await consentirAntes();
    montar();
    await screen.findByTestId('frase-para-gravar');
    fireEvent.change(screen.getByLabelText('Frase própria'), { target: { value: 'Oi, Joana, que saudade!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar' }));
    expect(screen.getByTestId('frase-para-gravar')).toHaveTextContent('Oi, Joana, que saudade!');
    expect(JSON.parse(localStorage.getItem('irisflow.vozGuardada.frasesProprias.p1') ?? '[]')).toEqual(['Oi, Joana, que saudade!']);
    // Os controles do cuidador não são alvos do olhar.
    expect(screen.getByRole('button', { name: 'Acrescentar' })).toHaveAttribute('data-no-dwell', 'true');
  });

  it('gravar e tocar valem sem o plano Voz; o plano só aparece numa linha', async () => {
    liberada = false;
    await consentirAntes();
    montar();
    await screen.findByTestId('frase-para-gravar');
    expect(screen.getByTestId('linha-do-plano')).toHaveTextContent(/sempre grátis.*plano Voz/);
    await gravarEParar();
    fireEvent.click(botao('Guardar'));
    expect(await screen.findByText('✓ Já guardada')).toBeInTheDocument();
    // Sem o plano, não oferece virar a base da voz do computador.
    expect(screen.queryByRole('button', { name: /base da voz do computador/ })).toBeNull();
  });

  it('virar a base da voz do computador: decisão do cuidador, com o termo da voz personalizada', async () => {
    comPortaDaVozClonada = true;
    estadoDaVoz = { disponivel: true, voz: { importada: true } };
    // Fala de 3 s: acima dos 2 s que o motor exige de uma referência.
    proximoAudio = voz(0.5, 3);
    await consentirAntes();
    montar();
    await screen.findByTestId('frase-para-gravar');
    await gravarEParar();
    fireEvent.click(botao('Guardar'));
    await screen.findByText('✓ Já guardada');
    fireEvent.click(screen.getByRole('button', { name: 'Usar como base da voz do computador' }));
    expect(screen.getByText(/TERMO DA VOZ PERSONALIZADA/)).toBeInTheDocument();
    expect(screen.getByText(/troca a voz do computador que está em uso/)).toBeInTheDocument();
    const usar = screen.getByRole('button', { name: 'Usar esta gravação' });
    expect(usar).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(usar);
    await waitFor(() => expect(usarComoReferencia).toHaveBeenCalledTimes(1));
    expect(usarComoReferencia.mock.calls[0][1]).toMatchObject({ texto: expect.stringContaining('TERMO DA VOZ PERSONALIZADA'), perfilId: 'p1' });
    expect(await screen.findByText(/é a base da voz do computador/)).toBeInTheDocument();
  });

  it('gravação curta demais para base (menos de 2 s) não é oferecida — e a tela diz por quê', async () => {
    comPortaDaVozClonada = true;
    estadoDaVoz = { disponivel: true, voz: { importada: false } };
    proximoAudio = voz(0.5, 1.2);
    await consentirAntes();
    montar();
    await screen.findByTestId('frase-para-gravar');
    await gravarEParar();
    fireEvent.click(botao('Guardar'));
    await screen.findByText('✓ Já guardada');
    const l = await armazemDaVozGuardada().listar();
    expect(l.ok && l.gravacoes[0].duracaoS).toBeLessThan(2);
    expect(screen.queryByRole('button', { name: 'Usar como base da voz do computador' })).toBeNull();
    expect(screen.getByText(/precisa ter pelo menos 2 segundos/)).toBeInTheDocument();
    expect(usarComoReferencia).not.toHaveBeenCalled();
  });

  it('apagar uma gravação pede confirmação (decisão de mouse, nunca de um olhar parado)', async () => {
    await consentirAntes();
    montar();
    await screen.findByTestId('frase-para-gravar');
    await gravarEParar();
    fireEvent.click(botao('Guardar'));
    await screen.findByText('✓ Já guardada');
    fireEvent.click(screen.getByRole('button', { name: 'Apagar esta gravação' }));
    const confirmar = await screen.findByRole('button', { name: 'Apagar gravação' });
    expect(confirmar).toHaveAttribute('data-no-dwell', 'true');
    await act(async () => { fireEvent.click(confirmar); });
    expect(await screen.findByText('Ainda não gravada')).toBeInTheDocument();
  });

  it('apagar todas as gravações: decisão do cuidador, com confirmação', async () => {
    await consentirAntes();
    montar();
    await screen.findByTestId('frase-para-gravar');
    await gravarEParar();
    fireEvent.click(botao('Guardar'));
    await screen.findByText('✓ Já guardada');
    fireEvent.click(screen.getByRole('button', { name: /Apagar todas as gravações \(1\)/ }));
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Apagar todas' })); });
    expect(await screen.findByText('Ainda não gravada')).toBeInTheDocument();
    const l = await armazemDaVozGuardada().listar();
    expect(l.ok && l.gravacoes).toEqual([]);
  });

  it('medidor: -60 dBFS vazio, -10 dBFS cheio', () => {
    expect(nivelEmFracao(0)).toBe(0);
    expect(nivelEmFracao(0.001)).toBe(0);
    expect(nivelEmFracao(0.316)).toBeCloseTo(1, 1);
    expect(nivelEmFracao(0.01)).toBeCloseTo(0.4, 1);
  });
});

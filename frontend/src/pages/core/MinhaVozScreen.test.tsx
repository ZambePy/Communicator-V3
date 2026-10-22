import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Minha voz → mensagens guardadas (pedido de 19/10/2026): a voz da própria
// pessoa, tocada com um olhar, que vai para o histórico e para o celular
// como qualquer frase.

const tocarMensagemGuardada = vi.fn(async (..._a: unknown[]) => ({ como: 'gravacao' }) as { como: string; motivo?: string });
vi.mock('../../services/voz/vozGuardada/tocar', () => ({ tocarMensagemGuardada: (...a: unknown[]) => tocarMensagemGuardada(...a) }));
let liberada = false;
vi.mock('../../services/voz', () => ({ vozClonadaLiberadaPelaLicenca: () => liberada }));
const emitirFalaDoPaciente = vi.fn();
vi.mock('../../cloud/eventos', () => ({ emitirFalaDoPaciente: (...a: unknown[]) => emitirFalaDoPaciente(...a) }));
const logSentence = vi.fn();
vi.mock('../../utils/clinicalLogger', () => ({ logSentence: (t: string) => logSentence(t) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: 'p1' } }) }));
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children, subtitulo }: { children: React.ReactNode; subtitulo?: string }) => <div><p data-testid="subtitulo">{subtitulo}</p>{children}</div>,
}));

const { MinhaVozScreen, paginasDasMensagens, linhaDoPlano } = await import('./MinhaVozScreen');
const { armazemDaVozGuardada, _zerarArmazemDaMemoria } = await import('../../services/voz/vozGuardada/armazem');
const { codificarWav } = await import('../../services/voz/vozGuardada/wav');
const { TERMO_DA_VOZ_GUARDADA } = await import('../../services/voz/vozGuardada/frases');

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function guardar(textos: string[], perfilId: string | null = 'p1') {
  const a = armazemDaVozGuardada();
  await a.consentir({ texto: TERMO_DA_VOZ_GUARDADA, aceitoEm: new Date().toISOString(), perfilId });
  for (const [i, texto] of textos.entries()) {
    await a.salvar({ id: uuid(i + 1), texto, wav: codificarWav(new Float32Array(160), 16000), duracaoS: 1, qualidade: 'boa', perfilId });
    // Datas distintas: a lista mostra na ordem em que foram gravadas.
    await new Promise((r) => setTimeout(r, 2));
  }
}

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/minha-voz']}>
      <Routes>
        <Route path="/minha-voz" element={<MinhaVozScreen />} />
        <Route path="/minha-voz/gravar" element={<p>tela de gravar</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('páginas das mensagens', () => {
  it('até 5 mensagens: todas numa página, com "Gravar frases" no fim', () => {
    expect(paginasDasMensagens(0)).toEqual([[{ tipo: 'gravar' }]]);
    expect(paginasDasMensagens(5)[0]).toHaveLength(6);
    expect(paginasDasMensagens(5)).toHaveLength(1);
  });

  it('mais de 5: 4 por página, "Mais" e "Gravar" sempre nos mesmos dois lugares; a última volta à primeira', () => {
    const p = paginasDasMensagens(9);
    expect(p).toHaveLength(3);
    for (const pagina of p) {
      expect(pagina[pagina.length - 1]).toEqual({ tipo: 'gravar' });
      expect(pagina[pagina.length - 2].tipo).toBe('mais');
    }
    expect(p[2][0]).toEqual({ tipo: 'mensagem', indice: 8 });
    expect(p[2][1]).toEqual({ tipo: 'mais', proxima: 0, total: 3 });
  });
});

describe('Minha voz', () => {
  beforeEach(() => {
    _zerarArmazemDaMemoria();
    tocarMensagemGuardada.mockClear();
    tocarMensagemGuardada.mockImplementation(async () => ({ como: 'gravacao' }));
    emitirFalaDoPaciente.mockClear();
    logSentence.mockClear();
    liberada = false;
  });

  it('sem mensagens: explica e leva a gravar', async () => {
    montar();
    expect(await screen.findByText('Ainda não há mensagens guardadas.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Começar a gravar' }));
    expect(screen.getByText('tela de gravar')).toBeInTheDocument();
  });

  it('tocar uma mensagem: na voz guardada, e vai para o histórico e para o celular como frase', async () => {
    await guardar(['Bom dia!', 'Eu te amo.']);
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Tocar: Eu te amo.' }));
    await act(async () => { await Promise.resolve(); });
    expect(tocarMensagemGuardada).toHaveBeenCalledWith(expect.objectContaining({ texto: 'Eu te amo.' }), expect.anything());
    expect(emitirFalaDoPaciente).toHaveBeenCalledWith('Eu te amo.', 'frase');
    expect(logSentence).toHaveBeenCalledWith('Eu te amo.');
    // Na ordem em que foram gravadas.
    const nomes = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(nomes).toEqual(['Tocar: Bom dia!', 'Tocar: Eu te amo.', 'Gravar frases com a minha voz']);
  });

  it('gravação que não abriu: diz que falou com a voz do computador', async () => {
    tocarMensagemGuardada.mockImplementation(async () => ({ como: 'voz_do_computador', motivo: 'sumiu' }));
    await guardar(['Sim.']);
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Tocar: Sim.' }));
    expect(await screen.findByText(/falei a frase com a voz do computador/)).toBeInTheDocument();
  });

  it('mensagens de outro paciente não aparecem', async () => {
    await guardar(['Frase da outra pessoa.'], 'p2');
    montar();
    expect(await screen.findByText('Ainda não há mensagens guardadas.')).toBeInTheDocument();
  });

  it('a linha do plano é calma e informativa; gravar é sempre grátis', async () => {
    montar();
    await screen.findByText('Ainda não há mensagens guardadas.');
    expect(screen.getByTestId('linha-do-plano')).toHaveTextContent(/sempre grátis.*plano Voz/);
    expect(linhaDoPlano(true)).toMatch(/sempre grátis.*inclui a voz do computador/);
    // Nada de botão de compra ou de bloqueio na tela.
    expect(screen.queryByRole('button', { name: /assinar|comprar|plano/i })).toBeNull();
    // Fora do app instalado, diz que é só até fechar.
    expect(screen.getByText(/ficam só até fechar o IrisFlow/)).toBeInTheDocument();
  });
});

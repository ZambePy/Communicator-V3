import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Revisão de UX de 20/10/2026, achado 2: a gravação que NÃO foi guardada (e o
// "Ouvir" que não tocou) precisa aparecer na tela. A falha volta para a
// revisão, e o resumo dela ("Ficou boa!") tomava o lugar do aviso. Estes são
// os testes de reprodução da revisão, que afirmavam o defeito; aqui afirmam a
// correção.

const TAXA = 16000;
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

vi.mock('../../services/voz/vozGuardada/gravador', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  abrirMicrofone: async () => ({ ok: true, stream: { getTracks: () => [] } }),
  fecharMicrofone: () => {},
  iniciarGravacao: () => ({ parar: async () => ({ amostras: voz(), taxa: TAXA }), cancelar: () => {} }),
}));
const tocarWav = vi.fn(async (_w: ArrayBuffer): Promise<boolean> => true);
vi.mock('../../services/voz/local', () => ({ tocarWav: (w: ArrayBuffer) => tocarWav(w) }));
vi.mock('../../services/voz', () => ({
  pararFala: () => {},
  falar: async () => ({ origem: 'sistema' }),
  useEstadoDaVoz: () => null,
  vozClonadaLiberadaPelaLicenca: () => true,
}));
vi.mock('../settings/VozScreen', () => ({ TERMO_DE_CONSENTIMENTO: 'TERMO' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: 'p1' } }) }));
vi.mock('../../components/ui/GazePageLayout', () => ({
  GazePageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Armazém da memória, com o "salvar" falhando como o do app instalado falha
// (disco cheio, limite de 300 gravações, IPC rejeitado).
let salvarFalha: string | null = null;
vi.mock('../../services/voz/vozGuardada/armazem', async (original) => {
  const real = await original<typeof import('../../services/voz/vozGuardada/armazem')>();
  return {
    ...real,
    armazemDaVozGuardada: () => {
      const a = real.armazemDaVozGuardada();
      return {
        ...a,
        salvar: async (p: Parameters<typeof a.salvar>[0]) => (salvarFalha ? { ok: false as const, erro: salvarFalha } : a.salvar(p)),
      };
    },
  };
});

const { GravarVozScreen } = await import('./GravarVozScreen');
const { armazemDaVozGuardada, _zerarArmazemDaMemoria } = await import('../../services/voz/vozGuardada/armazem');
const { TERMO_DA_VOZ_GUARDADA } = await import('../../services/voz/vozGuardada/frases');

const montar = () =>
  render(
    <MemoryRouter initialEntries={['/minha-voz/gravar']}>
      <Routes>
        <Route path="/minha-voz/gravar" element={<GravarVozScreen />} />
      </Routes>
    </MemoryRouter>,
  );
const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome });

async function gravarUmaFrase() {
  await screen.findByTestId('frase-para-gravar');
  fireEvent.click(botao('Gravar'));
  fireEvent.click(await screen.findByRole('button', { name: 'Parar a gravação' }));
  await screen.findByRole('button', { name: 'Ouvir a gravação' });
}

/** As linhas do status, na ordem em que aparecem (a primeira é a grande). */
const linhasDoStatus = () => Array.from(screen.getByRole('status').querySelectorAll('p')).map((p) => p.textContent ?? '');

describe('achado 2 — falhas da gravação aparecem na revisão', () => {
  beforeEach(async () => {
    _zerarArmazemDaMemoria();
    salvarFalha = null;
    tocarWav.mockReset();
    tocarWav.mockImplementation(async () => true);
    await armazemDaVozGuardada().consentir({ texto: TERMO_DA_VOZ_GUARDADA, aceitoEm: new Date().toISOString(), perfilId: 'p1' });
  });

  it('"Guardar" que falha: o erro vem primeiro, em destaque, e a revisão continua lá', async () => {
    salvarFalha = 'Já há 300 gravações guardadas. Apague alguma para gravar outra.';
    montar();
    await gravarUmaFrase();
    await act(async () => { fireEvent.click(botao('Guardar')); await new Promise((r) => setTimeout(r, 20)); });
    // Voltou para a revisão (os botões de antes estão lá)...
    expect(botao('Guardar')).toBeInTheDocument();
    // ...com o erro na linha grande, antes do resumo da gravação.
    const linhas = linhasDoStatus();
    expect(linhas[0]).toBe(salvarFalha);
    expect(linhas.slice(1).join(' ')).toContain('Ficou boa!');
    const primeira = screen.getByRole('status').querySelector('p')!;
    expect(primeira.style.fontWeight).toBe('800');
    expect(primeira.style.color).toBe('var(--tint-warn-text)');
    // E nada foi guardado:
    const l = await armazemDaVozGuardada().listar();
    expect(l.ok && l.gravacoes).toEqual([]);
  });

  it('"Ouvir" a gravação nova que não toca: a tela diz, em destaque', async () => {
    tocarWav.mockImplementation(async () => { throw new Error('decode falhou'); });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    montar();
    await gravarUmaFrase();
    await act(async () => { fireEvent.click(botao('Ouvir a gravação')); await new Promise((r) => setTimeout(r, 20)); });
    expect(linhasDoStatus()[0]).toBe('Não consegui tocar a gravação agora.');
    // A falha também vai para o console (uma vez por falha).
    expect(aviso.mock.calls.filter((c) => String(c[0]).includes('[voz-guardada]'))).toHaveLength(1);
    aviso.mockRestore();
  });

  it('sem falha, a revisão é a de sempre (o resumo na linha grande)', async () => {
    montar();
    await gravarUmaFrase();
    expect(linhasDoStatus()[0]).toContain('Ficou boa!');
  });
});

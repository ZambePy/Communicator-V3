import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { EstadoDoMotorDeVoz } from '@tracker/voz/protocolo';

const estadoMock = vi.hoisted(() => ({ atual: null as EstadoDoMotorDeVoz | null }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
const ponteMock = vi.hoisted(() => ({
  importar: vi.fn(async () => ({ ok: true as const, duracaoS: 22, qualidade: 'boa' as const, avisos: ['Áudio longo: foram usados os melhores ~12 s.'] })),
  remover: vi.fn(async () => {}),
  baixarModelo: vi.fn(async () => ({ ok: true })),
  ativar: vi.fn(async () => {}),
  sintetizar: vi.fn(),
  sondar: vi.fn(async () => estadoMock.atual),
  estado: vi.fn(),
  onEstado: vi.fn(() => () => {}),
}));

vi.mock('../../services/voz', () => ({
  useEstadoDaVoz: () => estadoMock.atual,
  vozClonadaLiberadaPelaLicenca: () => true,
  aquecerCache: vi.fn(async () => 3),
}));
vi.mock('../../services/voz/local', () => ({
  ponteDaVoz: () => ponteMock,
  falarComVozClonada: vi.fn(async () => ({ ok: true, deCache: true, ms: 0 })),
}));
vi.mock('../../services/voz/sistema', () => ({ falarComVozDoSistema: vi.fn(async () => {}) }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ currentProfile: { id: 'perfil-1' } }) }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ settings: { voiceGender: 'female' }, updateSettings: vi.fn() }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => toastMock }));
// A preparação do cache só lê destas telas as listas de textos. As telas de verdade
// são pesadas de carregar (o `import()` passa dos 5 s de um teste numa máquina
// ocupada): falsos, com duas frases cada. Os textos do quarto (`frasesDoHospital`)
// ficam de verdade: são o que o teste confere.
vi.mock('../QuickPhrasesScreen', () => ({ TEXTOS_DAS_FRASES_RAPIDAS: ['Preciso de ajuda.', 'Obrigado.'] }));
vi.mock('../core/PictogramScreen', () => ({ TEXTOS_DOS_PICTOGRAMAS: ['Quero água.', 'Estou com dor.'] }));

import { VozScreen, TERMO_DE_CONSENTIMENTO } from './VozScreen';
import { aquecerCache } from '../../services/voz';

const semVoz = (): EstadoDoMotorDeVoz => ({
  disponivel: true,
  motor: 'parado',
  modelo: { baixado: false, baixando: false, progresso: null },
  dispositivo: null,
  voz: { importada: false },
  ativa: false,
  cache: { itens: 0, mb: 0 },
  sintetizando: false,
});

const montar = () => render(<MemoryRouter><VozScreen /></MemoryRouter>);

describe('VozScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estadoMock.atual = semVoz();
  });

  it('sem modelo oferece o download; sem voz oferece importar', () => {
    montar();
    expect(screen.getByText(/Baixar o modelo agora/)).toBeInTheDocument();
    expect(screen.getByText(/Importar áudio da voz/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Baixar o modelo agora/));
    expect(ponteMock.baixarModelo).toHaveBeenCalled();
  });

  it('a importação só acontece depois de aceitar o termo, e leva o termo junto', async () => {
    montar();
    fireEvent.click(screen.getByText(/Importar áudio da voz/));
    expect(screen.getByText(/Termo de consentimento/)).toBeInTheDocument();
    const confirmar = screen.getByText(/Aceitar e escolher o arquivo/).closest('button')!;
    expect(confirmar).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Li e aceito o termo/));
    expect(confirmar).not.toBeDisabled();
    fireEvent.click(confirmar);
    await waitFor(() => expect(ponteMock.importar).toHaveBeenCalled());
    const arg = ponteMock.importar.mock.calls[0][0] as { texto: string; aceitoEm: string; perfilId: string | null };
    expect(arg.texto).toBe(TERMO_DE_CONSENTIMENTO);
    expect(arg.perfilId).toBe('perfil-1');
    expect(new Date(arg.aceitoEm).getTime()).toBeGreaterThan(0);
    expect(await screen.findByText(/Voz importada: 22 s de fala útil, qualidade boa/)).toBeInTheDocument();
  });

  it('com voz importada mostra qualidade, liga/desliga e permite remover (com confirmação)', async () => {
    estadoMock.atual = { ...semVoz(), modelo: { baixado: true, baixando: false, progresso: null }, motor: 'pronto', dispositivo: 'cpu', voz: { importada: true, duracaoS: 18, qualidade: 'aceitavel', nomeDoArquivo: 'voz.opus', consentimentoEm: '2026-09-09T00:00:00Z' }, ativa: true };
    montar();
    expect(screen.getByText('Aceitável')).toBeInTheDocument();
    expect(screen.getByText('voz.opus')).toBeInTheDocument();
    const toggle = screen.getByLabelText(/Usar a voz clonada/) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(ponteMock.ativar).toHaveBeenCalledWith(false);

    // A confirmação agora é um diálogo do próprio app (o `confirm` nativo fica
    // fora da árvore do documento e o olhar não o alcança). Cancelar não apaga.
    fireEvent.click(screen.getByText(/Remover voz/));
    fireEvent.click(await screen.findByText('Cancelar'));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(ponteMock.remover).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(/Remover voz/));
    fireEvent.click(await screen.findByText('Remover a voz'));
    await waitFor(() => expect(ponteMock.remover).toHaveBeenCalled());
  });

  // Modo hospital (rodada 3, 21/10/2026): com a voz clonada, uma frase nova
  // espera até 4 s pela geração e cai para a voz do sistema. "Preciso de
  // aspiração" não pode esperar: a preparação das frases rápidas leva junto as
  // do quarto e a do chamado da enfermagem.
  it('"Preparar frases rápidas" manda também as frases do quarto do hospital para o cache', async () => {
    estadoMock.atual = { ...semVoz(), modelo: { baixado: true, baixando: false, progresso: null }, motor: 'pronto', dispositivo: 'cpu', voz: { importada: true, duracaoS: 18, qualidade: 'boa', nomeDoArquivo: 'voz.opus', consentimentoEm: '2026-09-09T00:00:00Z' }, ativa: true };
    montar();
    const botao = screen.getByText(/Preparar frases rápidas/).closest('button')!;
    fireEvent.click(botao);
    // O clique começou a preparação (o ícone vira o círculo que gira)…
    expect(botao.querySelector('.animate-spin')).not.toBeNull();
    // …e ela termina depois de mandar as frases ao cache.
    await waitFor(() => expect(botao.querySelector('.animate-spin')).toBeNull());
    // Toda chamada ao cache leva as frases do quarto (a preparação em segundo
    // plano de um teste anterior pode terminar durante este: é a mesma função).
    const chamadas = vi.mocked(aquecerCache).mock.calls;
    expect(chamadas.length).toBeGreaterThan(0);
    for (const [textos] of chamadas) {
      for (const frase of [
        'Estou com sede.', 'Preciso de aspiração.', 'Preciso mudar de posição.', 'Estou com frio.',
        'Estou com calor.', 'Chame a minha família, por favor.', 'Por favor, chame a enfermagem.',
      ]) {
        expect(textos, `"${frase}" ficou fora do cache`).toContain(frase);
      }
      // As de sempre continuam lá: as das telas de frases e de pictogramas e as fixas.
      for (const frase of ['Preciso de ajuda.', 'Obrigado.', 'Quero água.', 'Estou com dor.', 'Sim', 'Não']) {
        expect(textos, `"${frase}" ficou fora do cache`).toContain(frase);
      }
    }
  });

  // Relato de 22/10/2026: os quatro caminhos abaixo falam com o processo
  // principal por `invoke`, que REJEITA quando ele lança. Sem `catch`, a
  // importação, a remoção da voz (dado biométrico), o download e a preparação
  // do cache terminavam sem uma palavra para o cuidador, e a rejeição saía solta.
  describe('IPC que rejeita: o cuidador é avisado, em palavras', () => {
    const comVoz = () => {
      estadoMock.atual = { ...semVoz(), modelo: { baixado: true, baixando: false, progresso: null }, motor: 'pronto', dispositivo: 'cpu', voz: { importada: true, duracaoS: 18, qualidade: 'boa', nomeDoArquivo: 'voz.opus', consentimentoEm: '2026-09-09T00:00:00Z' }, ativa: true };
    };
    const textoDoErro = () => String(toastMock.error.mock.calls[0]?.[0] ?? '');

    it('importar', async () => {
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ponteMock.importar.mockRejectedValueOnce(new Error('Error invoking remote method'));
      montar();
      fireEvent.click(screen.getByText(/Importar áudio da voz/));
      fireEvent.click(screen.getByLabelText(/Li e aceito o termo/));
      const confirmar = screen.getByText(/Aceitar e escolher o arquivo/).closest('button')!;
      fireEvent.click(confirmar);
      await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
      expect(textoDoErro()).toMatch(/importar a voz/i);
      // Destravou: dá para tentar de novo.
      await waitFor(() => expect(confirmar).not.toBeDisabled());
      aviso.mockRestore();
    });

    it('remover', async () => {
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
      comVoz();
      ponteMock.remover.mockRejectedValueOnce(new Error('Error invoking remote method'));
      montar();
      fireEvent.click(screen.getByText(/Remover voz/));
      fireEvent.click(await screen.findByText('Remover a voz'));
      await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
      expect(textoDoErro()).toMatch(/remover a voz/i);
      expect(toastMock.success).not.toHaveBeenCalledWith('Voz removida.');
      aviso.mockRestore();
    });

    it('baixar o modelo', async () => {
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ponteMock.baixarModelo.mockRejectedValueOnce(new Error('Error invoking remote method'));
      montar();
      fireEvent.click(screen.getByText(/Baixar o modelo agora/));
      await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
      expect(textoDoErro()).toMatch(/baixar o modelo/i);
      aviso.mockRestore();
    });

    it('preparar as frases na voz nova', async () => {
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
      comVoz();
      vi.mocked(aquecerCache).mockRejectedValueOnce(new Error('motor caiu'));
      montar();
      const botao = screen.getByText(/Preparar frases rápidas/).closest('button')!;
      fireEvent.click(botao);
      await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
      expect(textoDoErro()).toMatch(/preparar as frases/i);
      await waitFor(() => expect(botao.querySelector('.animate-spin')).toBeNull());
      aviso.mockRestore();
    });
  });

  it('termo cobre autorização, uso local e remoção', () => {
    expect(TERMO_DE_CONSENTIMENTO).toMatch(/autorizou expressamente/);
    expect(TERMO_DE_CONSENTIMENTO).toMatch(/apenas aqui/);
    expect(TERMO_DE_CONSENTIMENTO).toMatch(/remover a voz a qualquer momento/);
  });
});

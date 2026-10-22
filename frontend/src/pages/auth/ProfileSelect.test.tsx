import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import React from 'react';
import i18n from '../../i18n';
import { ProfileSelect } from './ProfileSelect';
import { AuthProvider } from '../../context/AuthContext';
import { criarPerfil, listarPerfis } from '../../services/local/profiles';
import { armazemDaVozGuardada } from '../../services/voz/vozGuardada/armazem';

// -----------------------------------------------------------------------------
// Antes esta tela listava "Paciente A/B/C" cravados no código e a rota era
// órfã — nada navegava para ela. Agora ela é o último passo antes da
// calibração, e os perfis são reais e locais.
// -----------------------------------------------------------------------------

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR');
});

const montar = () =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/profiles']}>
        <Routes>
          <Route path="/profiles" element={<ProfileSelect />} />
          <Route path="/calibration-check" element={<div>tela de calibracao</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );

describe('lista vazia', () => {
  it('não mostra pacientes fictícios', () => {
    montar();
    expect(screen.queryByText(/paciente a/i)).toBeNull();
  });

  it('convida a criar o primeiro', () => {
    montar();
    expect(screen.getByText(/nenhum perfil ainda/i)).toBeInTheDocument();
  });
});

describe('criar um perfil', () => {
  const abrirFormulario = () =>
    fireEvent.click(screen.getByRole('button', { name: /novo paciente/i }));

  it('exige o nome', () => {
    montar();
    abrirFormulario();
    fireEvent.click(screen.getByRole('button', { name: /criar perfil/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/nome é obrigatório/i);
    expect(listarPerfis()).toHaveLength(0);
  });

  it('cria com só o nome — idade e condição são opcionais', () => {
    montar();
    abrirFormulario();
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Joana' } });
    fireEvent.click(screen.getByRole('button', { name: /criar perfil/i }));

    expect(screen.getByText('Joana')).toBeInTheDocument();
    expect(listarPerfis()).toHaveLength(1);
  });

  it('guarda idade e condição quando informadas', () => {
    montar();
    abrirFormulario();
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Joana' } });
    fireEvent.change(screen.getByLabelText(/idade/i), { target: { value: '58' } });
    fireEvent.change(screen.getByLabelText(/condição/i), { target: { value: 'ELA' } });
    fireEvent.click(screen.getByRole('button', { name: /criar perfil/i }));

    const [p] = listarPerfis();
    expect(p.age).toBe(58);
    expect(p.condition).toBe('ELA');
  });

  it('avisa que a foto não sai do computador', () => {
    montar();
    abrirFormulario();
    expect(screen.getByText(/fica só neste computador/i)).toBeInTheDocument();
  });

  it('cancelar fecha o formulário sem criar nada', () => {
    montar();
    abrirFormulario();
    fireEvent.change(screen.getByLabelText(/nome/i), { target: { value: 'Joana' } });
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(listarPerfis()).toHaveLength(0);
  });
});

describe('escolher um perfil', () => {
  it('leva à conferência de calibração', () => {
    criarPerfil({ name: 'Joana' });
    montar();

    // `/joana/i` sozinho casaria tambem o botao "Remover Joana".
    fireEvent.click(screen.getByRole('button', { name: /joana.*iniciar sess/i }));

    expect(screen.getByText('tela de calibracao')).toBeInTheDocument();
  });
});

// FE-15: remover era UM clique, sem confirmação, num botão de 32 px dentro do
// cartão de "Iniciar sessão".
describe('remover um perfil', () => {
  it('pede confirmação com o nome e só tira da lista depois do "Remover perfil"', async () => {
    criarPerfil({ name: 'Joana' });
    montar();

    fireEvent.click(screen.getByRole('button', { name: /remover joana/i }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/Remover o perfil de Joana\?/);
    expect(listarPerfis()).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Remover perfil' }));
    await waitFor(() => expect(listarPerfis()).toHaveLength(0));
    expect(screen.queryByRole('button', { name: /remover joana/i })).toBeNull();
  });

  it('cancelar mantém o perfil', async () => {
    criarPerfil({ name: 'Joana' });
    montar();

    fireEvent.click(screen.getByRole('button', { name: /remover joana/i }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(listarPerfis()).toHaveLength(1);
  });

  it('a lixeira não responde ao olhar (data-no-dwell)', () => {
    criarPerfil({ name: 'Joana' });
    montar();
    expect(screen.getByRole('button', { name: /remover joana/i })).toHaveAttribute('data-no-dwell');
  });

  // Revisão final, rodada 1 (M4): a confirmação dizia só "o perfil e as frases do assistente".
  it('a confirmação diz tudo o que sai: voz, diário, calibração e o que o cuidador anotou', async () => {
    criarPerfil({ name: 'Joana' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: /remover joana/i }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/gravações da voz/i);
    expect(dialogo).toHaveTextContent(/diário/i);
    expect(dialogo).toHaveTextContent(/calibração/i);
  });

  // Revisão final, rodada 2 (N1): a confirmação diz EXATAMENTE o que sai da voz — as gravações e o
  // termo dele, e a voz personalizada só se for dele.
  it('a confirmação diz o que acontece com a voz personalizada: sai só se foi criada com o termo dele', async () => {
    criarPerfil({ name: 'Joana' });
    montar();
    fireEvent.click(screen.getByRole('button', { name: /remover joana/i }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent(/o termo que ele aceitou/i);
    expect(dialogo).toHaveTextContent(/voz personalizada importada/i);
    expect(dialogo).toHaveTextContent(/só se foi criada com o termo dele/i);
    expect(dialogo).toHaveTextContent(/outro paciente.*continua/i);
  });

  it('se a voz personalizada não pôde ser apagada, a tela diz onde removê-la (e o perfil sai mesmo assim)', async () => {
    criarPerfil({ name: 'Joana' });
    (window as unknown as { irisflowVoz?: unknown }).irisflowVoz = {
      removerDoPerfil: async () => ({ ok: false, erro: 'arquivo preso' }),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    montar();
    fireEvent.click(screen.getByRole('button', { name: /remover joana/i }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Remover perfil' }));
    await waitFor(() => expect(listarPerfis()).toHaveLength(0));
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/não foi possível apagar a voz personalizada/i);
    expect(aviso).toHaveTextContent(/Remover voz/);
    delete (window as unknown as { irisflowVoz?: unknown }).irisflowVoz;
    vi.restoreAllMocks();
  });

  it('se a voz guardada não pôde ser apagada, a tela diz (e o perfil sai mesmo assim)', async () => {
    criarPerfil({ name: 'Joana' });
    vi.spyOn(armazemDaVozGuardada(), 'apagarDoPerfil').mockResolvedValue({ ok: false, erro: 'arquivo preso' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    montar();
    fireEvent.click(screen.getByRole('button', { name: /remover joana/i }));
    await screen.findByRole('alertdialog');
    fireEvent.click(screen.getByRole('button', { name: 'Remover perfil' }));
    await waitFor(() => expect(listarPerfis()).toHaveLength(0));
    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/não foi possível apagar as gravações da voz/i);
    vi.restoreAllMocks();
  });
});

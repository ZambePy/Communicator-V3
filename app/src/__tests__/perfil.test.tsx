/**
 * Perfis (31/10/2026): Meu perfil (o cuidador edita nome e celular; o e-mail
 * só se lê) e a conta sem pessoa, que agora cadastra a pessoa no app.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Perfil from '../../app/perfil';
import { SemPaciente } from '@/features/SemPaciente';
import { formatarCelular, resumoDaPessoa, resumoDosComputadores } from '@/utils/pessoa';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }) }));

const mockApp = {
  profile: { id: 'u1', buyer_name: 'Ana Souza', email: 'ana.souza@gmail.com', phone: '11987654321' as string | null },
  patient: { id: 'b1', profile_id: 'u1', user_name: 'Carlos', relation: 'conjuge', condition: 'ela', os: 'windows', prescriber_name: null, prescriber_role: null },
  devices: [{ id: 'd1', revoked_at: null, online: true }],
  atualizarPerfil: jest.fn(async (_m: unknown) => undefined),
  completarCadastro: jest.fn(async (_d: unknown) => undefined),
  refresh: jest.fn(async () => undefined),
  signOut: jest.fn(async () => undefined),
};
jest.mock('@/store/AppProvider', () => ({ useApp: () => mockApp }));

beforeEach(() => {
  mockApp.atualizarPerfil.mockClear();
  mockApp.completarCadastro.mockClear();
});

describe('Meu perfil', () => {
  it('mostra quem é, de quem cuida, o celular formatado e o e-mail', async () => {
    await render(<Perfil />);
    expect(screen.getAllByText('Ana Souza').length).toBeGreaterThan(0);
    expect(screen.getByText('Cuida de Carlos')).toBeTruthy();
    expect(screen.getByText('(11) 9 8765-4321')).toBeTruthy();
    expect(screen.getByText('ana.souza@gmail.com')).toBeTruthy();
    expect(screen.getByText('Cônjuge, ELA')).toBeTruthy();
    expect(screen.getByText('1 ligado')).toBeTruthy();
  });

  it('celular com tamanho errado não grava; com 11 dígitos grava só os dígitos', async () => {
    await render(<Perfil />);
    await fireEvent.press(screen.getByTestId('perfil-celular'));
    const campo = screen.getByLabelText('Celular com DDD');
    await fireEvent.changeText(campo, '1234');
    await fireEvent.press(screen.getByText('Salvar'));
    expect(screen.getByText('Use DDD e número: 10 ou 11 dígitos.')).toBeTruthy();
    expect(mockApp.atualizarPerfil).not.toHaveBeenCalled();
    await fireEvent.changeText(campo, '(21) 9 1234-5678');
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(mockApp.atualizarPerfil).toHaveBeenCalledWith({ phone: '21912345678' }));
  });

  it('o nome se edita pela mesma folha', async () => {
    await render(<Perfil />);
    await fireEvent.press(screen.getByTestId('perfil-nome'));
    await fireEvent.changeText(screen.getByLabelText('Nome'), 'Ana S. Lima');
    await fireEvent.press(screen.getByText('Salvar'));
    await waitFor(() => expect(mockApp.atualizarPerfil).toHaveBeenCalledWith({ buyer_name: 'Ana S. Lima' }));
  });

  it('rótulos curtos', () => {
    expect(formatarCelular('1134567890')).toBe('(11) 3456-7890');
    expect(resumoDaPessoa({ relation: 'pai-mae', condition: 'prefiro-nao' })).toBe('Mãe ou pai');
    expect(resumoDosComputadores([])).toBe('Nenhum');
    expect(resumoDosComputadores([{ revoked_at: null, online: false }])).toBe('1 desligado');
  });
});

describe('Conta sem pessoa', () => {
  it('cadastra a pessoa no próprio app, sem mandar para o site', async () => {
    await render(<SemPaciente />);
    expect(screen.getByText('Para quem é o IrisFlow?')).toBeTruthy();
    expect(screen.queryByText(/site/i)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Como você chama essa pessoa'), 'Carlos');
    await fireEvent.press(screen.getByLabelText('Paciente'));
    await fireEvent.press(screen.getByText('Pronto'));
    await waitFor(() => expect(mockApp.completarCadastro).toHaveBeenCalledWith({ userName: 'Carlos', relation: 'cuidador', condition: null }));
  });
});

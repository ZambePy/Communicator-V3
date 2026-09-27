import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import { CaregiverDashboard } from './CaregiverDashboard';

let mockIsCaregiver = false;
const mockLoginCaregiver = vi.fn((pin: string) => {
  if (pin === '1234') {
    mockIsCaregiver = true;
    return true;
  }
  return false;
});

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    currentProfile: { id: 'patient123' },
    isCaregiver: mockIsCaregiver,
    loginCaregiver: mockLoginCaregiver,
  }),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock base CaregiverPageLayout para simplificar as verificações do dashboard
vi.mock('../../components/ui/CaregiverPageLayout', () => ({
  CaregiverPageLayout: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

describe('CaregiverDashboard PIN & Keypad Access', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsCaregiver = false;
    await i18n.changeLanguage('pt-BR');
  });

  it('deve exibir tela de restrição e permitir autenticar pelo teclado virtual numérico', () => {
    render(
      <MemoryRouter>
        <CaregiverDashboard />
      </MemoryRouter>
    );

    // 1. Deve exibir a restrição
    expect(screen.getByText('Acesso Restrito ao Cuidador')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••')).toBeInTheDocument();

    // 2. Clica nos botões numéricos
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    fireEvent.click(screen.getByRole('button', { name: '4' }));

    // 3. Submete senha correta (1234)
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    expect(mockLoginCaregiver).toHaveBeenCalledWith('1234');
  });

  it('deve rejeitar senha errada, exibir mensagem de erro e limpar campo', () => {
    render(
      <MemoryRouter>
        <CaregiverDashboard />
      </MemoryRouter>
    );

    // Clica 9, 9, 9
    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.click(screen.getByRole('button', { name: '9' }));
    fireEvent.click(screen.getByRole('button', { name: '9' }));

    // Submete senha errada
    fireEvent.click(screen.getByRole('button', { name: /Entrar/i }));

    expect(mockLoginCaregiver).toHaveBeenCalledWith('999');
    expect(screen.getByText('PIN inválido')).toBeInTheDocument();
  });

  it('deve carregar diretamente os painéis de tarefas e diário se já estiver autenticado', () => {
    mockIsCaregiver = true;

    render(
      <MemoryRouter>
        <CaregiverDashboard />
      </MemoryRouter>
    );

    expect(screen.queryByText('Acesso Restrito ao Cuidador')).toBeNull();
    expect(screen.getByText('Painel do Cuidador')).toBeInTheDocument();
    expect(screen.getByText('Rotina Diária')).toBeInTheDocument();
  });
});

// FE-20: toda instalação nascia com "Tomar medicação da manhã" e "Beber 500ml
// de água" na rotina — informação clínica que ninguém cadastrou.
describe('CaregiverDashboard — rotina sem tarefas de fábrica (FE-20)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsCaregiver = true;
    localStorage.clear();
    await i18n.changeLanguage('pt-BR');
  });

  it('instalação nova: rotina vazia, com convite para acrescentar', () => {
    render(
      <MemoryRouter>
        <CaregiverDashboard />
      </MemoryRouter>
    );
    expect(screen.queryByText(/medicação/i)).toBeNull();
    expect(screen.queryByText(/500ml/i)).toBeNull();
    expect(screen.getByTestId('rotina-vazia')).toBeInTheDocument();
  });

  it('o cuidador acrescenta e remove as próprias tarefas, e elas ficam gravadas', () => {
    render(
      <MemoryRouter>
        <CaregiverDashboard />
      </MemoryRouter>
    );
    fireEvent.change(screen.getByLabelText('Nova tarefa da rotina'), { target: { value: 'Fisioterapia às 14h' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar/ }));
    expect(screen.getByText('Fisioterapia às 14h')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('irisflow_caregiver_patient123') ?? '{}').tasks).toEqual([{ id: 1, label: 'Fisioterapia às 14h', done: false }]);

    fireEvent.click(screen.getByRole('button', { name: 'Remover tarefa: Fisioterapia às 14h' }));
    expect(screen.queryByText('Fisioterapia às 14h')).toBeNull();
    expect(screen.getByTestId('rotina-vazia')).toBeInTheDocument();
  });
});

describe('CaregiverDashboard — dado gravado fora do formato não derruba a tela (FE-8)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsCaregiver = true;
    localStorage.clear();
    await i18n.changeLanguage('pt-BR');
  });

  it('tasks que não é lista (edição à mão, versão antiga): rotina vazia, sem cair', () => {
    localStorage.setItem('irisflow_caregiver_patient123', JSON.stringify({ tasks: { 0: 'x' }, entries: 'y' }));
    render(
      <MemoryRouter>
        <CaregiverDashboard />
      </MemoryRouter>
    );
    expect(screen.getByTestId('rotina-vazia')).toBeInTheDocument();
  });

  it('armazenamento cheio ao gravar: a tela segue de pé', () => {
    const gravar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('cheio', 'QuotaExceededError'); });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <MemoryRouter>
        <CaregiverDashboard />
      </MemoryRouter>
    );
    expect(screen.getByText('Rotina Diária')).toBeInTheDocument();
    expect(aviso).toHaveBeenCalled();
    gravar.mockRestore();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { FronteiraDeErroDaTela } from './FronteiraDeErroDaTela';
import { informarEntrega, ouvir, _limparOuvintes } from '../cloud/eventos';
import { dispararPedidoDeSocorro, _reiniciarSocorroParaTestes } from '../services/emergencia/pedidoDeSocorro';

// O alarme do sistema (Electron) e o áudio não existem aqui.
vi.mock('../services/emergencia/ponteDoAlarme', () => ({
  ligarAlarmeDoSistema: () => {},
  desligarAlarmeDoSistema: () => {},
  reconciliarAlarmeDoSistema: () => {},
}));
vi.mock('../utils/emergencyAudio', () => ({ tocarSirene: () => {}, getSharedAudioContext: () => null }));

// -----------------------------------------------------------------------------
// FE-8: um erro de render numa tela derrubava o app inteiro (a única fronteira
// estava na raiz, por fora do olhar e da Emergência). A falha agora fica na
// tela, com uma saída grande pelo olhar, e o que está fora dela continua.
// -----------------------------------------------------------------------------

const Quebra: React.FC = () => {
  throw new Error('w.map is not a function');
};

let navegar: (r: string) => void = () => {};
const Nav: React.FC = () => {
  navegar = useNavigate();
  return null;
};

afterEach(() => vi.restoreAllMocks());

describe('fronteira de erro por tela', () => {
  it('a tela que quebra mostra uma saída pelo olhar; o que está fora (Emergência) continua', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/caregiver']}>
        <Nav />
        <button data-emergency="true">Emergência</button>
        <FronteiraDeErroDaTela>
          <Routes>
            <Route path="/caregiver" element={<Quebra />} />
            <Route path="/menu" element={<div>menu do paciente</div>} />
          </Routes>
        </FronteiraDeErroDaTela>
      </MemoryRouter>
    );
    expect(screen.getByTestId('fronteira-de-erro-da-tela')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emergência' })).toBeInTheDocument();
    const voltar = screen.getByRole('button', { name: 'Voltar ao menu' });
    // Aceito também com o rastreamento degradado.
    expect(voltar.getAttribute('data-recovery')).toBe('true');
    // Sem a mensagem técnica na tela.
    expect(screen.queryByText(/w\.map/)).toBeNull();

    act(() => voltar.click());
    expect(screen.getByText('menu do paciente')).toBeInTheDocument();
    expect(screen.queryByTestId('fronteira-de-erro-da-tela')).toBeNull();
  });

  // Revisão de UX de 19/10/2026 (achado 15): na rota da emergência a fronteira
  // dizia "O pedido de socorro já foi enviado" sempre — sem celular ligado, sem
  // internet ou com o envio recusado também.
  describe('na emergência, o texto segue a entrega do pedido em andamento', () => {
    afterEach(() => {
      _reiniciarSocorroParaTestes();
      _limparOuvintes();
    });

    const quebrarNaEmergencia = () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      render(
        <MemoryRouter initialEntries={['/emergency']}>
          <FronteiraDeErroDaTela>
            <Routes>
              <Route path="/emergency" element={<Quebra />} />
            </Routes>
          </FronteiraDeErroDaTela>
        </MemoryRouter>
      );
      return screen.getByTestId('fronteira-de-erro-da-tela');
    };

    it('sem celular ligado a este computador: não diz que enviou', () => {
      // Ninguém ouvindo o barramento = sem nuvem: a entrega é `sem_nuvem` na hora.
      dispararPedidoDeSocorro('other', 'OUTRA URGÊNCIA');
      const fronteira = quebrarNaEmergencia();
      expect(fronteira.textContent).not.toMatch(/já foi enviado|foi avisado/);
      expect(fronteira.textContent).toMatch(/não está ligado ao celular de um cuidador/);
    });

    it.each([
      ['na_fila', /Sem internet/],
      ['falhou', /Não foi possível avisar o celular/],
      ['sem_push', /nenhum celular de cuidador foi avisado/],
      ['limitado', /nenhum celular de cuidador foi avisado/],
      ['push_incerto', /não deu para confirmar/],
      ['ensaio', /Modo apresentação/],
    ] as const)('entrega %s: diz o que aconteceu, sem afirmar o envio', (entrega, esperado) => {
      ouvir(() => {}); // a nuvem está montada: a entrega vem da resposta do envio
      const p = dispararPedidoDeSocorro('other', 'OUTRA URGÊNCIA');
      informarEntrega(p.id, entrega);
      const fronteira = quebrarNaEmergencia();
      expect(fronteira.textContent).not.toMatch(/já foi enviado|celular do cuidador foi avisado/);
      expect(fronteira.textContent).toMatch(esperado);
    });

    it('entregue: diz que o celular foi avisado — e acompanha a entrega que chega depois', () => {
      ouvir(() => {});
      const p = dispararPedidoDeSocorro('other', 'OUTRA URGÊNCIA');
      const fronteira = quebrarNaEmergencia();
      expect(fronteira.textContent).toMatch(/Enviando o pedido de socorro/);
      act(() => informarEntrega(p.id, 'enviado'));
      expect(fronteira.textContent).toMatch(/O celular do cuidador foi avisado/);
    });
  });

  it('trocar de rota limpa o erro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={['/quebra']}>
        <Nav />
        <FronteiraDeErroDaTela>
          <Routes>
            <Route path="/quebra" element={<Quebra />} />
            <Route path="/outra" element={<div>outra tela</div>} />
          </Routes>
        </FronteiraDeErroDaTela>
      </MemoryRouter>
    );
    expect(screen.getByTestId('fronteira-de-erro-da-tela')).toBeInTheDocument();
    act(() => navegar('/outra'));
    expect(screen.getByText('outra tela')).toBeInTheDocument();
  });
});

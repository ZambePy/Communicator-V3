import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { CalibrationLog } from '../../utils/clinicalLogger';
import type { DiaDeUso } from '../../services/evolucao/registroDeUso';

// Tela de evolução semanal (21/10/2026): dado de acompanhamento, não
// diagnóstico, e nunca mexe em ajuste. Os números e as regras estão testados
// em services/evolucao; aqui se confere o que o cuidador LÊ.

let medicoes: CalibrationLog[] = [];
let uso: DiaDeUso[] = [];
let autorizado = true;
let paciente: string | null = 'p1';

vi.mock('../../utils/clinicalLogger', () => ({
  getClinicalData: () => ({ sentences: [], calibrations: medicoes, dores: [] }),
  hasConsent: () => autorizado,
  perfilAtivoDoHistorico: () => paciente,
}));
vi.mock('../../services/evolucao/registroDeUso', async (original) => ({
  ...(await original<typeof import('../../services/evolucao/registroDeUso')>()),
  lerUso: () => uso,
}));
const updateSettings = vi.fn();
vi.mock('../../context/SettingsContext', () => ({
  useSettings: () => ({ settings: { dwellMs: 1500 }, updateSettings }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
const baixarCsv = vi.fn();
vi.mock('../../services/evolucao/csv', async (original) => ({
  ...(await original<typeof import('../../services/evolucao/csv')>()),
  baixarCsv: (...a: unknown[]) => baixarCsv(...a),
}));

import { EvolucaoScreen } from './EvolucaoScreen';
import { AVISO_NAO_E_DIAGNOSTICO } from '../../services/evolucao/sugestoes';

const cal = (dia: string, errorDeg: number, herdado = false): CalibrationLog => ({
  id: `${dia}-${errorDeg}`,
  errorDeg,
  timestamp: `${dia}T13:00:00.000Z`,
  ...(herdado ? { herdado: true } : {}),
});

const diaDeUso = (dia: string, p: Partial<DiaDeUso>): DiaDeUso => ({
  dia, minutosUteis: 0, ultimoMinuto: 0, caracteres: 0, msDigitando: 0, desfazer: 0, avisosDeFadiga: 0, dwellSomaMs: 0, dwellAmostras: 0, ...p,
});

function Local() {
  return <span data-testid="local">{useLocation().pathname}</span>;
}
const montar = () =>
  render(
    <MemoryRouter initialEntries={['/evolucao']}>
      <Local />
      <Routes>
        <Route path="/evolucao" element={<EvolucaoScreen />} />
        <Route path="*" element={null} />
      </Routes>
    </MemoryRouter>,
  );

describe('EvolucaoScreen', () => {
  beforeEach(() => {
    medicoes = [];
    uso = [];
    autorizado = true;
    paciente = 'p1';
    updateSettings.mockClear();
    baixarCsv.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-21T15:00:00Z')); // quarta; a semana de hoje é 19/10 a 25/10
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sempre', () => {
    it('diz, no alto, que é dado de acompanhamento e não diagnóstico — mesmo vazia', () => {
      montar();
      expect(screen.getByRole('note')).toHaveTextContent(AVISO_NAO_E_DIAGNOSTICO);
      expect(screen.getByRole('heading', { level: 1, name: /evolução semanal/i })).toBeInTheDocument();
    });

    it('Voltar leva às Configurações', () => {
      montar();
      fireEvent.click(screen.getByRole('button', { name: 'common.backAria' }));
      expect(screen.getByTestId('local')).toHaveTextContent('/settings');
    });

    it('sem nenhum dado: explica quando os números aparecem, sem tabela nem CSV', () => {
      montar();
      expect(screen.getByText(/ainda não há medições nem uso registrado/i)).toBeInTheDocument();
      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.queryByRole('button', { name: /exportar csv/i })).toBeNull();
    });

    it('sem autorização do histórico: avisa por que está vazio e onde ligar', () => {
      autorizado = false;
      montar();
      expect(screen.getByRole('status')).toHaveTextContent(/histórico clínico está desligado/i);
      expect(screen.getByRole('status')).toHaveTextContent(/Configurações/);
    });

    it('com autorização, não mostra esse aviso', () => {
      montar();
      expect(screen.queryByText(/histórico clínico está desligado/i)).toBeNull();
    });
  });

  describe('com dados', () => {
    beforeEach(() => {
      medicoes = [cal('2026-10-06', 1.0), cal('2026-10-14', 1.5)];
      uso = [
        diaDeUso('2026-10-07', { minutosUteis: 100, caracteres: 40, msDigitando: 120_000, dwellSomaMs: 75_000, dwellAmostras: 50, avisosDeFadiga: 1, desfazer: 5 }),
        diaDeUso('2026-10-14', { minutosUteis: 100, caracteres: 20, msDigitando: 120_000, dwellSomaMs: 90_000, dwellAmostras: 50, avisosDeFadiga: 4, desfazer: 20 }),
      ];
    });

    it('uma linha por semana, da mais recente para a mais antiga, com a de hoje marcada em andamento', () => {
      montar();
      const linhas = within(screen.getByRole('table')).getAllByRole('row').slice(1);
      const periodos = linhas.map((l) => within(l).getAllByRole('rowheader')[0].textContent ?? '');
      expect(periodos[0]).toMatch(/19\/10 a 25\/10/);
      expect(periodos[0]).toMatch(/em andamento/i);
      expect(periodos[1]).toMatch(/12\/10 a 18\/10/);
      expect(periodos[1]).not.toMatch(/em andamento/i);
      expect(periodos[2]).toMatch(/05\/10 a 11\/10/);
    });

    it('mostra os seis números da semana, em pt-BR', () => {
      montar();
      const linha = screen.getByRole('row', { name: /12\/10 a 18\/10/ });
      expect(linha).toHaveTextContent('1,5°'); // erro
      expect(linha).toHaveTextContent('1,8 s'); // dwell: 90.000 / 50 = 1.800 ms
      expect(linha).toHaveTextContent('10,0'); // caracteres por minuto: 20 em 2 min
      expect(linha).toHaveTextContent('100 min'); // minutos úteis
    });

    it('a seta vem com a PALAVRA: a cor nunca é o único sinal', () => {
      montar();
      const linha = screen.getByRole('row', { name: /12\/10 a 18\/10/ });
      // O erro subiu de 1,0 para 1,5; a velocidade caiu de 20 para 10.
      expect(within(linha).getAllByText(/subiu/).length).toBeGreaterThan(0);
      expect(within(linha).getAllByText(/caiu/).length).toBeGreaterThan(0);
      expect(linha.textContent).toMatch(/↑/);
      expect(linha.textContent).toMatch(/↓/);
    });

    it('a semana em andamento e a primeira não têm seta (nada com que comparar)', () => {
      montar();
      expect(screen.getByRole('row', { name: /19\/10 a 25\/10/ }).textContent).not.toMatch(/[↑↓→]/);
      expect(screen.getByRole('row', { name: /05\/10 a 11\/10/ }).textContent).not.toMatch(/[↑↓→]/);
    });

    it('semana sem registro de uso mostra travessão, não zero', () => {
      uso = [];
      medicoes = [cal('2026-10-14', 1.5)];
      montar();
      const linha = screen.getByRole('row', { name: /12\/10 a 18\/10/ });
      expect(linha).toHaveTextContent('1,5°');
      expect(linha).not.toHaveTextContent('0 min');
      expect(linha.textContent!.match(/–/g)!.length).toBeGreaterThanOrEqual(4);
      expect(screen.getByText(/só aparecem a partir de quando o registro de uso/i)).toBeInTheDocument();
    });

    it('as sugestões levam o "não é diagnóstico" em cada uma', () => {
      montar();
      const secao = screen.getByRole('region', { name: /para conversar com a equipe/i });
      const cartoes = within(secao).getAllByRole('article');
      expect(cartoes.length).toBeGreaterThan(0);
      for (const c of cartoes) expect(c).toHaveTextContent(AVISO_NAO_E_DIAGNOSTICO);
    });

    it('a sugestão que tem tela leva até ela, sem mudar nada no caminho', () => {
      montar();
      fireEvent.click(screen.getByRole('button', { name: /refazer a calibração/i }));
      expect(screen.getByTestId('local')).toHaveTextContent('/calibration-check');
      expect(updateSettings).not.toHaveBeenCalled();
    });

    it('nada nesta tela muda um ajuste sozinha', () => {
      montar();
      for (const b of screen.getAllByRole('button')) {
        if (!/voltar|back/i.test(b.getAttribute('aria-label') ?? '')) fireEvent.click(b);
      }
      expect(updateSettings).not.toHaveBeenCalled();
    });
  });

  describe('medições herdadas', () => {
    beforeEach(() => {
      medicoes = [cal('2026-10-14', 1.5), cal('2026-10-15', 4.0, true), cal('2026-10-16', 4.0, true)];
    });

    it('ficam fora da curva e a tela diz quantas são e por quê', () => {
      montar();
      expect(screen.getByRole('row', { name: /12\/10 a 18\/10/ })).toHaveTextContent('1,5°');
      expect(screen.getByText(/2 medições anteriores à separação por paciente/i)).toBeInTheDocument();
    });

    it('o cuidador pode incluí-las, e a curva muda', () => {
      montar();
      const botao = screen.getByRole('button', { name: /contar as 2 medições/i });
      expect(botao).toHaveAttribute('aria-pressed', 'false');
      fireEvent.click(botao);
      expect(screen.getByRole('button', { name: /parar de contar as 2 medições/i })).toHaveAttribute('aria-pressed', 'true');
      // (1,5 + 4,0 + 4,0) / 3 = 3,2 (arredondado de 3,166…)
      expect(screen.getByRole('row', { name: /12\/10 a 18\/10/ })).toHaveTextContent('3,2°');
    });

    it('sem herdadas, nem o aviso nem o botão aparecem', () => {
      medicoes = [cal('2026-10-14', 1.5)];
      montar();
      expect(screen.queryByText(/separação por paciente/i)).toBeNull();
      expect(screen.queryByRole('button', { name: /contar as/i })).toBeNull();
    });
  });

  describe('exportar CSV', () => {
    beforeEach(() => {
      medicoes = [cal('2026-10-14', 1.5)];
    });

    it('gera o arquivo com a evolução que está na tela e diz o nome', () => {
      montar();
      fireEvent.click(screen.getByRole('button', { name: /exportar csv/i }));
      expect(baixarCsv).toHaveBeenCalledTimes(1);
      const evolucao = baixarCsv.mock.calls[0][0] as { semanas: unknown[] };
      expect(evolucao.semanas.length).toBeGreaterThan(0);
      expect(screen.getByRole('status')).toHaveTextContent(/irisflow-evolucao-2026-10-21\.csv/);
    });

    it('se não conseguir gerar, diz — não dá por feito', () => {
      const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
      baixarCsv.mockImplementation(() => { throw new Error('bloqueado'); });
      montar();
      fireEvent.click(screen.getByRole('button', { name: /exportar csv/i }));
      expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível gerar o arquivo/i);
      expect(aviso).toHaveBeenCalledTimes(1);
      aviso.mockRestore();
    });
  });

  it('há um caminho para a folha da consulta', () => {
    medicoes = [cal('2026-10-14', 1.5)];
    montar();
    fireEvent.click(screen.getByRole('button', { name: /folha da consulta/i }));
    expect(screen.getByTestId('local')).toHaveTextContent('/consulta');
  });
});

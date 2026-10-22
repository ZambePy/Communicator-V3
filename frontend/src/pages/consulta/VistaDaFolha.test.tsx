import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { CalibrationLog, RegistroDeDor } from '../../utils/clinicalLogger';
import { agregarPorSemana } from '../../services/evolucao/agregar';
import type { DiaDeUso } from '../../services/evolucao/registroDeUso';
import type { EntradaDoDiario } from '../../services/consulta/diario';
import type { PerguntaDaConsulta } from '../../services/consulta/perguntas';
import { AVISO_DA_FOLHA, montarFolha, type PeriodoDaFolha } from '../../services/consulta/folha';
import { VistaDaFolha } from './VistaDaFolha';

// A folha em papel (21/10/2026). O CONTEÚDO está testado em
// services/consulta/folha.test.ts; aqui se confere que cada campo chega à
// página — e que a página é só leitura: é um papel, não uma tela.

const AGORA = Date.parse('2026-10-21T15:00:00Z'); // quarta, 12h em Brasília

const dor = (dia: string, lugar: string, nivel: number): RegistroDeDor => ({
  id: `${dia}-${lugar}`, local: lugar.toLowerCase(), lugar, nivel, frase: 'x', timestamp: `${dia}T14:00:00.000Z`,
});
const pergunta = (n: number, quem: PerguntaDaConsulta['quem'], texto = `Pergunta ${n}?`): PerguntaDaConsulta => ({
  id: `p${n}`, texto, quem, criadaEm: new Date(AGORA + n).toISOString(), feita: false,
});
const cal = (dia: string, errorDeg: number): CalibrationLog => ({ id: dia, errorDeg, timestamp: `${dia}T13:00:00.000Z` });
const uso = (dia: string, p: Partial<DiaDeUso>): DiaDeUso => ({
  dia, minutosUteis: 0, ultimoMinuto: 0, caracteres: 0, msDigitando: 0, desfazer: 0, avisosDeFadiga: 0, dwellSomaMs: 0, dwellAmostras: 0, ...p,
});

function folha(periodo: PeriodoDaFolha = 7, extra: { dores?: RegistroDeDor[]; diario?: EntradaDoDiario[]; perguntas?: PerguntaDaConsulta[]; calibracoes?: CalibrationLog[]; usoDias?: DiaDeUso[]; paciente?: string } = {}) {
  return montarFolha({
    periodo,
    agora: AGORA,
    paciente: extra.paciente ?? 'Maria Souza',
    dores: extra.dores ?? [],
    diario: extra.diario ?? [],
    evolucao: agregarPorSemana({ calibracoes: extra.calibracoes ?? [], uso: extra.usoDias ?? [], agora: AGORA }),
    perguntas: extra.perguntas ?? [],
  });
}

const montar = (f = folha()) => render(<VistaDaFolha folha={f} />);

describe('VistaDaFolha', () => {
  it('cabeçalho: título, paciente, período e intervalo', () => {
    montar();
    const folhaEl = screen.getByTestId('folha-da-consulta');
    expect(within(folhaEl).getByRole('heading', { level: 2, name: 'Folha da consulta' })).toBeInTheDocument();
    expect(folhaEl).toHaveTextContent('Maria Souza');
    expect(folhaEl).toHaveTextContent('Últimos 7 dias');
    expect(folhaEl).toHaveTextContent('15/10/2026 a 21/10/2026');
  });

  it('uma linha por dia do período, do mais antigo ao mais recente, com o dia da semana', () => {
    const primeiroDia = { 7: 'qui 15/10', 30: 'ter 22/09' } as const;
    for (const p of [7, 30] as const) {
      const { unmount } = montar(folha(p));
      const linhas = within(screen.getByRole('table', { name: /dia a dia/i })).getAllByRole('row').slice(1);
      expect(linhas).toHaveLength(p);
      expect(linhas[0]).toHaveTextContent(primeiroDia[p]);
      expect(linhas[linhas.length - 1]).toHaveTextContent('qua 21/10');
      unmount();
    }
  });

  it('cada dia mostra dor, sono, humor e nota; o que falta é travessão', () => {
    montar(folha(7, {
      dores: [dor('2026-10-20', 'Cabeça', 7), dor('2026-10-20', 'Braço esquerdo', 4)],
      diario: [{ dia: '2026-10-20', sono: 4, humor: 2, nota: 'Noite tranquila.' }],
    }));
    const terca = screen.getByRole('row', { name: /ter 20\/10/ });
    expect(terca).toHaveTextContent('7/10');
    expect(terca).toHaveTextContent('Cabeça');
    expect(terca).toHaveTextContent('Bom (4)');
    expect(terca).toHaveTextContent('Mal (2)');
    expect(terca).toHaveTextContent('Noite tranquila.');
    const quarta = screen.getByRole('row', { name: /qua 21\/10/ });
    expect(quarta.textContent!.match(/–/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('dor de nível 7 ou mais vem em negrito (o destaque que sobrevive à impressora sem cor); menos que isso, não', () => {
    montar(folha(7, { dores: [dor('2026-10-20', 'Cabeça', 7), dor('2026-10-19', 'Costas', 6)] }));
    const celulaDaDor = (nome: RegExp) => screen.getByRole('row', { name: nome }).querySelectorAll('td')[0];
    expect(celulaDaDor(/ter 20\/10/)).toHaveClass('consulta-folha__forte');
    expect(celulaDaDor(/seg 19\/10/)).not.toHaveClass('consulta-folha__forte');
  });

  it('resume a dor do período: relatos, dias, maior nível e lugares mais citados', () => {
    montar(folha(7, { dores: [dor('2026-10-20', 'Cabeça', 7), dor('2026-10-21', 'Cabeça', 5), dor('2026-10-21', 'Costas', 3)] }));
    const resumo = screen.getByRole('region', { name: /resumo do período/i });
    expect(resumo).toHaveTextContent(/3 relatos em 2 dias/);
    expect(resumo).toHaveTextContent(/maior nível 7 de 10/);
    expect(resumo).toHaveTextContent(/Cabeça \(2\)/);
  });

  it('sem relato de dor, diz isso por extenso', () => {
    montar();
    expect(screen.getByRole('region', { name: /resumo do período/i })).toHaveTextContent(/nenhum relato de dor/i);
  });

  it('médias de sono e humor, com em quantos dias houve marcação; sem marcação, "sem registro"', () => {
    montar(folha(7, { diario: [{ dia: '2026-10-19', sono: 4, humor: 2, nota: '' }, { dia: '2026-10-20', sono: 3, humor: 4, nota: '' }] }));
    const resumo = screen.getByRole('region', { name: /resumo do período/i });
    expect(resumo).toHaveTextContent(/Sono.*média 3,5.*2 dias/s);
    expect(resumo).toHaveTextContent(/Humor.*média 3,0.*2 dias/s);
  });

  it('sem diário, o resumo diz "sem registro" para sono e humor', () => {
    montar();
    expect(screen.getByRole('region', { name: /resumo do período/i }).textContent!.match(/sem registro/gi)!.length).toBe(2);
  });

  it('a evolução por semana leva os números da tela de evolução, e marca a semana em andamento', () => {
    montar(folha(7, {
      calibracoes: [cal('2026-10-14', 1.5)],
      usoDias: [uso('2026-10-14', { minutosUteis: 100, caracteres: 20, msDigitando: 120_000 })],
    }));
    const tabela = screen.getByRole('table', { name: /evolução por semana/i });
    const linha = within(tabela).getByRole('row', { name: /12\/10 a 18\/10/ });
    expect(linha).toHaveTextContent('1,5°');
    expect(linha).toHaveTextContent('100 min');
    expect(within(tabela).getByRole('row', { name: /19\/10 a 25\/10/ })).toHaveTextContent(/em andamento/i);
  });

  it('sem nenhuma semana com dado, diz isso em vez de uma tabela vazia', () => {
    montar();
    expect(screen.getByText(/ainda sem medições nem uso registrados/i)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: /evolução por semana/i })).toBeNull();
  });

  it('perguntas: duas colunas, do paciente e do cuidador, só as pendentes', () => {
    montar(folha(7, { perguntas: [pergunta(1, 'paciente', 'Posso comer?'), pergunta(2, 'cuidador', 'Qual o exame?'), { ...pergunta(3, 'cuidador', 'Já feita?'), feita: true }] }));
    const secao = screen.getByRole('region', { name: /perguntas para o médico/i });
    expect(within(secao).getByRole('list', { name: /do paciente/i })).toHaveTextContent('Posso comer?');
    expect(within(secao).getByRole('list', { name: /do cuidador/i })).toHaveTextContent('Qual o exame?');
    expect(secao).not.toHaveTextContent('Já feita?');
  });

  it('perguntas além do teto: a folha diz quantas ficaram no aparelho', () => {
    const muitas = Array.from({ length: 10 }, (_, i) => pergunta(i, 'paciente'));
    montar(folha(7, { perguntas: muitas }));
    expect(screen.getByRole('region', { name: /perguntas para o médico/i })).toHaveTextContent(/\+2 perguntas só no aparelho/);
  });

  it('sem perguntas pendentes, diz isso', () => {
    montar();
    expect(screen.getByRole('region', { name: /perguntas para o médico/i })).toHaveTextContent(/nenhuma pergunta pendente/i);
  });

  it('rodapé: o aviso de que não é diagnóstico e a data de geração', () => {
    montar();
    const rodape = screen.getByTestId('rodape-da-folha');
    expect(rodape).toHaveTextContent(AVISO_DA_FOLHA);
    expect(rodape).toHaveTextContent('Gerada em 21/10/2026');
  });

  it('notas encurtadas: a folha avisa; sem encurtar, não fala nisso', () => {
    const comNotaLonga = montar(folha(30, { diario: [{ dia: '2026-10-20', sono: null, humor: null, nota: 'x'.repeat(200) }] }));
    expect(screen.getByTestId('rodape-da-folha')).toHaveTextContent(/notas resumidas/i);
    comNotaLonga.unmount();
    montar(folha(30, { diario: [{ dia: '2026-10-20', sono: null, humor: null, nota: 'curta' }] }));
    expect(screen.getByTestId('rodape-da-folha')).not.toHaveTextContent(/notas resumidas/i);
  });

  it('é um papel: nenhum botão, link ou campo', () => {
    const { container } = montar(folha(30, { perguntas: [pergunta(1, 'paciente')] }));
    expect(container.querySelectorAll('button, a, input, textarea, select, [role="button"]')).toHaveLength(0);
  });

  it('o texto do paciente aparece como texto, nunca como HTML', () => {
    montar(folha(7, { paciente: '<img src=x onerror=alert(1)>', diario: [{ dia: '2026-10-20', sono: null, humor: null, nota: '<b>negrito</b>' }] }));
    expect(screen.getByTestId('folha-da-consulta').querySelector('img, b')).toBeNull();
    expect(screen.getByTestId('folha-da-consulta')).toHaveTextContent('<b>negrito</b>');
  });
});

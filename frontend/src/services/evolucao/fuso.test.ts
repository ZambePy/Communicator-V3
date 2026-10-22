import { describe, it, expect, afterEach } from 'vitest';
import { diaDeBrasilia, diasEntre, ehDia, rotuloDoDia, segundaDaSemana, somarDias } from './fuso';

// A evolução semanal e a folha da consulta agrupam por DIA e por SEMANA, e quem
// lê é o médico no horário de Brasília: uma fala às 23h30 de domingo tem de cair
// no domingo, e não na segunda (que é onde o UTC a põe).

describe('dia no fuso de Brasília', () => {
  it('a virada do dia é à meia-noite de Brasília (03:00 UTC), não à do UTC', () => {
    expect(diaDeBrasilia('2026-10-19T02:59:59Z')).toBe('2026-10-18');
    expect(diaDeBrasilia('2026-10-19T03:00:00Z')).toBe('2026-10-19');
  });

  it('aceita texto ISO, milissegundos e Date; o que não é data vira null', () => {
    const t = Date.parse('2026-10-19T15:00:00Z');
    expect(diaDeBrasilia(t)).toBe('2026-10-19');
    expect(diaDeBrasilia(new Date(t))).toBe('2026-10-19');
    expect(diaDeBrasilia('ontem')).toBeNull();
    expect(diaDeBrasilia(Number.NaN)).toBeNull();
    expect(diaDeBrasilia(new Date('x'))).toBeNull();
  });

  describe('não depende do fuso do computador', () => {
    const original = process.env.TZ;
    afterEach(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });

    for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      it(`em ${tz}`, () => {
        process.env.TZ = tz;
        expect(diaDeBrasilia('2026-10-19T02:30:00Z')).toBe('2026-10-18');
        expect(diaDeBrasilia('2026-10-19T03:30:00Z')).toBe('2026-10-19');
      });
    }
  });
});

describe('contas de calendário', () => {
  it('ehDia só aceita AAAA-MM-DD de um dia que existe', () => {
    expect(ehDia('2026-10-19')).toBe(true);
    expect(ehDia('2028-02-29')).toBe(true);
    expect(ehDia('2026-02-29')).toBe(false);
    expect(ehDia('2026-02-30')).toBe(false);
    expect(ehDia('19/10/2026')).toBe(false);
    expect(ehDia(20261019)).toBe(false);
    expect(ehDia(null)).toBe(false);
  });

  it('somarDias atravessa mês, ano e fevereiro bissexto, para a frente e para trás', () => {
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(somarDias('2026-10-19', 0)).toBe('2026-10-19');
  });

  it('diasEntre conta dias de calendário (positivo para a frente)', () => {
    expect(diasEntre('2026-10-12', '2026-10-19')).toBe(7);
    expect(diasEntre('2026-10-19', '2026-10-12')).toBe(-7);
    expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('a semana vai de segunda a domingo', () => {
    // 19/10/2026 é segunda-feira.
    expect(segundaDaSemana('2026-10-19')).toBe('2026-10-19');
    expect(segundaDaSemana('2026-10-21')).toBe('2026-10-19');
    expect(segundaDaSemana('2026-10-25')).toBe('2026-10-19');
    // O domingo fecha a semana que começou na segunda anterior.
    expect(segundaDaSemana('2026-10-18')).toBe('2026-10-12');
    expect(segundaDaSemana('2027-01-01')).toBe('2026-12-28');
  });

  it('rótulo do dia: DD/MM, com o ano quando pedido', () => {
    expect(rotuloDoDia('2026-10-09')).toBe('09/10');
    expect(rotuloDoDia('2026-10-09', true)).toBe('09/10/2026');
  });
});

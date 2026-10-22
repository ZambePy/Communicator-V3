import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { definirPerfilAtivo, setConsent } from '../../utils/clinicalLogger';
import { _redefinirFalhasDeGravacao, falhasDeGravacaoVisiveis } from '../local/falhasDeGravacao';
import { chaveDoDiario } from '../evolucao/chaves';
import {
  MAX_DIAS_NO_DIARIO,
  MAX_NOTA,
  ROTULOS_DO_HUMOR,
  ROTULOS_DO_SONO,
  dorPorDia,
  entradaDoDia,
  lerDiario,
  salvarNoDiario,
} from './diario';

// Diário da consulta: sono (1 a 5), humor (5 rostos) e uma nota por dia. A dor
// NÃO é digitada aqui — vem do mapa da dor, que já guarda lugar e nível.

const SEGUNDA = Date.parse('2026-10-19T15:00:00Z'); // segunda, 12h em Brasília

describe('diário da consulta', () => {
  beforeEach(() => {
    _redefinirFalhasDeGravacao();
    definirPerfilAtivo('p1');
    setConsent(true);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('rótulos', () => {
    it('cinco degraus de sono e cinco de humor, cada um com palavra (nunca só o rosto ou o número)', () => {
      expect(ROTULOS_DO_SONO).toHaveLength(5);
      expect(ROTULOS_DO_HUMOR).toHaveLength(5);
      expect(new Set(ROTULOS_DO_SONO).size).toBe(5);
      expect(new Set(ROTULOS_DO_HUMOR).size).toBe(5);
    });
  });

  describe('salvar', () => {
    it('guarda sono, humor e nota no dia de Brasília', () => {
      expect(salvarNoDiario({ sono: 4, humor: 2, nota: 'Dormi bem, mas amanheci cansado.' }, SEGUNDA)).toBe('gravado');
      expect(lerDiario('p1')).toEqual([{ dia: '2026-10-19', sono: 4, humor: 2, nota: 'Dormi bem, mas amanheci cansado.' }]);
    });

    it('23h30 de domingo é domingo, não segunda', () => {
      salvarNoDiario({ sono: 3 }, Date.parse('2026-10-19T02:30:00Z'));
      expect(lerDiario('p1').map((e) => e.dia)).toEqual(['2026-10-18']);
    });

    it('um campo por vez: tocar no humor não apaga o sono que já estava marcado', () => {
      salvarNoDiario({ sono: 4 }, SEGUNDA);
      salvarNoDiario({ humor: 5 }, SEGUNDA + 60_000);
      expect(entradaDoDia('p1', '2026-10-19')).toEqual({ dia: '2026-10-19', sono: 4, humor: 5, nota: '' });
    });

    it('tocar de novo no mesmo degrau desmarca (quem marcou sem querer consegue tirar)', () => {
      salvarNoDiario({ sono: 4 }, SEGUNDA);
      salvarNoDiario({ sono: null }, SEGUNDA);
      expect(entradaDoDia('p1', '2026-10-19').sono).toBeNull();
    });

    it('valor fora de 1 a 5 ou que não é inteiro é recusado e nada é gravado', () => {
      for (const ruim of [0, 6, 2.5, -1, Number.NaN, '3' as unknown as number]) {
        expect(salvarNoDiario({ sono: ruim }, SEGUNDA), String(ruim)).toBe('invalido');
        expect(salvarNoDiario({ humor: ruim }, SEGUNDA), String(ruim)).toBe('invalido');
      }
      expect(lerDiario('p1')).toEqual([]);
    });

    it('a nota é cortada em MAX_NOTA e perde espaços e quebras de linha nas pontas', () => {
      salvarNoDiario({ nota: `  ${'a'.repeat(MAX_NOTA + 50)}  \n` }, SEGUNDA);
      expect(entradaDoDia('p1', '2026-10-19').nota).toBe('a'.repeat(MAX_NOTA));
    });

    it('sem a autorização do histórico clínico, nada é guardado — e a resposta diz isso', () => {
      setConsent(false);
      expect(salvarNoDiario({ sono: 3 }, SEGUNDA)).toBe('sem_consentimento');
      expect(localStorage.getItem(chaveDoDiario('p1'))).toBeNull();
    });

    it('sem paciente escolhido, a resposta diz "sem_perfil"', () => {
      definirPerfilAtivo(null);
      expect(salvarNoDiario({ sono: 3 }, SEGUNDA)).toBe('sem_perfil');
    });

    it('armazenamento cheio: "falhou" e o aviso "não foi possível salvar" aparece', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('cheio', 'QuotaExceededError');
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(salvarNoDiario({ sono: 3 }, SEGUNDA)).toBe('falhou');
      expect(falhasDeGravacaoVisiveis()).toContain('historico');
    });

    it('guarda os MAX_DIAS_NO_DIARIO dias mais recentes', () => {
      const dias = Array.from({ length: MAX_DIAS_NO_DIARIO }, (_, i) => ({
        dia: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
        sono: 3,
        humor: 3,
        nota: '',
      }));
      localStorage.setItem(chaveDoDiario('p1'), JSON.stringify({ versao: 1, dias }));
      salvarNoDiario({ sono: 5 }, SEGUNDA);
      const depois = lerDiario('p1');
      expect(depois).toHaveLength(MAX_DIAS_NO_DIARIO);
      expect(depois[0].dia).toBe('2025-01-02');
      expect(depois[depois.length - 1].dia).toBe('2026-10-19');
    });
  });

  describe('ler', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    const guardar = (v: unknown) => localStorage.setItem(chaveDoDiario('p1'), typeof v === 'string' ? v : JSON.stringify(v));

    it('sem nada guardado: lista vazia e o dia vem vazio', () => {
      expect(lerDiario('p1')).toEqual([]);
      expect(entradaDoDia('p1', '2026-10-19')).toEqual({ dia: '2026-10-19', sono: null, humor: null, nota: '' });
    });

    it('conteúdo estragado dá lista vazia, sem exceção', () => {
      for (const ruim of ['{não é json', { versao: 9, dias: [] }, { versao: 1, dias: 'x' }, []]) {
        guardar(ruim);
        expect(lerDiario('p1')).toEqual([]);
      }
    });

    it('descarta dia inválido, corrige o que está fora da faixa e ordena', () => {
      guardar({
        versao: 1,
        dias: [
          { dia: '2026-10-20', sono: 9, humor: 'ótimo', nota: 7 },
          { dia: 'ontem', sono: 3 },
          null,
          { dia: '2026-10-19', sono: 2, humor: 4, nota: 'oi' },
        ],
      });
      expect(lerDiario('p1')).toEqual([
        { dia: '2026-10-19', sono: 2, humor: 4, nota: 'oi' },
        { dia: '2026-10-20', sono: null, humor: null, nota: '' },
      ]);
    });

    it('cada paciente tem o seu diário', () => {
      salvarNoDiario({ sono: 5 }, SEGUNDA);
      definirPerfilAtivo('p2');
      expect(lerDiario('p2')).toEqual([]);
    });
  });
});

describe('dorPorDia (lê o mapa da dor)', () => {
  const relato = (iso: string, lugar: string, nivel: number, local = lugar.toLowerCase()) => ({
    id: `${iso}-${lugar}`,
    local,
    lugar,
    nivel,
    frase: `Dói ${lugar}`,
    timestamp: iso,
  });

  it('agrupa por dia de Brasília: maior nível do dia, quantos relatos e os lugares', () => {
    const porDia = dorPorDia([
      relato('2026-10-19T14:00:00Z', 'Cabeça', 4),
      relato('2026-10-19T20:00:00Z', 'Braço esquerdo', 7),
      relato('2026-10-19T21:00:00Z', 'Cabeça', 2),
      relato('2026-10-20T14:00:00Z', 'Pescoço', 3),
    ]);
    expect(porDia.get('2026-10-19')).toEqual({ dia: '2026-10-19', nivelMaximo: 7, relatos: 3, lugares: ['Cabeça', 'Braço esquerdo'] });
    expect(porDia.get('2026-10-20')).toEqual({ dia: '2026-10-20', nivelMaximo: 3, relatos: 1, lugares: ['Pescoço'] });
  });

  it('o limite do dia é o de Brasília: 02:59Z ainda é o dia anterior', () => {
    const porDia = dorPorDia([relato('2026-10-19T02:59:00Z', 'Cabeça', 5), relato('2026-10-19T03:00:00Z', 'Cabeça', 6)]);
    expect(porDia.get('2026-10-18')?.nivelMaximo).toBe(5);
    expect(porDia.get('2026-10-19')?.nivelMaximo).toBe(6);
  });

  it('relato com data ou nível inválido fica de fora', () => {
    const porDia = dorPorDia([
      relato('não é data', 'Cabeça', 5),
      { ...relato('2026-10-19T14:00:00Z', 'Cabeça', 5), nivel: Number.NaN },
    ]);
    expect(porDia.size).toBe(0);
  });

  it('os lugares vêm do mais frequente para o menos, sem repetir', () => {
    const porDia = dorPorDia([
      relato('2026-10-19T14:00:00Z', 'Cabeça', 1),
      relato('2026-10-19T15:00:00Z', 'Pescoço', 1),
      relato('2026-10-19T16:00:00Z', 'Pescoço', 1),
    ]);
    expect(porDia.get('2026-10-19')?.lugares).toEqual(['Pescoço', 'Cabeça']);
  });
});

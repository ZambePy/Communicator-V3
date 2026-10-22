import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DWELL_MAX_MS, DWELL_MIN_MS } from '../../dwellMs';
import { definirPerfilAtivo, setConsent } from '../../utils/clinicalLogger';
import { _redefinirFalhasDeGravacao, falhasDeGravacaoVisiveis } from '../local/falhasDeGravacao';
import { chaveDoUso } from './chaves';
import {
  MAX_DIAS_DE_USO,
  PAUSA_MAXIMA_NA_DIGITACAO_MS,
  _redefinirRegistroDeUso,
  lerUso,
  registrarAvisoDeFadiga,
  registrarCorrecao,
  registrarDigitacao,
  registrarSelecao,
  rotaContaComoUso,
} from './registroDeUso';

// O que o app mede do USO, por dia, para a evolução semanal: minutos úteis,
// caracteres por minuto, correções ("desfazer"), avisos de fadiga e o tempo de
// fixação em uso. Local, por paciente, e só com a autorização do histórico
// clínico — como as frases e as medições.

const T0 = Date.parse('2026-10-19T15:00:10Z'); // segunda, 12h00 em Brasília

describe('registro de uso', () => {
  beforeEach(() => {
    _redefinirRegistroDeUso();
    _redefinirFalhasDeGravacao();
    definirPerfilAtivo('p1');
    setConsent(true);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('quando NÃO grava', () => {
    it('sem a autorização do histórico clínico, nada é guardado', () => {
      setConsent(false);
      registrarSelecao(T0, 1500);
      registrarDigitacao(1, T0);
      registrarDigitacao(3, T0 + 2000);
      registrarCorrecao(T0);
      registrarAvisoDeFadiga(T0);
      expect(lerUso('p1')).toEqual([]);
      expect(localStorage.getItem(chaveDoUso('p1'))).toBeNull();
    });

    it('sem paciente escolhido, nada é guardado (não há a quem atribuir)', () => {
      definirPerfilAtivo(null);
      registrarSelecao(T0, 1500);
      registrarAvisoDeFadiga(T0);
      expect(Object.keys(localStorage).filter((k) => k.startsWith('irisflow.evolucao'))).toEqual([]);
    });
  });

  describe('minutos úteis', () => {
    it('conta um por minuto em que houve ao menos uma seleção', () => {
      registrarSelecao(T0, 1500);
      registrarSelecao(T0 + 20_000, 1500); // mesmo minuto
      expect(lerUso('p1')[0].minutosUteis).toBe(1);
      registrarSelecao(T0 + 61_000, 1700); // outro minuto
      const [dia] = lerUso('p1');
      expect(dia.minutosUteis).toBe(2);
      // O dwell em uso é amostrado uma vez por minuto útil.
      expect(dia.dwellAmostras).toBe(2);
      expect(dia.dwellSomaMs).toBe(3200);
    });

    it('não conta o mesmo minuto de novo depois de reabrir o app', () => {
      registrarSelecao(T0, 1500);
      _redefinirRegistroDeUso(); // o app fechou e abriu dentro do mesmo minuto
      registrarSelecao(T0 + 5_000, 1500);
      expect(lerUso('p1')[0].minutosUteis).toBe(1);
    });

    it('um dwell que não é número não entra na média, mas o minuto conta', () => {
      registrarSelecao(T0, Number.NaN);
      registrarSelecao(T0 + 61_000, undefined);
      const [dia] = lerUso('p1');
      expect(dia.minutosUteis).toBe(2);
      expect(dia.dwellAmostras).toBe(0);
    });

    it('o dia é o de Brasília: 23h30 de domingo não vira segunda', () => {
      registrarSelecao(Date.parse('2026-10-19T02:30:00Z'), 1500); // domingo 23h30 em Brasília
      registrarSelecao(Date.parse('2026-10-19T03:30:00Z'), 1500); // segunda 00h30
      expect(lerUso('p1').map((d) => d.dia)).toEqual(['2026-10-18', '2026-10-19']);
    });
  });

  describe('caracteres por minuto', () => {
    it('o primeiro avanço da rajada só marca o relógio; os seguintes contam com o intervalo', () => {
      registrarDigitacao(1, T0);
      expect(lerUso('p1')).toEqual([]);
      registrarDigitacao(1, T0 + 2_000);
      registrarDigitacao(14, T0 + 5_000); // uma palavra sugerida entrou de uma vez
      const [dia] = lerUso('p1');
      expect(dia.caracteres).toBe(15);
      expect(dia.msDigitando).toBe(5_000);
    });

    it('pausa longa não conta como tempo digitando (a pessoa foi descansar)', () => {
      registrarDigitacao(1, T0);
      registrarDigitacao(1, T0 + 2_000);
      registrarDigitacao(1, T0 + 2_000 + PAUSA_MAXIMA_NA_DIGITACAO_MS + 1); // volta da pausa: só marca
      registrarDigitacao(2, T0 + 2_000 + PAUSA_MAXIMA_NA_DIGITACAO_MS + 1 + 3_000);
      const [dia] = lerUso('p1');
      expect(dia.caracteres).toBe(3);
      expect(dia.msDigitando).toBe(5_000);
    });

    it('quantidade inválida ou intervalo zero não suja o registro', () => {
      registrarDigitacao(0, T0);
      registrarDigitacao(-3, T0 + 1_000);
      registrarDigitacao(Number.NaN, T0 + 2_000);
      registrarDigitacao(1, T0 + 3_000);
      registrarDigitacao(1, T0 + 3_000); // mesmo instante
      expect(lerUso('p1')).toEqual([]);
    });
  });

  it('conta as correções (desfazer) e os avisos de fadiga do dia', () => {
    registrarCorrecao(T0);
    registrarCorrecao(T0 + 1_000);
    registrarAvisoDeFadiga(T0 + 2_000);
    const [dia] = lerUso('p1');
    expect(dia.desfazer).toBe(2);
    expect(dia.avisosDeFadiga).toBe(1);
    // Correção e aviso não são minutos úteis nem digitação.
    expect(dia.minutosUteis).toBe(0);
    expect(dia.caracteres).toBe(0);
  });

  it('cada paciente tem o seu', () => {
    registrarSelecao(T0, 1500);
    definirPerfilAtivo('p2');
    registrarAvisoDeFadiga(T0);
    expect(lerUso('p1')[0].avisosDeFadiga).toBe(0);
    expect(lerUso('p2')[0].avisosDeFadiga).toBe(1);
    expect(lerUso('p2')[0].minutosUteis).toBe(0);
  });

  describe('o que está guardado', () => {
    // Armazenamento adulterado avisa no console; aqui o aviso é esperado.
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    const guardar =(valor: unknown) => localStorage.setItem(chaveDoUso('p1'), typeof valor === 'string' ? valor : JSON.stringify(valor));
    const dia = (extra: Record<string, unknown> = {}) => ({
      dia: '2026-10-19', minutosUteis: 3, ultimoMinuto: 0, caracteres: 10, msDigitando: 4000, desfazer: 1, avisosDeFadiga: 0,
      dwellSomaMs: 3000, dwellAmostras: 2, ...extra,
    });

    it('JSON quebrado, versão desconhecida ou formato errado dão lista vazia, sem exceção', () => {
      guardar('{nao é json');
      expect(lerUso('p1')).toEqual([]);
      guardar({ versao: 99, dias: [dia()] });
      expect(lerUso('p1')).toEqual([]);
      guardar({ versao: 1, dias: 'x' });
      expect(lerUso('p1')).toEqual([]);
      guardar([dia()]);
      expect(lerUso('p1')).toEqual([]);
    });

    it('descarta registro sem dia válido; número inválido ou negativo vira zero; ordena e junta dias repetidos', () => {
      guardar({
        versao: 1,
        dias: [
          dia({ dia: '2026-10-20', minutosUteis: 5 }),
          dia({ dia: 'ontem' }),
          null,
          dia({ dia: '2026-10-19', minutosUteis: 'muitos', caracteres: -4 }),
          dia({ dia: '2026-10-20', minutosUteis: 7 }),
        ],
      });
      const lidos = lerUso('p1');
      expect(lidos.map((d) => d.dia)).toEqual(['2026-10-19', '2026-10-20']);
      expect(lidos[0]).toMatchObject({ minutosUteis: 0, caracteres: 0 });
      // O repetido fica com o último gravado.
      expect(lidos[1].minutosUteis).toBe(7);
    });

    it('guarda no máximo MAX_DIAS_DE_USO dias — os mais recentes', () => {
      const dias = Array.from({ length: MAX_DIAS_DE_USO }, (_, i) => dia({ dia: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10) }));
      guardar({ versao: 1, dias });
      expect(lerUso('p1')).toHaveLength(MAX_DIAS_DE_USO);
      registrarSelecao(T0, 1500); // um dia novo, bem depois
      const depois = lerUso('p1');
      expect(depois).toHaveLength(MAX_DIAS_DE_USO);
      expect(depois[0].dia).toBe('2025-01-02'); // o mais antigo saiu
      expect(depois[depois.length - 1].dia).toBe('2026-10-19');
    });
  });

  it('armazenamento cheio: não derruba quem registrou e o aviso "não foi possível salvar" aparece', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('cheio', 'QuotaExceededError');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => registrarSelecao(T0, 1500)).not.toThrow();
    expect(falhasDeGravacaoVisiveis()).toContain('historico');
  });

  it('o dwell em uso fica dentro da faixa do app (um valor absurdo não distorce a média)', () => {
    registrarSelecao(T0, 90_000);
    registrarSelecao(T0 + 61_000, 10);
    const [dia] = lerUso('p1');
    expect(dia.dwellAmostras).toBe(2);
    expect(dia.dwellSomaMs).toBe(DWELL_MAX_MS + DWELL_MIN_MS);
  });

  it('registro ilegível: avisa no console (limitado) e recomeça, em vez de falhar calado', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(chaveDoUso('p1'), '{nao é json');
    registrarSelecao(T0, 1500);
    registrarSelecao(T0 + 61_000, 1500);
    expect(lerUso('p1')[0].minutosUteis).toBe(2);
    // Uma linha só, não uma por clique.
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('o registro de um paciente nunca vaza para o dia de outro (cada chave é do seu paciente)', () => {
    registrarSelecao(T0, 1500);
    expect(localStorage.getItem(chaveDoUso('p1'))).not.toBeNull();
    expect(localStorage.getItem(chaveDoUso('p2'))).toBeNull();
  });
});

describe('rotaContaComoUso', () => {
  it('conta as telas que o paciente usa para se comunicar, descansar e se distrair', () => {
    for (const rota of [
      '/menu', '/keyboard', '/phrases', '/comunicacao', '/sim-nao', '/dor', '/minha-voz', '/minha-voz/gravar', '/pictograms',
      '/conversation', '/options', '/rest', '/meditation', '/games', '/games/bubble', '/drawing', '/gallery', '/photo', '/news',
    ]) {
      expect(rotaContaComoUso(rota), rota).toBe(true);
    }
  });

  it('não conta a área do cuidador, os ajustes, o caminho até a calibração, a evolução e a consulta', () => {
    for (const rota of [
      '/', '/intro', '/login', '/activated', '/consent', '/profiles', '/setup', '/setup/camera', '/welcome', '/tutorial',
      '/calibration-check', '/calibration/resultado', '/retomada',
      '/settings', '/settings/voice', '/accessibility', '/voice', '/virtual-mouse',
      '/conta', '/historico', '/relatorio', '/caregiver', '/caregiver/guide',
      '/evolucao', '/consulta',
    ]) {
      expect(rotaContaComoUso(rota), rota).toBe(false);
    }
  });

  it('não conta a Emergência: um aumento ali é aflição, não melhora', () => {
    expect(rotaContaComoUso('/emergency')).toBe(false);
  });

  it('prefixo parcial não conta como a rota', () => {
    // `/consulta` na lista não pode esconder `/consultas-do-menu`.
    expect(rotaContaComoUso('/consultas-do-menu')).toBe(true);
    expect(rotaContaComoUso('/settingsX')).toBe(true);
  });

  it('rota vazia ou estranha não derruba', () => {
    expect(() => rotaContaComoUso('')).not.toThrow();
    expect(rotaContaComoUso('')).toBe(false);
  });
});

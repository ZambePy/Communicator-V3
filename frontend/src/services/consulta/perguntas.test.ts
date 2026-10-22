import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirPerfilAtivo, setConsent } from '../../utils/clinicalLogger';
import { chaveDasPerguntas } from '../evolucao/chaves';
import { _redefinirFalhasDeGravacao, falhasDeGravacaoVisiveis } from '../local/falhasDeGravacao';
import {
  MAX_PERGUNTAS,
  MAX_TEXTO_DA_PERGUNTA,
  adicionarPergunta,
  lerPerguntas,
  marcarComoFeita,
  perguntasDasFrases,
  removerPergunta,
} from './perguntas';

// Perguntas para levar ao médico. Duas origens: o cuidador, que digita, e o
// paciente — que escreve (ou fala) pelo teclado do olhar e cujas frases com "?"
// podem ser levadas à consulta com um toque.

const AGORA = Date.parse('2026-10-21T15:00:00Z');

describe('perguntas da consulta', () => {
  beforeEach(() => {
    _redefinirFalhasDeGravacao();
    definirPerfilAtivo('p1');
    setConsent(true);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('adicionar', () => {
    it('guarda a pergunta com quem a fez, e a lista volta na ordem em que foram feitas', () => {
      expect(adicionarPergunta('Posso dormir com a cabeceira mais alta?', 'paciente', AGORA)).toBe('gravado');
      expect(adicionarPergunta('Qual o horário do remédio da noite?', 'cuidador', AGORA + 1000)).toBe('gravado');
      const lista = lerPerguntas('p1');
      expect(lista.map((p) => [p.texto, p.quem, p.feita])).toEqual([
        ['Posso dormir com a cabeceira mais alta?', 'paciente', false],
        ['Qual o horário do remédio da noite?', 'cuidador', false],
      ]);
      expect(lista[0].id).not.toBe(lista[1].id);
      expect(lista[0].criadaEm).toBe(new Date(AGORA).toISOString());
    });

    it('apara espaços e junta os repetidos no meio', () => {
      adicionarPergunta('  Posso   comer\n  sozinho?  ', 'cuidador', AGORA);
      expect(lerPerguntas('p1')[0].texto).toBe('Posso comer sozinho?');
    });

    it('sem crypto.randomUUID (contexto sem ele) ainda grava, com um id próprio e único', () => {
      // Rodada 1 da revisão: o perfil e o aparelho já tinham esta saída; sem ela,
      // o submit lançava e a tela caía na fronteira de erro sem dizer nada.
      vi.stubGlobal('crypto', {});
      try {
        expect(adicionarPergunta('Primeira?', 'cuidador', AGORA)).toBe('gravado');
        expect(adicionarPergunta('Segunda?', 'cuidador', AGORA)).toBe('gravado');
      } finally {
        vi.unstubAllGlobals();
      }
      const [a, b] = lerPerguntas('p1');
      expect(a.id).toBeTruthy();
      expect(a.id).not.toBe(b.id);
    });

    it('vazia é recusada', () => {
      expect(adicionarPergunta('   ', 'cuidador', AGORA)).toBe('invalido');
      expect(lerPerguntas('p1')).toEqual([]);
    });

    it('autor desconhecido é recusado', () => {
      expect(adicionarPergunta('Oi?', 'médico' as never, AGORA)).toBe('invalido');
    });

    it('a mesma pergunta pendente não entra duas vezes (maiúsculas e espaços não contam)', () => {
      adicionarPergunta('Posso comer sozinho?', 'cuidador', AGORA);
      expect(adicionarPergunta('posso  comer SOZINHO?', 'paciente', AGORA)).toBe('repetida');
      expect(lerPerguntas('p1')).toHaveLength(1);
    });

    it('uma já feita pode ser perguntada de novo', () => {
      adicionarPergunta('Posso comer sozinho?', 'cuidador', AGORA);
      marcarComoFeita(lerPerguntas('p1')[0].id);
      expect(adicionarPergunta('Posso comer sozinho?', 'cuidador', AGORA)).toBe('gravado');
    });

    it('o texto é cortado em MAX_TEXTO_DA_PERGUNTA', () => {
      adicionarPergunta('a'.repeat(MAX_TEXTO_DA_PERGUNTA + 40), 'cuidador', AGORA);
      expect(lerPerguntas('p1')[0].texto).toHaveLength(MAX_TEXTO_DA_PERGUNTA);
    });

    it('lista cheia: abre espaço tirando a feita mais antiga; sem nenhuma feita, diz "cheia" em vez de apagar pergunta pendente', () => {
      for (let i = 0; i < MAX_PERGUNTAS; i += 1) adicionarPergunta(`Pergunta ${i}?`, 'cuidador', AGORA + i);
      expect(adicionarPergunta('Mais uma?', 'cuidador', AGORA + 999)).toBe('cheia');
      expect(lerPerguntas('p1')).toHaveLength(MAX_PERGUNTAS);

      marcarComoFeita(lerPerguntas('p1')[3].id);
      expect(adicionarPergunta('Mais uma?', 'cuidador', AGORA + 999)).toBe('gravado');
      const textos = lerPerguntas('p1').map((p) => p.texto);
      expect(textos).toHaveLength(MAX_PERGUNTAS);
      expect(textos).not.toContain('Pergunta 3?');
      expect(textos).toContain('Mais uma?');
    });

    it('sem a autorização do histórico clínico, nada é guardado', () => {
      setConsent(false);
      expect(adicionarPergunta('Oi?', 'cuidador', AGORA)).toBe('sem_consentimento');
      expect(localStorage.getItem(chaveDasPerguntas('p1'))).toBeNull();
    });

    it('sem paciente escolhido: "sem_perfil"', () => {
      definirPerfilAtivo(null);
      expect(adicionarPergunta('Oi?', 'cuidador', AGORA)).toBe('sem_perfil');
    });

    it('armazenamento cheio: "falhou" e o aviso aparece', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('cheio', 'QuotaExceededError');
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(adicionarPergunta('Oi?', 'cuidador', AGORA)).toBe('falhou');
      expect(falhasDeGravacaoVisiveis()).toContain('historico');
    });
  });

  describe('marcar como feita e remover', () => {
    it('marcar e desmarcar', () => {
      adicionarPergunta('Oi?', 'cuidador', AGORA);
      const { id } = lerPerguntas('p1')[0];
      expect(marcarComoFeita(id)).toBe('gravado');
      expect(lerPerguntas('p1')[0].feita).toBe(true);
      expect(marcarComoFeita(id, false)).toBe('gravado');
      expect(lerPerguntas('p1')[0].feita).toBe(false);
    });

    it('remover tira só aquela', () => {
      adicionarPergunta('Primeira?', 'cuidador', AGORA);
      adicionarPergunta('Segunda?', 'cuidador', AGORA + 1);
      expect(removerPergunta(lerPerguntas('p1')[0].id)).toBe('gravado');
      expect(lerPerguntas('p1').map((p) => p.texto)).toEqual(['Segunda?']);
    });

    it('id que não existe: "invalido", e nada muda', () => {
      adicionarPergunta('Oi?', 'cuidador', AGORA);
      expect(marcarComoFeita('nao-existe')).toBe('invalido');
      expect(removerPergunta('nao-existe')).toBe('invalido');
      expect(lerPerguntas('p1')).toHaveLength(1);
    });
  });

  describe('ler', () => {
    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('conteúdo estragado dá lista vazia, sem exceção', () => {
      for (const ruim of ['{não é json', JSON.stringify({ versao: 9, perguntas: [] }), JSON.stringify({ versao: 1, perguntas: 'x' }), '[]']) {
        localStorage.setItem(chaveDasPerguntas('p1'), ruim);
        expect(lerPerguntas('p1')).toEqual([]);
      }
    });

    it('descarta item sem texto ou com autor desconhecido; id e feita são corrigidos', () => {
      localStorage.setItem(
        chaveDasPerguntas('p1'),
        JSON.stringify({
          versao: 1,
          perguntas: [
            { id: 'a', texto: 'Boa?', quem: 'paciente', criadaEm: '2026-10-20T10:00:00.000Z', feita: 'sim' },
            { id: 'b', texto: '', quem: 'paciente', criadaEm: '2026-10-20T10:00:00.000Z', feita: false },
            { id: 'c', texto: 'Quem?', quem: 'vizinho', criadaEm: '2026-10-20T10:00:00.000Z', feita: false },
            null,
          ],
        }),
      );
      expect(lerPerguntas('p1')).toEqual([{ id: 'a', texto: 'Boa?', quem: 'paciente', criadaEm: '2026-10-20T10:00:00.000Z', feita: false }]);
    });

    it('cada paciente tem as suas', () => {
      adicionarPergunta('Do p1?', 'cuidador', AGORA);
      expect(lerPerguntas('p2')).toEqual([]);
    });
  });
});

describe('perguntasDasFrases (o que o paciente escreveu pelo teclado do olhar)', () => {
  const frase = (text: string, iso: string) => ({ id: iso + text, text, timestamp: iso });

  it('pega só as frases com "?", das mais novas para as mais antigas, sem repetir', () => {
    const r = perguntasDasFrases(
      [
        frase('Quero água', '2026-10-20T10:00:00Z'),
        frase('Posso tomar banho hoje?', '2026-10-18T10:00:00Z'),
        frase('Quando é a consulta?', '2026-10-20T10:00:00Z'),
        frase('posso tomar banho hoje?', '2026-10-19T10:00:00Z'),
      ],
      [],
      AGORA,
    );
    expect(r).toEqual(['Quando é a consulta?', 'posso tomar banho hoje?']);
  });

  it('ignora o que é mais antigo que 30 dias (no dia de Brasília)', () => {
    const r = perguntasDasFrases(
      [frase('Muito antiga?', '2026-09-10T10:00:00Z'), frase('No limite?', '2026-09-21T15:00:00Z')],
      [],
      AGORA,
    );
    expect(r).toEqual(['No limite?']);
  });

  it('não repete o que já está na lista da consulta', () => {
    const jaNaLista = [{ id: '1', texto: 'Quando é a consulta?', quem: 'paciente' as const, criadaEm: '2026-10-20T10:00:00.000Z', feita: false }];
    const r = perguntasDasFrases([frase('Quando é a consulta?', '2026-10-20T10:00:00Z'), frase('Outra?', '2026-10-19T10:00:00Z')], jaNaLista, AGORA);
    expect(r).toEqual(['Outra?']);
  });

  it('devolve no máximo 8 e ignora frase só com "?" ou longa demais', () => {
    const muitas = Array.from({ length: 12 }, (_, i) => frase(`Pergunta número ${i}?`, `2026-10-${String(10 + i).padStart(2, '0')}T10:00:00Z`));
    const r = perguntasDasFrases(
      [...muitas, frase('?', '2026-10-20T10:00:00Z'), frase(`${'x'.repeat(MAX_TEXTO_DA_PERGUNTA + 1)}?`, '2026-10-20T10:00:00Z')],
      [],
      AGORA,
    );
    expect(r).toHaveLength(8);
    expect(r).not.toContain('?');
    expect(r[0]).toBe('Pergunta número 11?');
  });

  it('frases com data inválida ficam de fora', () => {
    expect(perguntasDasFrases([frase('Quando?', 'ontem')], [], AGORA)).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  MISSOES,
  missaoAtiva,
  iniciarMissao,
  abandonarMissao,
  cumprirMissao,
  missaoCumprida,
  missoesCumpridas,
  guardarPasso,
  passoGuardado,
  limparMissoes,
} from './missao';

/**
 * As missões são o combinado entre o tutorial e as telas reais: o passo manda a
 * pessoa ao teclado, a tela real avisa quando ela escreveu, o passo destrava.
 *
 * Duas propriedades importam mais que as outras, e as duas são sobre NÃO
 * atrapalhar o uso normal:
 *
 *   1. `cumprirMissao` é chamada no fluxo normal do teclado, das frases e dos
 *      jogos — a esmagadora maioria das vezes SEM tutorial nenhum rodando. Ela
 *      não pode fazer nada nesse caso, e não pode lançar.
 *   2. Nada disso pode derrubar a tela quando o storage não existe (janela
 *      anônima, dados do site bloqueados). Um tutorial sem memória é chato;
 *      um teclado que não abre é grave.
 */
describe('missões do tutorial', () => {
  beforeEach(() => {
    limparMissoes();
  });

  it('começa sem missão e sem nada cumprido', () => {
    expect(missaoAtiva()).toBeNull();
    expect(missoesCumpridas()).toEqual([]);
  });

  it('iniciar torna a missão a ativa', () => {
    iniciarMissao('digitacao');
    expect(missaoAtiva()).toBe('digitacao');
  });

  it('cumprir a missão ativa a marca e encerra', () => {
    iniciarMissao('digitacao');
    cumprirMissao('digitacao');
    expect(missaoCumprida('digitacao')).toBe(true);
    expect(missaoAtiva()).toBeNull();
  });

  it('cumprir SEM missão ativa não faz nada — é o uso normal do app', () => {
    // O teclado chama `cumprirMissao('digitacao')` toda vez que alguém fala
    // uma frase, tutorial ou não.
    expect(() => cumprirMissao('digitacao')).not.toThrow();
    expect(missaoCumprida('digitacao')).toBe(false);
  });

  it('cumprir OUTRA missão que não a ativa não marca nada', () => {
    iniciarMissao('digitacao');
    cumprirMissao('lazer');
    expect(missaoCumprida('lazer')).toBe(false);
    expect(missaoAtiva()).toBe('digitacao');
  });

  it('abandonar encerra sem marcar — voltar sem fazer é legítimo', () => {
    iniciarMissao('conversa');
    abandonarMissao();
    expect(missaoAtiva()).toBeNull();
    expect(missaoCumprida('conversa')).toBe(false);
  });

  it('missões cumpridas acumulam e não se apagam entre si', () => {
    for (const m of MISSOES) {
      iniciarMissao(m);
      cumprirMissao(m);
    }
    expect(new Set(missoesCumpridas())).toEqual(new Set(MISSOES));
  });

  it('cumprir duas vezes é idempotente', () => {
    iniciarMissao('lazer');
    cumprirMissao('lazer');
    cumprirMissao('lazer');
    expect(missoesCumpridas().filter((m) => m === 'lazer')).toHaveLength(1);
  });

  it('o passo guardado sobrevive à ida e volta, e é limpo ao sair', () => {
    guardarPasso('digitacao');
    expect(passoGuardado()).toBe('digitacao');
    limparMissoes();
    expect(passoGuardado()).toBeNull();
  });

  it('lixo no storage não vira missão', () => {
    // Um valor plantado por outra versão, ou corrompido, não pode virar uma
    // missão ativa nem uma missão cumprida.
    sessionStorage.setItem('irisflow_tutorial_missao', 'configuracoes');
    sessionStorage.setItem('irisflow_tutorial_missoes_ok', '{"nao":"e uma lista"}');
    expect(missaoAtiva()).toBeNull();
    expect(missoesCumpridas()).toEqual([]);
  });

  it('JSON quebrado na lista de cumpridas não derruba nada', () => {
    sessionStorage.setItem('irisflow_tutorial_missoes_ok', '[isto não é json');
    expect(missoesCumpridas()).toEqual([]);
  });
});

describe('sem sessionStorage (janela anônima, dados bloqueados)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('nenhuma operação lança — o app segue, só sem memória', () => {
    const explodir = () => {
      throw new DOMException('acesso negado', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(explodir);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(explodir);
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(explodir);

    expect(() => {
      iniciarMissao('digitacao');
      cumprirMissao('digitacao');
      abandonarMissao();
      guardarPasso('lazer');
      limparMissoes();
    }).not.toThrow();
    expect(missaoAtiva()).toBeNull();
    expect(missoesCumpridas()).toEqual([]);
    expect(passoGuardado()).toBeNull();
  });
});

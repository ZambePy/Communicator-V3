import { describe, it, expect } from 'vitest';
import {
  SIMBOLOS_DO_TECLADO_LATERAL as SIMBOLOS,
  ladosDoTeclado,
  escolherLado,
  aplicarSimbolo,
  aplicarPrevisao,
  palavraEmCurso,
  previsaoDoTeclado,
  type EstadoDoTecladoLateral,
  type LadoDoTeclado,
  type SimboloLateral,
} from './divisaoDoTecladoLateral';

// Teclado lateral (modo só horizontal, pedido de 21/10/2026): cada escolha
// divide o que sobra ao meio — esquerda ou direita — até sobrar um símbolo.

const nomeDo = (s: SimboloLateral) => (s.tipo === 'letra' ? s.valor : s.tipo);

describe('a divisão binária', () => {
  it('o alfabeto inteiro mais espaço, apagar e falar', () => {
    expect(SIMBOLOS.map(nomeDo).join(' ')).toBe(
      'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z espaco apagar falar',
    );
  });

  it('sem previsão, o começo já divide tudo ao meio (a esquerda leva o símbolo do meio)', () => {
    const { esquerda, direita } = ladosDoTeclado(null, null);
    expect(esquerda).toEqual({ tipo: 'faixa', inicio: 0, fim: 15 });
    expect(direita).toEqual({ tipo: 'faixa', inicio: 15, fim: SIMBOLOS.length });
  });

  it('com previsão, ela é um dos lados no começo; o outro lado é o teclado inteiro', () => {
    const { esquerda, direita } = ladosDoTeclado(null, 'QUERO');
    expect(esquerda).toEqual({ tipo: 'previsao', palavra: 'QUERO' });
    expect(direita).toEqual({ tipo: 'faixa', inicio: 0, fim: SIMBOLOS.length });
    // Escolher o teclado entra na divisão, sem previsão no caminho.
    const r = escolherLado(direita);
    expect(r).toEqual({ tipo: 'estreitar', estado: { inicio: 0, fim: SIMBOLOS.length } });
    expect(ladosDoTeclado((r as { estado: EstadoDoTecladoLateral }).estado, 'QUERO').esquerda).toEqual({ tipo: 'faixa', inicio: 0, fim: 15 });
  });

  it('todo símbolo sai em no máximo 5 escolhas, e cada caminho termina num símbolo só', () => {
    const alcancados: string[] = [];
    const percorrer = (estado: EstadoDoTecladoLateral, profundidade: number) => {
      expect(profundidade).toBeLessThanOrEqual(5);
      const { esquerda, direita } = ladosDoTeclado(estado, null);
      for (const lado of [esquerda, direita] as LadoDoTeclado[]) {
        const r = escolherLado(lado);
        if (r.tipo === 'simbolo') alcancados.push(nomeDo(r.simbolo));
        else if (r.tipo === 'estreitar') percorrer(r.estado, profundidade + 1);
        else throw new Error('previsão fora do começo');
      }
    };
    percorrer(null, 1);
    expect(alcancados).toEqual(SIMBOLOS.map(nomeDo));
  });

  it('um lado de um símbolo só é a ação; de mais de um, estreita', () => {
    expect(escolherLado({ tipo: 'faixa', inicio: 0, fim: 1 })).toEqual({ tipo: 'simbolo', simbolo: { tipo: 'letra', valor: 'A' } });
    expect(escolherLado({ tipo: 'faixa', inicio: 0, fim: 2 })).toEqual({ tipo: 'estreitar', estado: { inicio: 0, fim: 2 } });
    expect(escolherLado({ tipo: 'previsao', palavra: 'ÁGUA' })).toEqual({ tipo: 'previsao', palavra: 'ÁGUA' });
  });
});

describe('o que cada escolha faz no texto', () => {
  it('letra escreve; espaço não dobra nem começa o texto; apagar tira a última', () => {
    expect(aplicarSimbolo('EU', { tipo: 'letra', valor: 'A' })).toEqual({ texto: 'EUA' });
    expect(aplicarSimbolo('EU', { tipo: 'espaco' })).toEqual({ texto: 'EU ' });
    expect(aplicarSimbolo('EU ', { tipo: 'espaco' })).toEqual({ texto: 'EU ' });
    expect(aplicarSimbolo('', { tipo: 'espaco' })).toEqual({ texto: '' });
    expect(aplicarSimbolo('EU', { tipo: 'apagar' })).toEqual({ texto: 'E' });
    expect(aplicarSimbolo('', { tipo: 'apagar' })).toEqual({ texto: '' });
  });

  it('falar devolve a frase e limpa a linha; sem frase, não fala nada', () => {
    expect(aplicarSimbolo('EU QUERO ÁGUA ', { tipo: 'falar' })).toEqual({ texto: '', falar: 'EU QUERO ÁGUA' });
    expect(aplicarSimbolo('   ', { tipo: 'falar' })).toEqual({ texto: '   ' });
  });

  it('a previsão completa a palavra em curso, em maiúsculas, com o espaço depois', () => {
    expect(aplicarPrevisao('EU QU', 'quero')).toBe('EU QUERO ');
    expect(aplicarPrevisao('AG', 'água')).toBe('ÁGUA ');
  });

  it('a palavra em curso é o que vem depois do último espaço', () => {
    expect(palavraEmCurso('EU QU')).toBe('QU');
    expect(palavraEmCurso('EU ')).toBe('');
    expect(palavraEmCurso('')).toBe('');
  });
});

describe('a previsão do teclado lateral', () => {
  const sugerir = (texto: string) => (texto.endsWith('Q') ? ['quero', 'dor'] : ['preciso', 'quero']);

  it('com uma palavra começada, a primeira sugestão que a continua', () => {
    expect(previsaoDoTeclado('EU Q', sugerir)).toBe('QUERO');
  });

  it('sem palavra começada (texto vazio ou depois do espaço), nada: a reserva do assistente não vira lado', () => {
    expect(previsaoDoTeclado('', sugerir)).toBeNull();
    expect(previsaoDoTeclado('EU ', sugerir)).toBeNull();
  });

  it('sugestão que não continua a palavra, ou igual a ela, não vale', () => {
    expect(previsaoDoTeclado('EU X', () => ['quero'])).toBeNull();
    expect(previsaoDoTeclado('EU DOR', () => ['dor'])).toBeNull();
  });

  it('o assistente que falha não derruba o teclado', () => {
    expect(previsaoDoTeclado('EU Q', () => { throw new Error('sem armazenamento'); })).toBeNull();
  });
});

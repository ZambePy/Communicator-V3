import { describe, it, expect } from 'vitest';
import { PALAVRAS_COMUNS } from '@tracker/assistente';
import {
  FALAS_PARA_APRENDER,
  MAX_FALAS_CONTADAS,
  MAX_SIGLA,
  MAX_SIGNIFICADO,
  SEMENTES,
  acronimoDaFrase,
  aprendidasDasFalas,
  contarFala,
  frasesCurtasDoTexto,
  listarAbreviacoes,
  montarDicionario,
  sementesAlteradas,
  validarAbreviacao,
  type AbreviacoesDoPerfil,
  type FalasContadas,
} from './dicionario';

// O dicionário do paciente é a soma de três coisas — as sementes, o que o
// aparelho aprendeu e o que a pessoa mudou à mão — e a pessoa sempre vence.

const nada: AbreviacoesDoPerfil = { editadas: {}, removidas: [] };

describe('validarAbreviacao', () => {
  it('guarda a abreviação em minúsculas e sem acento, e o significado com espaços arrumados', () => {
    expect(validarAbreviacao('  OBG ', '  muito   obrigado ')).toEqual({
      ok: true,
      sigla: 'obg',
      significado: 'muito obrigado',
    });
    expect(validarAbreviacao('TÁ', 'está')).toEqual({ ok: true, sigla: 'ta', significado: 'está' });
  });

  it('abreviação vazia: pede para escrever', () => {
    const r = validarAbreviacao('   ', 'obrigado');
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/Escreva a abreviação/) });
  });

  it('só letras: espaço, número, pontuação e símbolo são recusados com uma frase que explica', () => {
    for (const ruim of ['o b', 'ob2', 'ob-g', 'ob.', '__proto__', 'o/b']) {
      const r = validarAbreviacao(ruim, 'obrigado');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.motivo).toMatch(/só letras/i);
    }
  });

  it('até 8 letras; 9 não', () => {
    expect(validarAbreviacao('a'.repeat(MAX_SIGLA), 'algo').ok).toBe(true);
    const r = validarAbreviacao('a'.repeat(MAX_SIGLA + 1), 'algo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/até 8 letras/);
  });

  it('o nome de uma propriedade de objeto não passa (constructor tem 11 letras)', () => {
    expect(validarAbreviacao('constructor', 'algo').ok).toBe(false);
  });

  it('significado vazio ou comprido demais é recusado', () => {
    const vazio = validarAbreviacao('obg', '   ');
    expect(vazio).toEqual({ ok: false, motivo: expect.stringMatching(/o que a abreviação quer dizer/i) });
    expect(validarAbreviacao('obg', 'x'.repeat(MAX_SIGNIFICADO)).ok).toBe(true);
    const longo = validarAbreviacao('obg', 'x'.repeat(MAX_SIGNIFICADO + 1));
    expect(longo.ok).toBe(false);
    if (!longo.ok) expect(longo.motivo).toMatch(/até 42/);
  });

  it('o limite do significado é o que cabe numa célula do teclado: 42 letras, como as frases', () => {
    expect(MAX_SIGNIFICADO).toBe(42);
  });

  it('o significado igual à abreviação não ajuda ninguém', () => {
    const r = validarAbreviacao('ok', 'OK');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toMatch(/iguais/);
  });
});

describe('montarDicionario', () => {
  it('sem nenhuma mudança são as sementes', () => {
    expect(montarDicionario(nada)).toEqual({ ...SEMENTES });
  });

  it('o que a pessoa mudou vence a semente', () => {
    expect(montarDicionario({ editadas: { pq: 'porque' }, removidas: [] }).pq).toBe('porque');
  });

  it('o que a pessoa acrescentou entra', () => {
    expect(montarDicionario({ editadas: { ctz: 'certeza' }, removidas: [] }).ctz).toBe('certeza');
  });

  it('o que a pessoa apagou sai, semente ou aprendida', () => {
    const d = montarDicionario({ editadas: {}, removidas: ['vc', 'ecd'] }, { ecd: 'estou com dor' });
    expect(d.vc).toBeUndefined();
    expect(d.ecd).toBeUndefined();
    expect(d.obg).toBe('obrigado');
  });

  it('as aprendidas entram, mas nunca trocam uma semente', () => {
    const d = montarDicionario(nada, { td: 'tenho dor', ecd: 'estou com dor' });
    expect(d.td).toBe('tudo');
    expect(d.ecd).toBe('estou com dor');
  });

  it('o que a pessoa acabou de escrever vence até um apagar antigo da mesma sigla', () => {
    expect(montarDicionario({ editadas: { vc: 'você' }, removidas: ['vc'] }).vc).toBe('você');
  });

  it('não mexe nos objetos recebidos', () => {
    const estado: AbreviacoesDoPerfil = { editadas: { x: 'xis' }, removidas: ['vc'] };
    const aprendidas = { ecd: 'estou com dor' };
    montarDicionario(estado, aprendidas);
    expect(estado).toEqual({ editadas: { x: 'xis' }, removidas: ['vc'] });
    expect(aprendidas).toEqual({ ecd: 'estou com dor' });
  });
});

describe('listarAbreviacoes — o que a tela de ajustes mostra', () => {
  it('em ordem alfabética, dizendo de onde cada uma veio', () => {
    const lista = listarAbreviacoes(
      { editadas: { pq: 'porque', ctz: 'certeza' }, removidas: ['vc'] },
      { ecd: 'estou com dor' },
    );
    const siglas = lista.map((i) => i.sigla);
    expect(siglas).toEqual([...siglas].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    expect(siglas).not.toContain('vc');
    expect(lista.find((i) => i.sigla === 'obg')).toEqual({
      sigla: 'obg',
      significado: 'obrigado',
      origem: 'semente',
      mudada: false,
    });
    expect(lista.find((i) => i.sigla === 'pq')).toEqual({
      sigla: 'pq',
      significado: 'porque',
      origem: 'semente',
      mudada: true,
    });
    expect(lista.find((i) => i.sigla === 'ctz')).toEqual({
      sigla: 'ctz',
      significado: 'certeza',
      origem: 'minha',
      mudada: false,
    });
    expect(lista.find((i) => i.sigla === 'ecd')).toEqual({
      sigla: 'ecd',
      significado: 'estou com dor',
      origem: 'aprendida',
      mudada: false,
    });
  });

  it('uma aprendida que a pessoa mudou à mão passa a ser dela', () => {
    const lista = listarAbreviacoes({ editadas: { ecd: 'estou com muita dor' }, removidas: [] }, { ecd: 'estou com dor' });
    expect(lista.find((i) => i.sigla === 'ecd')).toMatchObject({ origem: 'minha', significado: 'estou com muita dor' });
  });
});

describe('sementesAlteradas', () => {
  it('conta as sementes mudadas ou apagadas — o que "Restaurar" desfaz', () => {
    expect(sementesAlteradas(nada)).toBe(0);
    expect(sementesAlteradas({ editadas: { pq: 'porque', ctz: 'certeza' }, removidas: ['vc', 'ecd'] })).toBe(2);
    // Editar uma semente para o próprio valor não é alteração.
    expect(sementesAlteradas({ editadas: { obg: 'obrigado' }, removidas: [] })).toBe(0);
  });
});

describe('acronimoDaFrase', () => {
  it('é a inicial de cada palavra, de 2 a 5 palavras', () => {
    expect(acronimoDaFrase('estou com dor')).toBe('ecd');
    expect(acronimoDaFrase('ESTOU COM DOR')).toBe('ecd');
    expect(acronimoDaFrase('Quero mudar de posição!')).toBe('qmdp');
    expect(acronimoDaFrase('boa noite')).toBe('bn');
    expect(acronimoDaFrase('é hora do remédio')).toBe('ehdr');
  });

  it('uma palavra só, cinco palavras ou mais, número e vazio: nada', () => {
    expect(acronimoDaFrase('água')).toBeNull();
    expect(acronimoDaFrase('quero que você me traga um copo')).toBeNull();
    expect(acronimoDaFrase('um dois três quatro cinco')).toBe('udtqc');
    expect(acronimoDaFrase('um dois três quatro cinco seis')).toBeNull();
    expect(acronimoDaFrase('tenho 2 dores')).toBeNull();
    expect(acronimoDaFrase('   ')).toBeNull();
  });
});

describe('frasesCurtasDoTexto — o que conta como "escrito por extenso"', () => {
  it('uma frase de 2 a 5 palavras, sem a pontuação do fim', () => {
    expect(frasesCurtasDoTexto('Estou com dor.')).toEqual(['Estou com dor']);
  });

  it('o teclado escreve em maiúsculas: a frase guardada vem em minúsculas', () => {
    expect(frasesCurtasDoTexto('ESTOU COM DOR')).toEqual(['estou com dor']);
  });

  it('um texto com várias frases dá as frases curtas, na ordem', () => {
    expect(frasesCurtasDoTexto('Quero água. Obrigado! Estou com sede\nmuita sede')).toEqual([
      'Quero água',
      'Estou com sede',
      'muita sede',
    ]);
  });

  it('frase longa demais, uma palavra só e vazio: nada', () => {
    expect(frasesCurtasDoTexto('Quero que você me traga um copo de água gelada')).toEqual([]);
    expect(frasesCurtasDoTexto('Obrigado')).toEqual([]);
    expect(frasesCurtasDoTexto('')).toEqual([]);
  });
});

describe('contarFala', () => {
  it('a mesma frase, em outra caixa e com outra pontuação, soma na mesma conta', () => {
    const falas: FalasContadas = {};
    contarFala(falas, 'Estou com dor.', 100);
    contarFala(falas, 'ESTOU COM DOR', 200);
    contarFala(falas, 'estou com dor!', 300);
    expect(Object.keys(falas)).toEqual(['estou com dor']);
    expect(falas['estou com dor']).toMatchObject({ n: 3, em: 300 });
  });

  it('guarda no máximo MAX_FALAS_CONTADAS frases e preserva as mais repetidas', () => {
    const falas: FalasContadas = {};
    for (let i = 0; i < 3; i++) contarFala(falas, 'estou com dor', i);
    for (let i = 0; i < MAX_FALAS_CONTADAS + 25; i++) contarFala(falas, `frase numero ${letras(i)} aqui`, 1000 + i);
    expect(Object.keys(falas).length).toBeLessThanOrEqual(MAX_FALAS_CONTADAS);
    expect(falas['estou com dor']?.n).toBe(3);
  });
});

/** Letras a partir de um número, para frases distintas sem dígitos. */
function letras(n: number): string {
  let s = '';
  let resto = n;
  do {
    s = String.fromCharCode(97 + (resto % 26)) + s;
    resto = Math.floor(resto / 26);
  } while (resto > 0);
  return s;
}

describe('aprendidasDasFalas', () => {
  const falasCom = (itens: Record<string, { texto: string; n: number; em?: number }>): FalasContadas =>
    Object.fromEntries(Object.entries(itens).map(([k, v]) => [k, { texto: v.texto, n: v.n, em: v.em ?? 0 }]));

  it('só depois de falar a frase pelo menos três vezes', () => {
    expect(FALAS_PARA_APRENDER).toBe(3);
    expect(aprendidasDasFalas(falasCom({ 'estou com dor': { texto: 'estou com dor', n: 2 } }))).toEqual({});
    expect(aprendidasDasFalas(falasCom({ 'estou com dor': { texto: 'estou com dor', n: 3 } }))).toEqual({
      ecd: 'estou com dor',
    });
  });

  it('duas frases com a mesma sigla: fica a mais falada; empatadas, a mais recente', () => {
    const maisFalada = aprendidasDasFalas(
      falasCom({
        'estou com dor': { texto: 'estou com dor', n: 5 },
        'estou com desconforto': { texto: 'estou com desconforto', n: 3 },
      }),
    );
    expect(maisFalada.ecd).toBe('estou com dor');

    const maisRecente = aprendidasDasFalas(
      falasCom({
        'estou com dor': { texto: 'estou com dor', n: 3, em: 10 },
        'estou com desconforto': { texto: 'estou com desconforto', n: 3, em: 20 },
      }),
    );
    expect(maisRecente.ecd).toBe('estou com desconforto');
  });

  it('não aprende sigla que já é de uma semente ou de uma escolha da pessoa', () => {
    const falas = falasCom({ 'tenho dor': { texto: 'tenho dor', n: 4 } });
    expect(aprendidasDasFalas(falas, { ocupadas: ['td'] })).toEqual({});
    expect(aprendidasDasFalas(falas, { ocupadas: Object.keys(SEMENTES) })).toEqual({});
    expect(aprendidasDasFalas(falas)).toEqual({});
  });

  it('não aprende sigla que é uma palavra comum, para o chip não aparecer no meio de uma palavra', () => {
    expect(PALAVRAS_COMUNS).toContain('ar');
    const falas = falasCom({ 'a roupa': { texto: 'a roupa', n: 6 } });
    expect(aprendidasDasFalas(falas)).toEqual({});
  });

  it('frase com mais de cinco palavras ou uma palavra só nunca vira abreviação', () => {
    const falas = falasCom({
      'quero que voce me traga um copo': { texto: 'quero que você me traga um copo', n: 9 },
      obrigado: { texto: 'obrigado', n: 9 },
    });
    expect(aprendidasDasFalas(falas)).toEqual({});
  });
});

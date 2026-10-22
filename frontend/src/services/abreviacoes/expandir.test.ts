import { describe, it, expect } from 'vitest';
import { aplicarExpansao, expandir, expansaoDoTexto } from './expandir';
import { SEMENTES } from './dicionario';

// Abreviações (roadmap 2, rodada 3 de 21/10/2026): "obg" vira "obrigado" como
// CHIP de previsão — nunca como troca automática. Estes testes fixam o que a
// expansão devolve: respeita a caixa que o paciente usou e a pontuação grudada
// na palavra.

const D = { ...SEMENTES };

describe('sementes em português do Brasil', () => {
  it('são as catorze combinadas, cada uma com o seu significado', () => {
    expect(SEMENTES).toEqual({
      obg: 'obrigado',
      pfv: 'por favor',
      vc: 'você',
      td: 'tudo',
      tb: 'também',
      hj: 'hoje',
      qd: 'quando',
      pq: 'por que',
      msg: 'mensagem',
      n: 'não',
      s: 'sim',
      agr: 'agora',
      dps: 'depois',
      blz: 'beleza',
    });
  });
});

describe('expandir — a caixa da palavra', () => {
  it('minúscula devolve o significado como está no dicionário', () => {
    expect(expandir('obg', D)).toBe('obrigado');
    expect(expandir('pfv', D)).toBe('por favor');
    expect(expandir('vc', D)).toBe('você');
  });

  it('inicial maiúscula devolve a inicial maiúscula', () => {
    expect(expandir('Obg', D)).toBe('Obrigado');
    expect(expandir('Pfv', D)).toBe('Por favor');
    expect(expandir('Vc', D)).toBe('Você');
  });

  it('tudo em maiúsculas devolve tudo em maiúsculas (o teclado só escreve assim)', () => {
    expect(expandir('OBG', D)).toBe('OBRIGADO');
    expect(expandir('PFV', D)).toBe('POR FAVOR');
    expect(expandir('VC', D)).toBe('VOCÊ');
    expect(expandir('MSG', D)).toBe('MENSAGEM');
  });

  it('uma letra só em maiúscula também vem em maiúsculas: "N" → "NÃO", "S" → "SIM"', () => {
    // O teclado escreve "N", não "n": a linha de composição fica toda igual.
    expect(expandir('N', D)).toBe('NÃO');
    expect(expandir('S', D)).toBe('SIM');
    expect(expandir('n', D)).toBe('não');
    expect(expandir('s', D)).toBe('sim');
  });

  it('caixa misturada cai no significado como está', () => {
    expect(expandir('oBg', D)).toBe('obrigado');
  });

  it('o significado do dicionário mantém a caixa própria quando a palavra está em minúsculas', () => {
    const d = { dr: 'Doutor', sus: 'SUS' };
    expect(expandir('dr', d)).toBe('Doutor');
    expect(expandir('Dr', d)).toBe('Doutor');
    expect(expandir('DR', d)).toBe('DOUTOR');
    expect(expandir('sus', d)).toBe('SUS');
  });
});

describe('expandir — a pontuação grudada', () => {
  it('fica onde estava: depois, antes e dos dois lados', () => {
    expect(expandir('obg!', D)).toBe('obrigado!');
    expect(expandir('vc?', D)).toBe('você?');
    expect(expandir('td,', D)).toBe('tudo,');
    expect(expandir('(pfv)', D)).toBe('(por favor)');
    expect(expandir('"hj"', D)).toBe('"hoje"');
    expect(expandir('...agr', D)).toBe('...agora');
    expect(expandir('OBG!!!', D)).toBe('OBRIGADO!!!');
    expect(expandir('Pfv.', D)).toBe('Por favor.');
  });
});

describe('expandir — quando não há o que expandir', () => {
  it('palavra que não é abreviação, vazio e só pontuação: nulo', () => {
    expect(expandir('casa', D)).toBeNull();
    expect(expandir('', D)).toBeNull();
    expect(expandir('   ', D)).toBeNull();
    expect(expandir('!!!', D)).toBeNull();
  });

  it('o que tem número, espaço ou pontuação no meio não é abreviação', () => {
    expect(expandir('obg2', D)).toBeNull();
    expect(expandir('o.b.g', D)).toBeNull();
    expect(expandir('obg/vc', D)).toBeNull();
    expect(expandir('por favor', D)).toBeNull();
  });

  it('só vale o dicionário recebido, não as sementes', () => {
    expect(expandir('obg', {})).toBeNull();
    expect(expandir('xpto', { xpto: 'qualquer coisa' })).toBe('qualquer coisa');
  });

  it('acento e caixa da chave não atrapalham: "TÁ" acha "ta"', () => {
    expect(expandir('TÁ', { ta: 'está' })).toBe('ESTÁ');
    expect(expandir('tá', { ta: 'está' })).toBe('está');
  });

  it('nome de propriedade de objeto não é abreviação (guarda; passa desde o começo)', () => {
    expect(expandir('constructor', {})).toBeNull();
    expect(expandir('toString', {})).toBeNull();
    expect(expandir('__proto__', {})).toBeNull();
    expect(expandir('hasOwnProperty', {})).toBeNull();
  });

  it('não oferece o que já está escrito', () => {
    expect(expandir('ok', { ok: 'ok' })).toBeNull();
    expect(expandir('OK', { ok: 'Ok' })).toBeNull();
  });
});

describe('expansaoDoTexto — a palavra que o paciente está escrevendo agora', () => {
  it('é a última palavra do texto', () => {
    expect(expansaoDoTexto('QUERO PFV', D)).toBe('POR FAVOR');
    expect(expansaoDoTexto('obg', D)).toBe('obrigado');
    expect(expansaoDoTexto('Oi, vc', D)).toBe('você');
    expect(expansaoDoTexto('OBG!', D)).toBe('OBRIGADO!');
  });

  it('depois do espaço o paciente já seguiu em frente: nada a oferecer', () => {
    expect(expansaoDoTexto('OBG ', D)).toBeNull();
    expect(expansaoDoTexto('QUERO PFV  ', D)).toBeNull();
    expect(expansaoDoTexto('a\n', D)).toBeNull();
  });

  it('uma abreviação no meio do texto não conta; só a última palavra', () => {
    expect(expansaoDoTexto('OBG QUERO', D)).toBeNull();
  });

  it('texto vazio ou só espaços: nada', () => {
    expect(expansaoDoTexto('', D)).toBeNull();
    expect(expansaoDoTexto('   ', D)).toBeNull();
  });

  it('quebra de linha separa palavras como o espaço', () => {
    expect(expansaoDoTexto('oi\nobg', D)).toBe('obrigado');
  });
});

describe('aplicarExpansao — o que o chip faz ao ser escolhido', () => {
  it('troca só a última palavra pela expansão e deixa um espaço, como a previsão de palavras', () => {
    expect(aplicarExpansao('OBG', 'OBRIGADO')).toBe('OBRIGADO ');
    expect(aplicarExpansao('QUERO PFV', 'POR FAVOR')).toBe('QUERO POR FAVOR ');
    expect(aplicarExpansao('OI, VC', 'VOCÊ')).toBe('OI, VOCÊ ');
  });

  it('mantém o que veio antes, inclusive a quebra de linha', () => {
    expect(aplicarExpansao('oi\nobg', 'obrigado')).toBe('oi\nobrigado ');
  });

  it('a pontuação grudada já vem dentro da expansão e não se repete', () => {
    expect(aplicarExpansao('OBG!', 'OBRIGADO!')).toBe('OBRIGADO! ');
  });

  it('texto que já terminou em espaço: só acrescenta (o chip nem aparece nesse caso)', () => {
    expect(aplicarExpansao('OBG ', 'OBRIGADO')).toBe('OBG OBRIGADO ');
  });
});

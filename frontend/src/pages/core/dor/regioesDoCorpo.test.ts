import { describe, it, expect } from 'vitest';
import {
  FAIXAS, OPCOES_DO_INICIO, PARTES, avisaOCelular, buscaDoPasso, codigoDoLocal, colunasDasFaixas, faixaDoNivel, fraseDaDor,
  intervaloDaFaixa, lerPasso, localDoCodigo, nomeDoLocal, niveisDaFaixa, ofereceEmergencia, opcoesDoGrupo,
  passoAnterior, passoDepoisDaFaixa, type IdDaParte, type LocalDaDor, type PassoDaDor,
} from './regioesDoCorpo';

// Mapa da dor (pedido de 19/10/2026): vocabulário, frase falada e passos.

describe('frase que o computador fala', () => {
  it('o exemplo do pedido, palavra por palavra', () => {
    expect(fraseDaDor({ parte: 'braco', lado: 'esquerdo' }, 7)).toBe('Dor no braço esquerdo, nível 7 de 10');
  });

  it('concorda gênero e número em todas as partes com lado', () => {
    expect(fraseDaDor({ parte: 'mao', lado: 'direito' }, 3)).toBe('Dor na mão direita, nível 3 de 10');
    expect(fraseDaDor({ parte: 'perna', lado: 'esquerdo' }, 5)).toBe('Dor na perna esquerda, nível 5 de 10');
    expect(fraseDaDor({ parte: 'pe', lado: 'direito' }, 2)).toBe('Dor no pé direito, nível 2 de 10');
    expect(fraseDaDor({ parte: 'braco', lado: 'ambos' }, 6)).toBe('Dor nos dois braços, nível 6 de 10');
    expect(fraseDaDor({ parte: 'mao', lado: 'ambos' }, 6)).toBe('Dor nas duas mãos, nível 6 de 10');
    expect(fraseDaDor({ parte: 'perna', lado: 'ambos' }, 9)).toBe('Dor nas duas pernas, nível 9 de 10');
    expect(fraseDaDor({ parte: 'pe', lado: 'ambos' }, 1)).toBe('Dor nos dois pés, nível 1 de 10');
  });

  it('partes sem lado, com a preposição certa', () => {
    expect(fraseDaDor({ parte: 'cabeca', lado: null }, 8)).toBe('Dor na cabeça, nível 8 de 10');
    expect(fraseDaDor({ parte: 'pescoco', lado: null }, 4)).toBe('Dor no pescoço, nível 4 de 10');
    expect(fraseDaDor({ parte: 'costas', lado: null }, 10)).toBe('Dor nas costas, nível 10 de 10');
    expect(fraseDaDor({ parte: 'corpo', lado: null }, 5)).toBe('Dor no corpo todo, nível 5 de 10');
  });

  it('nível 0 diz "sem dor" e o número continua junto', () => {
    expect(fraseDaDor({ parte: 'barriga', lado: null }, 0)).toBe('Sem dor na barriga, nível 0 de 10');
  });

  it('nível fora da escala vira um nível válido (nunca "nível NaN de 10")', () => {
    expect(fraseDaDor({ parte: 'peito', lado: null }, 14)).toBe('Dor no peito, nível 10 de 10');
    expect(fraseDaDor({ parte: 'peito', lado: null }, Number.NaN)).toBe('Sem dor no peito, nível 0 de 10');
  });
});

describe('rótulos dos alvos', () => {
  it('lados escritos por extenso, com a concordância', () => {
    expect(nomeDoLocal({ parte: 'braco', lado: 'direito' })).toBe('Braço direito');
    expect(nomeDoLocal({ parte: 'mao', lado: 'esquerdo' })).toBe('Mão esquerda');
    expect(nomeDoLocal({ parte: 'pe', lado: 'ambos' })).toBe('Os dois pés');
    expect(nomeDoLocal({ parte: 'perna', lado: 'ambos' })).toBe('As duas pernas');
    expect(nomeDoLocal({ parte: 'cabeca', lado: null })).toBe('Cabeça');
  });

  it('o passo do lado põe o ESQUERDO do corpo na coluna da esquerda e o direito na da direita', () => {
    for (const grupo of ['bracos', 'pernas'] as const) {
      const linhas = opcoesDoGrupo(grupo);
      expect(linhas).toHaveLength(2);
      for (const linha of linhas) expect(linha.map((l) => l.lado)).toEqual(['esquerdo', 'ambos', 'direito']);
    }
    expect(opcoesDoGrupo('bracos').map((l) => l[0].parte)).toEqual(['braco', 'mao']);
    expect(opcoesDoGrupo('pernas').map((l) => l[0].parte)).toEqual(['perna', 'pe']);
  });

  it('o primeiro passo tem as regiões pedidas — e nenhuma parte com lado fica sem caminho', () => {
    const diretas = OPCOES_DO_INICIO.filter((o) => o.tipo === 'local').map((o) => (o.tipo === 'local' ? o.local.parte : ''));
    expect(diretas).toEqual(['cabeca', 'pescoco', 'peito', 'barriga', 'costas', 'corpo']);
    const alcancaveis = new Set<IdDaParte>(diretas as IdDaParte[]);
    for (const o of OPCOES_DO_INICIO) if (o.tipo === 'grupo') for (const l of opcoesDoGrupo(o.grupo).flat()) alcancaveis.add(l.parte);
    expect([...alcancaveis].sort()).toEqual((Object.keys(PARTES) as IdDaParte[]).sort());
    // 8 alvos: duas linhas de quatro.
    expect(OPCOES_DO_INICIO).toHaveLength(8);
  });
});

describe('escala de 0 a 10', () => {
  it('cinco faixas com os rótulos pedidos cobrem 0..10 sem buraco nem sobreposição', () => {
    expect(FAIXAS.map((f) => f.rotulo)).toEqual(['Sem dor', 'Leve', 'Moderada', 'Forte', 'Pior dor possível']);
    const cobertos = FAIXAS.flatMap(niveisDaFaixa);
    expect(cobertos).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (let n = 0; n <= 10; n++) expect(niveisDaFaixa(faixaDoNivel(n))).toContain(n);
    expect(intervaloDaFaixa(FAIXAS[1])).toBe('1 a 3');
    expect(intervaloDaFaixa(FAIXAS[4])).toBe('10');
  });

  it('emergência é oferecida a partir do 8, nunca antes', () => {
    expect([0, 5, 7].map(ofereceEmergencia)).toEqual([false, false, false]);
    expect([8, 9, 10].map(ofereceEmergencia)).toEqual([true, true, true]);
  });

  it('a partir do 7 a frase também vai como pedido de ajuda, que toca no celular (revisão de UX de 20/10/2026, achado 3)', () => {
    expect([0, 3, 6].map(avisaOCelular)).toEqual([false, false, false]);
    expect([7, 8, 10].map(avisaOCelular)).toEqual([true, true, true]);
    // Fora da escala, o nível é limitado como no resto da tela.
    expect(avisaOCelular(99)).toBe(true);
    expect(avisaOCelular(-1)).toBe(false);
  });

  it('cinco faixas numa linha só quando cabem no alvo mínimo; senão, 3 + 2', () => {
    // 1366 px (notebook) com alvo de 207 px e espaço de 59 px: 5×207 + 4×59 = 1271 cabe em 1298.
    expect(colunasDasFaixas(1298, 207, 59)).toBe(5);
    // Mesma tela com a pessoa mais longe (alvo de 276 px): não cabe.
    expect(colunasDasFaixas(1298, 276, 59)).toBe(3);
    expect(colunasDasFaixas(0, 207, 59)).toBe(3);
  });
});

describe('passos na URL', () => {
  const locais: LocalDaDor[] = [
    { parte: 'cabeca', lado: null }, { parte: 'braco', lado: 'esquerdo' }, { parte: 'pe', lado: 'ambos' },
  ];

  it('código do lugar vai e volta; lixo na URL não vira um lugar', () => {
    for (const l of locais) expect(localDoCodigo(codigoDoLocal(l))).toEqual(l);
    for (const ruim of ['', 'braco', 'cabeca-esquerdo', 'olho', 'braco-meio', 'mao-esquerdo-x', '__proto__']) {
      expect(localDoCodigo(ruim)).toBeNull();
    }
  });

  it('cada passo sobrevive à ida para a URL e à volta', () => {
    const passos: PassoDaDor[] = [
      { passo: 'onde' },
      { passo: 'qual', grupo: 'pernas' },
      { passo: 'quanto', local: locais[1] },
      { passo: 'numero', local: locais[1], faixa: FAIXAS[3] },
      { passo: 'confirmar', local: locais[1], nivel: 8 },
    ];
    for (const p of passos) expect(lerPasso(buscaDoPasso(p).replace(/^\?/, ''))).toEqual(p);
  });

  it('nível inválido na URL não confirma nada: volta para a escala', () => {
    expect(lerPasso('local=cabeca&nivel=11').passo).toBe('quanto');
    expect(lerPasso('local=cabeca&nivel=-1').passo).toBe('quanto');
    expect(lerPasso('local=cabeca&nivel=7.5').passo).toBe('quanto');
    expect(lerPasso('nivel=7').passo).toBe('onde');
    expect(lerPasso('grupo=olhos').passo).toBe('onde');
  });

  it('faixas de um número só (0 e 10) vão direto para conferir', () => {
    const local = locais[0];
    expect(passoDepoisDaFaixa(local, FAIXAS[0])).toEqual({ passo: 'confirmar', local, nivel: 0 });
    expect(passoDepoisDaFaixa(local, FAIXAS[4])).toEqual({ passo: 'confirmar', local, nivel: 10 });
    expect(passoDepoisDaFaixa(local, FAIXAS[2])).toEqual({ passo: 'numero', local, faixa: FAIXAS[2] });
    expect(lerPasso('local=cabeca&faixa=pior')).toEqual({ passo: 'confirmar', local, nivel: 10 });
  });

  it('"Voltar" volta um passo de cada vez, pelo caminho por onde se veio', () => {
    const braco = locais[1];
    expect(passoAnterior({ passo: 'confirmar', local: braco, nivel: 8 })).toEqual({ passo: 'numero', local: braco, faixa: FAIXAS[3] });
    expect(passoAnterior({ passo: 'numero', local: braco, faixa: FAIXAS[3] })).toEqual({ passo: 'quanto', local: braco });
    expect(passoAnterior({ passo: 'quanto', local: braco })).toEqual({ passo: 'qual', grupo: 'bracos' });
    expect(passoAnterior({ passo: 'qual', grupo: 'bracos' })).toEqual({ passo: 'onde' });
    expect(passoAnterior({ passo: 'onde' })).toBeNull();
    // Sem lado: da escala volta direto ao começo; do 10 volta à escala.
    expect(passoAnterior({ passo: 'quanto', local: locais[0] })).toEqual({ passo: 'onde' });
    expect(passoAnterior({ passo: 'confirmar', local: locais[0], nivel: 10 })).toEqual({ passo: 'quanto', local: locais[0] });
  });
});

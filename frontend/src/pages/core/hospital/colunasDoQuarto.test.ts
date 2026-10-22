import { describe, it, expect } from 'vitest';
import { BARRA_DE_ROLAGEM_PX, COLUNAS_DO_QUARTO, ESPACO_DO_QUARTO, colunasDoQuarto } from './colunasDoQuarto';

// -----------------------------------------------------------------------------
// As colunas da tela do quarto (revisão da Task 6, importante 1).
//
// A grade era sempre 5 × 2, e só a ALTURA das células tinha o piso de 5°
// (`alvoMinimoPx()`): a largura de cada célula é o que sobra da janela dividido
// por cinco. A 1280 px de janela ela dá 196 px (piso: 198) e a 1024 px, 147 px
// — e quem usa o olhar não alcança um alvo menor que o piso. O piso ainda
// sobe com a geometria do usuário e com a acurácia medida (até ~6,6°: ~260 px).
//
// Agora o número de colunas sai da largura de que a grade dispõe: o maior
// número (até cinco) em que a célula continua com o piso na LARGURA; a altura
// já tem o piso na própria grade (`minmax(piso, 1fr)`) e, se as linhas não
// couberem, ela rola. A ordem dos botões (a da varredura) não muda: a grade
// preenche linha por linha.
// -----------------------------------------------------------------------------

const N = 10; // os botões do quarto
const PISO = 198; // 5° a 60 cm numa tela de 96 dpi (o padrão antes de a geometria do usuário carregar)

const entre = (minimo: number, valor: number, maximo: number) => Math.min(maximo, Math.max(minimo, valor));

/**
 * A caixa da grade numa janela de `w` × `h`, como o `GazePageLayout` a deixa:
 * `clamp(1rem, 2,5vw, 3rem)` de margem de cada lado; em cima `clamp(6,5rem, 4rem
 * + 7vh, 9,5rem)` (o cabeçalho é absoluto: o espaço é todo daqui) e embaixo
 * `clamp(1rem, 3vh, 3rem)`. O navegador entrega `clientWidth` e `clientHeight`
 * inteiros.
 */
const caixaDaGrade = (w: number, h: number) => ({
  largura: Math.round(w - 2 * entre(16, 0.025 * w, 48)),
  altura: Math.round(h - entre(104, 64 + 0.07 * h, 152) - entre(16, 0.03 * h, 48)),
});

const colunasNaJanela = (w: number, h: number, piso = PISO) => colunasDoQuarto({ ...caixaDaGrade(w, h), piso, alvos: N });

/** A largura de cada célula de `c` colunas, descontada a barra de rolagem quando as linhas não cabem na altura. */
function celula(largura: number, altura: number, piso: number, c: number): number {
  const linhas = Math.ceil(N / c);
  const rola = !(altura > 0) || linhas * piso + (linhas - 1) * ESPACO_DO_QUARTO > altura + 1;
  return (largura - (rola ? BARRA_DE_ROLAGEM_PX : 0) - (c - 1) * ESPACO_DO_QUARTO) / c;
}

describe('colunasDoQuarto', () => {
  it('a caixa de que os testes partem bate com as medidas do app (1366 × 768: ~1298 × 627)', () => {
    expect(caixaDaGrade(1366, 768)).toEqual({ largura: 1298, altura: 627 });
    expect(caixaDaGrade(1024, 768)).toEqual({ largura: 973, altura: 627 });
  });

  it.each([
    // [largura da janela, altura da janela, colunas]
    [1920, 1080, 5], // células de ~318 px
    [1366, 768, 5], //  células de ~212 px: o desenho de sempre
    [1280, 720, 4], //  a 5 colunas seriam 196 px (< 198): quatro, de ~258 px
    [1152, 720, 4], //  a 5 seriam 172 px
    [1024, 768, 3], //  a 4 seriam 197,5 px com a barra de rolagem (< 198): três, de ~283 px
    [800, 600, 3], //   3 colunas de ~212 px
  ])('janela de %i × %i: %i colunas', (w, h, esperado) => {
    expect(colunasNaJanela(w, h)).toBe(esperado);
  });

  it('com o piso maior (olhar menos preciso: ~260 px) cabem menos colunas', () => {
    expect(colunasNaJanela(1366, 768, 198)).toBe(5);
    expect(colunasNaJanela(1366, 768, 260)).toBe(4); // a 5 colunas: 212 px < 260
    expect(colunasNaJanela(1280, 720, 260)).toBe(3); // a 4 colunas: 258 px < 260
    expect(colunasNaJanela(1920, 1080, 260)).toBe(5); // 318 px
  });

  it('sem medida (a primeira volta, ou um teste sem layout) fica no desenho de sempre: cinco colunas', () => {
    expect(colunasDoQuarto({ largura: 0, altura: 0, piso: PISO, alvos: N })).toBe(COLUNAS_DO_QUARTO);
    expect(colunasDoQuarto({ largura: NaN, altura: 600, piso: PISO, alvos: N })).toBe(COLUNAS_DO_QUARTO);
    expect(colunasDoQuarto({ largura: 1200, altura: 600, piso: 0, alvos: N })).toBe(COLUNAS_DO_QUARTO);
    expect(colunasDoQuarto({ largura: -5, altura: 600, piso: PISO, alvos: N })).toBe(COLUNAS_DO_QUARTO);
    expect(colunasDoQuarto({ largura: Infinity, altura: 600, piso: PISO, alvos: N })).toBe(COLUNAS_DO_QUARTO);
  });

  it('sem a altura (ainda não medida), conta a barra de rolagem: é o lado seguro', () => {
    const { largura } = caixaDaGrade(1024, 768);
    // 4 colunas a 1024 de janela: com a barra de 6 px a célula fica em 197,5 px.
    expect(colunasDoQuarto({ largura, altura: 0, piso: PISO, alvos: N })).toBe(3);
    // Com altura de sobra não há barra, e quatro colunas passam por pouco (199 px).
    expect(colunasDoQuarto({ largura, altura: 2000, piso: PISO, alvos: N })).toBe(4);
  });

  it('nunca passa de cinco colunas, nem desce de uma', () => {
    expect(colunasDoQuarto({ largura: 10_000, altura: 5000, piso: PISO, alvos: N })).toBe(5);
    expect(colunasDoQuarto({ largura: 120, altura: 600, piso: PISO, alvos: N })).toBe(1);
  });

  it('não pede mais colunas do que há botões', () => {
    expect(colunasDoQuarto({ largura: 10_000, altura: 5000, piso: PISO, alvos: 3 })).toBe(3);
    expect(colunasDoQuarto({ largura: 10_000, altura: 5000, piso: PISO, alvos: 1 })).toBe(1);
  });

  it('em toda janela e em todo piso: a célula tem o piso na largura, e uma coluna a mais não teria', () => {
    for (const piso of [198, 230, 260, 300]) {
      for (const altura of [0, 400, 627, 939]) {
        let anterior = 0;
        for (let janela = 420; janela <= 3000; janela += 11) {
          const { largura } = caixaDaGrade(janela, 800);
          const c = colunasDoQuarto({ largura, altura, piso, alvos: N });
          expect(c).toBeGreaterThanOrEqual(1);
          expect(c).toBeLessThanOrEqual(COLUNAS_DO_QUARTO);
          // Janela maior nunca pede menos colunas.
          expect(c, `janela ${janela}, altura ${altura}, piso ${piso}`).toBeGreaterThanOrEqual(anterior);
          anterior = c;
          if (c >= 2) {
            expect(celula(largura, altura, piso, c), `janela ${janela}, altura ${altura}, piso ${piso}, ${c} colunas`).toBeGreaterThanOrEqual(piso);
          }
          // Nada de encolher à toa: com uma coluna a mais a célula ficaria abaixo do piso.
          if (c < COLUNAS_DO_QUARTO) {
            expect(celula(largura, altura, piso, c + 1), `janela ${janela}, altura ${altura}, piso ${piso}`).toBeLessThan(piso);
          }
        }
      }
    }
  });
});

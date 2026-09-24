import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ler = (rel: string) => readFileSync(resolve(AQUI, '../../..', rel), 'utf8');

/** O mesmo, sem comentários: um valor citado na explicação de por que ele saiu
 *  não é um valor cravado no código. */
const lerCodigo = (rel: string) =>
  ler(rel)
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');

/**
 * Responsividade das telas de paciente.
 *
 * O sintoma relatado era a Home "cortada" em notebook. A causa não era falta
 * de media query: era `gridTemplateRows: repeat(3, 1fr)` — e `1fr` é
 * `minmax(auto, 1fr)`, cujo mínimo `auto` é o min-content do cartão. As linhas
 * se recusavam a encolher, a grade ficava maior que a caixa, e o
 * `overflow: hidden` do `GazePageLayout` transformava o excedente em CORTE.
 *
 * A conta, com os valores de antes: cartão 198,6 px × 3 linhas + 2 gaps de 28
 * = 652 px de grade, dentro de 514 px úteis a 1366×768. Faltavam 137 px — a
 * terceira linha aparecia pela metade. Na janela PADRÃO do próprio Electron
 * (1280×800 externo ≈ 761 de conteúdo) já faltavam 144 px: a Home nascia
 * cortada.
 *
 * Estes testes travam o contrato estrutural. Não substituem olhar a tela —
 * substituem a regressão silenciosa.
 */

/** Altura intrínseca de um cartão da Home, com o cromo já responsivo. */
function alturaDoCartao(vh: number): number {
  const clamp = (min: number, pref: number, max: number) => Math.max(min, Math.min(pref, max));
  const selo = clamp(52, 0.07 * vh, 88);
  const padding = clamp(8, 0.012 * vh, 16) * 2;
  const margemDoSelo = clamp(6.4, 0.01 * vh, 16);
  const titulo = clamp(18.4, 0.022 * vh, 27.2) * 1.15;
  const descricao = clamp(13.6, 0.014 * vh, 16.8) * 1.2;
  return 4 /* borda */ + padding + selo + margemDoSelo + titulo + 7.2 + descricao;
}

/** Altura útil para a grade, descontado o cromo do layout. */
function alturaUtil(vh: number): number {
  const clamp = (min: number, pref: number, max: number) => Math.max(min, Math.min(pref, max));
  const padTopo = clamp(104, 64 + 0.07 * vh, 152);
  const padBase = clamp(16, 0.03 * vh, 48);
  const estadoDaSessao = 53.5;
  return vh - padTopo - padBase - estadoDaSessao;
}

const RESOLUCOES = [
  { nome: '1920×1080', w: 1920, h: 1080 },
  { nome: '1600×900', w: 1600, h: 900 },
  { nome: '1366×768 (notebook comum)', w: 1366, h: 768 },
  { nome: '1280×720', w: 1280, h: 720 },
  { nome: 'janela padrão do Electron', w: 1264, h: 761 },
];

describe('a Home cabe nas resoluções de notebook', () => {
  for (const { nome, h } of RESOLUCOES) {
    it(`${nome}: as 3 linhas cabem sem corte`, () => {
      const grade = 3 * alturaDoCartao(h) + 2 * 28;
      expect(grade).toBeLessThanOrEqual(alturaUtil(h));
    });
  }

  it('abaixo do piso da janela a grade ROLA, não é cortada', () => {
    // 1024×600 é menor que o `minHeight` do Electron; num navegador é possível.
    // O contrato aqui não é "cabe", é "não some": a grade rola.
    const grade = 3 * alturaDoCartao(600) + 2 * 28;
    expect(grade).toBeGreaterThan(alturaUtil(600));
    expect(ler('src/components/ui/GazeGrid.tsx')).toMatch(/overflowY:\s*'auto'/);
  });
});

describe('as causas estruturais do corte foram removidas', () => {
  it('as linhas da grade não travam no min-content do cartão', () => {
    const src = ler('src/components/ui/GazeGrid.tsx');
    // `repeat(N, 1fr)` era o bug: `1fr` = `minmax(auto, 1fr)`.
    expect(src).not.toMatch(/gridTemplateRows:\s*`repeat\(\$\{rows\}, 1fr\)`/);
    expect(src).toMatch(/gridTemplateRows:.*minmax\(\$\{cellMinPx\}px, 1fr\)/);
    expect(src).toMatch(/gridTemplateColumns:.*minmax\(0, 1fr\)/);
  });

  it('o piso da linha é o alvo mínimo de 5° — encolher não é opção', () => {
    // O app é dirigido por OLHAR: abaixo do mínimo angular o alvo deixa de ser
    // alcançável. A solução para falta de espaço é rolar, nunca diminuir.
    const src = ler('src/components/ui/GazeGrid.tsx');
    expect(src).toContain('alvoMinimoPx');
    expect(src).toMatch(/minmax\(\$\{cellMinPx\}px/);
  });

  it('o padding do layout acompanha a altura da tela', () => {
    const src = ler('src/components/ui/GazePageLayout.tsx');
    expect(src).not.toContain("'9.5rem 3rem 3rem 3rem'");
    expect(src).toMatch(/clamp\(6\.5rem,[^)]*9\.5rem\)/);
  });

  it('o conteúdo pode encolher dentro do layout (flex + minHeight 0)', () => {
    const src = ler('src/components/ui/GazePageLayout.tsx');
    expect(src).toMatch(/flex:\s*1/);
    expect(src).toMatch(/minHeight:\s*0/);
  });

  it('`100vw` saiu do layout — com barra de rolagem ele estoura o body', () => {
    expect(lerCodigo('src/components/ui/GazePageLayout.tsx')).not.toMatch(/width:\s*'100vw'/);
  });

  it('a Home aproveita a largura de telas grandes', () => {
    // `maxWidth: 1280` fixo desperdiçava 544 px em 1920. O teto continua
    // sendo 1600 px / 92 % — só que agora a largura também acompanha a
    // proporção dos cartões (ver o teste seguinte), em vez de um número fixo.
    const src = lerCodigo('src/pages/MainMenu.tsx');
    expect(src).not.toMatch(/maxWidth:\s*1280\b/);
    expect(src).toMatch(/`min\(1600px, 92%, calc\(3 \* \$\{larguraDoCartao\}/);
  });

  it('os cartões da Home seguem a proporção, não a largura que sobrar', () => {
    // Pedido do usuário: a 1920×1080 os cartões eram 515×231 (2,2 : 1). A
    // largura sai da altura disponível (100cqh do contêiner de tamanho), com
    // o piso de 5° na altura da linha e um piso de largura para o texto.
    const src = lerCodigo('src/pages/MainMenu.tsx');
    expect(src).toMatch(/containerType:\s*'size'/);
    expect(src).toMatch(/const PROPORCAO_DO_CARTAO = 1\.6;/);
    expect(src).toMatch(/max\(var\(--gaze-target-min, 198px\), \(100cqh - /);
    expect(src).toMatch(/max\(\$\{LARGURA_MINIMA_DO_CARTAO\}, \$\{PROPORCAO_DO_CARTAO\} \* /);
  });

  it('a grade da Home só rola quando as linhas não cabem', () => {
    // A zona de acerto de 12 px da última linha fazia a grade "transbordar"
    // ~10 px mesmo cabendo: barra de rolagem fantasma, e a primeira linha e o
    // anel de dwell cortados no topo depois de rolar esses 10 px.
    expect(lerCodigo('src/pages/MainMenu.tsx')).toMatch(/<GazeGrid[^>]*\brolarSoSeNaoCouber\b/);
  });

  it('os tokens de gaze são recalculados ao redimensionar a janela', () => {
    // Sem isto os tokens ficavam congelados no tamanho do primeiro render: o
    // app parava de avisar que os alvos estavam abaixo do mínimo.
    const src = ler('src/context/SettingsContext.tsx');
    expect(src).toMatch(/addEventListener\('resize'/);
    expect(src).toMatch(/removeEventListener\('resize'/);
  });

  it('a janela do Electron tem piso de tamanho', () => {
    const main = readFileSync(resolve(AQUI, '../../../../electron/main.ts'), 'utf8');
    expect(main).toMatch(/minWidth:\s*1024/);
    expect(main).toMatch(/minHeight:\s*640/);
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cursorVisivelNoTeste,
  modoDoTesteAtual,
  RAIO_DE_ACERTO_PX,
  isAccuracyTesting,
} from './accuracy';
import { EXPERIMENT } from './config/experiment';

/**
 * A POLÍTICA do cursor durante o teste de precisão.
 *
 * O pedido é legítimo e a tensão é real: o usuário quer ver o cursor enquanto
 * tenta acertar os alvos, e a medição de acurácia só vale enquanto ele NÃO o
 * vê. Não dá para ter as duas coisas no mesmo alvo — vendo o cursor a pessoa
 * corrige o olhar até ele cair no alvo, e a partir daí "olhar para o alvo"
 * deixou de ser verdade; o erro medido vira o resíduo da perseguição e tende a
 * zero com qualquer modelo. A contaminação entra no COMPORTAMENTO da pessoa,
 * então nenhum pós-processamento a desfaz.
 *
 * A saída é separar as perguntas, não misturar as respostas:
 *   'medicao'     → malha aberta, cursor escondido, métricas do protocolo.
 *   'verificacao' → malha fechada, cursor visível, métricas próprias
 *                   (`result.verificacao`: acertou? em quanto tempo?).
 *
 * Este arquivo fixa o contrato observável dessa separação sem abrir overlay
 * nenhum: `startAccuracyTest` mexe no DOM e no rAF, e o que interessa aqui é a
 * decisão, não a coreografia.
 */
describe('cursor durante o teste de precisão — a política', () => {
  afterEach(() => {
    EXPERIMENT.cursorNoTesteDePrecisao = false;
  });

  it('fora de qualquer teste a decisão não é deste módulo', () => {
    // Quem esconde o cursor por calibração, por falta de modelo ou por modo
    // desenvolvedor é o `GazeContext`. Aqui a resposta é "não tenho objeção".
    expect(isAccuracyTesting).toBe(false);
    expect(cursorVisivelNoTeste()).toBe(true);
  });

  it('o modo default é medição — quem não pede nada roda o protocolo', () => {
    expect(modoDoTesteAtual()).toBe('medicao');
  });

  it('o raio de acerto é o da especificação', () => {
    // ~1,6° na geometria de referência (38,5 px/grau): a ordem do menor alvo
    // que esta interface usa.
    expect(RAIO_DE_ACERTO_PX).toBe(60);
  });
});

/**
 * A separação existe no NÍVEL DO CÓDIGO, não só na intenção. Estas guardas
 * leem o fonte porque o caminho que elas protegem só acontece dentro do laço
 * de rAF do teste, com overlay montado — e o custo de um mock que reproduza
 * isso é maior que o valor dele.
 */
describe('separação entre medir e verificar', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'accuracy.ts'), 'utf8');

  it('a linha de base do vigia só é escrita em rodada de MEDIÇÃO', () => {
    // O `accuracyResult` do storage é contra o que o vigia de recalibração
    // compara o uso normal. Escrevê-lo a partir de uma rodada em que a pessoa
    // perseguia o cursor daria ao vigia uma régua que não existe, e ele
    // passaria a pedir recalibração o tempo todo.
    expect(fonte).toMatch(
      /if \(modoDoTeste === 'medicao'\) try \{\s*\n\s*localStorage\.setItem\('accuracyResult'/,
    );
  });

  it('o relatório declara o modo e se o cursor estava na tela', () => {
    // Sem isto, dois JSONs com números muito diferentes ficariam
    // indistinguíveis — e o de verificação pareceria o melhor dos dois.
    expect(fonte).toMatch(/modo: modoDoTeste,/);
    expect(fonte).toMatch(/cursorVisivel: rodadaMostraCursor\(\),/);
  });

  it('as métricas de malha fechada ficam em campo próprio, nunca somadas', () => {
    // `meanError`, `jitterRMS` e companhia continuam sendo calculados do mesmo
    // jeito, sobre a predição CRUA. O que a verificação acrescenta é um objeto
    // ao lado — e ele só existe quando a rodada foi de verificação.
    expect(fonte).toMatch(
      /verificacao: modoDoTeste === 'verificacao' \? agregarVerificacao\(diagnostics\) : undefined,/,
    );
    expect(fonte).toMatch(/malhaFechada: modoDoTeste === 'verificacao' \?/);
  });

  it('a coleta de malha fechada usa a saída FILTRADA, e a do protocolo a crua', () => {
    // São dois sinais distintos de propósito: o cursor é o que a pessoa vê
    // (filtrado), e o protocolo mede o modelo (cru, direto do `mapGaze`).
    expect(fonte).toMatch(/if \(modoDoTeste === 'verificacao' && frameNovo && currentFiltered/);
    expect(fonte).toMatch(/gaze = mapGaze\(currentFeaturesLeft, currentFeaturesRight\);/);
  });

  it('o relógio da verificação começa quando o alvo aparece, não na acomodação', () => {
    // O que se mede é quanto tempo a pessoa leva para pousar o cursor no alvo.
    // Esse relógio começa em `elapsed = 0`; o do protocolo só vale depois dos
    // 600 ms de acomodação. Os dois blocos são vizinhos no arquivo, e o da
    // verificação vem ANTES do `if (elapsed >= ACCLIMATION_MS`.
    const iVerif = fonte.indexOf("if (modoDoTeste === 'verificacao' && frameNovo");
    const iProto = fonte.indexOf('if (elapsed >= ACCLIMATION_MS && frameNovo)');
    expect(iVerif).toBeGreaterThan(0);
    expect(iProto).toBeGreaterThan(iVerif);
  });
});

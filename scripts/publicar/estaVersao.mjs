/**
 * estaVersao.mjs — o que muda a cada versão entregue ao dono.
 *
 * O coordenador preenche este arquivo a cada rodada, junto com o código novo
 * que chega à pasta IrisFlow V2; o `npm run publicar` só lê.
 *
 * BASE — prefixo (7 a 40 caracteres) do SHA do commit em que o V2 do dono
 *   está ANTES desta versão (`git rev-parse HEAD` na pasta dele, antes de o
 *   código novo chegar). Por que existe: REMOVIDOS é a lista do que saiu
 *   NESTA versão. Se a lista de uma rodada velha ficasse aqui e o comando
 *   rodasse numa rodada futura, ela apagaria um arquivo que tivesse voltado.
 *   Com a BASE, o comando só remove quando o HEAD do V2 é exatamente o ponto de
 *   onde a lista foi calculada; em qualquer outro caso avisa e não remove nada.
 *   BASE vazia = "não conferido" = nada é removido.
 *
 * REMOVIDOS — caminhos, relativos à raiz do repositório e com `/`, que existiam
 *   na versão anterior e não existem mais nesta (`git rm`, sem curinga: o
 *   caminho é literal).
 *
 * MENSAGEM — o commit: `titulo`, uma linha em branco e `corpo` (se houver).
 *   `--mensagem "<texto>"` na linha de comando troca a mensagem inteira.
 *   Nada de linha de coautoria.
 */

export const BASE = '5bf841f9158af46f8ea2b637bd5470c8f126fbb9';

// Nada saiu nesta versão.
export const REMOVIDOS = [];

export const MENSAGEM = {
  titulo: 'Rastreamento: reajustes deliberados mais robustos (M23, M24) e decomposição do erro no relatório',
  corpo: [
    'M23 (ruidoDoMapaNaCorrecaoDeliberada): o erro de padrão do mapa (1,4 graus, 55 px sem a distância) entra no ruído do reajuste pelo centro e da recalibração rápida, porque um ponto só não o separa do deslocamento. Os rótulos do dwell não mudam.',
    'M24 (medidaDeliberadaAteODobroDoTeto): esses reajustes são aceitos até o dobro do teto da correção; o deslocamento aprendido continua no teto. Antes, o reajuste pelo centro era recusado em 8 das 15 sessões reais, as de erro maior.',
    'No replay dos 15 relatórios reais (05/09 a 25/10/2026), o reajuste pelo centro vai de 2,19 a 1,97 graus e a recalibração pelos 4 cantos internos, de 2,07 a 1,76 (sem reajuste, 2,27 e 2,26). As duas flags ficam desligadas em ?pipeline=base.',
    'O relatório do teste ganha result.decomposicaoDoErro (deslocamento, parte linear, resto e o erro em uso com a correção por dwell, nulo sem o Kalman) e calibrationFit.looByTarget[].residuoMedioPx (o vetor do erro fora da amostra). docs/MEDICOES.md 14.8 e a tabela de flags do README.',
  ].join('\n\n'),
};

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

export const BASE = 'd62fec80e0081405872905643d00d39cf632d8bd';

// Nada saiu nesta versão.
export const REMOVIDOS = [];

export const MENSAGEM = {
  titulo: 'Cursor: anda sem trancos e não congela ao olhar para baixo (M25–M29); teste-local no build de produção',
  corpo: [
    'M25 (travessiaContinua): o cursor anda por animação web (el.animate) que parte do ponto calculado, com início explícito, e cada travessia dura o intervalo mediano mais 17 ms. A transição CSS escrita no fim de um quadro ocupado pelo MediaPipe começava no começo dele e chegava ao compositor quase terminada: o cursor saltava e parava. Numa gravação a 60 quadros/s de um Chromium com a thread presa como no app, os quadros parados no meio de um movimento caíram de 40 % para ~10 %.',
    'M26 (deslocamentoPorInovacao): o estimador de fixação acha o passo pela inovação AR(1) branqueada (GLR), e não pela média das 4 últimas amostras; o botão vizinho chega bem antes, sem pulos a mais com o olhar parado. Só liga com a rampa do L2CS. M27 (palpebraBaixaRapida): a pálpebra que desce com o olhar, não fecha até o fundo em 150 ms e assenta deixa de ser piscada; antes o cursor congelava 400 ms a cada olhar para o teclado. A piscada dentro da pálpebra baixa segura só ela, e o fechamento lento e a reabertura continuam piscada. M28 (fixacaoNaPerdaCurta): um quadro sem rosto não recomeça a fixação. M29 (rampaDoL2cs): o ângulo do L2CS anda em rampa entre inferências, em vez de degraus a 6-10 Hz; na sacada e depois de uma lacuna sai na hora.',
    'No simulador do compositor (cenário do vídeo de 06/11/2026): paradas no meio do movimento de 31,5 % para 4,3 %, pulos com o olhar parado de 37 para 5,2 por minuto, tremor de 3,3 para 1,9 px por quadro, botão vizinho de 266 para 165 ms. As cinco flags ficam desligadas em ?pipeline=base; a sessão 16 do roteiro decide se ficam.',
    'npm run teste-local passa a gerar o build de produção (frontend/dist-teste-local, fora do git e do instalador) e a servir com o vite preview em 127.0.0.1:4180 (--strictPort, fora da 4173 do build de medição, para o armazenamento das duas origens não se misturar): o servidor de desenvolvimento pesava na thread do rastreamento. No build do instalador o modo compila para falso.',
    'Revisão com quatro revisores (bugs, convenções e testes, UX, UI): corrigidos o M27 que voltava a segurar ~400 ms numa piscada enquanto a pessoa olha o teclado, a rampa do M29 depois de uma lacuna, o M26 sem a rampa, a origem do teste-local e a borda do cursor do Modo Computador (border-box); testes do engine para o M28.',
    'Ferramentas de medição: src/testUtils/simuladorDoCursor.ts, cenarioDoCursor.ts e medicaoDoCursor.test.ts (IRISFLOW_MEDIR_CURSOR=1). Documentação: README, docs/MEDICOES.md (14.9), docs/PESQUISA.md, docs/ROTEIRO_DE_MEDICAO.md (sessão 16), docs/RELATORIO_DE_ALTERACOES.md e CLAUDE.md.',
  ].join('\n\n'),
};

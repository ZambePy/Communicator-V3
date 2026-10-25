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

export const BASE = '6d7ae288e404f031de92b9d1a670214f6ca73356';

export const REMOVIDOS = [
  // 25/10: no Windows (sem diferença de maiúsculas) o import './MarcaCuidador' caía neste
  // arquivo e o tsc do app parava (TS1261). Virou caminhosDaMarcaCuidador.ts.
  'app/src/components/marcaCuidador.ts',
];

export const MENSAGEM = {
  titulo: 'App do cuidador: marcaCuidador.ts vira caminhosDaMarcaCuidador.ts (o tsc parava no Windows)',
  corpo: [
    'No Windows, MarcaCuidador.tsx e marcaCuidador.ts só diferiam nas maiúsculas: o import de \'./MarcaCuidador\' no index caía no arquivo de dados e o tsc do app parava (TS1261), o que travava o npm run publicar.',
    'O arquivo de dados (gerado por app/scripts/gerar-marca-cuidador.py) agora se chama caminhosDaMarcaCuidador.ts; o gerador e o README acompanham. Nenhuma mudança visual.',
    'Teste da tela de voz (desktop): "Preparar frases rápidas" carrega módulos com import() e, com a suíte inteira rodando, passava do prazo de 1 s do waitFor. Prazo de 15 s e o modelo do assistente simulado no teste. Nenhuma mudança no app.',
  ].join('\n\n'),
};

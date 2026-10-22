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

export const BASE = '593dd85c9f59b6e415518d05a12c57291e81b910';

export const REMOVIDOS = [
  // O fundo e o título animados do site de 20/10, trocados pelo visual v3.
  'site/src/components/effects/AmbientBackground.test.tsx',
  'site/src/components/effects/AmbientBackground.tsx',
  'site/src/components/effects/AnimatedHeadline.test.tsx',
  'site/src/components/effects/AnimatedHeadline.tsx',
  'site/src/components/effects/ambient.css',
  'site/src/components/effects/typography.css',
  // A faixa curta de privacidade da home antiga (o v3 diz isso no teste ao vivo).
  'site/src/components/home/PrivacidadeCurta.tsx',
  // O "efeito" do v3, recusado pelo dono em 21/10/2026 (grade, feixe de luz, o
  // "IRISFLOW" gigante, o olho de partículas com o motor WebGL2 e a aurora da
  // chamada final; a chamada virou ChamadaFinal.tsx, um campo azul sólido). No PC
  // do dono estes arquivos podem ter sido só COPIADOS para a pasta, sem nunca
  // entrar no git: o `git rm` não os apaga, e o publicar apaga do disco o que
  // desta lista ainda existir sem ser rastreado (só arquivo, só dentro do repositório).
  'site/src/components/v3/AuroraCta.tsx',
  'site/src/components/v3/FeixeDeLuz.tsx',
  'site/src/components/v3/FundoDeGrade.tsx',
  'site/src/components/v3/MarcaDagua.tsx',
  'site/src/components/v3/ParticulasDoOlhar.test.tsx',
  'site/src/components/v3/ParticulasDoOlhar.tsx',
  'site/src/components/v3/aurora.css',
  'site/src/components/v3/fundo.css',
  'site/src/components/v3/particulas.css',
  'site/src/components/v3/particulas/formas.test.ts',
  'site/src/components/v3/particulas/formas.ts',
  'site/src/components/v3/particulas/laco.test.ts',
  'site/src/components/v3/particulas/laco.ts',
  'site/src/components/v3/particulas/motor.test.ts',
  'site/src/components/v3/particulas/motor.ts',
  // 22/10: no Windows (sem diferença de maiúsculas) o import './CampoDeCalibracao' caía neste
  // arquivo e o tsc do site parava (TS1149). Virou ritmoDoCampo.ts.
  'site/src/components/v3/campoDeCalibracao.test.ts',
  'site/src/components/v3/campoDeCalibracao.ts',
];

export const MENSAGEM = {
  titulo: 'V2, rodada 3 e revisão final: site refeito de ponta a ponta, modo só horizontal, backup do perfil, modo hospital, abreviações e publicar com um comando',
  corpo: [
    'V2 (até 20/10): emergência por entrega, Plano B, mapa da dor, voz guardada, prancha impressa, calibração com recoleta dos alvos ruins, robustez, app do cuidador redesenhado, celular por QR e o domínio irisflow.ia.br.',
    'Rodada 3 (21/10): site v3 (fundo marinho chapado, abertura editorial com a gravação real no monitor, cartões 01–06 com a tela real do app e "Teste com o seu olhar" só no navegador); modo só horizontal com Emergência pela borda; pergunta sim/não do cuidador falada no computador; backup completo e restauração conferida antes de escrever, sem nunca sobrescrever a voz guardada; varredura falada; contagem da Emergência de 3 a 10 s; modo hospital; abreviações e respostas sugeridas (nunca em pergunta de dor); limite atômico de avisos e search_path com pg_temp no banco; npm run publicar e /versao.json.',
    'Site de ponta a ponta (22/10): a primeira tela diz para quem é (ELA, AVC, lesão medular); site mais leve (supabase-js sob demanda, entrada de 470 para 260 KiB, logo de 5 KB); barra fixa que não tampa o foco; fundo dos 13 pontos e luz do olhar em todas as páginas; textos claros e fecho próprio por página; preços na hora; acessibilidade AA sem violações.',
    'Revisão final (22/10): o app instalado não abre mais o "Salvar como" depois de cada calibração; um recurso opcional que falha não impede a janela de abrir; o aviso de socorro não confunde erro do banco com "sem celular"; rejeições soltas da nuvem, da voz e do Modo Computador viram aviso; máscara de brilho sem realocar por quadro.',
    'Banco e funções: migrações 20261019200000_pareamento_do_celular e 20261021120000_endurecimento_rodada3 e as funções desktop-sync e parear-celular são publicadas à parte.',
  ].join('\n\n'),
};

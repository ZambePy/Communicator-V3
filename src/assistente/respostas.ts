/**
 * Respostas sugeridas — a faixa de botões que aparece junto da mensagem do
 * cuidador (roadmap 1, rodada 3 de 21/10/2026).
 *
 * O cuidador pergunta no celular, o computador oferece até quatro respostas
 * curtas, e um olhar do paciente escolhe uma. Responder "Quer água?" leva de 2
 * a 4 s assim; letra a letra, de 30 a 90 s.
 *
 * Sem IA generativa, de propósito: nada aqui fala com a rede nem inventa
 * frase. As respostas vêm de duas fontes, nesta ordem de prioridade:
 *
 *   1. O QUE O PACIENTE JÁ RESPONDEU a esta mesma pergunta (`aprenderResposta`).
 *      Ninguém prevê melhor a resposta dele do que ele mesmo.
 *   2. RESPOSTAS-PADRÃO POR INTENÇÃO: o que a forma da pergunta pede. Pergunta
 *      fechada pede sim/não; "chá ou café?" pede as duas opções; "quer água?"
 *      pede aceitar ou recusar. São regras declaradas e legíveis, não um modelo
 *      opaco — dá para explicar ao cuidador por que aquele botão apareceu.
 *
 * Três decisões que moldam o resultado:
 *
 *   - NUNCA NA DOR (decisão de 21/10/2026, rodada de correção 1 da Task 7). Pergunta
 *     que fale de dor não leva resposta nenhuma — nem pronta, nem aprendida. Uma
 *     resposta pronta com o sentido trocado sobre dor é perigosa: "A dor passou?"
 *     respondida por "Sim, estou com dor" diz o contrário do que o paciente quis,
 *     na voz dele e no celular do cuidador. A faixa simplesmente não aparece, e o
 *     paciente responde pelo teclado ou pelo mapa da dor.
 *
 *   - Pergunta fechada SEMPRE leva um "sim" e um "não". Se o paciente só
 *     respondeu "sim, ..." nas outras vezes, as aprendidas ocupam no máximo
 *     metade dos botões e as respostas-padrão (que começam por sim e não)
 *     ficam com o resto. Uma faixa que só afirma obriga o paciente a sair dela
 *     para dizer "não".
 *   - Pergunta aberta ("o que você quer comer?") sem histórico NÃO tem
 *     sugestão. "Sim" ou "espere um pouco" não respondem e ocupam alvos
 *     grandes; pior, com um olhar impreciso, o paciente acerta um deles por
 *     engano e diz o que não quis. Sem o que oferecer, a faixa nem aparece.
 *
 * `frases.ts` (`sugerirFrases`) segue como está, servindo o teclado: aqui o
 * foco é a pergunta que está no ar, e a tabela de intenções é mais fina.
 */

import { ehPergunta } from './frases';
import type { ModeloDoAssistente } from './modelo';
import { normalizar } from './normalizar';

/** Quatro botões: mais que isso o olhar não escolhe com calma. */
export const MAXIMO_DE_RESPOSTAS = 4;

/**
 * Texto mais longo que isto é cortado no botão e o paciente escolheria sem
 * saber o que escolheu. Mesmo teto das frases na grade do teclado.
 */
const MAX_CARACTERES_NO_BOTAO = 42;

export type Intencao =
  | 'escolha'
  | 'dor-onde'
  | 'dor-quanto'
  | 'dor'
  | 'como-esta'
  | 'aberta'
  | 'comida-e-bebida'
  | 'posicao'
  | 'chamar'
  | 'bem-estar'
  | 'oferta'
  | 'saudacao'
  | 'despedida'
  | 'simnao'
  | 'nenhuma';

interface Regra {
  intencao: Intencao;
  /** Casa com a pergunta NORMALIZADA (minúscula, sem acento nem pontuação). */
  quando: RegExp;
  /**
   * Respostas-padrão. Nas perguntas fechadas as duas primeiras são sempre
   * uma afirmativa e uma negativa — é o que garante o par sim/não na faixa.
   */
  respostas: readonly string[];
}

/**
 * Toda palavra que faz a pergunta falar de dor (já normalizada: "dói" → "doi").
 * Larga de propósito: errar para o lado de esconder a faixa custa um toque no
 * teclado; errar para o outro lado põe na voz do paciente uma frase de sentido
 * trocado sobre dor. Palavra inteira: "dormir", "calor" e "amor" não casam.
 */
const DOR =
  '(?:dor|dores|doi|doe|doem|doeu|doia|doer|doendo|dolorid[oa]s?|doloros[oa]s?|machuc\\w*|incomod\\w*|desconfort\\w*)';
const ONDE = '(?:onde|aonde|em que lugar|que lugar|qual lugar|em que parte|que parte)';
const QUANTO = '(?:quanto|quao|intensidade|de 0 a 10|de zero a dez|nota|escala|como (?:voce |vc )?(?:esta|anda|vai|fica))';
const juntas = (a: string, b: string) => new RegExp(`\\b${a}\\b.*\\b${b}\\b|\\b${b}\\b.*\\b${a}\\b`);

/**
 * Avaliadas em ordem; a PRIMEIRA que casa vence, então vão do mais específico
 * ao mais genérico. Uma regra genérica no topo apagaria todas as outras
 * ("quer água?" tem "quer", que é oferta, mas a resposta certa é a de bebida).
 *
 * `escolha` e a pergunta aberta ficam fora da tabela: a primeira tira as
 * opções da própria pergunta, a segunda não tem resposta-padrão. A dor também
 * fica fora, e de propósito: ela não tem respostas-padrão (ver `intencaoDeDor`).
 */
const REGRAS_ANTES_DA_ABERTA: readonly Regra[] = [
  {
    intencao: 'como-esta',
    quando: /\bcomo (?:voce |vc )?(?:esta|se sente|vai)\b/,
    respostas: ['Estou bem', 'Não estou bem', 'Mais ou menos', 'Estou cansado'],
  },
];

const REGRAS_DEPOIS_DA_ABERTA: readonly Regra[] = [
  {
    intencao: 'comida-e-bebida',
    quando: /\b(?:sede|agua|beber|bebida|suco|cha|cafe|leite|refrigerante|copo|fome|comer|comida|lanche|almoco|jantar|sopa|fruta|pao|bolacha|biscoito)\b/,
    respostas: ['Sim, por favor', 'Não, obrigado', 'Só um pouco', 'Mais tarde'],
  },
  {
    intencao: 'posicao',
    quando: /\b(?:posicao|deitar|sentar|virar|almofada|travesseiro|cobertor|ajeitar|levantar|inclinar)\b/,
    respostas: ['Sim, por favor', 'Não, assim está bom', 'Daqui a pouco', 'Um pouco mais'],
  },
  {
    intencao: 'chamar',
    quando: /\b(?:chamo|chamar|chame|ligo|ligar para|aviso|avisar)\b/,
    respostas: ['Sim, por favor', 'Não precisa', 'Daqui a pouco'],
  },
  {
    intencao: 'bem-estar',
    quando: /\b(?:tudo bem|esta bem|se sente bem)\b/,
    respostas: ['Sim, estou bem', 'Não estou bem', 'Mais ou menos', 'Estou cansado'],
  },
  {
    intencao: 'oferta',
    quando: /\b(?:quer|queria|gostaria|deseja|aceita|precisa|posso|vamos|que tal|prefere)\b/,
    respostas: ['Sim, por favor', 'Não, obrigado', 'Daqui a pouco', 'Não sei'],
  },
  {
    intencao: 'saudacao',
    quando: /\b(?:bom dia|boa tarde|boa noite|oi|ola|cheguei|estou aqui)\b/,
    respostas: ['Oi', 'Que bom que você chegou', 'Estou aqui'],
  },
  {
    intencao: 'despedida',
    quando: /\b(?:ja volto|vou sair|ate logo|ate mais|ate amanha|tchau|volto (?:logo|ja))\b/,
    respostas: ['Está bem', 'Não demore', 'Tchau', 'Preciso de você aqui'],
  },
];

const SO_DOR = new RegExp(`\\b${DOR}\\b`);
const DOR_E_ONDE = juntas(DOR, ONDE);
const DOR_E_QUANTO = juntas(DOR, QUANTO);

/**
 * As intenções de dor. Existem só para o log e o teste dizerem QUE a pergunta
 * é de dor (e se pede lugar ou intensidade): nenhuma tem resposta-padrão, e
 * `sugerirRespostas` devolve lista vazia para todas elas — nem a pronta, nem a
 * aprendida (decisão de 21/10/2026, ver o cabeçalho do arquivo).
 */
const INTENCOES_DE_DOR: ReadonlySet<Intencao> = new Set<Intencao>(['dor-onde', 'dor-quanto', 'dor']);

/** A pergunta (já normalizada) fala de dor? Qual das três intenções, ou `null`. */
function intencaoDeDor(normalizada: string): Intencao | null {
  if (!SO_DOR.test(normalizada)) return null;
  if (DOR_E_ONDE.test(normalizada)) return 'dor-onde';
  if (DOR_E_QUANTO.test(normalizada)) return 'dor-quanto';
  return 'dor';
}

/**
 * A pergunta tem palavra de dor (dor, dói, doendo, dolorido, machuca,
 * incomoda…)? Vale para qualquer forma: "A dor passou?", "O remédio aliviou a
 * dor?", "Quer remédio para a dor?", "Dói na perna ou no braço?". Nelas não há
 * sugestão.
 */
export function falaDeDor(pergunta: string): boolean {
  return intencaoDeDor(normalizar(pergunta)) !== null;
}

/** A saudação do cuidador, devolvida igual. */
const ECOS_DA_SAUDACAO: readonly (readonly [RegExp, string])[] = [
  [/\bbom dia\b/, 'Bom dia'],
  [/\bboa tarde\b/, 'Boa tarde'],
  [/\bboa noite\b/, 'Boa noite'],
];

/** Pergunta fechada sem assunto conhecido. */
const RESPOSTAS_DA_PERGUNTA_FECHADA: readonly string[] = ['Sim', 'Não', 'Não sei', 'Espere um pouco'];

/**
 * A pergunta abre com palavra interrogativa: pede informação, não "sim" ou
 * "não". "Que" sozinho não entra ("que tal sair?" é oferta; "que bom que você
 * chegou" nem é pergunta).
 */
const PERGUNTA_ABERTA =
  /^(?:o que|oque|qual|quais|quando|onde|aonde|como|quanto|quantos|quantas|quem|por que|porque|por qual|para que|pra que|que horas|que dia)\b/;

/** Intenções cujas respostas-padrão começam por um "sim" e um "não". */
const COM_SIM_E_NAO: ReadonlySet<Intencao> = new Set<Intencao>([
  'comida-e-bebida',
  'posicao',
  'chamar',
  'bem-estar',
  'oferta',
  'simnao',
]);

const capitalizar = (texto: string): string => texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);

/** Palavras que abrem a pergunta e não fazem parte da opção ("quer chá" → "chá"). */
const PALAVRAS_DE_PEDIDO: ReadonlySet<string> = new Set([
  'quer', 'queria', 'prefere', 'preferia', 'gostaria', 'deseja', 'aceita', 'vai', 'vamos', 'precisa',
  'posso', 'pode', 'voce', 'vc', 'tu', 'que', 'eu', 'esta', 'tem',
]);
const NEGACOES: ReadonlySet<string> = new Set(['nao', 'nada', 'nenhum', 'nenhuma']);

/**
 * As opções de uma pergunta "A ou B?" ("Quer chá ou café?" → Chá, Café), ou
 * `null` se não for uma escolha. "Quer sair ou não?" não é escolha: o "ou
 * não" só reforça a pergunta de sim/não.
 */
function opcoesDaEscolha(pergunta: string): string[] | null {
  let texto = pergunta.trim().replace(/[\s?!.…]+$/u, '');
  if (PERGUNTA_ABERTA.test(normalizar(texto))) {
    // "Qual você prefere, chá ou café?": as opções vêm depois da vírgula.
    // Sem vírgula não há onde separar a pergunta das opções.
    const virgula = texto.indexOf(',');
    if (virgula < 0) return null;
    texto = texto.slice(virgula + 1).trim();
  }
  const blocos = texto.split(/\s+ou\s+/iu);
  if (blocos.length < 2) return null;
  const brutas = blocos.flatMap((b) => b.split(/\s*,\s*/u));

  // O começo da primeira opção é o pedido ("Quer", "Você prefere"), não a coisa pedida.
  const palavras = brutas[0].split(/\s+/u).filter(Boolean);
  while (palavras.length > 1 && PALAVRAS_DE_PEDIDO.has(normalizar(palavras[0]))) palavras.shift();
  brutas[0] = palavras.join(' ');

  const opcoes = brutas.map((o) => o.trim().replace(/^[\s,;:]+|[\s,;:?!.]+$/gu, '')).filter(Boolean);
  if (opcoes.length < 2 || opcoes.length > 3) return null;
  for (const o of opcoes) {
    const n = normalizar(o);
    const palavrasDaOpcao = o.split(/\s+/u).length;
    if (!n || NEGACOES.has(n) || PALAVRAS_DE_PEDIDO.has(n) || palavrasDaOpcao > 5 || o.length > MAX_CARACTERES_NO_BOTAO) {
      return null;
    }
  }
  return opcoes.map(capitalizar);
}

/** O que a pergunta pede. Exportada para o teste e para o log. */
export function intencaoDaPergunta(pergunta: string): Intencao {
  const n = normalizar(pergunta);
  if (!n) return 'nenhuma';
  // A dor vence tudo, até a escolha ("dói na perna ou no braço?"): as opções
  // da própria pergunta virariam botões de resposta sobre dor.
  const deDor = intencaoDeDor(n);
  if (deDor) return deDor;
  if (opcoesDaEscolha(pergunta)) return 'escolha';
  for (const r of REGRAS_ANTES_DA_ABERTA) if (r.quando.test(n)) return r.intencao;
  if (PERGUNTA_ABERTA.test(n)) return 'aberta';
  for (const r of REGRAS_DEPOIS_DA_ABERTA) if (r.quando.test(n)) return r.intencao;
  return ehPergunta(pergunta) ? 'simnao' : 'nenhuma';
}

/**
 * A pergunta pede "sim" ou "não"? Nessas, a faixa nunca fica vazia e sempre
 * leva as duas pontas.
 */
export function ehPerguntaDeSimNao(pergunta: string): boolean {
  return COM_SIM_E_NAO.has(intencaoDaPergunta(pergunta));
}

function respostasPadrao(intencao: Intencao, pergunta: string): { padroes: readonly string[]; reserva: number } {
  if (intencao === 'escolha') {
    const opcoes = opcoesDaEscolha(pergunta) ?? [];
    const extras = opcoes.length === 2 ? ['Os dois', 'Nenhum dos dois'] : ['Nenhum'];
    // Reserva 3: no máximo UMA aprendida antes das opções, que são o espaço de resposta.
    return { padroes: [...opcoes, ...extras], reserva: 3 };
  }
  if (intencao === 'simnao') return { padroes: RESPOSTAS_DA_PERGUNTA_FECHADA, reserva: 2 };
  if (intencao === 'saudacao') {
    // Devolve a mesma saudação: "Bom dia" para "boa noite" seria um erro de
    // quem não pode corrigir depressa.
    const eco = ECOS_DA_SAUDACAO.find(([quando]) => quando.test(normalizar(pergunta)))?.[1];
    const regra = REGRAS_DEPOIS_DA_ABERTA.find((r) => r.intencao === 'saudacao');
    return { padroes: [...(eco ? [eco] : []), ...(regra?.respostas ?? [])], reserva: 2 };
  }
  const regra = [...REGRAS_ANTES_DA_ABERTA, ...REGRAS_DEPOIS_DA_ABERTA].find((r) => r.intencao === intencao);
  return regra ? { padroes: regra.respostas, reserva: 2 } : { padroes: [], reserva: 0 };
}

/** O que o paciente já respondeu a esta pergunta, da mais dita para a menos dita. */
function aprendidasPara(pergunta: string, modelo: ModeloDoAssistente): string[] {
  const mapa = modelo.respostas[normalizar(pergunta)];
  if (!mapa) return [];
  return Object.entries(mapa)
    .filter(([resposta]) => resposta.length <= MAX_CARACTERES_NO_BOTAO)
    .sort((a, b) => b[1] - a[1])
    .map(([resposta]) => resposta);
}

export interface OpcoesDeRespostas {
  /** No máximo 4, que é o que cabe na faixa. */
  maximo?: number;
}

/**
 * Até quatro respostas para a pergunta do cuidador. Uma consulta: não mexe no
 * modelo (quem aprende é `aprenderResposta`, quando o paciente escolhe).
 *
 * Lista vazia quando não há o que oferecer — mensagem que não é pergunta nem
 * assunto conhecido, pergunta aberta sem histórico, ou QUALQUER pergunta que
 * fale de dor. A tela, então, não mostra a faixa.
 */
export function sugerirRespostas(
  pergunta: string,
  modelo: ModeloDoAssistente,
  { maximo = MAXIMO_DE_RESPOSTAS }: OpcoesDeRespostas = {},
): string[] {
  if (!normalizar(pergunta)) return [];
  const teto = Math.max(0, Math.min(MAXIMO_DE_RESPOSTAS, Math.floor(maximo)));
  const intencao = intencaoDaPergunta(pergunta);
  // Nunca na dor: antes de olhar as respostas-padrão e, sobretudo, as aprendidas
  // (o que o paciente respondeu uma vez a outra pergunta de dor não vale aqui).
  if (INTENCOES_DE_DOR.has(intencao)) return [];
  const { padroes, reserva } = respostasPadrao(intencao, pergunta);
  const aprendidas = aprendidasPara(pergunta, modelo);

  const saida: string[] = [];
  const vistas = new Set<string>();
  const juntar = (texto: string, limite: number) => {
    if (saida.length >= limite) return;
    const chave = normalizar(texto);
    if (!chave || vistas.has(chave)) return;
    vistas.add(chave);
    saida.push(texto);
  };

  // 1. As aprendidas, deixando a reserva para as respostas-padrão.
  const limiteDasAprendidas = Math.max(0, teto - Math.min(reserva, teto));
  for (const a of aprendidas) juntar(a, limiteDasAprendidas);
  // 2. As respostas-padrão.
  for (const p of padroes) juntar(p, teto);
  // 3. Sobrou lugar (poucas respostas-padrão): mais aprendidas.
  for (const a of aprendidas) juntar(a, teto);

  return saida;
}

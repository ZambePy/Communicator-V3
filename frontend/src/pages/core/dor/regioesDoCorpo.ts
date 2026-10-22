/**
 * Mapa do corpo para o relato de dor (pedido de 19/10/2026).
 *
 * A pessoa diz ONDE dói e QUANTO, só com o olhar. Nada aqui desenha: é o
 * vocabulário (as partes, os lados, as faixas da escala), a frase que o
 * computador fala e a sequência de passos, tudo puro e testado.
 *
 * ── Por que vários passos, e não um mapa de toque ──────────────────────────
 *
 * Um desenho do corpo com regiões clicáveis do tamanho anatômico tem a mão, o
 * pé e o pescoço com poucos centímetros: muito abaixo do alvo mínimo de 5° que
 * o olhar alcança (~5 cm a 60 cm da tela). E a escala 0–10 tem 11 números: a
 * 5° cada um, não cabem numa tela de notebook (cabem ~5 por linha e 2 linhas).
 * Por isso o relato vai em passos curtos, cada um com poucos alvos grandes:
 *
 *   onde (8 alvos) → qual lado (6, só braços/mãos e pernas/pés)
 *     → quanto (5 faixas) → número (3, só nas faixas com mais de um)
 *     → conferir → falar.
 *
 * O desenho do corpo continua lá, dentro de cada alvo, com a região acesa.
 *
 * ── Esquerdo e direito são do PACIENTE ──────────────────────────────────────
 *
 * Na tela, o lado esquerdo do corpo fica sempre à ESQUERDA: as figuras dos
 * braços e das pernas são vistas de costas (como quem se vê por trás), e a
 * coluna da esquerda é a do braço esquerdo. Uma figura de frente, como num
 * atlas, põe o braço esquerdo da pessoa à direita de quem olha — a confusão
 * clássica dos mapas de dor impressos. As palavras ("Braço esquerdo") estão
 * sempre escritas no alvo; a posição e o desenho só confirmam.
 */

export type Lado = 'esquerdo' | 'direito' | 'ambos';
export type IdDaParte =
  | 'cabeca' | 'pescoco' | 'peito' | 'barriga' | 'costas' | 'corpo'
  | 'braco' | 'mao' | 'perna' | 'pe';
export type IdDoGrupo = 'bracos' | 'pernas';
/** Qual figura desenhar no alvo: de frente ou de costas. */
export type Vista = 'frente' | 'costas';

interface DefinicaoDaParte {
  id: IdDaParte;
  /** Rótulo do alvo, para as partes sem lado. */
  nome: string;
  /** A parte com a preposição já contraída: "na cabeça", "nas costas". */
  em: string;
  /** Partes com lado: substantivo e gênero, para concordar ("mão esquerda", "os dois pés"). */
  comLado?: { singular: string; plural: string; feminino: boolean };
  vista: Vista;
}

export const PARTES: Readonly<Record<IdDaParte, DefinicaoDaParte>> = {
  cabeca: { id: 'cabeca', nome: 'Cabeça', em: 'na cabeça', vista: 'frente' },
  pescoco: { id: 'pescoco', nome: 'Pescoço', em: 'no pescoço', vista: 'frente' },
  peito: { id: 'peito', nome: 'Peito', em: 'no peito', vista: 'frente' },
  barriga: { id: 'barriga', nome: 'Barriga', em: 'na barriga', vista: 'frente' },
  costas: { id: 'costas', nome: 'Costas', em: 'nas costas', vista: 'costas' },
  // Dor espalhada (rigidez, câimbras, o corpo todo dolorido de ficar na mesma
  // posição) não tem lugar no mapa; sem esta opção, a pessoa escolheria um
  // lugar errado ou desistiria.
  corpo: { id: 'corpo', nome: 'Corpo todo', em: 'no corpo todo', vista: 'frente' },
  braco: { id: 'braco', nome: 'Braço', em: 'no braço', comLado: { singular: 'braço', plural: 'braços', feminino: false }, vista: 'costas' },
  mao: { id: 'mao', nome: 'Mão', em: 'na mão', comLado: { singular: 'mão', plural: 'mãos', feminino: true }, vista: 'costas' },
  perna: { id: 'perna', nome: 'Perna', em: 'na perna', comLado: { singular: 'perna', plural: 'pernas', feminino: true }, vista: 'costas' },
  pe: { id: 'pe', nome: 'Pé', em: 'no pé', comLado: { singular: 'pé', plural: 'pés', feminino: false }, vista: 'costas' },
};

/** Onde dói: a parte e, nas que têm, o lado. */
export interface LocalDaDor {
  parte: IdDaParte;
  /** `null` nas partes sem lado (cabeça, peito…). */
  lado: Lado | null;
}

export const GRUPOS: Readonly<Record<IdDoGrupo, { titulo: string; descricao: string; partes: readonly [IdDaParte, IdDaParte] }>> = {
  bracos: { titulo: 'Braços e mãos', descricao: 'Escolher o lado', partes: ['braco', 'mao'] },
  pernas: { titulo: 'Pernas e pés', descricao: 'Escolher o lado', partes: ['perna', 'pe'] },
};

export type OpcaoDoInicio =
  | { tipo: 'local'; local: LocalDaDor }
  | { tipo: 'grupo'; grupo: IdDoGrupo };

/**
 * O primeiro passo, na ordem da tela: de cima para baixo no corpo, em duas
 * linhas de quatro (4 colunas de 5° cabem até num notebook de 1366 px).
 */
export const OPCOES_DO_INICIO: readonly OpcaoDoInicio[] = [
  { tipo: 'local', local: { parte: 'cabeca', lado: null } },
  { tipo: 'local', local: { parte: 'pescoco', lado: null } },
  { tipo: 'local', local: { parte: 'peito', lado: null } },
  { tipo: 'local', local: { parte: 'barriga', lado: null } },
  { tipo: 'local', local: { parte: 'costas', lado: null } },
  { tipo: 'grupo', grupo: 'bracos' },
  { tipo: 'grupo', grupo: 'pernas' },
  { tipo: 'local', local: { parte: 'corpo', lado: null } },
];

/**
 * O passo "qual lado": uma linha por parte do grupo; as colunas são o lado
 * ESQUERDO do corpo, os dois lados e o lado DIREITO — a esquerda da tela é a
 * esquerda da pessoa.
 */
export function opcoesDoGrupo(grupo: IdDoGrupo): LocalDaDor[][] {
  return GRUPOS[grupo].partes.map((parte) => [
    { parte, lado: 'esquerdo' as const },
    { parte, lado: 'ambos' as const },
    { parte, lado: 'direito' as const },
  ]);
}

export function grupoDaParte(parte: IdDaParte): IdDoGrupo | null {
  for (const id of Object.keys(GRUPOS) as IdDoGrupo[]) {
    if (GRUPOS[id].partes.includes(parte)) return id;
  }
  return null;
}

function adjetivoDoLado(lado: 'esquerdo' | 'direito', feminino: boolean): string {
  if (lado === 'esquerdo') return feminino ? 'esquerda' : 'esquerdo';
  return feminino ? 'direita' : 'direito';
}

/** Rótulo do lugar: "Cabeça", "Braço esquerdo", "As duas mãos". */
export function nomeDoLocal(local: LocalDaDor): string {
  const def = PARTES[local.parte];
  if (!def.comLado || local.lado === null) return def.nome;
  const { singular, plural, feminino } = def.comLado;
  if (local.lado === 'ambos') return `${feminino ? 'As duas' : 'Os dois'} ${plural}`;
  const nome = `${singular} ${adjetivoDoLado(local.lado, feminino)}`;
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

/** O lugar com a preposição: "no braço esquerdo", "nas duas mãos", "nas costas". */
export function lugarComPreposicao(local: LocalDaDor): string {
  const def = PARTES[local.parte];
  if (!def.comLado || local.lado === null) return def.em;
  const { singular, plural, feminino } = def.comLado;
  if (local.lado === 'ambos') return `${feminino ? 'nas duas' : 'nos dois'} ${plural}`;
  return `${feminino ? 'na' : 'no'} ${singular} ${adjetivoDoLado(local.lado, feminino)}`;
}

/**
 * A frase que o computador fala e manda ao cuidador:
 * "Dor no braço esquerdo, nível 7 de 10". O número vai sempre junto da
 * palavra "nível" e do "de 10": dito em voz alta, "sete" sozinho se perde.
 */
export function fraseDaDor(local: LocalDaDor, nivel: number): string {
  const n = limitarNivel(nivel);
  const lugar = lugarComPreposicao(local);
  return n === 0 ? `Sem dor ${lugar}, nível 0 de 10` : `Dor ${lugar}, nível ${n} de 10`;
}

// ── A escala ───────────────────────────────────────────────────────────────

export type IdDaFaixa = 'sem-dor' | 'leve' | 'moderada' | 'forte' | 'pior';

export interface FaixaDeDor {
  id: IdDaFaixa;
  rotulo: string;
  de: number;
  ate: number;
  /**
   * Cor de APOIO. O significado nunca depende dela: o número e a palavra
   * estão sempre escritos, e a barra de 10 segmentos mostra a quantidade.
   * Tons claros sobre o fundo escuro, do verde-água ao rosa-avermelhado — o
   * vermelho cheio fica para a Emergência.
   */
  cor: string;
}

export const FAIXAS: readonly FaixaDeDor[] = [
  { id: 'sem-dor', rotulo: 'Sem dor', de: 0, ate: 0, cor: '#5EEAD4' },
  { id: 'leve', rotulo: 'Leve', de: 1, ate: 3, cor: '#BEF264' },
  { id: 'moderada', rotulo: 'Moderada', de: 4, ate: 6, cor: '#FCD34D' },
  { id: 'forte', rotulo: 'Forte', de: 7, ate: 9, cor: '#FB923C' },
  { id: 'pior', rotulo: 'Pior dor possível', de: 10, ate: 10, cor: '#FB7185' },
];

export function limitarNivel(nivel: number): number {
  if (!Number.isFinite(nivel)) return 0;
  return Math.min(10, Math.max(0, Math.round(nivel)));
}

export function faixaDoNivel(nivel: number): FaixaDeDor {
  const n = limitarNivel(nivel);
  return FAIXAS.find((f) => n >= f.de && n <= f.ate) ?? FAIXAS[0];
}

export function niveisDaFaixa(faixa: FaixaDeDor): number[] {
  const niveis: number[] = [];
  for (let n = faixa.de; n <= faixa.ate; n++) niveis.push(n);
  return niveis;
}

/** Texto do intervalo: "0", "1 a 3", "10". */
export function intervaloDaFaixa(faixa: FaixaDeDor): string {
  return faixa.de === faixa.ate ? String(faixa.de) : `${faixa.de} a ${faixa.ate}`;
}

/**
 * A partir de que nível a tela oferece chamar a emergência (com a contagem de
 * sempre, que pode ser cancelada). Só oferece: quem decide é a pessoa.
 */
export const NIVEL_QUE_OFERECE_EMERGENCIA = 8;
export const ofereceEmergencia = (nivel: number): boolean => limitarNivel(nivel) >= NIVEL_QUE_OFERECE_EMERGENCIA;

/**
 * A partir de que nível a frase vai TAMBÉM como pedido de ajuda, o tipo que
 * faz o celular do cuidador tocar (revisão de UX de 20/10/2026, achado 3). A
 * frase sozinha só entra na conversa, sem aviso: o cuidador a vê quando abrir
 * o app — tarde demais para uma dor forte. Abaixo disto, a conversa basta.
 */
export const NIVEL_QUE_AVISA_O_CELULAR = 7;
export const avisaOCelular = (nivel: number): boolean => limitarNivel(nivel) >= NIVEL_QUE_AVISA_O_CELULAR;

/**
 * Quantas faixas por linha. Cinco lado a lado é a escala como ela é lida (da
 * esquerda para a direita, de menos para mais) — mas só quando as cinco cabem
 * com o alvo mínimo; senão, três em cima e duas embaixo.
 */
export function colunasDasFaixas(larguraPx: number, alvoMinimoPx: number, espacoPx: number): 5 | 3 {
  if (!(larguraPx > 0) || !(alvoMinimoPx > 0)) return 3;
  return 5 * alvoMinimoPx + 4 * Math.max(0, espacoPx) <= larguraPx ? 5 : 3;
}

// ── Os passos, na URL ──────────────────────────────────────────────────────
//
// Cada passo é uma URL (`/dor?local=braco-esquerdo&faixa=forte`). Assim o
// "Voltar" do cabeçalho, que é um alvo de olhar como outro qualquer, volta UM
// passo — para o passo anterior da conta, não para fora da tela — e uma
// recarga da página no meio (queda do renderer) reabre no mesmo ponto. O
// envio NUNCA está na URL: reabrir a página não fala nem manda nada sozinha.

export type PassoDaDor =
  | { passo: 'onde' }
  | { passo: 'qual'; grupo: IdDoGrupo }
  | { passo: 'quanto'; local: LocalDaDor }
  | { passo: 'numero'; local: LocalDaDor; faixa: FaixaDeDor }
  | { passo: 'confirmar'; local: LocalDaDor; nivel: number };

const LADOS: readonly Lado[] = ['esquerdo', 'direito', 'ambos'];

export function codigoDoLocal(local: LocalDaDor): string {
  return local.lado ? `${local.parte}-${local.lado}` : local.parte;
}

/** O inverso de `codigoDoLocal`; `null` para qualquer coisa fora do vocabulário. */
export function localDoCodigo(codigo: string | null | undefined): LocalDaDor | null {
  if (!codigo) return null;
  const [parte, lado, ...resto] = codigo.split('-');
  // `hasOwn`, não `in`: "constructor" e "__proto__" estão "em" qualquer objeto.
  if (resto.length > 0 || !Object.prototype.hasOwnProperty.call(PARTES, parte)) return null;
  const def = PARTES[parte as IdDaParte];
  if (def.comLado) {
    return LADOS.includes(lado as Lado) ? { parte: def.id, lado: lado as Lado } : null;
  }
  return lado === undefined ? { parte: def.id, lado: null } : null;
}

export function lerPasso(busca: URLSearchParams | string): PassoDaDor {
  const p = typeof busca === 'string' ? new URLSearchParams(busca) : busca;
  const local = localDoCodigo(p.get('local'));
  if (local) {
    const nivelBruto = p.get('nivel');
    if (nivelBruto !== null && /^\d{1,2}$/.test(nivelBruto) && Number(nivelBruto) <= 10) {
      return { passo: 'confirmar', local, nivel: Number(nivelBruto) };
    }
    const faixa = FAIXAS.find((f) => f.id === p.get('faixa'));
    // Faixa de um número só (0, 10) não tem passo de número: vai direto
    // para conferir.
    if (faixa && faixa.de !== faixa.ate) return { passo: 'numero', local, faixa };
    if (faixa) return { passo: 'confirmar', local, nivel: faixa.de };
    return { passo: 'quanto', local };
  }
  const grupo = p.get('grupo');
  if (grupo === 'bracos' || grupo === 'pernas') return { passo: 'qual', grupo };
  return { passo: 'onde' };
}

export function buscaDoPasso(passo: PassoDaDor): string {
  switch (passo.passo) {
    case 'onde':
      return '';
    case 'qual':
      return `?grupo=${passo.grupo}`;
    case 'quanto':
      return `?local=${codigoDoLocal(passo.local)}`;
    case 'numero':
      return `?local=${codigoDoLocal(passo.local)}&faixa=${passo.faixa.id}`;
    case 'confirmar':
      return `?local=${codigoDoLocal(passo.local)}&nivel=${limitarNivel(passo.nivel)}`;
  }
}

/** Para onde o "Voltar" leva. `null`: sair do mapa da dor. */
export function passoAnterior(passo: PassoDaDor): PassoDaDor | null {
  switch (passo.passo) {
    case 'onde':
      return null;
    case 'qual':
      return { passo: 'onde' };
    case 'quanto': {
      const grupo = grupoDaParte(passo.local.parte);
      return grupo ? { passo: 'qual', grupo } : { passo: 'onde' };
    }
    case 'numero':
      return { passo: 'quanto', local: passo.local };
    case 'confirmar': {
      const faixa = faixaDoNivel(passo.nivel);
      return faixa.de === faixa.ate
        ? { passo: 'quanto', local: passo.local }
        : { passo: 'numero', local: passo.local, faixa };
    }
  }
}

/** O passo que vem depois de escolher uma faixa. */
export function passoDepoisDaFaixa(local: LocalDaDor, faixa: FaixaDeDor): PassoDaDor {
  return faixa.de === faixa.ate
    ? { passo: 'confirmar', local, nivel: faixa.de }
    : { passo: 'numero', local, faixa };
}

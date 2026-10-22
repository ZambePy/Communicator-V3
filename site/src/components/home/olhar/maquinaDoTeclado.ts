/**
 * O teclado do IrisFlow em miniatura, para a abertura da home (pedido de
 * 20/10/2026: "dar movimento ao site" sem que nada se mexa só por enfeite).
 *
 * É o MESMO arranjo do teclado do app (frontend/src/pages/KeyboardScreen.tsx):
 * uma grade de 3 × 2 em dois níveis — primeiro o grupo de letras, depois a
 * letra —, a quinta tecla com Y, Z e as ações, e a sexta com as sugestões do
 * assistente de escrita (frases primeiro, depois palavras, no máximo seis).
 * As regras de escrita também são as do app: a letra entra no fim do texto, a
 * palavra sugerida troca a palavra começada, a frase sugerida substitui tudo e
 * NÃO fala sozinha — quem fala é a tecla Falar.
 *
 * Funções puras: a abertura (roteiroDoOlhar.ts) e o mouse (olharDoMouse.ts)
 * só chamam `selecionar` e desenham o que `celulas` devolve.
 */

/** Os grupos da camada de letras, na ordem da grade (o `GROUPS` do app). */
export const GRUPOS = [
  ['A', 'B', 'C', 'D', 'E', 'F'],
  ['G', 'H', 'I', 'J', 'K', 'L'],
  ['M', 'N', 'O', 'P', 'Q', 'R'],
  ['S', 'T', 'U', 'V', 'W', 'X'],
  ['Y', 'Z', 'Espaço', 'Falar', 'Apagar', 'Limpar'],
] as const

export type Acao = 'Espaço' | 'Falar' | 'Apagar' | 'Limpar'

const ACOES: readonly string[] = ['Espaço', 'Falar', 'Apagar', 'Limpar']

/** Nível 1 (os grupos), nível 2 de um grupo, ou nível 2 das sugestões. */
export type Nivel = { tipo: 'grupos' } | { tipo: 'grupo'; grupo: number } | { tipo: 'sugestoes' }

export type EstadoDoTeclado = { nivel: Nivel; texto: string }

export const INICIO: EstadoDoTeclado = { nivel: { tipo: 'grupos' }, texto: '' }

/** As seis teclas da grade e as duas da barra de cima. */
export type IdDaTecla = 'c0' | 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'voltar' | 'falar'

export const TECLAS_DA_GRADE: readonly IdDaTecla[] = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5']

/** O que uma tecla da grade mostra. */
export type Celula =
  | { tipo: 'grupo'; letras: readonly string[] }
  | { tipo: 'acoes' }
  | { tipo: 'previa'; palavras: string[]; frases: number }
  | { tipo: 'letra'; letra: string }
  | { tipo: 'acao'; acao: Acao }
  | { tipo: 'palavra'; texto: string }
  | { tipo: 'frase'; texto: string }
  | { tipo: 'vazia' }

/** O que a seleção fez — é o que a tela anima. */
export type Efeito = 'abriu' | 'escreveu' | 'apagou' | 'voltou' | 'falou' | 'nada'

/* ---------------- o assistente de escrita, em miniatura ----------------
   O do app aprende o vocabulário da pessoa; aqui é uma lista fixa do dia a
   dia, na ordem em que aparece (a primeira é a mais usada). As palavras em
   caixa alta, como as teclas; as frases do jeito que a pessoa as escreveu. */

/** As palavras do campo vazio: as mesmas do app (`DEFAULT_WORDS`). */
export const PALAVRAS_DO_INICIO = ['EU', 'SIM', 'NÃO', 'TALVEZ']

const PALAVRAS = [
  'EU',
  'SIM',
  'NÃO',
  'ESTOU',
  'ESTÁ',
  'ESPERA',
  'OBRIGADO',
  'OI',
  'ONDE',
  'OLHA',
  'QUERO',
  'COM',
  'CAMA',
  'CALOR',
  'SEDE',
  'SONO',
  'FOME',
  'FRIO',
  'DOR',
  'DORMIR',
  'ÁGUA',
  'AGORA',
  'AMOR',
  'AJUDA',
  'BANHEIRO',
  'BEM',
  'MÃE',
  'MUITO',
  'PAI',
  'POR',
  'FAVOR',
  'PRECISO',
  'LUZ',
  'TV',
  'VIRAR',
  'HOJE',
  'NOITE',
  'TALVEZ',
]

/** As frases mais usadas primeiro: com o campo vazio, são as três primeiras. */
const FRASES = [
  'Estou com sede.',
  'Obrigado, amor.',
  'Preciso de ajuda.',
  'Estou bem.',
  'Estou com frio.',
  'Quero dormir.',
  'Pode me virar?',
  'Quero água.',
  'Apaga a luz?',
  'Liga a TV?',
]

/** Comparação sem caixa e sem acento: "esta" acha "ESTÁ". */
function normal(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}

/** A palavra que está sendo escrita (o que vem depois do último espaço). */
export function palavraComecada(texto: string): string {
  const i = texto.lastIndexOf(' ')
  return i < 0 ? texto : texto.slice(i + 1)
}

/**
 * As sugestões para o que está escrito, como o app faz: frases que continuam
 * o texto (ou as mais usadas, com o campo vazio) e palavras que completam a
 * palavra começada (ou as do início).
 */
export function sugerir(texto: string): { palavras: string[]; frases: string[] } {
  const vazio = texto.trim() === ''
  const escrita = palavraComecada(texto).toUpperCase()
  const comeco = normal(escrita)
  // A palavra igual à escrita não é sugestão; a mesma com acento é ("ESTA"
  // sugere "ESTÁ"): é assim que o acento chega sem a camada de símbolos.
  const palavras = vazio || comeco === ''
    ? PALAVRAS_DO_INICIO.slice()
    : PALAVRAS.filter((p) => normal(p).startsWith(comeco) && p !== escrita).slice(0, 5)
  const frases = vazio
    ? FRASES.slice(0, 3)
    : FRASES.filter((f) => normal(f).startsWith(normal(texto)) && normal(f) !== normal(texto.trim())).slice(0, 3)
  return { palavras: palavras.length > 0 ? palavras : PALAVRAS_DO_INICIO.slice(), frases }
}

/**
 * O que entra nas seis teclas do nível das sugestões: frases primeiro, porque
 * valem mais por fixação, depois palavras (a mesma regra do app).
 */
export function itensDeSugestao(texto: string): { texto: string; frase: boolean }[] {
  const { palavras, frases } = sugerir(texto)
  return [
    ...frases.map((t) => ({ texto: t, frase: true })),
    ...palavras.map((t) => ({ texto: t, frase: false })),
  ].slice(0, 6)
}

/** O que cada uma das seis teclas mostra neste estado. */
export function celulas(estado: EstadoDoTeclado): Celula[] {
  const { nivel, texto } = estado
  if (nivel.tipo === 'grupos') {
    const { palavras, frases } = sugerir(texto)
    return [
      { tipo: 'grupo', letras: GRUPOS[0] },
      { tipo: 'grupo', letras: GRUPOS[1] },
      { tipo: 'grupo', letras: GRUPOS[2] },
      { tipo: 'grupo', letras: GRUPOS[3] },
      { tipo: 'acoes' },
      // A prévia não cabe a frase inteira: diz que ela existe lá dentro.
      { tipo: 'previa', palavras: palavras.slice(0, frases.length > 0 ? 3 : 4), frases: frases.length },
    ]
  }
  if (nivel.tipo === 'grupo') {
    return GRUPOS[nivel.grupo].map((item): Celula =>
      ACOES.includes(item) ? { tipo: 'acao', acao: item as Acao } : { tipo: 'letra', letra: item },
    )
  }
  const itens: Celula[] = itensDeSugestao(texto).map((i) =>
    i.frase ? { tipo: 'frase', texto: i.texto } : { tipo: 'palavra', texto: i.texto },
  )
  while (itens.length < 6) itens.push({ tipo: 'vazia' })
  return itens
}

/**
 * As teclas que valem agora. Voltar só existe no nível 2 e Falar só com texto
 * escrito — alvo sem função é alvo para errar (o mesmo critério do app).
 */
export function teclasAtivas(estado: EstadoDoTeclado): IdDaTecla[] {
  const grade = celulas(estado)
  const ativas: IdDaTecla[] = TECLAS_DA_GRADE.filter((_, i) => grade[i].tipo !== 'vazia')
  if (estado.nivel.tipo !== 'grupos') ativas.push('voltar')
  if (estado.texto.trim() !== '') ativas.push('falar')
  return ativas
}

/** Teto do texto da miniatura: a linha de cima mostra o fim, e só cabe uma frase. */
export const MAXIMO_DE_LETRAS = 48

function escrever(texto: string, mais: string): string {
  return (texto + mais).slice(0, MAXIMO_DE_LETRAS)
}

/** A palavra sugerida troca a palavra começada (o `handleSelectSuggestion` do app). */
function trocarPalavra(texto: string, palavra: string): string {
  if (texto === '' || texto.endsWith(' ')) return escrever(texto, palavra + ' ')
  const partes = texto.trim().split(/\s+/)
  partes[partes.length - 1] = palavra
  return escrever('', partes.join(' ') + ' ')
}

/**
 * Aciona uma tecla. Depois de uma letra, palavra, frase ou ação, volta ao
 * nível 1 — menos o Apagar, que fica no grupo para apagar várias letras.
 * Tecla que não vale agora não faz nada.
 */
export function selecionar(estado: EstadoDoTeclado, tecla: IdDaTecla): { estado: EstadoDoTeclado; efeito: Efeito } {
  if (!teclasAtivas(estado).includes(tecla)) return { estado, efeito: 'nada' }
  const grupos: Nivel = { tipo: 'grupos' }

  if (tecla === 'voltar') return { estado: { ...estado, nivel: grupos }, efeito: 'voltou' }
  if (tecla === 'falar') return { estado, efeito: 'falou' }

  const i = TECLAS_DA_GRADE.indexOf(tecla)
  const { nivel, texto } = estado

  if (nivel.tipo === 'grupos') {
    if (i === 5) return { estado: { ...estado, nivel: { tipo: 'sugestoes' } }, efeito: 'abriu' }
    return { estado: { ...estado, nivel: { tipo: 'grupo', grupo: i } }, efeito: 'abriu' }
  }

  const celula = celulas(estado)[i]
  switch (celula.tipo) {
    case 'letra':
      return { estado: { nivel: grupos, texto: escrever(texto, celula.letra) }, efeito: 'escreveu' }
    case 'palavra':
      return { estado: { nivel: grupos, texto: trocarPalavra(texto, celula.texto) }, efeito: 'escreveu' }
    case 'frase':
      // Substitui o que estava escrito e não fala: falar é decisão da pessoa.
      return { estado: { nivel: grupos, texto: escrever('', celula.texto + ' ') }, efeito: 'escreveu' }
    case 'acao':
      if (celula.acao === 'Espaço') return { estado: { nivel: grupos, texto: escrever(texto, ' ') }, efeito: 'escreveu' }
      if (celula.acao === 'Apagar') return { estado: { ...estado, texto: texto.slice(0, -1) }, efeito: 'apagou' }
      if (celula.acao === 'Limpar') return { estado: { nivel: grupos, texto: '' }, efeito: 'apagou' }
      return { estado: { ...estado, nivel: grupos }, efeito: texto.trim() !== '' ? 'falou' : 'voltou' }
    default:
      return { estado, efeito: 'nada' }
  }
}

/**
 * A tecla que, neste estado, mostra o item pedido — para o roteiro da abertura
 * dizer o que escolher ("a letra E", "a frase Estou com sede.") em vez de
 * decorar posições. `null` se nenhuma tecla mostra.
 */
export function teclaQueMostra(estado: EstadoDoTeclado, item: string): IdDaTecla | null {
  if (item === 'Falar' && estado.texto.trim() !== '') return 'falar'
  if (item === 'Voltar' && estado.nivel.tipo !== 'grupos') return 'voltar'
  const grade = celulas(estado)
  const i = grade.findIndex((c) => {
    switch (c.tipo) {
      case 'grupo':
        return c.letras.includes(item)
      case 'acoes':
        return GRUPOS[4].includes(item as (typeof GRUPOS)[4][number])
      case 'previa':
        return item === 'Sugestões'
      case 'letra':
        return c.letra === item
      case 'acao':
        return c.acao === item
      case 'palavra':
      case 'frase':
        return c.texto === item
      default:
        return false
    }
  })
  return i < 0 ? null : TECLAS_DA_GRADE[i]
}

/** Um nome curto da tecla, para o texto alternativo e os testes. */
export function nomeDaTecla(estado: EstadoDoTeclado, tecla: IdDaTecla): string {
  if (tecla === 'voltar') return 'Voltar'
  if (tecla === 'falar') return 'Falar'
  const c = celulas(estado)[TECLAS_DA_GRADE.indexOf(tecla)]
  switch (c.tipo) {
    case 'grupo':
      return `Grupo ${c.letras.join(' ')}`
    case 'acoes':
      return 'Grupo Y Z e ações'
    case 'previa':
      return 'Sugestões'
    case 'letra':
      return c.letra
    case 'acao':
      return c.acao
    case 'palavra':
    case 'frase':
      return c.texto
    default:
      return ''
  }
}

/** Uma chave do nível, para saber quando a grade mudou de verdade. */
export function chaveDoNivel(e: EstadoDoTeclado): string {
  return e.nivel.tipo === 'grupo' ? `grupo-${e.nivel.grupo}` : e.nivel.tipo
}

/** Até onde dois textos começam iguais: na linha de cima, só o resto "chega". */
export function prefixoComum(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

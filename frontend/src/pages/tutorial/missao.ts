/**
 * Missões do tutorial — a ponte entre um passo do tutorial e a TELA REAL.
 *
 * ## Por que existe
 *
 * O tutorial precisava deixar de ser uma sequência de telas explicativas. A
 * saída óbvia seria desenhar, dentro do tutorial, versões pequenas do teclado,
 * das frases prontas e dos jogos — e é exatamente a saída errada: o paciente
 * aprenderia um teclado que não existe, com uma grade que não é a do app, e na
 * primeira vez que abrisse o teclado de verdade estaria de novo no zero.
 *
 * Então o tutorial MANDA a pessoa para a tela de verdade e espera ela fazer a
 * coisa de verdade. Este módulo é o combinado entre os dois lados:
 *
 *   - o passo do tutorial chama `iniciarMissao` e navega para a rota;
 *   - a tela real chama `cumprirMissao` no ponto em que a ação ACONTECE
 *     (a frase foi falada, o jogo abriu), não onde o botão foi montado;
 *   - a pessoa volta, e o passo já está cumprido.
 *
 * ## Por que `sessionStorage`
 *
 * O estado precisa sobreviver a uma navegação de rota e a um F5 — o paciente
 * ou o cuidador apertar F5 no meio do tutorial não pode custar o progresso
 * inteiro. E precisa NÃO sobreviver à sessão: uma missão pendente de ontem
 * reabriria o app com uma faixa de tutorial no teclado, sem nada que explique
 * por quê. `sessionStorage` é exatamente essa duração.
 *
 * Toda leitura e escrita é defensiva: em janela anônima, com dados do site
 * bloqueados ou em jsdom sem storage, o acesso pode lançar. Um tutorial que
 * derruba a tela é pior que um tutorial sem memória.
 */

export type Missao = 'comunicacao' | 'digitacao' | 'conversa' | 'lazer';

export const MISSOES: readonly Missao[] = ['comunicacao', 'digitacao', 'conversa', 'lazer'];

const CHAVE_ATIVA = 'irisflow_tutorial_missao';
const CHAVE_CUMPRIDAS = 'irisflow_tutorial_missoes_ok';
const CHAVE_PASSO = 'irisflow_tutorial_passo';

function ler(chave: string): string | null {
  try {
    return sessionStorage.getItem(chave);
  } catch {
    return null;
  }
}

function escrever(chave: string, valor: string | null): void {
  try {
    if (valor === null) sessionStorage.removeItem(chave);
    else sessionStorage.setItem(chave, valor);
  } catch {
    /* sem storage: o tutorial funciona, só não lembra entre recargas */
  }
}

function ehMissao(v: string | null): v is Missao {
  return v !== null && (MISSOES as readonly string[]).includes(v);
}

/** Missão que a pessoa foi mandada cumprir agora, ou `null`. */
export function missaoAtiva(): Missao | null {
  const v = ler(CHAVE_ATIVA);
  return ehMissao(v) ? v : null;
}

/** Marca a missão como a que está em curso. Chamado pelo passo do tutorial. */
export function iniciarMissao(m: Missao): void {
  escrever(CHAVE_ATIVA, m);
}

/** Encerra a missão em curso sem cumpri-la (a pessoa voltou pelo caminho). */
export function abandonarMissao(): void {
  escrever(CHAVE_ATIVA, null);
}

/**
 * A ação da missão aconteceu.
 *
 * Idempotente e silenciosa quando a missão não está ativa: as telas chamam
 * isto no fluxo normal de uso, e o caso comum é não haver tutorial nenhum
 * rodando. Uma exceção aqui derrubaria o teclado.
 */
export function cumprirMissao(m: Missao): void {
  if (missaoAtiva() !== m) return;
  const feitas = new Set(missoesCumpridas());
  feitas.add(m);
  escrever(CHAVE_CUMPRIDAS, JSON.stringify([...feitas]));
  escrever(CHAVE_ATIVA, null);
}

/** Missões já cumpridas nesta sessão. */
export function missoesCumpridas(): Missao[] {
  const raw = ler(CHAVE_CUMPRIDAS);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter(ehMissao) : [];
  } catch {
    return [];
  }
}

export function missaoCumprida(m: Missao): boolean {
  return missoesCumpridas().includes(m);
}

/** Passo do tutorial a retomar quando a pessoa voltar. */
export function guardarPasso(passo: string): void {
  escrever(CHAVE_PASSO, passo);
}

export function passoGuardado(): string | null {
  return ler(CHAVE_PASSO);
}

/** Esquece tudo. Chamado ao sair do tutorial, por conclusão ou por "Pular". */
export function limparMissoes(): void {
  escrever(CHAVE_ATIVA, null);
  escrever(CHAVE_CUMPRIDAS, null);
  escrever(CHAVE_PASSO, null);
}

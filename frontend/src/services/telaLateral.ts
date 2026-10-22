/**
 * A tela lateral de onde o paciente veio (revisão de 21/10/2026, Important 1).
 *
 * No modo só horizontal, as telas que o olhar alcança são as laterais: o
 * Sim · Não em duas metades e o teclado lateral. O menu, não — os cartões dele
 * pedem o olhar vertical. Sair da tela de socorro levava ao menu, e o paciente
 * ficava sem nada que o olhar acionasse. Agora a saída volta para a última tela
 * lateral aberta, marcada aqui por ela mesma.
 *
 * Na memória do módulo e na `sessionStorage` (o pedido de socorro sobrevive a
 * recarregar a página, e a origem dele também). Só as rotas laterais conhecidas
 * valem: um valor estranho na sessão não vira navegação.
 */

export type TelaLateral = '/sim-nao' | '/teclado-lateral';

const TELAS_LATERAIS: readonly TelaLateral[] = ['/sim-nao', '/teclado-lateral'];
const CHAVE = 'irisflow.telaLateralDeOrigem';
/** Sem nada marcado: o Sim · Não, a tela lateral que sempre existe. */
const PADRAO: TelaLateral = '/sim-nao';

let marcada: TelaLateral | null = null;

const ehTelaLateral = (v: unknown): v is TelaLateral => TELAS_LATERAIS.includes(v as TelaLateral);

export function marcarTelaLateral(rota: TelaLateral): void {
  marcada = rota;
  try {
    sessionStorage.setItem(CHAVE, rota);
  } catch {
    // Sem armazenamento, vale a memória desta página — perder a origem ao
    // recarregar só faz a saída ir para o Sim · Não.
  }
}

export function telaLateralDeOrigem(): TelaLateral {
  if (marcada) return marcada;
  try {
    const gravada = sessionStorage.getItem(CHAVE);
    if (ehTelaLateral(gravada)) return gravada;
  } catch {
    // idem
  }
  return PADRAO;
}

/** Só para testes. `manterSessao`: simula recarregar a página. */
export function _reiniciarTelaLateralParaTestes(opcoes: { manterSessao?: boolean } = {}): void {
  marcada = null;
  if (opcoes.manterSessao) return;
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    // idem
  }
}

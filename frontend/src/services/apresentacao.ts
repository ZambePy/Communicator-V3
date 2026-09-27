/**
 * Modo apresentação — para demonstrar o produto sem que a demonstração vire
 * um evento real na vida de alguém.
 *
 * O motivo concreto: numa demonstração para clínica ou investidor, alguém vai
 * olhar para o botão de socorro. Sem este modo, esse olhar dispara um pedido
 * de emergência de verdade — notificação no celular do cuidador, linha no
 * histórico de alertas, escalonamento automático se ninguém responder. Isso já
 * é ruim numa conta de teste e é grave numa conta com um paciente real.
 *
 * O que o modo faz, então, é simples e verificável:
 *
 *   1. corta a saída para a nuvem no barramento de eventos — nada de fala,
 *      alerta, calibração ou contador sai deste computador;
 *   2. troca o nome do paciente por um rótulo neutro nas telas;
 *   3. mantém uma faixa visível o tempo todo, para que ninguém confunda uma
 *      demonstração com uso real — inclusive quem estiver assistindo.
 *
 * Prazo: o modo se desliga sozinho depois de `DURACAO_DO_MODO_APRESENTACAO_MS`
 * (2 h). Um modo esquecido ligado descartava TODOS os pedidos de socorro, sem
 * prazo — agora, no pior caso, por duas horas (e a tela de emergência diz
 * "modo apresentação" em vez de "alerta enviado").
 *
 * O que ele NÃO faz: simular dados. As telas continuam mostrando o estado
 * verdadeiro do rastreamento, da calibração e da voz. Uma demonstração que
 * inventa números não prova nada a quem entende do assunto, e mente para quem
 * não entende.
 */

export const CHAVE_DO_MODO_APRESENTACAO = 'irisflow.apresentacao';

/** Nome mostrado no lugar do nome real do paciente durante a demonstração. */
export const NOME_DE_DEMONSTRACAO = 'Paciente demonstração';

type Ouvinte = (ativo: boolean) => void;
const ouvintes = new Set<Ouvinte>();

/** Depois disto o modo apresentação se desliga sozinho. */
export const DURACAO_DO_MODO_APRESENTACAO_MS = 2 * 60 * 60_000;

/** Quando o modo foi ligado (`null` = desligado). */
let ativoDesde: number | null = null;

/**
 * Lê o modo gravado. O formato é `desde:<ms>`; o antigo (`'1'`, sem data) e um
 * prazo vencido contam como desligado — o lado seguro: o socorro volta a sair.
 */
function lerDoDisco(): boolean {
  ativoDesde = null;
  try {
    const v = localStorage.getItem(CHAVE_DO_MODO_APRESENTACAO);
    if (!v) return false;
    const desde = v.startsWith('desde:') ? Number(v.slice(6)) : NaN;
    if (!Number.isFinite(desde) || Date.now() - desde >= DURACAO_DO_MODO_APRESENTACAO_MS || desde > Date.now() + 60_000) {
      localStorage.removeItem(CHAVE_DO_MODO_APRESENTACAO);
      return false;
    }
    ativoDesde = desde;
    return true;
  } catch {
    return false;
  }
}

let ativo = lerDoDisco();

export function modoApresentacaoAtivo(): boolean {
  if (ativo && ativoDesde !== null && Date.now() - ativoDesde >= DURACAO_DO_MODO_APRESENTACAO_MS) {
    definirModoApresentacao(false);
  }
  return ativo;
}

export function definirModoApresentacao(novo: boolean): void {
  if (novo === ativo) return;
  ativo = novo;
  ativoDesde = novo ? Date.now() : null;
  try {
    if (novo) localStorage.setItem(CHAVE_DO_MODO_APRESENTACAO, `desde:${ativoDesde}`);
    else localStorage.removeItem(CHAVE_DO_MODO_APRESENTACAO);
  } catch {
    // Sem armazenamento o modo vale só nesta sessão — e é assim que ele deve
    // falhar: aberto demais é melhor que preso ligado sem ninguém saber.
  }
  for (const o of ouvintes) {
    try {
      o(novo);
    } catch (e) {
      console.warn('[apresentacao] ouvinte falhou', e);
    }
  }
}

export function ouvirModoApresentacao(o: Ouvinte): () => void {
  ouvintes.add(o);
  return () => {
    ouvintes.delete(o);
  };
}

/** O nome que deve aparecer na tela, dado o nome real. */
export function nomeParaExibir(nomeReal: string | null | undefined): string {
  if (ativo) return NOME_DE_DEMONSTRACAO;
  return nomeReal?.trim() || 'Paciente';
}

/** Só para os testes: relê o disco e esquece os ouvintes. */
export function _reiniciarParaTeste(): void {
  ouvintes.clear();
  ativo = lerDoDisco();
}

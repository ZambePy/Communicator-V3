/**
 * Tendência de uma semana para a seguinte (21/10/2026).
 *
 * A seta só aparece quando a mudança é maior que o ruído natural de uma semana
 * para outra. Uma seta que sobe e desce a cada 0,1° ensina o cuidador a
 * ignorá-la — e a que o médico vai ver na consulta tem de valer alguma coisa.
 * Por isso cada métrica exige a mudança em DUAS medidas ao mesmo tempo:
 *   - relativa (a proporção do valor anterior): 0,2° pesa muito sobre um erro de
 *     1°, e pouco sobre um de 5°;
 *   - absoluta: 20 % de 0,5 caractere por minuto não é nada.
 * Os limiares são constantes nomeadas, calibradas por bom senso e não por dados
 * — por isso conservadoras — e a revisão deles é esperada quando houver semanas
 * reais de vários pacientes.
 */

export type Metrica = 'erro' | 'dwell' | 'cpm' | 'minutos' | 'fadiga' | 'desfazer';

export type Direcao = 'subiu' | 'desceu' | 'estavel' | 'sem-dados';

export interface Tendencia {
  direcao: Direcao;
  /** Atual menos anterior; `null` quando não há comparação. */
  variacao: number | null;
}

interface Limiar {
  /** Fração do valor anterior (0,1 = 10 %). */
  relativo: number;
  /** Na unidade da métrica. */
  absoluto: number;
}

const LIMIARES: Record<Metrica, Limiar> = {
  /** graus */
  erro: { relativo: 0.1, absoluto: 0.3 },
  /** caracteres por minuto */
  cpm: { relativo: 0.1, absoluto: 1 },
  /** ms — 100 é um passo do ajuste de dwell */
  dwell: { relativo: 0.05, absoluto: 100 },
  /** minutos úteis na semana */
  minutos: { relativo: 0.15, absoluto: 10 },
  /** avisos de fadiga por hora de uso */
  fadiga: { relativo: 0.2, absoluto: 1 },
  /** desfazer por hora de uso */
  desfazer: { relativo: 0.2, absoluto: 1 },
};

/** Contas com decimais ficam um pouco abaixo do limite exato (2,3 − 2,0 = 0,2999…). */
const FOLGA_NUMERICA = 1e-9;

const SEM_COMPARACAO: Tendencia = { direcao: 'sem-dados', variacao: null };

export function compararMetrica(metrica: Metrica, anterior: number | null, atual: number | null): Tendencia {
  if (anterior === null || atual === null || !Number.isFinite(anterior) || !Number.isFinite(atual)) {
    return { ...SEM_COMPARACAO };
  }
  const variacao = atual - anterior;
  const { relativo, absoluto } = LIMIARES[metrica];

  const grandeEmValor = Math.abs(variacao) + FOLGA_NUMERICA >= absoluto;
  // De zero não há proporção: vale só o limite absoluto.
  const grandeEmProporcao = anterior === 0 || Math.abs(variacao) / Math.abs(anterior) + FOLGA_NUMERICA >= relativo;

  if (!grandeEmValor || !grandeEmProporcao) return { direcao: 'estavel', variacao };
  return { direcao: variacao > 0 ? 'subiu' : 'desceu', variacao };
}

/** Subir é bom ou ruim? Só onde isso é inequívoco. */
export type Leitura = 'favoravel' | 'desfavoravel' | 'neutra';

/**
 * - erro, avisos de fadiga e desfazer: menos é melhor;
 * - caracteres por minuto: mais é melhor;
 * - dwell e minutos úteis: sem lado bom. O dwell foi ESCOLHIDO por alguém (um
 *   valor maior pode ser cuidado, e não piora), e mais uso nem sempre é melhor.
 *
 * Isto só colore a seta; as palavras continuam neutras ("subiu", "caiu") — a
 * tela mostra dado de acompanhamento, não um julgamento.
 */
export function leituraDaTendencia(metrica: Metrica, direcao: Direcao): Leitura {
  if (direcao !== 'subiu' && direcao !== 'desceu') return 'neutra';
  switch (metrica) {
    case 'erro':
    case 'fadiga':
    case 'desfazer':
      return direcao === 'subiu' ? 'desfavoravel' : 'favoravel';
    case 'cpm':
      return direcao === 'subiu' ? 'favoravel' : 'desfavoravel';
    default:
      return 'neutra';
  }
}

/** Seta e palavra juntas: a cor nunca é o único sinal. */
export const SETA_DA_DIRECAO: Record<Direcao, string> = {
  subiu: '↑',
  desceu: '↓',
  estavel: '→',
  'sem-dados': '–',
};

export const PALAVRA_DA_DIRECAO: Record<Direcao, string> = {
  subiu: 'subiu',
  desceu: 'caiu',
  estavel: 'estável',
  'sem-dados': 'sem comparação',
};

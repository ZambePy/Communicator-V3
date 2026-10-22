/**
 * Sugestões da evolução semanal (21/10/2026) — CONSERVADORAS.
 *
 * O que isto é: uma leitura das semanas já completas, em palavras calmas, com
 * algo que o cuidador PODE considerar. O que isto não é:
 *   - diagnóstico: o número é dado de acompanhamento, e cada sugestão diz isso
 *     em voz alta (`AVISO_NAO_E_DIAGNOSTICO`);
 *   - ordem: nenhuma sugestão muda ajuste algum. Este módulo só devolve texto —
 *     ele nem enxerga os ajustes (recebe o dwell atual como número, e só para
 *     escrever "de 1,5 s para 1,6 s"). Quem decide é o cuidador, na tela de
 *     ajustes, e dá para voltar atrás;
 *   - alarme: só a última semana COMPLETA conta, contra a completa anterior; a
 *     semana em andamento nunca gera sugestão, e uma mudança dentro do ruído
 *     (ver `tendencia.ts`) também não.
 *
 * As sugestões de ajuste são sempre na direção da CAUTELA: pausas, conferir a
 * câmera, refazer a calibração, aumentar um passo o tempo de fixação, falar com
 * a equipe de saúde. Nenhuma sugere acelerar o paciente.
 */

import { emSegundos, podeAumentarDwell, proximoDwellMs } from '../../pages/acessibilidade/ajustes';
import type { Evolucao, SemanaDeEvolucao } from './agregar';
import { emGraus, numeroBr, periodoDaSemana } from './formatar';

export const AVISO_NAO_E_DIAGNOSTICO =
  'Isto é dado de acompanhamento, não é diagnóstico. Antes de mudar algo importante, converse com a equipe de saúde.';

/** Mais que isto vira lista para ignorar. */
export const MAX_SUGESTOES = 4;

/** O uso só "caiu bastante" se antes havia uso para cair: uma hora, pelo menos. */
const MIN_MINUTOS_ANTES_DA_QUEDA = 60;
/** ... e se ficou na metade, ou menos. */
const FRACAO_DA_QUEDA = 0.5;

export type IdDaSugestao =
  | 'poucos-dados'
  | 'erro-subiu'
  | 'velocidade-e-fadiga'
  | 'desfazer-subiu'
  | 'fadiga-subiu'
  | 'velocidade-caiu'
  | 'uso-caiu'
  | 'sem-alertas';

export interface Sugestao {
  id: IdDaSugestao;
  titulo: string;
  /** O que os números mostram. */
  observacao: string;
  /** O que o cuidador pode considerar — sempre uma opção, nunca uma ordem. */
  sugestao: string;
  aviso: typeof AVISO_NAO_E_DIAGNOSTICO;
  /** Para onde ir, se a sugestão tem uma tela. */
  ir?: { rotulo: string; rota: string };
}

export interface ContextoDasSugestoes {
  /** O tempo de fixação em uso agora, em ms (só para dizer "de X para Y"). */
  dwellMs: number;
}

const RECALIBRAR = { rotulo: 'Refazer a calibração', rota: '/calibration-check' } as const;

const montar = (s: Omit<Sugestao, 'aviso'>): Sugestao => ({ ...s, aviso: AVISO_NAO_E_DIAGNOSTICO });

const poucosDados = (): Sugestao =>
  montar({
    id: 'poucos-dados',
    titulo: 'Ainda é cedo para comparar',
    observacao:
      'Para comparar uma semana com a outra são precisas pelo menos duas semanas completas com medições ou uso. A semana de hoje ainda está em andamento.',
    sugestao: 'Continue usando o IrisFlow como de costume. Esta tela se completa sozinha com o passar das semanas.',
  });

function erroSubiu(anterior: SemanaDeEvolucao, atual: SemanaDeEvolucao): Sugestao {
  return montar({
    id: 'erro-subiu',
    titulo: 'O erro da calibração aumentou',
    observacao: `O erro médio das medições foi de ${emGraus(anterior.erroMedioDeg)} (${periodoDaSemana(anterior)}) para ${emGraus(atual.erroMedioDeg)} (${periodoDaSemana(atual)}).`,
    sugestao:
      'Vale conferir a posição da câmera, a luz do ambiente e a postura, e refazer a calibração. Um erro maior deixa as letras e os botões mais difíceis de acertar.',
    ir: { ...RECALIBRAR },
  });
}

function velocidadeEFadiga(anterior: SemanaDeEvolucao, atual: SemanaDeEvolucao): Sugestao {
  return montar({
    id: 'velocidade-e-fadiga',
    titulo: 'Escrita mais lenta e mais avisos de cansaço',
    observacao: `A velocidade passou de ${numeroBr(anterior.caracteresPorMinuto, 0)} para ${numeroBr(atual.caracteresPorMinuto, 0)} caracteres por minuto, e os avisos de fadiga de ${numeroBr(anterior.avisosDeFadigaPorHora, 1)} para ${numeroBr(atual.avisosDeFadigaPorHora, 1)} por hora de uso.`,
    sugestao:
      'Pode ser cansaço. Pausas mais frequentes e sessões mais curtas podem ajudar, e vale contar isso à equipe de saúde (médico, fonoaudiólogo ou fisioterapeuta).',
  });
}

function desfazerSubiu(anterior: SemanaDeEvolucao, atual: SemanaDeEvolucao, dwellMs: number): Sugestao {
  const observacao = `Apagar, Limpar e Voltar foram usados ${numeroBr(atual.desfazerPorHora, 1)} vezes por hora de uso, contra ${numeroBr(anterior.desfazerPorHora, 1)} na semana anterior.`;
  if (podeAumentarDwell(dwellMs)) {
    return montar({
      id: 'desfazer-subiu',
      titulo: 'Mais correções do que antes',
      observacao,
      sugestao: `Se há mais seleções sem querer, aumentar um pouco o tempo de fixação — de ${emSegundos(dwellMs)} para ${emSegundos(proximoDwellMs(dwellMs, 1))} — pode ajudar. Esta tela nunca muda ajustes sozinha: quem decide é você, e dá para voltar atrás.`,
      ir: { rotulo: 'Ajustar o tempo de fixação', rota: '/accessibility' },
    });
  }
  return montar({
    id: 'desfazer-subiu',
    titulo: 'Mais correções do que antes',
    observacao,
    sugestao: `O tempo de fixação já está no máximo (${emSegundos(dwellMs)}). Vale conferir a posição da câmera e a luz do ambiente, e refazer a calibração.`,
    ir: { ...RECALIBRAR },
  });
}

function fadigaSubiu(anterior: SemanaDeEvolucao, atual: SemanaDeEvolucao): Sugestao {
  return montar({
    id: 'fadiga-subiu',
    titulo: 'Mais avisos de cansaço',
    observacao: `Os avisos de fadiga passaram de ${numeroBr(anterior.avisosDeFadigaPorHora, 1)} para ${numeroBr(atual.avisosDeFadigaPorHora, 1)} por hora de uso, entre ${periodoDaSemana(anterior)} e ${periodoDaSemana(atual)}.`,
    sugestao:
      'Pausas mais frequentes e sessões mais curtas podem ajudar. Se o cansaço tem aumentado no dia a dia, vale contar à equipe de saúde.',
  });
}

function velocidadeCaiu(anterior: SemanaDeEvolucao, atual: SemanaDeEvolucao): Sugestao {
  return montar({
    id: 'velocidade-caiu',
    titulo: 'A escrita ficou mais lenta',
    observacao: `A velocidade passou de ${numeroBr(anterior.caracteresPorMinuto, 0)} para ${numeroBr(atual.caracteresPorMinuto, 0)} caracteres por minuto.`,
    sugestao:
      'A velocidade varia com o cansaço, com a calibração e com o dia. Se a queda continuar na próxima semana, vale refazer a calibração e conversar com a equipe de saúde.',
    ir: { ...RECALIBRAR },
  });
}

function usoCaiu(anterior: SemanaDeEvolucao, atual: SemanaDeEvolucao): Sugestao {
  const observacao =
    atual.usoRegistrado && atual.minutosUteis > 0
      ? `Foram ${numeroBr(atual.minutosUteis, 0)} minutos úteis em ${periodoDaSemana(atual)}, contra ${numeroBr(anterior.minutosUteis, 0)} na semana anterior.`
      : `Não há nenhum uso registrado em ${periodoDaSemana(atual)}; na semana anterior foram ${numeroBr(anterior.minutosUteis, 0)} minutos úteis.`;
  return montar({
    id: 'uso-caiu',
    titulo: 'O uso diminuiu bastante',
    observacao,
    sugestao:
      'Pode haver um motivo simples: viagem, internação, câmera desligada, um dia ruim. Vale perguntar à pessoa como ela está e se algo atrapalhou o uso.',
  });
}

function semAlertas(): Sugestao {
  return montar({
    id: 'sem-alertas',
    titulo: 'Nada que peça atenção',
    observacao: 'Comparando a última semana completa com a anterior, nenhum número piorou além da variação de costume.',
    sugestao: 'Continue como está. Se algo mudar no dia a dia, aparecerá aqui na semana seguinte.',
  });
}

/** O uso caiu para menos da metade — ou sumiu — de uma semana que tinha uso de verdade. */
function usoCaiuBastante(anterior: SemanaDeEvolucao, atual: SemanaDeEvolucao): boolean {
  if (!anterior.usoRegistrado || anterior.minutosUteis < MIN_MINUTOS_ANTES_DA_QUEDA) return false;
  if (!atual.usoRegistrado) return true;
  return atual.tendencias.minutos.direcao === 'desceu' && atual.minutosUteis <= anterior.minutosUteis * FRACAO_DA_QUEDA;
}

export function sugerir(evolucao: Evolucao, contexto: ContextoDasSugestoes): Sugestao[] {
  const completas = evolucao.semanas.filter((s) => s.completa);
  if (completas.length < 2) return [poucosDados()];
  const atual = completas[completas.length - 1];
  const anterior = completas[completas.length - 2];
  if (!anterior.temDados) return [poucosDados()];

  const t = atual.tendencias;
  const velocidadeDesceu = t.cpm.direcao === 'desceu';
  const fadigaSubiuNaSemana = t.fadiga.direcao === 'subiu';

  // Na ordem do que mais importa ao cuidador: o que atrapalha o uso hoje
  // (erro), o que pode ser cansaço, o que se ajusta, e por fim o uso.
  const achados: Sugestao[] = [];
  if (t.erro.direcao === 'subiu') achados.push(erroSubiu(anterior, atual));
  // Velocidade em queda com mais avisos de cansaço é UMA história, e conta-se uma vez.
  if (velocidadeDesceu && fadigaSubiuNaSemana) achados.push(velocidadeEFadiga(anterior, atual));
  if (t.desfazer.direcao === 'subiu') achados.push(desfazerSubiu(anterior, atual, contexto.dwellMs));
  if (fadigaSubiuNaSemana && !velocidadeDesceu) achados.push(fadigaSubiu(anterior, atual));
  if (velocidadeDesceu && !fadigaSubiuNaSemana) achados.push(velocidadeCaiu(anterior, atual));
  if (usoCaiuBastante(anterior, atual)) achados.push(usoCaiu(anterior, atual));

  if (achados.length > 0) return achados.slice(0, MAX_SUGESTOES);
  // "Nada piorou" só se diz de uma semana que foi medida.
  return [atual.temDados ? semAlertas() : poucosDados()];
}

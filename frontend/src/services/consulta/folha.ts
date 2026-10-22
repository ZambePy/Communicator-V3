/**
 * O CONTEÚDO da folha da consulta (21/10/2026): uma página A4 que o paciente
 * leva ao médico, com os últimos 7 ou 30 dias — dor, sono, humor e uma nota por
 * dia —, o resumo das semanas e as perguntas que ele quer fazer.
 *
 * Função pura, sem tela e sem armazenamento: recebe os dados e devolve texto
 * pronto. Assim o conteúdo se testa sem imprimir, e o mesmo conteúdo serve à
 * pré-visualização e à impressão.
 *
 * Tem de caber numa página mesmo no pior caso, e por isso cada seção tem teto
 * (dias, semanas, perguntas, tamanho de nota e de pergunta). O que foi cortado
 * é DITO na folha ("notas resumidas", "+N perguntas no aparelho"): uma folha que
 * esconde o que cortou parece completa e não é.
 */

import type { RegistroDeDor } from '../../utils/clinicalLogger';
import type { Evolucao, SemanaDeEvolucao } from '../evolucao/agregar';
import { emGraus, emMinutos, numeroBr, periodoDaSemana } from '../evolucao/formatar';
import { diaDaSemanaCurto, diaDeBrasilia, rotuloDoDia, somarDias } from '../evolucao/fuso';
import { ROTULOS_DO_HUMOR, ROTULOS_DO_SONO, dorPorDia, type EntradaDoDiario } from './diario';
import type { PerguntaDaConsulta } from './perguntas';

export type PeriodoDaFolha = 7 | 30;

export const AVISO_DA_FOLHA =
  'Dado de acompanhamento registrado pelo IrisFlow neste computador; não é diagnóstico. A decisão é da equipe de saúde.';

/** Com 30 dias a nota tem uma linha curta; com 7 há espaço para mais. */
export const NOTA_MAXIMA_NA_FOLHA: Record<PeriodoDaFolha, number> = { 7: 50, 30: 44 };
/**
 * Menos perguntas na folha de 30 dias: ela já leva 30 linhas de dia a dia, e
 * medida no Chromium (21/10/2026) com 8+8 perguntas de 110 caracteres ela
 * passava ~9 mm da página. O que fica de fora é contado na própria folha.
 */
export const MAX_PERGUNTAS_POR_AUTOR_NA_FOLHA: Record<PeriodoDaFolha, number> = { 7: 8, 30: 6 };
export const MAX_TEXTO_DA_PERGUNTA_NA_FOLHA = 110;
const MAX_SEMANAS_NA_FOLHA: Record<PeriodoDaFolha, number> = { 7: 2, 30: 5 };
const MAX_LUGARES_NO_RESUMO = 3;
/**
 * Lugares de dor por dia na coluna "Dor": poucos, porque a coluna é estreita e
 * uma linha só (medido no Chromium, 21/10/2026). O resto vira "+N" — dito, e não
 * cortado pelo CSS sem aviso. Os nomes do mapa da dor são curtos ("Braço
 * esquerdo", "As duas pernas"); o teto do nome é só uma rede de segurança.
 */
const MAX_LUGARES_POR_DIA: Record<PeriodoDaFolha, number> = { 7: 2, 30: 1 };
export const MAX_LUGAR_NA_FOLHA = 20;
const MAX_NOME = 60;

const SEM_REGISTRO = '–';

export interface LinhaDoDiaNaFolha {
  dia: string;
  /** `qua 21/10`. */
  rotulo: string;
  /** `7/10 · Cabeça, Braço esquerdo`, ou travessão. */
  dor: string;
  nivelDeDor: number | null;
  /** `Bom (4)`, ou travessão. */
  sono: string;
  humor: string;
  nota: string;
}

export interface ResumoDaDorNaFolha {
  relatos: number;
  diasComDor: number;
  nivelMaximo: number | null;
  nivelMedio: number | null;
  lugares: { lugar: string; relatos: number }[];
}

export interface MediaDoDiario {
  /** `3,8`, ou travessão. */
  media: string;
  /** Em quantos dias do período houve marcação. */
  dias: number;
}

export interface LinhaDeSemanaNaFolha {
  /** `12/10 a 18/10`. */
  periodo: string;
  /** `em andamento` ou vazio. */
  situacao: string;
  erro: string;
  minutos: string;
  cpm: string;
  fadiga: string;
  desfazer: string;
}

export interface FolhaDaConsulta {
  titulo: string;
  paciente: string;
  periodo: PeriodoDaFolha;
  /** `15/10/2026 a 21/10/2026`. */
  intervalo: string;
  geradaEm: string;
  dias: LinhaDoDiaNaFolha[];
  dor: ResumoDaDorNaFolha;
  sono: MediaDoDiario;
  humor: MediaDoDiario;
  semanas: LinhaDeSemanaNaFolha[];
  perguntas: { paciente: string[]; cuidador: string[]; omitidas: number };
  /** Alguma nota foi encurtada para caber? */
  notasResumidas: boolean;
  aviso: string;
}

export interface EntradaDaFolha {
  periodo: PeriodoDaFolha;
  agora: number;
  paciente: string;
  dores: ReadonlyArray<RegistroDeDor>;
  diario: ReadonlyArray<EntradaDoDiario>;
  evolucao: Evolucao;
  perguntas: ReadonlyArray<PerguntaDaConsulta>;
}

/** Corta em `max` caracteres, terminando em reticências; devolve também se cortou. */
function cortar(texto: string, max: number): { texto: string; cortou: boolean } {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  if (limpo.length <= max) return { texto: limpo, cortou: false };
  return { texto: `${limpo.slice(0, Math.max(0, max - 1)).trimEnd()}…`, cortou: true };
}

function media(valores: number[]): MediaDoDiario {
  if (valores.length === 0) return { media: SEM_REGISTRO, dias: 0 };
  return { media: numeroBr(valores.reduce((a, b) => a + b, 0) / valores.length, 1), dias: valores.length };
}

function linhaDeSemana(s: SemanaDeEvolucao): LinhaDeSemanaNaFolha {
  const uso = s.usoRegistrado;
  return {
    periodo: periodoDaSemana(s),
    situacao: s.completa ? '' : 'em andamento',
    erro: emGraus(s.erroMedioDeg),
    minutos: uso ? emMinutos(s.minutosUteis) : SEM_REGISTRO,
    cpm: s.caracteresPorMinuto === null ? SEM_REGISTRO : numeroBr(s.caracteresPorMinuto, 0),
    fadiga: uso ? String(s.avisosDeFadiga) : SEM_REGISTRO,
    desfazer: uso ? String(s.desfazer) : SEM_REGISTRO,
  };
}

export function montarFolha(entrada: EntradaDaFolha): FolhaDaConsulta {
  const periodo = entrada.periodo === 30 ? 30 : 7;
  const hoje = diaDeBrasilia(entrada.agora) ?? (diaDeBrasilia(Date.now()) as string);
  const de = somarDias(hoje, -(periodo - 1));

  const dorDoDia = dorPorDia(entrada.dores);
  const diarioPorDia = new Map(entrada.diario.map((e) => [e.dia, e]));

  let notasResumidas = false;
  const dias: LinhaDoDiaNaFolha[] = [];
  const niveisDeSono: number[] = [];
  const niveisDeHumor: number[] = [];
  for (let i = 0; i < periodo; i += 1) {
    const dia = somarDias(de, i);
    const d = dorDoDia.get(dia);
    const e = diarioPorDia.get(dia);
    if (e?.sono) niveisDeSono.push(e.sono);
    if (e?.humor) niveisDeHumor.push(e.humor);
    const nota = cortar(e?.nota ?? '', NOTA_MAXIMA_NA_FOLHA[periodo]);
    if (nota.cortou) notasResumidas = true;

    const teto = MAX_LUGARES_POR_DIA[periodo];
    const lugares = d
      ? d.lugares.slice(0, teto).map((l) => cortar(l, MAX_LUGAR_NA_FOLHA).texto).join(', ') + (d.lugares.length > teto ? ` +${d.lugares.length - teto}` : '')
      : '';
    dias.push({
      dia,
      rotulo: `${diaDaSemanaCurto(dia)} ${rotuloDoDia(dia)}`,
      dor: d ? `${d.nivelMaximo}/10${lugares ? ` · ${lugares}` : ''}` : SEM_REGISTRO,
      nivelDeDor: d ? d.nivelMaximo : null,
      sono: e?.sono ? `${ROTULOS_DO_SONO[e.sono - 1]} (${e.sono})` : SEM_REGISTRO,
      humor: e?.humor ? `${ROTULOS_DO_HUMOR[e.humor - 1]} (${e.humor})` : SEM_REGISTRO,
      nota: nota.texto,
    });
  }

  // Resumo da dor: os relatos do período, pelo dia de Brasília de cada um.
  const noPeriodo = entrada.dores.filter((r) => {
    const dia = diaDeBrasilia(r?.timestamp);
    return dia !== null && dia >= de && dia <= hoje && typeof r.nivel === 'number' && Number.isFinite(r.nivel);
  });
  const porLugar = new Map<string, number>();
  for (const r of noPeriodo) {
    const lugar = typeof r.lugar === 'string' ? r.lugar.trim() : '';
    if (lugar) porLugar.set(lugar, (porLugar.get(lugar) ?? 0) + 1);
  }
  const diasComDor = new Set(noPeriodo.map((r) => diaDeBrasilia(r.timestamp))).size;
  const dor: ResumoDaDorNaFolha = {
    relatos: noPeriodo.length,
    diasComDor: noPeriodo.length === 0 ? 0 : diasComDor,
    nivelMaximo: noPeriodo.length ? Math.max(...noPeriodo.map((r) => r.nivel)) : null,
    nivelMedio: noPeriodo.length ? noPeriodo.reduce((a, r) => a + r.nivel, 0) / noPeriodo.length : null,
    lugares: [...porLugar.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
      .slice(0, MAX_LUGARES_NO_RESUMO)
      .map(([lugar, relatos]) => ({ lugar, relatos })),
  };

  // Perguntas pendentes, por autor, na ordem em que foram feitas. As MAIS
  // ANTIGAS ficam: são as que a pessoa quer perguntar há mais tempo.
  const pendentes = entrada.perguntas.filter((p) => !p.feita);
  const doAutor = (quem: PerguntaDaConsulta['quem']) => pendentes.filter((p) => p.quem === quem);
  const doPaciente = doAutor('paciente');
  const doCuidador = doAutor('cuidador');
  const tetoDasPerguntas = MAX_PERGUNTAS_POR_AUTOR_NA_FOLHA[periodo];
  const noTeto = (lista: PerguntaDaConsulta[]) =>
    lista.slice(0, tetoDasPerguntas).map((p) => cortar(p.texto, MAX_TEXTO_DA_PERGUNTA_NA_FOLHA).texto);

  const semanas = entrada.evolucao.semanas.slice(-MAX_SEMANAS_NA_FOLHA[periodo]).map(linhaDeSemana);

  return {
    titulo: 'Folha da consulta',
    paciente: cortar(entrada.paciente ?? '', MAX_NOME).texto || 'Paciente',
    periodo,
    intervalo: `${rotuloDoDia(de, true)} a ${rotuloDoDia(hoje, true)}`,
    geradaEm: rotuloDoDia(hoje, true),
    dias,
    dor,
    sono: media(niveisDeSono),
    humor: media(niveisDeHumor),
    semanas,
    perguntas: {
      paciente: noTeto(doPaciente),
      cuidador: noTeto(doCuidador),
      omitidas: Math.max(0, doPaciente.length - tetoDasPerguntas) + Math.max(0, doCuidador.length - tetoDasPerguntas),
    },
    notasResumidas,
    aviso: AVISO_DA_FOLHA,
  };
}

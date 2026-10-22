/**
 * Exportar a evolução em CSV (21/10/2026), para a planilha da consulta.
 *
 * Feito para o Excel em português do Brasil, que é onde isto vai ser aberto:
 *   - separador `;` — a vírgula é o separador decimal, e um CSV com `,` entre
 *     colunas abre tudo na coluna A;
 *   - decimais com vírgula;
 *   - BOM no começo, senão "Medições" e "calibração" abrem com acento quebrado;
 *   - quebra de linha CRLF.
 *
 * Só datas e números saem daqui. Nada do que a pessoa escreveu, falou ou
 * relatou (frases, dores, notas) vai para o arquivo; esse conteúdo fica no
 * aparelho. Por isso também não há risco de uma célula virar fórmula — mesmo
 * assim `escaparCelula` neutraliza, por garantia, para o dia em que uma coluna
 * de texto entrar.
 */

import type { Evolucao, SemanaDeEvolucao } from './agregar';
import { numeroBr } from './formatar';
import { diaDeBrasilia, rotuloDoDia } from './fuso';

export const CABECALHO_DO_CSV = [
  'Semana (segunda)',
  'Semana (domingo)',
  'Situação',
  'Medições de calibração',
  'Erro médio da calibração (graus)',
  'Dias com uso',
  'Minutos úteis',
  'Dwell em uso (ms)',
  'Caracteres',
  'Caracteres por minuto',
  'Avisos de fadiga',
  'Avisos de fadiga por hora de uso',
  'Desfazer',
  'Desfazer por hora de uso',
] as const;

const SEPARADOR = ';';
const FIM_DE_LINHA = '\r\n';
const BOM = '\uFEFF';

/** Começo que uma planilha lê como fórmula. */
const COMECA_COMO_FORMULA = /^[=+\-@\t\r]/;

/** Uma célula pronta para o CSV: neutraliza fórmula e protege `;`, aspas e quebra de linha. */
export function escaparCelula(valor: string): string {
  let texto = COMECA_COMO_FORMULA.test(valor) ? `'${valor}` : valor;
  if (/[;"\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/** Vazio quando não há número: nunca "NaN", nunca um zero inventado. */
const numero = (valor: number | null, casas: number): string => (valor === null ? '' : numeroBr(valor, casas));

function linhaDaSemana(s: SemanaDeEvolucao): string[] {
  // Sem registro de uso a semana não teve "zero minutos": não foi medida.
  const uso = s.usoRegistrado;
  return [
    rotuloDoDia(s.inicio, true),
    rotuloDoDia(s.fim, true),
    s.completa ? 'completa' : 'em andamento',
    String(s.medicoes),
    numero(s.erroMedioDeg, 2),
    uso ? String(s.diasComUso) : '',
    uso ? numero(s.minutosUteis, 0) : '',
    numero(s.dwellMedioMs, 0),
    uso ? numero(s.caracteres, 0) : '',
    numero(s.caracteresPorMinuto, 1),
    uso ? numero(s.avisosDeFadiga, 0) : '',
    numero(s.avisosDeFadigaPorHora, 2),
    uso ? numero(s.desfazer, 0) : '',
    numero(s.desfazerPorHora, 2),
  ];
}

export function evolucaoEmCsv(evolucao: Evolucao): string {
  const linhas = [[...CABECALHO_DO_CSV], ...evolucao.semanas.map(linhaDaSemana)];
  return BOM + linhas.map((l) => l.map(escaparCelula).join(SEPARADOR)).join(FIM_DE_LINHA) + FIM_DE_LINHA;
}

/** `irisflow-evolucao-2026-10-21.csv`, com a data de Brasília. */
export function nomeDoArquivoCsv(agora: number): string {
  const dia = diaDeBrasilia(agora);
  return dia ? `irisflow-evolucao-${dia}.csv` : 'irisflow-evolucao.csv';
}

/**
 * Baixa o CSV. Blob e link temporário, como o relatório de suporte: o app roda
 * em `file://` dentro do Electron, sem servidor para servir o arquivo.
 */
export function baixarCsv(evolucao: Evolucao, agora: number = Date.now()): void {
  const blob = new Blob([evolucaoEmCsv(evolucao)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeDoArquivoCsv(agora);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar na hora corta o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

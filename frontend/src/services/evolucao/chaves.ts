/**
 * Chaves locais da evolução semanal e do modo consulta (21/10/2026).
 *
 * Módulo-FOLHA, sem nenhuma importação, de propósito: o `clinicalLogger`
 * precisa saber estes nomes para apagá-los junto com o histórico clínico, e os
 * serviços de uso, diário e perguntas importam o `clinicalLogger` (consentimento
 * e paciente ativo). Com os nomes aqui, ninguém importa ninguém em círculo.
 *
 * Todas começam com `irisflow.` (o prefixo das chaves do app) e são POR
 * PACIENTE: o que uma pessoa dorme, sente e pergunta ao médico não se mistura
 * com o de outra que usa o mesmo computador. O número depois de `v` é a versão
 * do formato guardado.
 */

/** Uso por dia: minutos úteis, caracteres, correções, avisos de fadiga e o dwell em uso. */
export const chaveDoUso = (perfilId: string): string => `irisflow.evolucao.uso.v1.${perfilId}`;

/** Diário da consulta: sono, humor e nota de cada dia. A dor vem do mapa da dor. */
export const chaveDoDiario = (perfilId: string): string => `irisflow.consulta.diario.v1.${perfilId}`;

/** Perguntas para levar ao médico (do paciente e do cuidador). */
export const chaveDasPerguntas = (perfilId: string): string => `irisflow.consulta.perguntas.v1.${perfilId}`;

/** Tudo o que este recurso guarda de um paciente — o que "apagar os dados clínicos" tem de levar. */
export const chavesDoAcompanhamentoDoPerfil = (perfilId: string): string[] => [
  chaveDoUso(perfilId),
  chaveDoDiario(perfilId),
  chaveDasPerguntas(perfilId),
];

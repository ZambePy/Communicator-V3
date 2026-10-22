/**
 * Números e períodos como o cuidador lê (pt-BR): vírgula decimal, travessão
 * onde não há número. Usado pela tela de evolução, pelas sugestões e pela
 * folha da consulta — um só jeito de escrever "1,4°" em todo lugar.
 */

import { rotuloDoDia } from './fuso';

const SEM_NUMERO = '–';

/** `1,5`. O que não é número finito vira travessão, nunca "NaN". */
export function numeroBr(valor: number | null | undefined, casas = 1): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return SEM_NUMERO;
  const texto = valor.toFixed(casas);
  // "-0,0" é um arredondamento de -0,04: não diz nada ao leitor.
  const semSinalDeZero = /^-0(\.0+)?$/.test(texto) ? texto.slice(1) : texto;
  return semSinalDeZero.replace('.', ',');
}

export function emGraus(valor: number | null | undefined): string {
  const n = numeroBr(valor, 1);
  return n === SEM_NUMERO ? n : `${n}°`;
}

export function emMinutos(valor: number | null | undefined): string {
  const n = numeroBr(valor, 0);
  return n === SEM_NUMERO ? n : `${n} min`;
}

/** `1,5 s` a partir de milissegundos. */
export function emSegundosCurtos(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return SEM_NUMERO;
  return `${numeroBr(ms / 1000, 1)} s`;
}

/** `12/10 a 18/10`. */
export function periodoDaSemana(semana: { inicio: string; fim: string }): string {
  return `${rotuloDoDia(semana.inicio)} a ${rotuloDoDia(semana.fim)}`;
}

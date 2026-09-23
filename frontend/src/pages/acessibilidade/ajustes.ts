/**
 * Passos dos controles da tela de Acessibilidade.
 *
 * Os controles de Configurações são sliders — bons para o cuidador com mouse,
 * inalcançáveis pelo olhar (arrastar um cursor de 20 px não é uma fixação).
 * Aqui a mesma grandeza muda por alvos grandes de "−" e "+". Os LIMITES são os
 * mesmos dos sliders (e vêm das mesmas constantes), então um valor ajustado
 * numa tela é sempre um valor válido na outra.
 */
import { DWELL_MAX_MS, DWELL_MIN_MS, limitarDwellMs } from '../../dwellMs';

/** 0,1 s por olhar: fino o bastante para achar o ponto, sem 36 fixações de ponta a ponta. */
export const PASSO_DO_DWELL_MS = 100;

/** Os mesmos limites do slider "Brilho da tela do IrisFlow" (40–100 %, passo 5). */
export const BRILHO_MIN = 0.4;
export const BRILHO_MAX = 1.0;
export const PASSO_DO_BRILHO = 0.05;

export type Direcao = 1 | -1;

/**
 * Próximo tempo de permanência.
 *
 * O valor atual pode estar fora da grade de 100 ms (o slider anda de 50 em
 * 50, e presets antigos existem): o primeiro passo alinha à grade NA DIREÇÃO
 * pedida, em vez de pular 100 ms a partir de 1 550 e cair em 1 650.
 */
export function proximoDwellMs(atualMs: number, direcao: Direcao): number {
  const atual = limitarDwellMs(atualMs);
  const naGrade = atual / PASSO_DO_DWELL_MS;
  const alvo =
    direcao > 0
      ? (Math.floor(naGrade + 1e-9) + 1) * PASSO_DO_DWELL_MS
      : (Math.ceil(naGrade - 1e-9) - 1) * PASSO_DO_DWELL_MS;
  return limitarDwellMs(alvo);
}

export const podeDiminuirDwell = (ms: number) => limitarDwellMs(ms) > DWELL_MIN_MS;
export const podeAumentarDwell = (ms: number) => limitarDwellMs(ms) < DWELL_MAX_MS;

function limitarBrilho(v: number): number {
  if (!Number.isFinite(v)) return BRILHO_MAX;
  return Math.min(BRILHO_MAX, Math.max(BRILHO_MIN, v));
}

/** Próximo brilho, alinhado à grade de 5 % (a mesma do slider). */
export function proximoBrilho(atual: number, direcao: Direcao): number {
  const passos = Math.round(limitarBrilho(atual) / PASSO_DO_BRILHO);
  const novo = (passos + direcao) * PASSO_DO_BRILHO;
  // Arredonda a 2 casas: 0.35000000000000003 gravado no disco não é "35 %".
  return Math.round(limitarBrilho(novo) * 100) / 100;
}

export const emPorcento = (v: number) => `${Math.round(limitarBrilho(v) * 100)}%`;
export const emSegundos = (ms: number) =>
  (limitarDwellMs(ms) / 1000).toFixed(1).replace('.', ',') + ' s';

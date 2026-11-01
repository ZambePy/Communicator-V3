/** O mesmo mínimo do site (`site/src/utils/validation.ts → SENHA_MINIMA`). */
export const SENHA_MINIMA = 8;
/** Espera antes de poder pedir outro e-mail com o código (o Supabase recusa antes de 60 s). */
export const ESPERA_DO_REENVIO_S = 60;

/** "0:42" */
export function relogio(segundos: number): string {
  const s = Math.max(0, Math.ceil(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

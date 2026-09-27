import { atribuirCalibracoesSemDono } from '@tracker/calibration';

/**
 * Migração do "dono da calibração" (FE-11 → calibração por paciente).
 *
 * Na versão anterior o núcleo guardava as calibrações sem dono e a interface
 * anotava aqui QUEM tinha feito a última — só para não oferecer ao paciente B
 * a calibração do paciente A. Agora cada calibração gravada leva o paciente
 * (`meta.paciente`, ver `definirPacienteDaCalibracao` no núcleo), e esta chave
 * só serve uma vez: as calibrações antigas passam a ser do dono anotado, e a
 * chave sai. Sem dono anotado, a calibração antiga fica para o primeiro
 * paciente que a carregar.
 */
const CHAVE = 'irisflow.calibracao.dono';

export function migrarDonoLegadoDaCalibracao(): void {
  let dono: string | null = null;
  try {
    dono = localStorage.getItem(CHAVE);
  } catch {
    return; // sem armazenamento: não há o que migrar
  }
  if (!dono) return;
  atribuirCalibracoesSemDono(dono);
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* fica para a próxima abertura; atribuir de novo é inofensivo */
  }
}

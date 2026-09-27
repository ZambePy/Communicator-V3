/**
 * De qual paciente é a calibração guardada neste computador.
 *
 * O núcleo guarda UMA calibração (a mais recente) e a restaura para quem
 * estiver na frente da câmera. Ao trocar de paciente, a conferência oferecia
 * "Usar a calibração salva" — a do paciente anterior: o cursor do novo
 * paciente passava a seguir o mapeamento de outra pessoa, sem aviso (FE-11).
 * Aqui fica só o dono; reaproveitar é permitido para ele.
 */
const CHAVE = 'irisflow.calibracao.dono';

/** Marca a calibração atual como deste paciente (calibrou agora, ou reaproveitou a que já era dele). */
export function registrarDonoDaCalibracao(perfilId: string | null): void {
  try {
    if (perfilId) localStorage.setItem(CHAVE, perfilId);
    else localStorage.removeItem(CHAVE);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
}

/**
 * A calibração guardada pode ser reaproveitada por este paciente? Sem dono
 * registrado (calibrações feitas antes desta versão), sim — e a partir daí
 * ela passa a ter dono.
 */
export function calibracaoEhDoPerfil(perfilId: string | null): boolean {
  try {
    const dono = localStorage.getItem(CHAVE);
    return !dono || !perfilId || dono === perfilId;
  } catch {
    return true;
  }
}

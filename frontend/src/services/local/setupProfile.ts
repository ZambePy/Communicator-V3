/**
 * Preparo do ambiente, gravado por perfil.
 *
 * **Por perfil, não global.** Dois pacientes na mesma casa podem usar o mesmo
 * computador em salas diferentes, com luz e distância diferentes. Herdar o
 * preparo de um para o outro entregaria calibração ruim com cara de aprovada —
 * pior que não ter preparo nenhum, porque some o sinal de que falta fazer.
 *
 * Local, como todo o resto do perfil: o termo de privacidade promete que dados
 * do paciente não saem desta máquina.
 */

/**
 * Suba quando um passo mudar ou um limiar for ajustado. Preparos de versão
 * anterior deixam de valer e o wizard reaparece — eles são uma afirmação sobre
 * critérios que não existem mais.
 */
export const PREPARO_VERSION = 1;

export interface DadosDoPreparo {
  cameraDeviceId: string | null;
  fpsMedido: number | null;
  /** Lux ambiente medido à mão. `null` é o caso normal: o campo é opcional. */
  luxAmbiente: number | null;
  monitorDiagonalIn: number | null;
  /** Um número lido do EDID e um digitado não têm a mesma confiança. */
  monitorOrigem: 'edid' | 'manual';
}

export interface PreparoDoPerfil extends DadosDoPreparo {
  version: number;
  /** ISO 8601. */
  completedAt: string;
}

export const chaveDoPreparo = (profileId: string) => `irisflow_setup_${profileId}`;

/**
 * Preparos concluídos nesta sessão que o disco recusou (armazenamento cheio —
 * fotos e calibrações moram nele — ou bloqueado). Sem isto o "vale só nesta
 * sessão" prometido abaixo não existia: `preparoConcluido` lia só o disco, o
 * portão da calibração mandava de volta ao preparo, que recomeça do passo 1, e
 * o cuidador girava nesse laço sem fim.
 */
const preparosSoNaSessao = new Map<string, PreparoDoPerfil>();

export function lerPreparo(profileId: string): PreparoDoPerfil | null {
  const daSessao = preparosSoNaSessao.get(profileId);
  if (daSessao) return daSessao;
  try {
    const raw = localStorage.getItem(chaveDoPreparo(profileId));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PreparoDoPerfil>;
    if (typeof p.version !== 'number' || typeof p.completedAt !== 'string') return null;
    return {
      version: p.version,
      completedAt: p.completedAt,
      cameraDeviceId: p.cameraDeviceId ?? null,
      fpsMedido: typeof p.fpsMedido === 'number' ? p.fpsMedido : null,
      luxAmbiente: typeof p.luxAmbiente === 'number' ? p.luxAmbiente : null,
      monitorDiagonalIn: typeof p.monitorDiagonalIn === 'number' ? p.monitorDiagonalIn : null,
      monitorOrigem: p.monitorOrigem === 'manual' ? 'manual' : 'edid',
    };
  } catch {
    // Storage corrompido pede preparo de novo. Chato, e muito melhor que
    // derrubar a tela que leva à calibração.
    return null;
  }
}

export function gravarPreparo(profileId: string, dados: DadosDoPreparo): PreparoDoPerfil {
  const registro: PreparoDoPerfil = {
    ...dados,
    version: PREPARO_VERSION,
    completedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(chaveDoPreparo(profileId), JSON.stringify(registro));
    preparosSoNaSessao.delete(profileId);
  } catch {
    // Sem persistência o preparo vale só nesta sessão.
    preparosSoNaSessao.set(profileId, registro);
  }
  return registro;
}

export function preparoConcluido(profileId: string): boolean {
  return lerPreparo(profileId)?.version === PREPARO_VERSION;
}

export function limparPreparo(profileId: string): void {
  preparosSoNaSessao.delete(profileId);
  try {
    localStorage.removeItem(chaveDoPreparo(profileId));
  } catch {
    /* idem */
  }
}

import { registrarFalhaDeGravacao, registrarGravacaoOk } from '../services/local/falhasDeGravacao';
import { chavesDoAcompanhamentoDoPerfil } from '../services/evolucao/chaves';

export interface SpokenSentence {
  id: string;
  text: string;
  timestamp: string; // ISO string
}

export interface CalibrationLog {
  id: string;
  errorDeg: number;
  timestamp: string; // ISO string
  /**
   * Veio do histórico GLOBAL, de antes da separação por paciente.
   *
   * A atribuição pode estar errada: se houve mais de um paciente nesta máquina
   * antes da separação, estas medições não são todas dele. A marca existe para
   * a tela poder dizer isso, em vez de apresentar tudo como sendo do perfil
   * ativo — num produto clínico, curva de dois pacientes misturada é pior que
   * curva nenhuma, porque parece um acompanhamento e não é.
   */
  herdado?: boolean;
}

/**
 * Um relato do mapa da dor (19/10/2026): onde e quanto doía, na hora em que a
 * pessoa disse. Guardado à parte das frases porque o relatório precisa do
 * lugar e do nível como dados — "nível 7" dentro de uma frase não se ordena,
 * não se filtra e não se compara com a semana anterior.
 */
export interface RegistroDeDor {
  id: string;
  /** Código do lugar (`braco-esquerdo`, `cabeca`): estável, para agrupar. */
  local: string;
  /** O lugar por extenso, como apareceu na tela ("Braço esquerdo"). */
  lugar: string;
  /** 0 a 10. */
  nivel: number;
  /** A frase falada e enviada ao cuidador. */
  frase: string;
  timestamp: string; // ISO string
}

export interface ClinicalData {
  sentences: SpokenSentence[];
  calibrations: CalibrationLog[];
  /** Relatos do mapa da dor. Históricos gravados antes de 19/10/2026 não têm. */
  dores: RegistroDeDor[];
}

/** Chave de antes da separação por paciente. Preservada — ver `migrar`. */
export const CHAVE_GLOBAL_LEGADA = 'irisflow_clinical_data';

export const chaveDoPerfil = (profileId: string) => `irisflow_clinical_data_${profileId}`;

/** Marca de que o global já foi migrado, para não duplicar num segundo perfil. */
const CHAVE_MIGRACAO = 'irisflow_clinical_migrado';

/**
 * Perfil ativo.
 *
 * Estado de módulo, como `setCameraFovDeg` faz na calibração: passar o perfil
 * em toda chamada obrigaria cada tela que registra uma frase a conhecer o
 * `AuthContext`, e são várias.
 */
let perfilAtivo: string | null = null;

export const definirPerfilAtivo = (profileId: string | null): void => {
  perfilAtivo = profileId;
};

/**
 * O paciente cujo histórico está sendo gravado agora (21/10/2026).
 *
 * A evolução semanal e o diário da consulta guardam POR PACIENTE, como o
 * histórico clínico, e quem registra uma tecla ou um aviso de fadiga não pode
 * depender do `AuthContext` — o teclado, por exemplo, nem o conhece. Ler daqui
 * mantém os dois no mesmo paciente.
 */
export const perfilAtivoDoHistorico = (): string | null => perfilAtivo;

const VAZIO = (): ClinicalData => ({ sentences: [], calibrations: [], dores: [] });

/**
 * Leva o histórico global para o perfil ativo, uma vez só.
 *
 * A chave global NÃO é apagada: se a atribuição estiver errada, o dado original
 * precisa continuar existindo para ser reatribuído à mão.
 */
function migrarSePreciso(profileId: string): void {
  try {
    if (localStorage.getItem(CHAVE_MIGRACAO)) return;
    // Migrar para um segundo perfil duplicaria as medições e inflaria as duas
    // curvas — por isso a marca é global, e não por perfil.
    localStorage.setItem(CHAVE_MIGRACAO, profileId);

    const bruto = localStorage.getItem(CHAVE_GLOBAL_LEGADA);
    if (!bruto) return;

    const antigo = JSON.parse(bruto) as Partial<ClinicalData>;
    const destino = localStorage.getItem(chaveDoPerfil(profileId));
    const atual: ClinicalData = destino ? (JSON.parse(destino) as ClinicalData) : VAZIO();

    atual.calibrations = [
      ...(antigo.calibrations ?? []).map((c) => ({ ...c, herdado: true })),
      ...atual.calibrations,
    ];
    atual.sentences = [...(antigo.sentences ?? []), ...atual.sentences];

    localStorage.setItem(chaveDoPerfil(profileId), JSON.stringify(atual));
  } catch {
    // Histórico ilegível não pode derrubar a tela que o mostra.
  }
}
const CONSENT_KEY = 'irisflow_consent_clinical_data';

export const hasConsent = (): boolean => {
  return localStorage.getItem(CONSENT_KEY) === 'true';
};

export const setConsent = (consented: boolean): void => {
  localStorage.setItem(CONSENT_KEY, consented ? 'true' : 'false');
  if (!consented) {
    clearClinicalData();
  }
};

export const getClinicalData = (): ClinicalData => {
  // Sem perfil não há a quem atribuir. Devolver o global aqui misturaria
  // pacientes pela porta dos fundos.
  if (perfilAtivo === null) return VAZIO();

  migrarSePreciso(perfilAtivo);

  try {
    const saved = localStorage.getItem(chaveDoPerfil(perfilAtivo));
    if (!saved) return VAZIO();
    const d = JSON.parse(saved) as Partial<ClinicalData>;
    return {
      sentences: d.sentences ?? [],
      calibrations: d.calibrations ?? [],
      dores: Array.isArray(d.dores) ? d.dores : [],
    };
  } catch {
    return VAZIO();
  }
};

/**
 * Grava o histórico do perfil ativo. Devolve `false` quando a gravação FALHOU
 * — quota estourada não pode derrubar a UI, mas também não pode passar por
 * salva (relato de 18/10/2026, item 15): a falha aparece na tela como "não foi
 * possível salvar o histórico". Sem perfil não há onde gravar, e isso não é
 * falha do disco.
 */
const saveClinicalData = (data: ClinicalData): boolean => {
  if (perfilAtivo === null) return true;
  try {
    localStorage.setItem(chaveDoPerfil(perfilAtivo), JSON.stringify(data));
    registrarGravacaoOk('historico');
    return true;
  } catch (e) {
    registrarFalhaDeGravacao('historico', e);
    return false;
  }
};

export const clearClinicalData = (): void => {
  if (perfilAtivo === null) return;
  localStorage.removeItem(chaveDoPerfil(perfilAtivo));
  // 21/10/2026: a evolução semanal, o diário da consulta (dor, sono, humor,
  // nota) e as perguntas ao médico são dado clínico deste paciente. Ao apagar —
  // e ao retirar a autorização, que passa por aqui — "todos os dados clínicos
  // locais" têm de ser TODOS, e não só as frases e as medições.
  for (const chave of chavesDoAcompanhamentoDoPerfil(perfilAtivo)) localStorage.removeItem(chave);
};

/**
 * Teto do histórico: as frases e calibrações MAIS RECENTES. Antes o log crescia
 * para sempre (≈ 8 MB/ano a 100 frases/dia) e era regravado inteiro a cada
 * frase — engasgo crescente no "Falar" e, com a cota por origem cheia, a
 * calibração e os ajustes deixavam de ser salvos em silêncio (FE-21). As
 * estatísticas (frases mais usadas, horários) passam a olhar para essa janela.
 */
export const MAX_FRASES_NO_HISTORICO = 2000;
export const MAX_CALIBRACOES_NO_HISTORICO = 300;
/** Relatos de dor: os mais recentes. ~1000 cobre meses de vários relatos por dia. */
export const MAX_DORES_NO_HISTORICO = 1000;

/** Registra uma frase. `false` = a gravação falhou (sem consentimento não há o que gravar: `true`). */
export const logSentence = (text: string): boolean => {
  if (!hasConsent() || !text.trim()) return true;

  const data = getClinicalData();
  data.sentences.push({
    id: crypto.randomUUID(),
    text: text.trim(),
    timestamp: new Date().toISOString(),
  });
  if (data.sentences.length > MAX_FRASES_NO_HISTORICO) data.sentences = data.sentences.slice(-MAX_FRASES_NO_HISTORICO);
  return saveClinicalData(data);
};

/** Registra o erro de uma calibração. `false` = a gravação falhou. */
export const logCalibrationAccuracy = (errorDeg: number): boolean => {
  if (!hasConsent()) return true;

  const data = getClinicalData();
  data.calibrations.push({
    id: crypto.randomUUID(),
    errorDeg,
    timestamp: new Date().toISOString(),
  });
  if (data.calibrations.length > MAX_CALIBRACOES_NO_HISTORICO) data.calibrations = data.calibrations.slice(-MAX_CALIBRACOES_NO_HISTORICO);
  return saveClinicalData(data);
};

/**
 * Por que um relato de dor ficou (ou não) no histórico — a tela diz, em vez
 * de dar por gravado:
 *   - `gravado`;
 *   - `sem_consentimento`: o cuidador não autorizou o histórico clínico (o
 *     relato foi falado e enviado mesmo assim; só não fica guardado aqui);
 *   - `sem_perfil`: nenhum paciente escolhido (modo de desenvolvimento);
 *   - `falhou`: o armazenamento recusou (cheio ou bloqueado).
 */
export type ResultadoDoRegistro = 'gravado' | 'sem_consentimento' | 'sem_perfil' | 'falhou';

export const logDor = (relato: Omit<RegistroDeDor, 'id' | 'timestamp'>): ResultadoDoRegistro => {
  try {
    if (!hasConsent()) return 'sem_consentimento';
  } catch {
    return 'falhou';
  }
  if (perfilAtivo === null) return 'sem_perfil';
  const data = getClinicalData();
  data.dores.push({
    id: crypto.randomUUID(),
    local: relato.local,
    lugar: relato.lugar,
    nivel: Number.isFinite(relato.nivel) ? Math.min(10, Math.max(0, Math.round(relato.nivel))) : 0,
    frase: relato.frase,
    timestamp: new Date().toISOString(),
  });
  if (data.dores.length > MAX_DORES_NO_HISTORICO) data.dores = data.dores.slice(-MAX_DORES_NO_HISTORICO);
  return saveClinicalData(data) ? 'gravado' : 'falhou';
};

/** Relatos de dor, do mais recente para o mais antigo. */
export const getRegistrosDeDor = (limite = Infinity): RegistroDeDor[] =>
  [...getClinicalData().dores]
    .filter((d) => d && typeof d.nivel === 'number' && typeof d.timestamp === 'string')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limite);

// Estatísticas Agregadas
export const getMostUsedPhrases = (limit = 5) => {
  const data = getClinicalData();
  const counts: Record<string, number> = {};
  data.sentences.forEach((s) => {
    const t = s.text.trim();
    if (!t) return;
    counts[t] = (counts[t] || 0) + 1;
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([text, count]) => ({ text, count }));
};

export const getActivityByHour = (): number[] => {
  const data = getClinicalData();
  const hours = Array(24).fill(0);
  data.sentences.forEach((s) => {
    try {
      const date = new Date(s.timestamp);
      const hr = date.getHours();
      if (hr >= 0 && hr < 24) {
        hours[hr]++;
      }
    } catch {
      // Ignora datas corrompidas
    }
  });
  return hours;
};

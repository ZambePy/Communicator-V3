import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { env } from '../config/env';
import { chaveDoPerfil, definirPerfilAtivo } from '../utils/clinicalLogger';
import { chavesDoAcompanhamentoDoPerfil } from '../services/evolucao/chaves';
import { chavesLocaisDoPaciente } from '../services/backup/chaves';
import { armazemDaVozGuardada } from '../services/voz/vozGuardada/armazem';
import { removerVozClonadaDoPerfil } from '../services/voz/removerVozDoPerfil';
import { apagarModeloDoPerfil, definirPerfilDoAssistente } from '../services/assistente/armazenamento';
import { definirPacienteDaCalibracao, removerCalibracoesDoPaciente } from '@tracker/calibration';
import { migrarDonoLegadoDaCalibracao } from '../services/local/donoDaCalibracao';
import {
  listarPerfis,
  criarPerfil,
  removerPerfil,
  type NovoPerfil,
  type PerfilLocal,
} from '../services/local/profiles';

export interface Profile {
  id: string;
  name: string;
  /** Data URL da foto. Local, como todo o resto do perfil. */
  avatar?: string;
  age?: number;
  condition?: string;
  createdAt?: string;
}

interface AuthContextData {
  currentProfile: Profile | null;
  profiles: Profile[];
  isCaregiver: boolean;
  authToken: string | null;
  selectProfile: (p: Profile) => void;
  createProfile: (dados: NovoPerfil) => Profile;
  /**
   * Remove o paciente e TUDO o que é dele neste computador. O perfil e o
   * `localStorage` saem na hora; a voz guardada (gravações e termo) e a voz
   * clonada importada (só se o termo dela for deste paciente), que moram no
   * processo principal, saem logo depois — se não puderem sair, `avisoDaRemocao` diz.
   */
  removeProfile: (id: string) => void;
  /** Uma frase pronta quando a remoção deixou algo para trás (a voz guardada ou a clonada); `null` quando saiu tudo. */
  avisoDaRemocao: string | null;
  dispensarAvisoDaRemocao: () => void;
  loginCaregiver: (pin: string) => boolean;
  /**
   * Fecha SÓ a área do cuidador; o paciente continua escolhido. É o "Encerrar
   * Acesso" e o que a trava automática chama (ver `TravaDoCuidador`).
   */
  encerrarAcessoDoCuidador: () => void;
  /** Sai de tudo: área do cuidador E paciente escolhido. */
  logout: () => void;
}

/** A remoção tirou o perfil e os dados locais, mas as gravações da voz dele ficaram no computador. */
export const AVISO_DA_VOZ_NAO_APAGADA =
  'O perfil foi removido, mas não foi possível apagar as gravações da voz dele deste computador agora. Elas continuam guardadas; feche o IrisFlow e tente remover de novo, ou peça ajuda ao suporte.';

/** O perfil saiu, mas a voz personalizada (clonada) importada dele ficou: a pessoa precisa saber onde removê-la. */
export const AVISO_DA_VOZ_CLONADA_NAO_APAGADA =
  'O perfil foi removido, mas não foi possível apagar a voz personalizada dele deste computador agora. Ela continua guardada: abra Configurações, Voz personalizada, e use “Remover voz”, ou peça ajuda ao suporte.';

/** As duas coisas ficaram: as gravações e a voz personalizada. Um aviso só, para não empilhar dois. */
export const AVISO_DAS_DUAS_VOZES_NAO_APAGADAS =
  'O perfil foi removido, mas não foi possível apagar as gravações da voz dele nem a voz personalizada deste computador agora. Elas continuam guardadas: a voz personalizada sai em Configurações, Voz personalizada, “Remover voz”; para as gravações, peça ajuda ao suporte.';

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

// O perfil do paciente persiste entre sessões (localStorage). O acesso do
// cuidador NÃO: vive só na aba/sessão atual (sessionStorage), para fechar o
// app não deixar a área do cuidador destravada para o paciente.
const PROFILE_KEY = 'irisflow_auth';
const CAREGIVER_SESSION_KEY = 'irisflow_caregiver_session';

interface PersistedProfile {
  currentProfile: Profile | null;
}

interface CaregiverSession {
  isCaregiver: boolean;
  authToken: string | null;
}

const loadProfile = (): PersistedProfile => {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return { currentProfile: null };
    const parsed = JSON.parse(raw) as Partial<PersistedProfile>;
    return { currentProfile: parsed.currentProfile ?? null };
  } catch {
    return { currentProfile: null };
  }
};

const loadCaregiverSession = (): CaregiverSession => {
  try {
    const raw = sessionStorage.getItem(CAREGIVER_SESSION_KEY);
    if (!raw) return { isCaregiver: false, authToken: null };
    const parsed = JSON.parse(raw) as Partial<CaregiverSession>;
    return { isCaregiver: parsed.isCaregiver === true, authToken: parsed.authToken ?? null };
  } catch {
    return { isCaregiver: false, authToken: null };
  }
};

/**
 * Os perfis vêm do armazenamento local (`services/local/profiles`), nunca do
 * servidor: nome, idade, condição e foto de um paciente com ELA são dado de
 * saúde, e o termo de privacidade promete que não saem desta máquina.
 *
 * Antes havia três perfis fictícios cravados aqui ("Paciente A/B/C"). Num
 * produto clínico isso leva o cuidador a calibrar no perfil errado e perder a
 * sessão inteira do paciente.
 */
const paraProfile = (p: PerfilLocal): Profile => ({
  id: p.id,
  name: p.name,
  createdAt: p.createdAt,
  ...(p.age !== undefined ? { age: p.age } : {}),
  ...(p.condition !== undefined ? { condition: p.condition } : {}),
  ...(p.avatarDataUrl !== undefined ? { avatar: p.avatarDataUrl } : {}),
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(() => {
    const salvo = loadProfile().currentProfile;
    // Já na primeira renderização: as telas filhas podem pedir sugestões
    // antes do efeito abaixo rodar, e leriam o vocabulário sem dono.
    definirPerfilDoAssistente(salvo?.id ?? null);
    // A calibração também é por paciente, e também já aqui: a abertura decide
    // a rota por "há calibração?" e o engine carrega a calibração no primeiro
    // efeito — os dois precisam saber de quem ela é.
    migrarDonoLegadoDaCalibracao();
    definirPacienteDaCalibracao(salvo?.id ?? null);
    return salvo;
  });
  const [caregiver, setCaregiver] = useState<CaregiverSession>(loadCaregiverSession);
  const [profiles, setProfiles] = useState<Profile[]>(() => listarPerfis().map(paraProfile));
  const { isCaregiver, authToken } = caregiver;

  // O histórico clínico é gravado POR PACIENTE, e quem sabe qual é o paciente é
  // este contexto. Sem isto o logger não teria a quem atribuir e não gravaria
  // nada — que é o lado certo de falhar, mas silencioso demais para deixar.
  useEffect(() => {
    definirPerfilAtivo(currentProfile?.id ?? null);
    // O vocabulário do assistente também é por paciente (FE-11).
    definirPerfilDoAssistente(currentProfile?.id ?? null);
    // E a calibração (idempotente: `selectProfile` já trocou na hora).
    definirPacienteDaCalibracao(currentProfile?.id ?? null);
  }, [currentProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ currentProfile }));
    } catch {
      // Storage indisponível: o perfil vale só nesta sessão.
    }
  }, [currentProfile]);

  useEffect(() => {
    try {
      if (caregiver.isCaregiver) {
        sessionStorage.setItem(CAREGIVER_SESSION_KEY, JSON.stringify(caregiver));
      } else {
        sessionStorage.removeItem(CAREGIVER_SESSION_KEY);
      }
    } catch {
      // Idem.
    }
  }, [caregiver]);

  const selectProfile = (p: Profile) => {
    // Na hora, não no efeito: a conferência da calibração renderiza logo em
    // seguida e pergunta se há calibração DESTE paciente para reaproveitar.
    definirPacienteDaCalibracao(p.id);
    setCurrentProfile(p);
  };

  const createProfile = useCallback((dados: NovoPerfil): Profile => {
    const criado = paraProfile(criarPerfil(dados));
    setProfiles((antes) => [...antes, criado]);
    return criado;
  }, []);

  const [avisoDaRemocao, setAvisoDaRemocao] = useState<string | null>(null);
  const dispensarAvisoDaRemocao = useCallback(() => setAvisoDaRemocao(null), []);

  const removeProfile = useCallback((id: string) => {
    removerPerfil(id);
    // O que o assistente aprendeu com esse paciente sai junto: frases faladas
    // são dado de saúde e não podem ficar sem dono no computador.
    apagarModeloDoPerfil(id);
    // As calibrações dele também (o mapeamento do olhar de uma pessoa).
    removerCalibracoesDoPaciente(id);
    // E tudo o mais que é DELE no `localStorage` (revisão final, rodada 1, M4,
    // 21/10/2026): o histórico clínico, o diário (sono, humor, nota), as perguntas
    // ao médico, o uso da evolução, o painel do cuidador (diário e tarefas), os
    // favoritos, o progresso do tutorial, as frases próprias da voz e o Preparo.
    // Depois que o perfil some não há como ver nem apagar isto pela interface —
    // tem de sair agora, e o backup "Tudo" não pode levá-lo a outro computador.
    // Só as chaves DESTE id: as dos outros pacientes ficam como estão.
    for (const chave of new Set([...chavesLocaisDoPaciente(id), ...chavesDoAcompanhamentoDoPerfil(id), chaveDoPerfil(id)])) {
      try {
        localStorage.removeItem(chave);
      } catch (e) {
        console.warn('[perfil] não foi possível apagar um dado local do paciente removido', chave, e);
      }
    }
    setProfiles((antes) => antes.filter((p) => p.id !== id));
    // Um perfil removido não pode continuar selecionado: a calibração
    // carregada ficaria sem dono e o app apontaria para algo que não existe.
    setCurrentProfile((atual) => (atual?.id === id ? null : atual));

    // A voz guardada (gravações e termo) e a voz clonada importada moram no processo principal.
    // Não impedem a remoção, mas a falha não é calada: vai para o console (uma vez por voz) e para
    // a tela. A clonada é única por computador: só sai se o termo dela for DESTE paciente — quem
    // confere é o processo principal (revisão final, rodada 2, N1, 21/10/2026).
    const falhou = async (qual: string, apagar: () => Promise<{ ok: boolean; erro?: string }>): Promise<boolean> => {
      let motivo: unknown;
      try {
        const r = await apagar();
        if (r.ok) return false;
        motivo = r.erro;
      } catch (e) {
        motivo = e;
      }
      console.warn(`[perfil] ${qual} do paciente removido não pôde ser apagada:`, motivo);
      return true;
    };
    void Promise.all([
      falhou('a voz guardada', () => armazemDaVozGuardada().apagarDoPerfil(id)),
      falhou('a voz personalizada', () => removerVozClonadaDoPerfil(id)),
    ]).then(([guardada, clonada]) => {
      if (guardada && clonada) setAvisoDaRemocao(AVISO_DAS_DUAS_VOZES_NAO_APAGADAS);
      else if (clonada) setAvisoDaRemocao(AVISO_DA_VOZ_CLONADA_NAO_APAGADA);
      else if (guardada) setAvisoDaRemocao(AVISO_DA_VOZ_NAO_APAGADA);
    });
  }, []);

  const loginCaregiver = (pin: string) => {
    // TEMPORÁRIO: PIN vem de env var. Substituir por autenticação no backend.
    if (pin === env.caregiverPin) {
      // Placeholder para JWT — hoje é um marcador local; será substituído pelo token do backend.
      setCaregiver({ isCaregiver: true, authToken: 'local-caregiver-session' });
      return true;
    }
    return false;
  };

  const encerrarAcessoDoCuidador = useCallback(() => {
    setCaregiver((atual) => (atual.isCaregiver ? { isCaregiver: false, authToken: null } : atual));
  }, []);

  const logout = () => {
    definirPacienteDaCalibracao(null);
    setCurrentProfile(null);
    setCaregiver({ isCaregiver: false, authToken: null });
  };

  return (
    <AuthContext.Provider
      value={{
        currentProfile,
        profiles,
        isCaregiver,
        authToken,
        selectProfile,
        createProfile,
        removeProfile,
        avisoDaRemocao,
        dispensarAvisoDaRemocao,
        loginCaregiver,
        encerrarAcessoDoCuidador,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import {
  AuthProvider,
  AVISO_DA_VOZ_CLONADA_NAO_APAGADA,
  AVISO_DA_VOZ_NAO_APAGADA,
  AVISO_DAS_DUAS_VOZES_NAO_APAGADAS,
  useAuth,
} from './AuthContext';
import { chavesDoAcompanhamentoDoPerfil } from '../services/evolucao/chaves';
import { chaveDoPerfil } from '../utils/clinicalLogger';
import { chavesLocaisDoPaciente } from '../services/backup/chaves';
import { montarBackup } from '../services/backup/montarBackup';
import { _zerarArmazemDaMemoria, armazemDaVozGuardada } from '../services/voz/vozGuardada/armazem';

// Remover o paciente (rodada 1 da revisão, 21/10/2026): o diário (sono, humor,
// nota, dor), as perguntas ao médico e o uso da evolução são dado de saúde dele
// e não podem ficar no computador sem dono — depois que o perfil some, não há
// mais caminho na interface para vê-los nem apagá-los.

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

/** Tudo o que se guarda de um paciente além do perfil: o acompanhamento e o histórico clínico. */
const chavesDoPaciente = (id: string): string[] => [...chavesDoAcompanhamentoDoPerfil(id), chaveDoPerfil(id)];

const gravarTudoDe = (id: string) => {
  for (const chave of chavesDoPaciente(id)) localStorage.setItem(chave, JSON.stringify({ de: id }));
};

describe('remover o perfil leva o acompanhamento do paciente', () => {
  beforeEach(() => localStorage.clear());

  it('apaga o diário, as perguntas, o uso e o histórico DELE, e não toca nos de outro paciente', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    let a = '';
    let b = '';
    act(() => {
      a = result.current.createProfile({ name: 'Joana' }).id;
      b = result.current.createProfile({ name: 'Carlos' }).id;
    });
    gravarTudoDe(a);
    gravarTudoDe(b);
    expect(chavesDoPaciente(a)).toHaveLength(4);

    act(() => result.current.removeProfile(a));

    for (const chave of chavesDoPaciente(a)) expect(localStorage.getItem(chave), chave).toBeNull();
    for (const chave of chavesDoPaciente(b)) expect(localStorage.getItem(chave), chave).toBe(JSON.stringify({ de: b }));
    expect(result.current.profiles.map((p) => p.id)).toEqual([b]);
  });

  it('vale também para o perfil que está em uso (e a seleção é limpa)', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    let p = { id: '', name: '' };
    act(() => {
      p = result.current.createProfile({ name: 'Joana' });
      result.current.selectProfile(p);
    });
    gravarTudoDe(p.id);

    act(() => result.current.removeProfile(p.id));

    for (const chave of chavesDoPaciente(p.id)) expect(localStorage.getItem(chave), chave).toBeNull();
    expect(result.current.currentProfile).toBeNull();
  });
});

// Revisão final, rodada 1 (M4): a remoção apagava o modelo, as calibrações e as chaves
// do acompanhamento, mas deixava no computador o painel do cuidador (diário e tarefas),
// os favoritos, o progresso do tutorial, as frases próprias da voz guardada, o Preparo
// e as GRAVAÇÕES da voz com o termo dele — e o backup "Tudo" os levava a outro computador.
describe('remover o perfil leva TUDO o que é do paciente (M4)', () => {
  beforeEach(() => {
    localStorage.clear();
    _zerarArmazemDaMemoria();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    _zerarArmazemDaMemoria();
  });

  const criarDois = () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    let a = '';
    let b = '';
    act(() => {
      a = result.current.createProfile({ name: 'Joana' }).id;
      b = result.current.createProfile({ name: 'Carlos' }).id;
    });
    return { result, a, b };
  };

  it('apaga o painel do cuidador, os favoritos, o tutorial, as frases próprias da voz e o Preparo DELE, sem tocar nos do outro', async () => {
    const { result, a, b } = criarDois();
    for (const id of [a, b]) for (const chave of chavesLocaisDoPaciente(id)) localStorage.setItem(chave, JSON.stringify({ de: id }));
    expect(chavesLocaisDoPaciente(a).length).toBeGreaterThanOrEqual(12);

    act(() => result.current.removeProfile(a));

    for (const chave of chavesLocaisDoPaciente(a)) expect(localStorage.getItem(chave), chave).toBeNull();
    for (const chave of chavesLocaisDoPaciente(b)) expect(localStorage.getItem(chave), chave).toBe(JSON.stringify({ de: b }));
  });

  it('o backup completo feito depois da remoção não leva nada do paciente removido', async () => {
    const { result, a, b } = criarDois();
    for (const id of [a, b]) for (const chave of chavesLocaisDoPaciente(id)) localStorage.setItem(chave, JSON.stringify({ de: id }));

    act(() => result.current.removeProfile(a));

    const backup = await montarBackup({ comVoz: false }, { ponteDaVoz: null, versaoDoApp: async () => 'teste' });
    const chaves = Object.keys(backup.chaves);
    expect(chaves.filter((k) => k.includes(a))).toEqual([]);
    // O outro paciente continua no backup.
    expect(chaves.some((k) => k.endsWith(b))).toBe(true);
    expect(chaves).toContain('irisflow_profiles');
    expect(JSON.parse(backup.chaves.irisflow_profiles).map((p: { id: string }) => p.id)).toEqual([b]);
  });

  const gravar = async (perfilId: string, id: string) => {
    const armazem = armazemDaVozGuardada();
    await armazem.consentir({ texto: 'Autorizo guardar a minha voz neste computador, sem enviá-la a ninguém.', aceitoEm: '2026-10-21T10:00:00Z', perfilId });
    const r = await armazem.salvar({ id, texto: 'Eu te amo', wav: new ArrayBuffer(64), duracaoS: 2, qualidade: 'boa', perfilId });
    expect(r.ok).toBe(true);
  };

  it('apaga as gravações da voz guardada e o termo DELE no armazém, e deixa os do outro', async () => {
    const { result, a, b } = criarDois();
    await gravar(a, '11111111-1111-4111-8111-111111111111');
    await gravar(b, '22222222-2222-4222-8222-222222222222');

    act(() => result.current.removeProfile(a));

    await waitFor(async () => {
      const l = await armazemDaVozGuardada().listar();
      expect(l.ok && l.gravacoes.length).toBe(1);
    });
    expect(result.current.avisoDaRemocao).toBeNull();
    const lista = await armazemDaVozGuardada().listar();
    expect(lista.ok).toBe(true);
    if (!lista.ok) return;
    expect(lista.gravacoes.map((g) => g.perfilId)).toEqual([b]);
    expect(lista.consentimentos.map((c) => c.perfilId)).toEqual([b]);
  });

  it('se o armazém da voz não consegue apagar, a remoção NÃO finge: avisa na tela e no console', async () => {
    const { result, a } = criarDois();
    const armazem = armazemDaVozGuardada();
    vi.spyOn(armazem, 'apagarDoPerfil').mockResolvedValue({ ok: false, erro: 'arquivo preso' });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});

    act(() => result.current.removeProfile(a));
    // O resto da remoção não espera pela voz: o perfil já saiu da lista.
    expect(result.current.profiles.some((p) => p.id === a)).toBe(false);

    await waitFor(() => expect(result.current.avisoDaRemocao).toBe(AVISO_DA_VOZ_NAO_APAGADA));
    expect(aviso).toHaveBeenCalled();
    act(() => result.current.dispensarAvisoDaRemocao());
    expect(result.current.avisoDaRemocao).toBeNull();
  });

  it('o armazém que lança (a ponte do Electron caiu) também avisa, em vez de calar', async () => {
    const { result, a } = criarDois();
    vi.spyOn(armazemDaVozGuardada(), 'apagarDoPerfil').mockRejectedValue(new Error('ipc fechado'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    act(() => result.current.removeProfile(a));
    await waitFor(() => expect(result.current.avisoDaRemocao).toBe(AVISO_DA_VOZ_NAO_APAGADA));
  });
});

// Revisão final, rodada 2 (N1, 21/10/2026): a voz clonada IMPORTADA (a referência, o termo e o cache
// de frases, que moram no processo principal) também é dado biométrico do paciente. Ao remover o
// perfil, a página pede ao processo principal "apague a voz clonada se o termo for deste perfil" —
// pelo id, nunca por caminho. Quem decide de quem é a voz é o processo principal (testado em
// `src/voz/removerVozDoPerfil.test.ts`); aqui se prova que o pedido sai e que a falha aparece.
describe('remover o perfil pede ao processo principal que apague a voz clonada dele (N1)', () => {
  type Resposta = { ok: true; removida: boolean } | { ok: false; erro: string };
  const ponte = (removerDoPerfil?: (id: string) => Promise<Resposta>) => {
    (window as unknown as { irisflowVoz?: unknown }).irisflowVoz = removerDoPerfil ? { removerDoPerfil } : {};
  };

  beforeEach(() => {
    localStorage.clear();
    _zerarArmazemDaMemoria();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    delete (window as unknown as { irisflowVoz?: unknown }).irisflowVoz;
    vi.restoreAllMocks();
    _zerarArmazemDaMemoria();
  });

  const criarDois = () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    let a = '';
    let b = '';
    act(() => {
      a = result.current.createProfile({ name: 'Joana' }).id;
      b = result.current.createProfile({ name: 'Carlos' }).id;
    });
    return { result, a, b };
  };

  it('manda só o id do perfil removido (uma vez), e o perfil sai na hora', async () => {
    const removerDoPerfil = vi.fn(async () => ({ ok: true as const, removida: true }));
    ponte(removerDoPerfil);
    const { result, a, b } = criarDois();

    act(() => result.current.removeProfile(a));

    expect(result.current.profiles.map((p) => p.id)).toEqual([b]);
    await waitFor(() => expect(removerDoPerfil).toHaveBeenCalledTimes(1));
    expect(removerDoPerfil).toHaveBeenCalledWith(a);
    expect(result.current.avisoDaRemocao).toBeNull();
  });

  it('o processo principal diz que a voz era de outro paciente (removida: false): fica tudo certo, sem aviso', async () => {
    const removerDoPerfil = vi.fn(async () => ({ ok: true as const, removida: false }));
    ponte(removerDoPerfil);
    const { result, a } = criarDois();
    act(() => result.current.removeProfile(a));
    await waitFor(() => expect(removerDoPerfil).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.avisoDaRemocao).toBeNull();
  });

  it('fora do aplicativo instalado (sem a ponte da voz) não há voz clonada a apagar e não há aviso', async () => {
    const { result, a } = criarDois();
    act(() => result.current.removeProfile(a));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.avisoDaRemocao).toBeNull();
    expect(result.current.profiles.some((p) => p.id === a)).toBe(false);
  });

  it('a remoção da voz clonada falha: o perfil sai mesmo assim e a tela avisa que a voz ficou (e o console, uma vez)', async () => {
    ponte(async () => ({ ok: false as const, erro: 'arquivo preso' }));
    const { result, a } = criarDois();

    act(() => result.current.removeProfile(a));
    expect(result.current.profiles.some((p) => p.id === a)).toBe(false);

    await waitFor(() => expect(result.current.avisoDaRemocao).toBe(AVISO_DA_VOZ_CLONADA_NAO_APAGADA));
    expect(AVISO_DA_VOZ_CLONADA_NAO_APAGADA).toMatch(/voz personalizada/i);
    expect(AVISO_DA_VOZ_CLONADA_NAO_APAGADA).toMatch(/Remover voz/);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('o IPC rejeita (a ponte caiu): avisa em vez de calar', async () => {
    ponte(async () => { throw new Error('ipc fechado'); });
    const { result, a } = criarDois();
    act(() => result.current.removeProfile(a));
    await waitFor(() => expect(result.current.avisoDaRemocao).toBe(AVISO_DA_VOZ_CLONADA_NAO_APAGADA));
  });

  it('preload antigo (a ponte não tem o pedido novo): o perfil sai e a tela avisa que a voz ficou', async () => {
    ponte(undefined); // `irisflowVoz` existe, mas sem `removerDoPerfil`
    const { result, a } = criarDois();
    act(() => result.current.removeProfile(a));
    expect(result.current.profiles.some((p) => p.id === a)).toBe(false);
    await waitFor(() => expect(result.current.avisoDaRemocao).toBe(AVISO_DA_VOZ_CLONADA_NAO_APAGADA));
  });

  it('uma resposta fora do formato também conta como falha', async () => {
    ponte((async () => undefined) as never);
    const { result, a } = criarDois();
    act(() => result.current.removeProfile(a));
    await waitFor(() => expect(result.current.avisoDaRemocao).toBe(AVISO_DA_VOZ_CLONADA_NAO_APAGADA));
  });

  it('as gravações e a voz clonada falham juntas: um aviso só, que diz as duas', async () => {
    ponte(async () => ({ ok: false as const, erro: 'preso' }));
    const { result, a } = criarDois();
    vi.spyOn(armazemDaVozGuardada(), 'apagarDoPerfil').mockResolvedValue({ ok: false, erro: 'arquivo preso' });
    act(() => result.current.removeProfile(a));
    await waitFor(() => expect(result.current.avisoDaRemocao).toBe(AVISO_DAS_DUAS_VOZES_NAO_APAGADAS));
    expect(AVISO_DAS_DUAS_VOZES_NAO_APAGADAS).toMatch(/gravações da voz/);
    expect(AVISO_DAS_DUAS_VOZES_NAO_APAGADAS).toMatch(/voz personalizada/);
  });

  it('só as gravações falham (a voz clonada saiu): o aviso é o das gravações, como antes', async () => {
    ponte(async () => ({ ok: true as const, removida: true }));
    const { result, a } = criarDois();
    vi.spyOn(armazemDaVozGuardada(), 'apagarDoPerfil').mockResolvedValue({ ok: false, erro: 'arquivo preso' });
    act(() => result.current.removeProfile(a));
    await waitFor(() => expect(result.current.avisoDaRemocao).toBe(AVISO_DA_VOZ_NAO_APAGADA));
  });
});

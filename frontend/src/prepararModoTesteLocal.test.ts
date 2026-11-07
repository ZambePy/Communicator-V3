import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepararModoTesteLocal, NOME_DO_PERFIL_DE_TESTE } from './prepararModoTesteLocal';
import { temConsentimentoValido } from './services/local/consent';
import { listarPerfis } from './services/local/profiles';
import { INTRO_SEEN_KEY } from './pages/onboarding/bootDestination';
import { PROFILE_KEY } from './context/AuthContext';

// `npm run teste-local` abre o app direto no rastreador: sem a apresentação,
// sem o termo e já com um paciente de teste escolhido. Fora desse modo, nada
// disso pode acontecer — é o que impede um atalho de chegar ao produto.

const perfilAtual = () => JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null')?.currentProfile ?? null;

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('prepararModoTesteLocal', () => {
  it('no modo teste-local: apresentação vista, termo aceito e o paciente de teste escolhido', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('MODE', 'teste-local');
    prepararModoTesteLocal();
    expect(localStorage.getItem(INTRO_SEEN_KEY)).toBe('true');
    expect(temConsentimentoValido()).toBe(true);
    expect(perfilAtual()?.name).toBe(NOME_DO_PERFIL_DE_TESTE);
    expect(listarPerfis().map((p) => p.name)).toEqual([NOME_DO_PERFIL_DE_TESTE]);
  });

  it('rodar de novo não cria outro paciente nem troca o escolhido', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('MODE', 'teste-local');
    prepararModoTesteLocal();
    const primeiro = perfilAtual();
    prepararModoTesteLocal();
    expect(listarPerfis()).toHaveLength(1);
    expect(perfilAtual()).toEqual(primeiro);
  });

  it('fora do modo teste-local (o npm run dev de sempre), não mexe em nada', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('MODE', 'development');
    prepararModoTesteLocal();
    expect(localStorage.length).toBe(0);
  });

  // O comando gera o build de PRODUÇÃO com `--mode teste-local` (o mesmo
  // desempenho do app instalado). O que protege o produto é o modo: o build do
  // instalador sai com `production`.
  it('no build de produção do teste-local (o que o comando gera), prepara igual', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'teste-local');
    prepararModoTesteLocal();
    expect(perfilAtual()?.name).toBe(NOME_DO_PERFIL_DE_TESTE);
  });

  it('no build do instalador (modo production), não mexe em nada', () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    prepararModoTesteLocal();
    expect(localStorage.length).toBe(0);
  });
});

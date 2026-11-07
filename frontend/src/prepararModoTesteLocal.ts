// Preparo do modo de teste local (`npm run teste-local`, ver `modoTesteLocal.ts`).
//
// Roda antes de renderizar e deixa o app direto no rastreador: a apresentação
// marcada como vista, o termo aceito em nome de um e-mail de teste e um
// paciente "Teste local" escolhido. A licença fica ativa no `LicenseContext` e
// a nuvem desligada em `cloud/config.ts`; nada aqui fala com a rede.
//
// Tudo fica no storage da origem do `vite preview` do teste local
// (`http://127.0.0.1:4180`, `PORTA_DO_TESTE_LOCAL`), que não é o do app
// instalado nem o do build de medição (4173): as calibrações e os pacientes de
// verdade não são tocados.

import { EMAIL_DO_TESTE_LOCAL, modoTesteLocal } from './modoTesteLocal';
import { aceitarConsentimento, temConsentimentoValido } from './services/local/consent';
import { criarPerfil, listarPerfis } from './services/local/profiles';
import { INTRO_SEEN_KEY } from './pages/onboarding/bootDestination';
import { PROFILE_KEY } from './context/AuthContext';

export { EMAIL_DO_TESTE_LOCAL };
export const NOME_DO_PERFIL_DE_TESTE = 'Teste local';

function perfilEscolhido(): unknown {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null')?.currentProfile ?? null;
  } catch {
    return null;
  }
}

export function prepararModoTesteLocal(): void {
  if (!modoTesteLocal()) return;
  try {
    localStorage.setItem(INTRO_SEEN_KEY, 'true');
    if (!temConsentimentoValido()) aceitarConsentimento(EMAIL_DO_TESTE_LOCAL);
    if (!perfilEscolhido()) {
      const perfil =
        listarPerfis().find((p) => p.name === NOME_DO_PERFIL_DE_TESTE) ??
        criarPerfil({ name: NOME_DO_PERFIL_DE_TESTE });
      localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({ currentProfile: { id: perfil.id, name: perfil.name, createdAt: perfil.createdAt } }),
      );
    }
  } catch (e) {
    console.warn('[teste-local] não consegui preparar o storage; o app segue pelo fluxo normal:', e);
  }
  console.warn('[teste-local] modo de teste local: sem nuvem, sem conta e sem termo. Nada sai deste computador.');
}

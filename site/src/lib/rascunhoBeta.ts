/* ============================================================
   Rascunho da inscrição na beta enquanto o e-mail não é confirmado.

   Com "Confirm email" ligado no Supabase, o signUp volta sem sessão e a
   inscrição (complete_beta_registration) só pode rodar depois que a pessoa
   clicar no link e entrar. Para ela não preencher tudo de novo, a /beta
   guarda aqui o que é seguro guardar e devolve ao formulário na volta.

   Privacidade:
   - lista FECHADA de campos (PODE_GUARDAR): CPF, condição de saúde, senha
     e telefone nunca entram, mesmo que sejam passados — a volta pede de novo;
   - nome e e-mail de quem se inscreve também não: vêm da própria conta;
   - vale por 48 horas e só para o mesmo e-mail; é apagado ao concluir a
     inscrição e ao sair da conta, e o vencido some na visita seguinte;
   - localStorage (e não sessionStorage) porque o link do e-mail abre outra
     aba. Todo acesso fica em try/catch: modo privado ou armazenamento
     bloqueado só fazem o rascunho não existir.
   ============================================================ */

import type { BetaProfile } from '@/context/AccountContext'

export const RASCUNHO_KEY = 'irisflow:rascunho-beta'

/** Validade do rascunho: cobre o prazo do link de confirmação com folga. */
export const RASCUNHO_VALIDADE_MS = 48 * 60 * 60 * 1000

const TEXTOS = ['userName', 'relation', 'os', 'prescriberName', 'prescriberRole', 'howFound'] as const
const ESCOLHAS = ['wantsCaregiverApp', 'feedbackConsent'] as const

/** Os únicos campos que podem ficar no navegador. */
export const PODE_GUARDAR: readonly (keyof BetaProfile)[] = [...TEXTOS, ...ESCOLHAS]

export type RascunhoBeta = Partial<Pick<BetaProfile, (typeof TEXTOS)[number] | (typeof ESCOLHAS)[number]>>

type Guardado = { v: 1; email: string; salvoEm: number; campos: RascunhoBeta }

const normalizar = (email: string) => email.trim().toLowerCase()

/** Copia só o que está na lista, com tipo e tamanho conferidos. */
function filtrar(origem: Partial<Record<string, unknown>>): RascunhoBeta {
  const campos: Record<string, string | boolean> = {}
  for (const k of TEXTOS) {
    const v = origem[k]
    if (typeof v === 'string' && v.trim()) campos[k] = v.slice(0, 200)
  }
  for (const k of ESCOLHAS) {
    const v = origem[k]
    if (typeof v === 'boolean') campos[k] = v
  }
  return campos as RascunhoBeta
}

export function salvarRascunhoBeta(
  email: string,
  dados: Partial<Record<string, unknown>>,
  agora: number = Date.now(),
): void {
  const alvo = normalizar(email)
  if (!alvo) return
  const guardado: Guardado = { v: 1, email: alvo, salvoEm: agora, campos: filtrar(dados) }
  try {
    window.localStorage.setItem(RASCUNHO_KEY, JSON.stringify(guardado))
  } catch {
    /* sem armazenamento: a volta pede os dados de novo */
  }
}

/** Rascunho do mesmo e-mail, dentro da validade; senão null. */
export function lerRascunhoBeta(email: string, agora: number = Date.now()): RascunhoBeta | null {
  let bruto: string | null = null
  try {
    bruto = window.localStorage.getItem(RASCUNHO_KEY)
  } catch {
    return null
  }
  if (!bruto) return null

  let guardado: Partial<Guardado> | null = null
  try {
    guardado = JSON.parse(bruto) as Partial<Guardado>
  } catch {
    guardado = null
  }

  const salvoEm = typeof guardado?.salvoEm === 'number' ? guardado.salvoEm : NaN
  if (!guardado || guardado.v !== 1 || !(agora - salvoEm < RASCUNHO_VALIDADE_MS) || agora < salvoEm) {
    // estragado ou vencido: não serve para ninguém, e não fica esquecido no navegador
    apagarRascunhoBeta()
    return null
  }
  if (typeof guardado.email !== 'string' || guardado.email !== normalizar(email)) return null
  return filtrar((guardado.campos ?? {}) as Record<string, unknown>)
}

/** Apaga o rascunho se ele já venceu ou está estragado (roda a cada visita). */
export function limparRascunhoVencido(agora: number = Date.now()): void {
  // lerRascunhoBeta apaga o vencido antes de conferir o e-mail; com um
  // e-mail vazio, nunca devolve nada
  lerRascunhoBeta('', agora)
}

export function apagarRascunhoBeta(): void {
  try {
    window.localStorage.removeItem(RASCUNHO_KEY)
  } catch {
    /* idem */
  }
}

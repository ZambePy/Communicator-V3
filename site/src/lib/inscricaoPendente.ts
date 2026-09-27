/* ============================================================
   Inscrição da beta à espera do código (etapa 2 da /beta).

   O e-mail e a hora do envio ficam na sessionStorage da aba: F5, o Voltar
   do navegador ou ler os termos na mesma aba reabrem a etapa do código, em
   vez de devolver o formulário vazio (e o "Aguarde 60 s" do Supabase a quem
   tentasse de novo). Some quando o e-mail é confirmado, quando a pessoa
   corrige o e-mail ou depois de 24 h. A senha NUNCA é guardada.
   ============================================================ */

const CHAVE = 'irisflow:beta-pendente'
const VALIDADE_MS = 24 * 60 * 60 * 1000

export type InscricaoPendente = {
  email: string
  /** Quando o último código foi pedido (ms desde 1970). */
  enviadoEm: number
}

export function lerInscricaoPendente(agora = Date.now()): InscricaoPendente | null {
  try {
    const bruto = JSON.parse(window.sessionStorage.getItem(CHAVE) ?? 'null') as Partial<InscricaoPendente> | null
    if (!bruto || typeof bruto.email !== 'string' || !bruto.email.includes('@')) return null
    if (typeof bruto.enviadoEm !== 'number' || agora - bruto.enviadoEm > VALIDADE_MS) {
      window.sessionStorage.removeItem(CHAVE)
      return null
    }
    return { email: bruto.email, enviadoEm: bruto.enviadoEm }
  } catch {
    return null
  }
}

export function guardarInscricaoPendente(email: string, enviadoEm = Date.now()): void {
  try {
    window.sessionStorage.setItem(CHAVE, JSON.stringify({ email, enviadoEm }))
  } catch {
    // Sem sessionStorage a etapa só não sobrevive ao F5.
  }
}

export function esquecerInscricaoPendente(): void {
  try {
    window.sessionStorage.removeItem(CHAVE)
  } catch {
    // nada a fazer
  }
}

/** Segundos que ainda faltam para poder pedir outro código (o Supabase exige 60 s). */
export function esperaRestante(enviadoEm: number, agora = Date.now(), intervalo = 60): number {
  return Math.max(0, Math.ceil(intervalo - (agora - enviadoEm) / 1000))
}

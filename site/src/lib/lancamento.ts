/* ============================================================
   Lançamento da beta: o dia em que o download abre.

   A data mora em beta_program.launch_at (o site lê sem login; migração
   20260924230017_beta_lancamento.sql), com reserva em
   BETA.lancamentoReserva (content.ts). Antes dela, a inscrição funciona
   normalmente — conta, confirmação do e-mail e pesquisa — e os botões de
   download mostram o dia. A partir dela, liberam sozinhos, sem novo deploy.

   Sempre no fuso de Brasília: "10/11 00:00 -03" não pode virar "09/11"
   num navegador configurado em outro fuso.
   ============================================================ */

const FUSO = 'America/Sao_Paulo'

/**
 * O download já está liberado? Data ausente ou inválida conta como
 * liberado: um valor estranho no banco não pode travar a beta para sempre.
 */
export function jaLancou(lancamento: string | null | undefined, agora: number = Date.now()): boolean {
  if (!lancamento) return true
  const t = Date.parse(lancamento)
  if (!Number.isFinite(t)) return true
  return agora >= t
}

function valida(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d : null
}

/** "10/11" — o rótulo curto da etiqueta vermelha. */
export function diaEMes(iso: string): string {
  const d = valida(iso)
  if (!d) return ''
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(d)
}

/** "10 de novembro" — para as frases. */
export function diaPorExtenso(iso: string): string {
  const d = valida(iso)
  if (!d) return ''
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: 'numeric', month: 'long' }).format(d)
}

/** Dias inteiros até o lançamento (0 no próprio dia ou depois). */
export function diasAteOLancamento(lancamento: string, agora: number = Date.now()): number {
  const t = Date.parse(lancamento)
  if (!Number.isFinite(t) || agora >= t) return 0
  return Math.ceil((t - agora) / 86_400_000)
}

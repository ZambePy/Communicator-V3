import { useEffect, useState } from 'react'
import { jaLancou } from '@/lib/lancamento'
import { BETA_PROGRAM_RESERVA, fetchBetaProgram, type BetaProgram } from '@/services/api'

/* ============================================================
   Estado do programa beta (tabela beta_program), lido uma vez por visita
   e dividido entre o cabeçalho (etiqueta do lançamento no menu), a /beta,
   o /perfil e a vitrine da página Solução.

   fetchBetaProgram nunca rejeita: em falha fica a reserva do content.ts,
   que tem as mesmas datas do banco.
   ============================================================ */

let pedido: Promise<BetaProgram> | null = null
let lido: BetaProgram | null = null

function lerBetaProgram(): Promise<BetaProgram> {
  if (!pedido) {
    pedido = fetchBetaProgram().then((p) => {
      lido = p
      return p
    })
  }
  return pedido
}

/** Só para os testes: esquece a leitura feita, para a próxima buscar de novo. */
export function esquecerBetaProgram() {
  pedido = null
  lido = null
}

export function useBetaProgram(): BetaProgram {
  const [program, setProgram] = useState<BetaProgram>(() => lido ?? BETA_PROGRAM_RESERVA)

  useEffect(() => {
    let vivo = true
    void lerBetaProgram().then((p) => {
      if (vivo) setProgram(p)
    })
    return () => {
      vivo = false
    }
  }, [])

  return program
}

/** Maior espera que o setTimeout aceita sem estourar (~24,8 dias). */
const ESPERA_MAXIMA_MS = 2_147_000_000

/**
 * O download já abriu? Quem está com a página aberta na virada do
 * lançamento vê os botões liberarem sozinhos, sem recarregar.
 */
export function useJaLancou(lancamento: string): boolean {
  const [agora, setAgora] = useState(() => Date.now())
  const lancou = jaLancou(lancamento, agora)

  useEffect(() => {
    if (lancou) return
    const falta = Date.parse(lancamento) - Date.now()
    if (!(falta > 0)) {
      setAgora(Date.now())
      return
    }
    if (falta > ESPERA_MAXIMA_MS) return
    const t = window.setTimeout(() => setAgora(Date.now()), falta + 250)
    return () => window.clearTimeout(t)
  }, [lancamento, lancou])

  return lancou
}

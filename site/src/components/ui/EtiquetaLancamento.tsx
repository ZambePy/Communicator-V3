import { diaEMes, diaPorExtenso } from '@/lib/lancamento'
import './etiqueta-lancamento.css'

type Props = {
  /** Data do lançamento (ISO), de beta_program.launch_at. */
  lancamento: string
  /**
   * 'curta' = só "10/11" (menu do cabeçalho);
   * 'longa' = "Lançamento 10/11" (páginas da beta e do perfil).
   */
  variante?: 'curta' | 'longa'
  className?: string
}

/**
 * A etiqueta vermelha com o dia do lançamento da beta. Quem lê a tela
 * ouve a data por extenso ("lançamento em 10 de novembro"), não "10 barra 11".
 */
export function EtiquetaLancamento({ lancamento, variante = 'longa', className = '' }: Props) {
  const curto = diaEMes(lancamento)
  if (!curto) return null
  return (
    <span className={`etiqueta-lancamento etiqueta-lancamento--${variante} ${className}`.trim()}>
      <span aria-hidden="true">
        {variante === 'longa' ? (
          <>
            Lançamento <strong>{curto}</strong>
          </>
        ) : (
          curto
        )}
      </span>
      <span className="sr-only">Lançamento em {diaPorExtenso(lancamento)}</span>
    </span>
  )
}

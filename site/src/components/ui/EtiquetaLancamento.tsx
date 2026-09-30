import { useJaLancou } from '@/hooks/useBetaProgram'
import { diaEMes, diaPorExtenso } from '@/lib/lancamento'
import './etiqueta-lancamento.css'

type Props = {
  /** Data do lançamento (ISO), de beta_program.launch_at. */
  lancamento: string
  /**
   * Antes do lançamento: 'curta' = só "10/11" (menu do cabeçalho);
   * 'longa' = "Lançamento 10/11" (páginas da beta e do perfil).
   * Depois: 'curta' = "Liberada" (no menu, ao lado de "Beta");
   * 'longa' = "Beta liberada".
   */
  variante?: 'curta' | 'longa'
  className?: string
}

/**
 * A etiqueta vermelha da beta. Antes do lançamento, o dia em que o download
 * abre; depois, que a beta foi liberada. A troca é sozinha, na virada, com a
 * página aberta (`useJaLancou`), como o resto do site. Quem lê a tela ouve a
 * frase por extenso ("lançamento em 10 de novembro", "beta liberada: o
 * download está aberto"), não "10 barra 11".
 */
export function EtiquetaLancamento({ lancamento, variante = 'longa', className = '' }: Props) {
  const liberada = useJaLancou(lancamento)
  const classes = (base: string) => `${base} ${className}`.trim()

  if (liberada) {
    return (
      <span className={classes(`etiqueta-lancamento etiqueta-lancamento--${variante} etiqueta-lancamento--liberada`)}>
        <span aria-hidden="true">{variante === 'longa' ? 'Beta liberada' : 'Liberada'}</span>
        <span className="sr-only">Beta liberada: o download está aberto</span>
      </span>
    )
  }

  const curto = diaEMes(lancamento)
  if (!curto) return null
  return (
    <span className={classes(`etiqueta-lancamento etiqueta-lancamento--${variante}`)}>
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

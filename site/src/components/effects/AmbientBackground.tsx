import './ambient.css'

type Props = {
  /** `suave` nas páginas de fluxo (beta, conta, acesso): a luz quase some,
   *  para não competir com formulário nenhum. */
  variante?: 'destaque' | 'suave'
}

/**
 * Luz de fundo das faixas escuras: um único foco azul, parado, vindo de
 * cima — como a luz de uma tela num quarto escuro. Sem partículas, grade,
 * varredura ou manchas em movimento: decoração que se mexe compete com o
 * produto, e é o produto que precisa aparecer. Decorativo (aria-hidden) e
 * sem custo de composição: é um gradiente estático.
 */
export function AmbientBackground({ variante = 'destaque' }: Props) {
  return <div className={`ambient ambient--${variante}`} aria-hidden="true" />
}

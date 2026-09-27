import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ehErroDePedaco, recarregarUmaVez } from '@/lib/recargaAposDeploy'

type Props = { children: ReactNode }
type State = { erro: unknown; recarregando: boolean }

/**
 * Fronteira de erro da página (em volta do <Outlet/>, dentro do <main>):
 * uma página que quebra não leva junto o cabeçalho e o rodapé. Se o erro for
 * um pedaço de rota que sumiu num deploy, recarrega o endereço uma vez (ver
 * lib/recargaAposDeploy.ts); nos outros casos, um aviso com "Recarregar" e o
 * caminho para o início. O <main> é remontado a cada rota (key={pathname}),
 * então trocar de página zera a fronteira.
 */
export class FronteiraDeErro extends Component<Props, State> {
  state: State = { erro: null, recarregando: false }

  static getDerivedStateFromError(erro: unknown): Partial<State> {
    return { erro }
  }

  componentDidCatch(erro: unknown, info: ErrorInfo) {
    if (ehErroDePedaco(erro) && recarregarUmaVez()) {
      this.setState({ recarregando: true })
      return
    }
    console.error('[IrisFlow] a página quebrou:', erro, info.componentStack)
  }

  render() {
    const { erro, recarregando } = this.state
    if (!erro) return this.props.children
    if (recarregando) return <div className="section route-fallback" aria-busy="true" />
    const atualizacao = ehErroDePedaco(erro)
    return (
      <section className="section fronteira-de-erro" role="alert">
        <div className="container container--narrow">
          <h1 className="titulo-capitulo">Esta página não abriu.</h1>
          <p className="texto-capitulo">
            {atualizacao
              ? 'O site acabou de ser atualizado e esta aba ainda tinha a versão anterior. Recarregar resolve.'
              : 'Algo deu errado ao mostrar esta página. Recarregue; se continuar, escreva para irisflowteam@gmail.com.'}
          </p>
          <div className="actions-row">
            <button type="button" className="btn btn--primary btn--lg" onClick={() => window.location.reload()}>
              <span className="btn__content">Recarregar a página</span>
            </button>
            <Link to="/" className="btn btn--secondary btn--lg">
              <span className="btn__content">Ir para o início</span>
            </Link>
          </div>
        </div>
      </section>
    )
  }
}

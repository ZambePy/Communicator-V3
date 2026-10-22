import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/Button'
import { TESTE_AO_VIVO } from '@/data/home'
import './teste-com-o-olhar.css'

type Carregador = () => Promise<{ default: ComponentType }>

/* O teste ao vivo (câmera, modelo do rosto) é um pedaço à parte, da Task 3:
   só este import dinâmico aponta para ele, e só roda no clique. */
const CARREGAR_O_TESTE: Carregador = () => import('@/components/demo/TesteAoVivo')

/** Onde o teste existe: computador com mouse, janela de 900 px ou mais (a mesma
 *  regra do teste-com-o-olhar.css e do próprio teste). */
const NO_COMPUTADOR = '(min-width: 900px) and (pointer: fine)'

type PropsDaFronteira = { children: ReactNode; aoTentarDeNovo: () => void }

/**
 * Se o pedaço não chega (rede caiu, deploy novo trocou os nomes dos arquivos),
 * a pessoa lê o que houve e pode tentar de novo — e o motivo vai para o
 * console, uma vez por falha. Sem falha silenciosa e sem derrubar a home.
 */
class FronteiraDoTeste extends Component<PropsDaFronteira, { erro: boolean }> {
  state = { erro: false }

  static getDerivedStateFromError() {
    return { erro: true }
  }

  componentDidCatch(erro: unknown) {
    console.warn('[teste ao vivo] o teste não abriu:', erro)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="teste-olhar__falha" role="alert">
        <p>{TESTE_AO_VIVO.falhou}</p>
        <Button
          variant="secondary"
          onClick={() => {
            this.setState({ erro: false })
            this.props.aoTentarDeNovo()
          }}
        >
          {TESTE_AO_VIVO.tentarDeNovo}
        </Button>
      </div>
    )
  }
}

/**
 * "Testar com o meu olhar" (rodada 3, 21/10/2026): o botão que abre, logo
 * abaixo da gravação, o teste com a câmera de quem visita. Nada do teste é
 * baixado antes do clique; fechar desmonta o teste (e, com ele, a câmera).
 * Só no computador com mouse (como o teste pede): no celular, uma frase diz
 * que ele existe.
 */
export function TesteComOOlhar({ carregar = CARREGAR_O_TESTE }: { carregar?: Carregador }) {
  const [aberto, setAberto] = useState(false)
  const [tentativa, setTentativa] = useState(0)
  const idDoPainel = useId()
  // Um lazy novo a cada tentativa: o React guarda a falha do anterior.
  const Teste = useMemo(() => lazy(carregar), [carregar, tentativa])

  // O CSS esconde o painel fora do computador com mouse, mas não desmonta
  // nada: se a janela estreitar (ou virar toque) com o teste aberto, ele
  // fecha aqui — desmontado, o teste apaga a câmera. Só a MUDANÇA conta: um
  // navegador que não responde à consulta não fecha o teste à toa.
  useEffect(() => {
    if (!aberto || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(NO_COMPUTADOR)
    const aoMudar = (e: { matches: boolean }) => {
      if (!e.matches) setAberto(false)
    }
    mq.addEventListener?.('change', aoMudar)
    return () => mq.removeEventListener?.('change', aoMudar)
  }, [aberto])

  return (
    <div className="teste-olhar">
      <div className="teste-olhar__chamada">
        <Button
          size="lg"
          chamada
          className="teste-olhar__botao"
          aria-expanded={aberto}
          aria-controls={idDoPainel}
          onClick={() => setAberto((a) => !a)}
        >
          {aberto ? TESTE_AO_VIVO.fechar : TESTE_AO_VIVO.botao}
        </Button>
        <p className="teste-olhar__nota">{TESTE_AO_VIVO.nota}</p>
        <p className="teste-olhar__nota-celular">{TESTE_AO_VIVO.notaNoCelular}</p>
      </div>

      <div id={idDoPainel} className="teste-olhar__painel" hidden={!aberto}>
        {aberto && (
          <FronteiraDoTeste key={tentativa} aoTentarDeNovo={() => setTentativa((t) => t + 1)}>
            <Suspense
              fallback={
                <p className="teste-olhar__carregando" role="status">
                  {TESTE_AO_VIVO.carregando}
                </p>
              }
            >
              <Teste />
            </Suspense>
          </FronteiraDoTeste>
        )}
      </div>
    </div>
  )
}

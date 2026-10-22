import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { CampoDoTopo } from '@/components/v3/CampoDoTopo'

/**
 * O fundo das páginas internas (rodada 4, 21/10/2026): no topo de cada página
 * interna, o motivo discreto dos 13 pontos da calibração, o mesmo sistema da
 * abertura da home sem repetir a abertura (v3/CampoDoTopo.tsx). A luz do olhar,
 * que acompanha o mouse, é do site inteiro e mora no Layout.
 *
 * Uso: a página escreve `<FundoDaPagina />` (ou `variante="calmo"`) antes da
 * `<PageHead />`. Quem DESENHA é a faixa de abertura, por dentro dela: a faixa
 * tem fundo opaco, e uma camada fora dela ficaria por baixo (ou por cima do
 * texto). Por isso este componente só PEDE o fundo, e a PageHead o pinta entre
 * o fundo da faixa e o título.
 *
 * Páginas sem faixa de abertura (formulários e fluxos, com o título dentro do
 * próprio cartão) ganham o mesmo motivo numa camada solta no topo do <main>,
 * por baixo de todo o conteúdo e esmaecida para baixo: o cartão, que tem fundo
 * próprio, fica por cima.
 *
 * - `padrao`: os 13 pontos entram na ordem da calibração, um anel de fixação
 *   enche no ponto do centro uma vez, e o campo fica parado.
 * - `calmo`: para páginas de leitura, formulário e fluxo, onde nada deve
 *   chamar a atenção: os pontos só assentam, mais apagados, e não há anel.
 *
 * Sem o provedor (fora do Layout: em um teste de página, por exemplo), não faz
 * nada, e a faixa fica lisa como antes.
 */
export type VarianteDoFundo = 'padrao' | 'calmo'

type Pedir = (variante: VarianteDoFundo) => () => void

const PedidoCtx = createContext<Pedir | null>(null)
const VarianteCtx = createContext<VarianteDoFundo | null>(null)
/** A PageHead da página, quando ela quer o fundo, avisa que vai desenhá-lo. */
const DeclararCtx = createContext<(() => () => void) | null>(null)
const AberturaCtx = createContext(false)

/** Liga as páginas à faixa de abertura. Fica no Layout, em volta do conteúdo da rota. */
export function FundoDaPaginaProvider({ children }: { children: ReactNode }) {
  // Pilha de pedidos: vale o último. Uma página que troca de passo (a beta tem
  // vários) pode montar o novo antes de desmontar o antigo.
  const [pedidos, setPedidos] = useState<{ id: number; variante: VarianteDoFundo }[]>([])
  const pedir = useMemo<Pedir>(() => {
    let proximo = 0
    return (variante) => {
      const id = proximo++
      setPedidos((p) => [...p, { id, variante }])
      return () => setPedidos((p) => p.filter((x) => x.id !== id))
    }
  }, [])
  const variante = pedidos.length ? pedidos[pedidos.length - 1].variante : null
  const [aberturas, setAberturas] = useState(0)
  const declarar = useMemo(
    () => () => {
      setAberturas((n) => n + 1)
      return () => setAberturas((n) => n - 1)
    },
    [],
  )
  return (
    <PedidoCtx.Provider value={pedir}>
      <VarianteCtx.Provider value={variante}>
        <DeclararCtx.Provider value={declarar}>
          <AberturaCtx.Provider value={aberturas > 0}>{children}</AberturaCtx.Provider>
        </DeclararCtx.Provider>
      </VarianteCtx.Provider>
    </PedidoCtx.Provider>
  )
}

/** Para a PageHead: qual fundo desenhar, ou `null` (nenhum). */
export function useFundoDaPagina(): VarianteDoFundo | null {
  return useContext(VarianteCtx)
}

/** Para a PageHead: "eu vou desenhar o fundo", e a camada solta não aparece. */
export function useDeclararAbertura(desenha: boolean) {
  const declarar = useContext(DeclararCtx)
  useLayoutEffect(() => (declarar && desenha ? declarar() : undefined), [declarar, desenha])
}

export function FundoDaPagina({ variante = 'padrao' }: { variante?: VarianteDoFundo }) {
  const pedir = useContext(PedidoCtx)
  const temAbertura = useContext(AberturaCtx)
  // Layout effect: o pedido entra antes da primeira pintura, e a faixa já
  // nasce com o fundo, sem um quadro liso antes.
  useLayoutEffect(() => (pedir ? pedir(variante) : undefined), [pedir, variante])
  if (!pedir || temAbertura) return null
  return (
    <div className="fundo-da-pagina" aria-hidden="true">
      <CampoDoTopo variante={variante} />
    </div>
  )
}

import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { Atmosfera } from '@/components/fundo/Atmosfera'

/**
 * O fundo vivo do topo das páginas de dentro.
 *
 * A página escreve `<FundoDaPagina />` (ou `variante="calmo"`, para leitura e
 * formulários) antes da `<PageHead />`. Quem desenha é a própria PageHead,
 * dentro da faixa dela. Páginas sem PageHead ganham uma camada solta no topo
 * do <main>, esmaecida para baixo, por baixo do conteúdo.
 *
 * Fora do Layout (num teste de página, por exemplo) não faz nada.
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
      <Atmosfera variante={variante === 'calmo' ? 'calmo' : 'topo'} />
    </div>
  )
}

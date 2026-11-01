import { Reveal } from '@/components/effects/Reveal'
import { usePlans } from '@/hooks/usePlans'
import { BETA } from '@/data/content'
import { CONTRASTE, notaDoIrisflowNaFaixa } from '@/data/home'
import './contraste-faixa.css'

type Props = {
  /**
   * `linhas` (padrão, /planos): duas linhas de uma conta, o rótulo à esquerda e
   * o valor à direita. `faixa` (home, desde 31/10/2026): o azul da marca
   * inteiro, com os dois números grandes lado a lado.
   */
  variante?: 'linhas' | 'faixa'
}

/**
 * O contraste que define o projeto: o aparelho importado contra a webcam de
 * casa. O menor preço vem de usePlans (o banco ou a reserva do content.ts).
 */
export function ContrastePreco({ variante = 'linhas' }: Props) {
  const { cheapest } = usePlans()
  const depois = `a partir de R$ ${cheapest.price} por mês`

  if (variante === 'faixa') {
    return (
      <section className="contraste-faixa home-faixa home-faixa--azul" aria-labelledby="contraste-titulo">
        <div className="container">
          <Reveal>
            <h2 id="contraste-titulo" className="home-titulo">
              {CONTRASTE.titulo}
            </h2>
          </Reveal>
          <dl className="contraste-faixa__conta">
            <Reveal className="contraste-faixa__lado contraste-faixa__lado--dedicado" delay={80}>
              <dt className="contraste-faixa__rotulo">{CONTRASTE.dedicado.rotulo}</dt>
              <dd className="contraste-faixa__numero">{CONTRASTE.faixa.dedicado.valor}</dd>
              <dd className="contraste-faixa__nota">{CONTRASTE.faixa.dedicado.nota}</dd>
            </Reveal>
            <Reveal className="contraste-faixa__lado contraste-faixa__lado--irisflow" delay={160}>
              <dt className="contraste-faixa__rotulo">{CONTRASTE.irisflow.rotulo}</dt>
              <dd className="contraste-faixa__numero">{CONTRASTE.faixa.irisflow.valor}</dd>
              <dd className="contraste-faixa__nota">{notaDoIrisflowNaFaixa(cheapest.price, BETA.ativo)}</dd>
            </Reveal>
          </dl>
        </div>
      </section>
    )
  }

  return (
    <section className="contraste on-dark" aria-labelledby="contraste-titulo">
      <div className="container">
        <h2 id="contraste-titulo" className="titulo-capitulo contraste__titulo">
          {CONTRASTE.titulo}
        </h2>

        <dl className="contraste__linhas">
          <div className="contraste__linha contraste__linha--dedicado">
            <dt className="contraste__rotulo">{CONTRASTE.dedicado.rotulo}</dt>
            <dd className="contraste__valor">{CONTRASTE.dedicado.valor}</dd>
            <dd className="contraste__nota">{CONTRASTE.dedicado.nota}</dd>
          </div>
          <div className="contraste__linha contraste__linha--irisflow">
            <dt className="contraste__rotulo">{CONTRASTE.irisflow.rotulo}</dt>
            <dd className="contraste__valor">{CONTRASTE.irisflow.valor}</dd>
            <dd className="contraste__nota">
              {BETA.ativo ? `Grátis na beta; depois, ${depois}.` : `${depois[0].toUpperCase()}${depois.slice(1)}.`}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

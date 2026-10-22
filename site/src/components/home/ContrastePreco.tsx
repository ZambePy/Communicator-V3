import { usePlans } from '@/hooks/usePlans'
import { BETA } from '@/data/content'
import { CONTRASTE } from '@/data/home'

/**
 * O contraste que define o projeto: o aparelho importado contra a webcam de
 * casa. Duas linhas de uma conta, e não dois cartões iguais: o rótulo à
 * esquerda, o valor grande à direita; a linha do IrisFlow no azul da marca.
 */
export function ContrastePreco() {
  const { cheapest } = usePlans()
  const depois = `a partir de R$ ${cheapest.price} por mês`
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

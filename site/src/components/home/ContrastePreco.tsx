import { Reveal } from '@/components/effects/Reveal'
import { usePlans } from '@/hooks/usePlans'
import { BETA } from '@/data/content'
import { CONTRASTE } from '@/data/home'

/** O contraste que define o projeto: o aparelho importado contra a webcam de casa. */
export function ContrastePreco() {
  const { cheapest } = usePlans()
  const depois = `a partir de R$ ${cheapest.price} por mês`
  return (
    <section className="contraste on-dark" aria-labelledby="contraste-titulo">
      <div className="container">
        <Reveal anim="up">
          <h2 id="contraste-titulo" className="titulo-capitulo contraste__titulo">
            {CONTRASTE.titulo}
          </h2>
        </Reveal>

        <div className="contraste__lados">
          <Reveal anim="up" delay={80} className="contraste__lado contraste__lado--dedicado">
            <span className="contraste__rotulo">{CONTRASTE.dedicado.rotulo}</span>
            <strong className="contraste__valor">{CONTRASTE.dedicado.valor}</strong>
            <span className="contraste__nota">{CONTRASTE.dedicado.nota}</span>
          </Reveal>

          <Reveal anim="up" delay={180} className="contraste__lado contraste__lado--irisflow">
            <span className="contraste__rotulo">{CONTRASTE.irisflow.rotulo}</span>
            <strong className="contraste__valor">{CONTRASTE.irisflow.valor}</strong>
            <span className="contraste__nota">{BETA.ativo ? `Grátis na beta; depois, ${depois}.` : `${depois[0].toUpperCase()}${depois.slice(1)}.`}</span>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Icon } from '@/components/ui/Icon'
import { PRIVACIDADE } from '@/data/home'

/** Privacidade em uma frase — a política inteira fica em /privacidade. */
export function PrivacidadeCurta() {
  return (
    <section className="privacidade-curta on-dark" aria-labelledby="privacidade-titulo">
      <div className="container privacidade-curta__inner">
        <Reveal anim="zoom" className="privacidade-curta__icone">
          <Icon name="cadeado" size={30} />
        </Reveal>
        <Reveal anim="up" delay={80}>
          <h2 id="privacidade-titulo" className="titulo-capitulo">
            {PRIVACIDADE.titulo}
          </h2>
          <p className="texto-capitulo">{PRIVACIDADE.texto}</p>
          <Link to="/privacidade" className="link-seta">
            Como tratamos os dados
          </Link>
        </Reveal>
      </div>
    </section>
  )
}

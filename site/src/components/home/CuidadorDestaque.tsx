import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { SelosDasLojas } from '@/components/ui/SelosDasLojas'
import { CUIDADOR_DESTAQUE, DEMO_CUIDADOR } from '@/data/home'
import { CelularDemo } from './Aparelhos'
import { MensagemQueChega } from './MensagemQueChega'

/**
 * O app de quem cuida, com a gravação real no celular. Quando a seção entra na
 * tela, o que o paciente escreveu chega ao celular (MensagemQueChega), uma vez.
 */
export function CuidadorDestaque() {
  return (
    <section className="cuidador-destaque on-dark" aria-labelledby="cuidador-destaque-titulo">
      <div className="container cuidador-destaque__grade">
        <Reveal anim="up" className="cuidador-destaque__aparelho">
          <CelularDemo demo={DEMO_CUIDADOR} sobre={<MensagemQueChega nome="Carlos" iniciais="CS" frase="Quero água" />} />
        </Reveal>

        <div className="cuidador-destaque__texto">
          <Reveal anim="up">
            <img
              className="cuidador-destaque__marca"
              src="/brand/irisflow-cuidador-negativo.svg"
              alt="IrisFlow Cuidador"
              width={141}
              height={152}
            />
          </Reveal>
          <Reveal anim="up" delay={80}>
            <h2 id="cuidador-destaque-titulo" className="titulo-capitulo">
              {CUIDADOR_DESTAQUE.titulo}
            </h2>
            <p className="texto-capitulo">{CUIDADOR_DESTAQUE.texto}</p>
          </Reveal>
          <Reveal anim="up" delay={160}>
            <ul className="lista-check">
              {CUIDADOR_DESTAQUE.pontos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal anim="up" delay={240}>
            <SelosDasLojas />
            <Link to="/cuidador" className="link-seta">
              Conhecer o IrisFlow Cuidador
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

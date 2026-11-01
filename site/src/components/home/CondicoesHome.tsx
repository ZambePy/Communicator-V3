import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { CONDICOES_NA_HOME, PARA_QUEM_O_OLHAR } from '@/data/home'
import './condicoes.css'

/**
 * "Para quem" na home (desenho de 31/10/2026, no lugar do arco): as seis
 * condições numa lista tipográfica de duas colunas, cada uma com uma linha do
 * que o IrisFlow muda nela. Cada nome leva à parte certa de /como-funciona.
 */
export function CondicoesHome() {
  return (
    <section className="condicoes home-faixa home-faixa--marinho" aria-labelledby="condicoes-titulo">
      <div className="container">
        <Reveal as="header">
          <h2 id="condicoes-titulo" className="home-titulo condicoes__titulo">
            {PARA_QUEM_O_OLHAR.titulo}
          </h2>
          <p className="home-sub">{PARA_QUEM_O_OLHAR.texto}</p>
        </Reveal>
        <ul className="condicoes__lista">
          {CONDICOES_NA_HOME.map((c, i) => (
            <Reveal key={c.nome} as="li" className="condicoes__item" delay={Math.min(i, 5) * 50}>
              <Link to={c.to} className="condicoes__link">
                <span className="condicoes__nome">{c.nome}</span>{' '}
                <span className="condicoes__linha">{c.linha}</span>
              </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}

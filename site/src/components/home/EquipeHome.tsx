import { Button } from '@/components/ui/Button'
import { Reveal } from '@/components/effects/Reveal'
import { TEAM, TEAM_PHOTO } from '@/data/content'
import { EQUIPE_NA_HOME as E } from '@/data/home'
import './equipe-home.css'

/**
 * A equipe na home (redesenho de 01/11/2026, pedido do dono: o painel com a
 * foto num círculo pequeno não tinha força). O título grande no alto e a foto
 * dos três na largura inteira: ela começa como um aro no meio e se abre até o
 * retângulo enquanto a faixa sobe na tela (o motivo da página, preso à
 * rolagem). Embaixo, os três, cada um com o rosto, o papel e uma frase, e os
 * dois blocos curtos da origem com o caminho para a página Sobre.
 */
export function EquipeHome() {
  return (
    <section className="equipe-home home-faixa home-faixa--marinho" aria-labelledby="equipe-home-titulo">
      <div className="container">
        <Reveal as="header" anim="up" className="equipe-home__cabeca">
          <h2 id="equipe-home-titulo" className="equipe-home__titulo">
            {E.titulo}
          </h2>
          <Button to="/sobre" size="lg" variant="secondary">
            {E.botao}
          </Button>
        </Reveal>

        <figure className="equipe-home__foto">
          <div className="equipe-home__janela">
            <picture>
              <source
                type="image/webp"
                srcSet={`/team/${TEAM_PHOTO.base}-800.webp 800w, /team/${TEAM_PHOTO.base}-1600.webp 1600w`}
                sizes="(min-width: 1240px) 1200px, 92vw"
              />
              <img
                src={`/team/${TEAM_PHOTO.base}-1600.jpg`}
                alt={TEAM_PHOTO.alt}
                width={1600}
                height={1066}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
        </figure>

        <ul className="equipe-home__pessoas">
          {TEAM.map((p, i) => (
            <Reveal as="li" anim="up" delay={i * 80} key={p.name} className="equipe-home__pessoa">
              <picture>
                <source type="image/webp" srcSet={`/team/${p.photo}-avatar-200.webp 1x, /team/${p.photo}-avatar-400.webp 2x`} />
                <img
                  className="equipe-home__rosto"
                  src={`/team/${p.photo}-avatar-200.jpg`}
                  alt=""
                  width={200}
                  height={200}
                  loading="lazy"
                  decoding="async"
                />
              </picture>
              <div>
                <h3 className="equipe-home__nome">{p.name.split(' ')[0]}</h3>
                <p className="equipe-home__papel">{p.role}</p>
                <p className="equipe-home__frase">{p.line}</p>
              </div>
            </Reveal>
          ))}
        </ul>

        <div className="equipe-home__blocos">
          {E.blocos.map((b, i) => (
            <Reveal key={b.titulo} anim="up" delay={80 + i * 80} className="equipe-home__bloco">
              <h3>{b.titulo}</h3>
              <p>{b.texto}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

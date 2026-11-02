import type { CSSProperties } from 'react'
import { Reveal } from '@/components/effects/Reveal'
import { MEDIDO } from '@/data/home'
import { NumeroQueRola } from './NumeroQueRola'
import './medido.css'

/**
 * "Medido, com as ressalvas" (redesenho de 01/11/2026): um quadro de ladrilhos
 * chapados, o primeiro no azul da marca com o título, e cada um dos outros com
 * um número grande e uma frase. A ressalva fecha o quadro, no mesmo tamanho de
 * texto dos números, para nunca ficar menor que a promessa. Os algarismos
 * rolam até o valor quando o quadro chega à tela (NumeroQueRola).
 */
export function MedidoHome() {
  return (
    <section className="medido home-faixa" aria-labelledby="medido-titulo">
      <div className="container">
        <ul className="medido__quadro">
          <Reveal as="li" anim="up" className="medido__ladrilho medido__ladrilho--titulo">
            <h2 id="medido-titulo" className="medido__titulo">
              {MEDIDO.titulo}
            </h2>
          </Reveal>
          {MEDIDO.marcas.map((m, i) => (
            <Reveal
              as="li"
              anim="up"
              key={m.valor}
              className="medido__ladrilho"
              delay={60 + (i % 4) * 70}
              style={{ '--i': i } as CSSProperties}
            >
              <NumeroQueRola valor={m.valor} className="medido__valor" />
              <span className="medido__texto">{m.texto}</span>
            </Reveal>
          ))}
          <Reveal as="li" anim="up" className="medido__ladrilho medido__ladrilho--ressalva" delay={200}>
            <p className="medido__ressalva">{MEDIDO.ressalva}</p>
          </Reveal>
        </ul>
      </div>
    </section>
  )
}

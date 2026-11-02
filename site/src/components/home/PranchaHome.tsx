import { Reveal } from '@/components/effects/Reveal'
import { PRANCHA } from '@/data/home'
import './prancha.css'

/** As palavras de uma frase, cada uma num span (a tinta acende uma por uma ao rolar). */
function Palavras({ texto, classe }: { texto: string; classe: string }) {
  return (
    <span className={classe}>
      {texto.split(' ').map((palavra, i, todas) => (
        <span key={i} className="prancha__palavra">
          {palavra}
          {i < todas.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  )
}

/**
 * A frase da prancha (redesenho de 01/11/2026, revisto a pedido do dono: só
 * texto, sem miniaturas no meio das palavras). Duas metades: como a família
 * conversa hoje, na prancha de letras, num tom apagado; e como fica com o
 * IrisFlow, na tinta cheia. Ao rolar, as palavras ganham tinta uma por uma
 * (prancha.css); a frase já se lê antes, a tinta só marca o ritmo. É um
 * parágrafo, não um título.
 */
export function PranchaHome() {
  return (
    <section className="prancha home-faixa" aria-label="O que muda com o IrisFlow">
      <div className="container">
        <Reveal as="p" anim="up" className="prancha__frase">
          <Palavras texto={PRANCHA.antes} classe="prancha__antes" />{' '}
          <Palavras texto={PRANCHA.depois} classe="prancha__depois" />
        </Reveal>
      </div>
    </section>
  )
}

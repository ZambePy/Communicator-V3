import { useState } from 'react'
import { useInView } from '@/hooks/useInView'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useTique } from '@/hooks/useTique'
import './voz-que-sai.css'

export const FRASES_DA_VOZ = ['Estou com sede.', 'Quero ver o jogo hoje.', 'Obrigado por ficar aqui.'] as const

const TROCA_MS = 4200
const BARRAS = 18

/**
 * O painel ao lado da chamada final: uma frase escolhida com o olhar e a voz
 * saindo dela. As frases se revezam sozinhas enquanto o painel está na tela;
 * com movimento reduzido, fica a primeira, parada.
 */
export function VozQueSai() {
  const reduzido = useReducedMotion()
  const { ref, inView } = useInView<HTMLDivElement>({ once: false, threshold: 0.2, rootMargin: '0px' })
  const [indice, setIndice] = useState(0)

  useTique(inView && !reduzido, TROCA_MS, () => setIndice((i) => (i + 1) % FRASES_DA_VOZ.length))

  const frase = FRASES_DA_VOZ[indice]

  return (
    <div ref={ref} className={`voz${reduzido ? ' is-parada' : ''}${inView ? ' is-na-tela' : ''}`} aria-hidden="true">
      <div className="voz__barra">
        <span className="voz__marca" />
        <span>IrisFlow Communicator</span>
        <span className="voz__estado">falando</span>
      </div>
      <p key={frase} className="voz__frase">
        {frase}
      </p>
      <div className="voz__onda">
        {Array.from({ length: BARRAS }, (_, i) => (
          <span key={`${indice}-${i}`} style={{ animationDelay: `${(i % 6) * 90 + Math.floor(i / 6) * 40}ms` }} />
        ))}
      </div>
      <div className="voz__rodape">
        <span>Escolhida com o olhar</span>
        <span>Falada em voz alta</span>
      </div>
    </div>
  )
}

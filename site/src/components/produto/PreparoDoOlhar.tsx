import type { CSSProperties } from 'react'
import { useInView } from '@/hooks/useInView'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import './preparo-do-olhar.css'

export const CONFERENCIAS = [
  { titulo: 'Rosto encontrado', detalhe: 'Os dois olhos à vista da câmera' },
  { titulo: 'Luz adequada', detalhe: 'Sem janela clara atrás da pessoa' },
  { titulo: 'Distância certa', detalhe: 'Entre 50 e 70 cm da tela' },
] as const

/**
 * Como funciona: o preparo antes da calibração, num painel no estilo do app.
 * As três conferências se confirmam uma a uma quando o painel chega à tela e,
 * no fim, o resultado aparece em palavras. Com movimento reduzido, já vem pronto.
 */
export function PreparoDoOlhar() {
  const reduzido = useReducedMotion()
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.35 })
  const pronto = reduzido || inView

  return (
    <div ref={ref} className={`preparo${pronto ? ' is-pronto' : ''}${reduzido ? ' is-parado' : ''}`}>
      <div className="preparo__topo">
        <span className="preparo__rotulo">Preparo do ambiente</span>
        <span>Antes de calibrar</span>
      </div>
      <ul className="preparo__lista">
        {CONFERENCIAS.map((c, i) => (
          <li key={c.titulo} className="preparo__item" style={{ '--ordem': i } as CSSProperties}>
            <span className="preparo__check" aria-hidden="true">
              <svg viewBox="0 0 20 20" focusable="false">
                <path d="M5 10.5 8.5 14 15 6.5" pathLength={1} />
              </svg>
            </span>
            <span>
              <strong>{c.titulo}</strong>
              <span className="preparo__detalhe">{c.detalhe}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="preparo__resultado">
        <span className="preparo__selo">Calibração: ótima</span>
        <span className="preparo__frase">Pode começar a escrever.</span>
      </div>
    </div>
  )
}

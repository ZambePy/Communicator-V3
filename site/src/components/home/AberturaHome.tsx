import type { CSSProperties } from 'react'
import { Button } from '@/components/ui/Button'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { BETA, BETA_CTA, HERO } from '@/data/content'
import { FundoVivo } from './FundoVivo'
import { SimboloEmVolume } from './SimboloEmVolume'
import './abertura.css'

/** "Seu olhar tem voz." em duas linhas: as duas primeiras palavras e o resto. */
function linhasDoTitulo(titulo: string): string[] {
  const palavras = titulo.split(' ')
  return [palavras.slice(0, 2).join(' '), palavras.slice(2).join(' ')].filter(Boolean)
}

/** A ordem de cada peça na entrada da abertura (70 ms entre uma e outra). */
const ordem = (n: number) => ({ '--entra': n }) as CSSProperties

/**
 * A abertura da home (redesenho de 01/11/2026). O teclado desenhado saiu
 * (parecia um teclado falso). Atrás de tudo, sobre o preto, o fundo vivo
 * (FundoVivo): partículas em profundidade, raios de luz que cruzam a tela e
 * um brilho azul atrás do símbolo. À direita, o símbolo da IrisFlow em volume
 * (SimboloEmVolume), que se monta peça por peça e depois flutua.
 *
 * Por cima, à esquerda: o título, o que é e para quem, as duas chamadas e os
 * fatos. A chamada principal segue a beta: antes do lançamento leva à
 * inscrição (/beta); depois, ao download (/baixar); sem beta, aos planos.
 *
 * Entrada (uma vez, ao carregar): as linhas do título sobem de trás da linha
 * de base, depois texto, chamadas e fatos em cascata de 70 ms (abertura.css).
 * Com movimento reduzido, tudo já está no lugar e o campo fica parado.
 */
export function AberturaHome() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const fatos = BETA.ativo ? [HERO.fatoDaBeta, ...HERO.fatos] : HERO.fatos

  return (
    <section className="abertura" aria-labelledby="abertura-titulo">
      <div className="container abertura__grade">
        <div className="abertura__texto">
          {/* As duas linhas sobem de trás da própria linha de base, uma depois da outra. */}
          <h1 id="abertura-titulo" className="abertura__titulo">
            {linhasDoTitulo(HERO.title).map((linha, i) => (
              <span key={linha} className="abertura__linha">
                <span style={{ '--i': i } as CSSProperties}>{linha}</span>{' '}
              </span>
            ))}
          </h1>
          <p className="abertura__lead abertura__entra" style={ordem(1)}>
            {HERO.lead}
          </p>

          {/* data-sticky-hide: com estas chamadas na tela, a barra fixa do celular fica escondida (StickyCta). */}
          <div className="abertura__acoes abertura__entra" style={ordem(2)} data-sticky-hide>
            {BETA.ativo ? (
              <Button to={lancou ? '/baixar' : BETA_CTA.to} size="lg" chamada>
                {lancou ? `Baixar grátis para ${BETA.sistemaDoLancamento}` : BETA_CTA.label}
              </Button>
            ) : (
              <Button to="/planos" size="lg" chamada>
                {HERO.primary}
              </Button>
            )}
            <Button to="/como-funciona" size="lg" variant="secondary">
              {HERO.secondary}
            </Button>
          </div>

          <ul className="abertura__fatos abertura__entra" style={ordem(3)} aria-label="Em resumo">
            {fatos.map((fato) => (
              <li key={fato}>{fato}</li>
            ))}
          </ul>
        </div>

      </div>

      <FundoVivo />
      <div className="abertura__simbolo">
        <SimboloEmVolume />
      </div>
    </section>
  )
}

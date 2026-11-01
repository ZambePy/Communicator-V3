import type { CSSProperties } from 'react'
import { Button } from '@/components/ui/Button'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { BETA, BETA_CTA, HERO } from '@/data/content'
import { PalcoDoTeclado } from './PalcoDoTeclado'
import './abertura.css'

/** A ordem de cada peça na entrada da abertura (70 ms entre uma e outra). */
const ordem = (n: number) => ({ '--entra': n }) as CSSProperties

/**
 * A abertura da home no desenho aprovado em 31/10/2026, sobre o marinho da
 * marca: o título grande, o que é e para quem, as duas chamadas e dois fatos;
 * à direita, um degrau mais fundo, o teclado do IrisFlow em demonstração
 * (PalcoDoTeclado, uma ilustração parada). No celular, uma coluna, com o
 * palco logo depois dos fatos.
 *
 * A chamada principal segue a beta: antes do lançamento leva à inscrição
 * (/beta); depois, ao download (/baixar); sem beta, aos planos.
 *
 * Entrada (uma vez, ao carregar): título, texto, chamadas, fatos e o palco
 * sobem e aparecem em cascata de 70 ms (abertura.css). Com movimento reduzido,
 * tudo já está no lugar.
 */
export function AberturaHome() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const fatos = BETA.ativo ? [HERO.fatoDaBeta, ...HERO.fatos] : HERO.fatos

  return (
    <section className="abertura" aria-labelledby="abertura-titulo">
      <div className="container abertura__grade">
        <div className="abertura__texto">
          <h1 id="abertura-titulo" className="abertura__titulo abertura__entra" style={ordem(0)}>
            {HERO.title}
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

        <div className="abertura__palco abertura__entra" style={ordem(4)}>
          <PalcoDoTeclado />
        </div>
      </div>
    </section>
  )
}

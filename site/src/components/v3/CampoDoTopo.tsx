import type { CSSProperties } from 'react'
import { ORDEM_DA_CALIBRACAO, PONTOS_DA_CALIBRACAO } from '@/components/produto/calibracao'
import type { VarianteDoFundo } from '@/components/layout/FundoDaPagina'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { ANEL_DO_TOPO_INICIO_MS, ANEL_DWELL_MS, atrasoDeEntradaMs } from './ritmoDoCampo'
import './campo-de-calibracao.css'

/** Fração da tela (0 a 1) como porcentagem curta: 0,171 → "17.1%". */
const porcento = (fracao: number) => `${+(fracao * 100).toFixed(2)}%`

/** O ponto do anel de fixação do topo: o primeiro da ordem da calibração (o centro). */
const PONTO_DO_ANEL = ORDEM_DA_CALIBRACAO[0]

/**
 * O motivo dos 13 pontos no topo das páginas internas (rodada 4, 21/10/2026):
 * a mesma geometria do app e a mesma ordem de entrada do campo da abertura da
 * home, mas num momento só e parado depois, para a página de dentro ser
 * coerente com a home sem repetir a abertura dela.
 *
 * - Sem temporizador, sem observador e sem ponto que respira: depois da
 *   entrada (CSS) o campo é uma imagem parada.
 * - `padrao`: entrada na ordem da calibração e um anel de fixação que enche
 *   uma vez no ponto do centro.
 * - `calmo`: os pontos só assentam, todos juntos e mais apagados; sem anel.
 * - Movimento reduzido: os 13 pontos já no repouso, sem anel.
 * - Decorativo: fora do leitor de tela, nada recebe foco ou clique.
 */
export function CampoDoTopo({ variante = 'padrao' }: { variante?: VarianteDoFundo }) {
  const reduzido = useReducedMotion()
  const comAnel = variante === 'padrao' && !reduzido
  const estilo = {
    '--anel-inicio': `${ANEL_DO_TOPO_INICIO_MS}ms`,
    '--anel-dwell': `${ANEL_DWELL_MS}ms`,
    '--anel-passo': `${ANEL_DWELL_MS}ms`,
  } as CSSProperties

  return (
    <div
      className={`v3-campo v3-campo--topo v3-campo--${variante}${reduzido ? ' is-parado' : ''}`}
      style={estilo}
      aria-hidden="true"
    >
      {PONTOS_DA_CALIBRACAO.map((p, i) => (
        <div
          key={i}
          className="v3-campo__ponto"
          data-ponto={i}
          style={{ '--x': porcento(p.x), '--y': porcento(p.y), '--atraso': `${atrasoDeEntradaMs(i)}ms` } as CSSProperties}
        >
          <svg className="v3-campo__base" viewBox="0 0 40 40" focusable="false">
            <circle className="v3-campo__aro" cx="20" cy="20" r="15" />
            <circle className="v3-campo__miolo" cx="20" cy="20" r="2.4" />
          </svg>
          {comAnel && i === PONTO_DO_ANEL && (
            <svg className="v3-campo__fixa" viewBox="0 0 40 40" focusable="false" style={{ '--v': 0 } as CSSProperties}>
              <circle cx="20" cy="20" r="15" pathLength={1} />
            </svg>
          )}
        </div>
      ))}
    </div>
  )
}

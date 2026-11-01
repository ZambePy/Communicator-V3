import { TECLADO_DO_PALCO as T } from '@/data/home'
import './palco-do-teclado.css'

/**
 * O teclado do IrisFlow como demonstração, na abertura da home (desenho
 * aprovado em 31/10/2026; o dono preferiu o teclado de antes, só para mostrar,
 * em vez de um teclado que a pessoa usa): a frase sendo escrita, os seis
 * grupos do teclado em dois passos e o anel de fixação quase fechado no grupo
 * sob o olhar.
 *
 * É uma ilustração: um nome só para o leitor de tela (role="img"), nada que
 * receba foco, nada que responda ao ponteiro. Parada, a não ser pelo cursor
 * que pisca na frase (com movimento reduzido, parado também).
 */
export function PalcoDoTeclado() {
  return (
    <div className="palco" role="img" aria-label={T.descricao}>
      <div className="palco__barra">
        <p className="palco__frase">
          {T.frase}
          <span className="palco__cursor" />
        </p>
        <span className="palco__falar">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
            <path d="M3 8v4h3l4 3.5v-11L6 8H3Z" fill="currentColor" />
            <path d="M13 7.2a4 4 0 0 1 0 5.6M15.4 5a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {T.falar}
        </span>
      </div>

      <div className="palco__grade">
        {T.grupos.map((linhas, i) => (
          <span key={linhas.join('')} className={`palco__tecla${i === T.grupoNoOlhar ? ' is-alvo' : ''}`}>
            {linhas.length === 1 ? (
              <span className="palco__yz">
                {linhas[0]}
                <svg viewBox="0 0 24 12" aria-hidden="true" focusable="false">
                  <path d="M2 3v6h20V3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : (
              linhas.map((l) => <span key={l}>{l}</span>)
            )}
            {i === T.grupoNoOlhar && (
              <>
                <svg className="palco__anel" focusable="false">
                  <rect className="palco__anel-trilho" x="0" y="0" width="100%" height="100%" pathLength={1} />
                  <rect className="palco__anel-traco" x="0" y="0" width="100%" height="100%" pathLength={1} />
                </svg>
                <span className="palco__olhar" />
              </>
            )}
          </span>
        ))}
        <span className="palco__tecla palco__tecla--sugestoes">
          {T.sugestoes.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </span>
      </div>

      <p className="palco__legenda">
        <span>
          <b>{T.legendaForte}</b> {T.legenda}
        </span>
        <span>{T.legendaDepois}</span>
      </p>
    </div>
  )
}

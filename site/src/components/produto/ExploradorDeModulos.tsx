import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { MonitorTelas, CelularTela } from '@/components/home/Aparelhos'
import { Icon } from '@/components/ui/Icon'
import type { ModuloEmTela } from '@/data/produto'
import './explorador.css'

/**
 * Os módulos do app como uma lista de abas: à esquerda os nomes, à direita a
 * tela de verdade no monitor (e, quando o módulo também vive no celular, o
 * IrisFlow Cuidador na frente). Abas do WAI-ARIA: setas trocam, Home e End
 * vão às pontas, e só a aba ativa entra no Tab.
 */
export function ExploradorDeModulos({ modulos }: { modulos: ModuloEmTela[] }) {
  const [ativo, setAtivo] = useState(0)
  const base = useId()
  const abas = useRef<(HTMLButtonElement | null)[]>([])
  const m = modulos[ativo]

  const escolher = (i: number) => {
    setAtivo(i)
    abas.current[i]?.focus()
  }

  const teclado = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = modulos.length
    const mapa: Record<string, number> = {
      ArrowDown: (i + 1) % n,
      ArrowRight: (i + 1) % n,
      ArrowUp: (i - 1 + n) % n,
      ArrowLeft: (i - 1 + n) % n,
      Home: 0,
      End: n - 1,
    }
    if (!(e.key in mapa)) return
    e.preventDefault()
    escolher(mapa[e.key])
  }

  const comCelular = modulos.filter((x) => x.celular)

  return (
    <div className="explorador">
      <div className="explorador__abas" role="tablist" aria-label="Módulos do IrisFlow Communicator" aria-orientation="vertical">
        {modulos.map((mod, i) => (
          <button
            key={mod.id}
            ref={(el) => {
              abas.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${base}-aba-${mod.id}`}
            aria-selected={i === ativo}
            aria-controls={`${base}-painel`}
            tabIndex={i === ativo ? 0 : -1}
            className={`explorador__aba${i === ativo ? ' is-ativa' : ''}`}
            onClick={() => setAtivo(i)}
            onKeyDown={(e) => teclado(e, i)}
          >
            <Icon name={mod.icone} size={20} />
            <span>{mod.nome}</span>
          </button>
        ))}
      </div>

      <div className="explorador__painel" role="tabpanel" id={`${base}-painel`} aria-labelledby={`${base}-aba-${m.id}`}>
        <div className={`explorador__palco${m.celular ? ' tem-celular' : ''}`}>
          <MonitorTelas telas={modulos.map((x) => x.tela)} ativa={ativo} />
          <div className="explorador__celulares">
            {comCelular.map((x) => (
              <div key={x.id} className={`explorador__celular${x.id === m.id ? ' is-ativo' : ''}`}>
                <CelularTela src={x.celular!.src} alt={x.celular!.alt} decorativa={x.id !== m.id} />
              </div>
            ))}
          </div>
        </div>

        <div className="explorador__texto" key={m.id}>
          <div className="explorador__cabeca">
            <h2 className="explorador__nome">{m.nome}</h2>
            {m.estado === 'Experimental' && <span className="explorador__selo explorador__selo--exp">Experimental</span>}
            {m.plano && (
              <span className="explorador__selo">
                {m.plano.includes(' e ') ? 'Planos' : 'Plano'} {m.plano}
              </span>
            )}
          </div>
          <p className="explorador__resumo">{m.resumo}</p>
          <ul className="lista-check explorador__pontos">
            {m.pontos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {m.nota && <p className="explorador__nota">{m.nota}</p>}
        </div>
      </div>
    </div>
  )
}

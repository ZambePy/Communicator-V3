import { useEffect, useState } from 'react'
import { Reveal } from '@/components/effects/Reveal'
import {
  diagnosticar,
  MIN_MEMORIA,
  MIN_NUCLEOS,
  REC_NUCLEOS,
  TETO_REPORTADO,
  type Diagnostico,
} from '@/utils/compat'

/**
 * Bloco "Seu computador é compatível?", mostrado logo depois do cadastro
 * (/sucesso e /beta). A leitura só acontece depois da montagem, porque
 * depende do navegador do visitante. O CSS está em pages/sucesso.css.
 */
export function CompatCheck({ delay = 0 }: { delay?: number }) {
  const [diag, setDiag] = useState<Diagnostico | null>(null)

  useEffect(() => {
    setDiag(diagnosticar())
  }, [])

  if (!diag) return null

  return (
    <Reveal anim="up" delay={delay}>
      <section className={`compat compat--${diag.nivel}`} aria-live="polite">
        <h2 className="compat__title">Seu computador é compatível?</h2>
        <p className="compat__intro">
          Esta verificação lê apenas o que o navegador informa sobre esta máquina. Ela{' '}
          <strong>não liga a câmera e não pede nenhuma permissão</strong>: a webcam só é testada
          de verdade na primeira calibração, dentro do aplicativo, com a imagem real.
        </p>

        <p className="compat__verdict">
          <span className="compat__dot" aria-hidden="true" />
          {diag.titulo}
        </p>
        <p className="compat__text">{diag.texto}</p>

        <dl className="compat__list">
          {diag.linhas.map((l) => (
            <div key={l.rotulo}>
              <dt>{l.rotulo}</dt>
              <dd>{l.valor}</dd>
            </div>
          ))}
        </dl>

        <p className="compat__fine">
          Requisitos declarados: mínimo de {MIN_MEMORIA} GB de memória e {MIN_NUCLEOS} núcleos;
          recomendado 16 GB e {REC_NUCLEOS} núcleos. Nem todo navegador informa a memória, e
          nenhum reporta acima de {TETO_REPORTADO} GB — quando o dado falta, está dito acima em
          vez de estimado.
        </p>
      </section>
    </Reveal>
  )
}

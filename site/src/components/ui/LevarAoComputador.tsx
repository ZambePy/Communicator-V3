import { useState } from 'react'
import { SITE_URL } from '@/data/content'
import './levar-ao-computador.css'

/** No celular não se instala o app do computador: mandar o link para ele. */
export function LevarAoComputador() {
  const link = `${SITE_URL}/baixar`
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2400)
    } catch {
      /* sem permissão de área de transferência: o e-mail continua ali */
    }
  }
  return (
    <div className="levar-ao-computador">
      <p>
        O IrisFlow Communicator é instalado no computador do paciente. Abra este endereço nele:{' '}
        <strong>{link.replace(/^https?:\/\//, '')}</strong>
      </p>
      <div className="levar-ao-computador__acoes">
        <button type="button" className="btn btn--md btn--secondary" onClick={() => void copiar()}>
          <span className="btn__content">{copiado ? 'Link copiado' : 'Copiar o link'}</span>
        </button>
        <a
          className="btn btn--md btn--ghost"
          href={`mailto:?subject=${encodeURIComponent('Baixar o IrisFlow')}&body=${encodeURIComponent(link)}`}
        >
          <span className="btn__content">Enviar por e-mail</span>
        </a>
      </div>
      <span className="sr-only" aria-live="polite">
        {copiado ? 'Link copiado' : ''}
      </span>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { SITE_URL } from '@/data/content'
import './levar-ao-computador.css'

/** Quanto tempo a confirmação de "Link copiado" fica no botão. */
const CONFIRMACAO_MS = 2400
/** O aviso de que não deu para copiar fica mais tempo: tem uma instrução para ler. */
const AVISO_MS = 6000

/**
 * No celular não se instala o app do computador (nem se testa o computador):
 * mandar o link para ele. `caminho` é a página a abrir lá — /baixar por
 * padrão; o teste "Meu computador funciona?" manda /meu-computador.
 *
 * Copiar tem resposta à vista (rodada 4, 21/10/2026): o botão vira "Link
 * copiado", com a marca de confirmação, e a frase é anunciada. Se a área de
 * transferência recusar (permissão negada, página sem https, navegador antigo),
 * a pessoa lê o que fazer; antes o erro era engolido e nada mudava na tela.
 */
export function LevarAoComputador({ caminho = '/baixar' }: { caminho?: string }) {
  const link = `${SITE_URL}${caminho}`
  const [estado, setEstado] = useState<'ocioso' | 'copiado' | 'falhou'>('ocioso')
  const temporizador = useRef(0)

  useEffect(() => () => window.clearTimeout(temporizador.current), [])

  const mostrar = (novo: 'copiado' | 'falhou') => {
    setEstado(novo)
    window.clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setEstado('ocioso'), novo === 'copiado' ? CONFIRMACAO_MS : AVISO_MS)
  }

  const copiar = async () => {
    try {
      if (!navigator.clipboard) throw new Error('sem área de transferência')
      await navigator.clipboard.writeText(link)
      mostrar('copiado')
    } catch {
      mostrar('falhou')
    }
  }

  return (
    <div className="levar-ao-computador">
      <p>
        O IrisFlow Communicator é instalado no computador da pessoa. Abra este endereço nele:{' '}
        <strong>{link.replace(/^https?:\/\//, '')}</strong>
      </p>
      <div className="levar-ao-computador__acoes">
        <button type="button" className="btn btn--md btn--secondary" onClick={() => void copiar()}>
          <span className="btn__content">
            {estado === 'copiado' ? (
              <>
                <svg className="levar-ao-computador__ok" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 12.5 9.5 18 20 6.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Link copiado
              </>
            ) : (
              'Copiar o link'
            )}
          </span>
        </button>
        <a
          className="btn btn--md btn--ghost"
          href={`mailto:?subject=${encodeURIComponent('Baixar o IrisFlow')}&body=${encodeURIComponent(link)}`}
        >
          <span className="btn__content">Enviar por e-mail</span>
        </a>
      </div>
      {/* Anunciado ao leitor de tela; o aviso de falha também fica à vista. */}
      <p
        role="status"
        className={estado === 'falhou' ? 'levar-ao-computador__aviso' : 'sr-only'}
      >
        {estado === 'copiado' && 'Link copiado'}
        {estado === 'falhou' && 'Não consegui copiar. Selecione o endereço acima e copie com Ctrl+C, ou use o e-mail.'}
      </p>
    </div>
  )
}

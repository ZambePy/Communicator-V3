import { useDownloads } from '@/hooks/useDownloads'
import type { OS } from '@/lib/releases'
import { Icon } from './Icon'
import './download-panel.css'

type Props = {
  /** Chamado no clique de um instalador disponível (métrica da beta). */
  onDownload?: (os: OS) => void
  /** Esconde a nota de tela cheia / atualizações (quando a página já diz). */
  compact?: boolean
}

/**
 * Os três sistemas lado a lado, com o do visitante primeiro e destacado.
 *
 * Instalador no último release do GitHub (consultado em tempo de execução,
 * ver useDownloads) e sistema liberado em VITE_RELEASES_AVAILABLE = link
 * direto para o arquivo. Senão, botão desabilitado com "Em breve" e a mesma
 * palavra do resto do site ("em preparação"), em texto claro sobre superfície neutra
 * (legível; antes era texto escuro sobre fundo escuro). Enquanto a consulta
 * não volta, vale a configuração do build e o painel fica `aria-busy`.
 * Embaixo, "Todas as versões" — que também é a saída quando a API falha — e
 * a nota de tela cheia e de atualizações automáticas.
 */
export function DownloadPanel({ onDownload, compact = false }: Props) {
  const { platforms, detected, releasesPage, status } = useDownloads()

  return (
    <div className="dl" aria-busy={status === 'pending' || undefined}>
      <ul className="dl__grid">
        {platforms.map((p) => {
          const mine = p.os === detected
          const [main, ...others] = p.assets
          return (
            <li
              key={p.os}
              className={`dl__card${mine ? ' is-mine' : ''}${p.available ? '' : ' is-soon'}`}
            >
              <div className="dl__head">
                <h3 className="dl__name">{p.name}</h3>
                {mine && <span className="dl__badge">Seu sistema</span>}
                {!p.available && <span className="dl__badge dl__badge--soon">Em breve</span>}
              </div>
              <p className="dl__req">{p.requirement}</p>

              {p.available ? (
                <>
                  <a
                    className={`btn btn--md btn--full ${mine ? 'btn--teal' : 'btn--secondary'} dl__main`}
                    href={main.url}
                    rel="noopener"
                    onClick={() => onDownload?.(p.os)}
                  >
                    <span className="btn__content">
                      <Icon name="download" size={18} />
                      {main.label}
                    </span>
                  </a>
                  <p className="dl__detail">{main.detail}</p>
                  {others.map((a) => (
                    <a
                      key={a.file}
                      className="dl__alt"
                      href={a.url}
                      rel="noopener"
                      onClick={() => onDownload?.(p.os)}
                    >
                      {a.label} <span>· {a.detail}</span>
                    </a>
                  ))}
                </>
              ) : (
                <>
                  <button type="button" className="btn btn--md btn--full btn--secondary dl__main" disabled>
                    <span className="btn__content">{p.name} — Em breve</span>
                  </button>
                  <p className="dl__detail">
                    Versão para {p.name} em preparação. Avisamos por e-mail quem estiver inscrito na
                    beta.
                  </p>
                </>
              )}
            </li>
          )
        })}
      </ul>

      <div className="dl__foot">
        <a className="dl__all" href={releasesPage} target="_blank" rel="noopener noreferrer">
          Todas as versões
          <span className="sr-only"> (abre o GitHub em outra aba)</span>
        </a>
        {!compact && (
          <p className="dl__note">
            <Icon name="info" size={18} />
            <span>
              O IrisFlow abre em <strong>tela cheia</strong>, para os alvos ficarem grandes e nada
              distrair o olhar. Ele está em <strong>beta</strong>: recebe atualizações frequentes, e
              o próprio aplicativo baixa e instala as novas versões automaticamente.
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

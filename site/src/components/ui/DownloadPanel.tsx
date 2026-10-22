import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useJaLancou } from '@/hooks/useBetaProgram'
import { useDownloads } from '@/hooks/useDownloads'
import { diaEMes, diaPorExtenso } from '@/lib/lancamento'
import type { OS } from '@/lib/releases'
import { ehCelular } from '@/lib/aparelho'
import { SITE_URL } from '@/data/content'
import { ApkDoRelease } from './BaixarApk'
import { EtiquetaLancamento } from './EtiquetaLancamento'
import { Icon } from './Icon'
import { QrCode } from './QrCode'
import './download-panel.css'

type Props = {
  /** Chamado no clique de um instalador disponível (métrica da beta). */
  onDownload?: (os: OS) => void
  /** Esconde a nota de tela cheia / atualizações (quando a página já diz). */
  compact?: boolean
  /**
   * Data do lançamento da beta (beta_program.launch_at). Antes dela, os
   * sistemas publicados aparecem travados, com o selo da beta do dia, e
   * nenhum link de arquivo sai do painel. Depois, liberam sozinhos.
   */
  liberaEm?: string | null
  /**
   * Páginas públicas (Solução): mostra os sistemas e a situação de cada um,
   * sem link de arquivo — o download fica para quem passou pela inscrição
   * (conta → pesquisa → download). A página põe a chamada para a beta embaixo.
   */
  vitrine?: boolean
  /**
   * O app do cuidador (Android) embaixo dos instaladores. Padrão: sim. A
   * /baixar desliga, porque lá ele tem o cartão próprio.
   */
  apk?: boolean
  /** O link "Meu computador funciona?". Padrão: sim; a própria página do teste desliga. */
  teste?: boolean
}

/**
 * Os três sistemas lado a lado, com o do visitante primeiro e destacado.
 *
 * Instalador no último release do GitHub (consultado em tempo de execução,
 * ver useDownloads) e sistema liberado em VITE_RELEASES_AVAILABLE = link
 * direto para o arquivo. Senão, botão desabilitado com "Em breve" e a mesma
 * palavra do resto do site ("em preparação"). Enquanto a consulta não
 * volta, vale a configuração do build e o painel fica `aria-busy`.
 *
 * Embaixo: o teste "Meu computador funciona?" (pedido do dono, 19/10/2026),
 * o app do cuidador para Android — o .apk do mesmo release, que o painel
 * ignorava (relato de 19/10/2026) —, "Todas as versões" (também a saída
 * quando a API falha) e a nota de tela cheia e de atualizações automáticas;
 * as duas últimas só quando há download de verdade (nem travado pelo
 * lançamento, nem vitrine).
 */
export function DownloadPanel({
  onDownload,
  compact = false,
  liberaEm = null,
  vitrine = false,
  apk = true,
  teste = true,
}: Props) {
  const { platforms, detected, releasesPage, status } = useDownloads()
  const lancou = useJaLancou(liberaEm ?? '')
  const travado = !lancou
  const baixa = !travado && !vitrine
  const dia = liberaEm ? diaEMes(liberaEm) : ''

  return (
    <div className="dl" aria-busy={status === 'pending' || undefined}>
      <ul className="dl__grid">
        {platforms.map((p) => {
          const mine = p.os === detected
          const [main, ...others] = p.assets
          return (
            <li
              key={p.os}
              className={`dl__card${mine ? ' is-mine' : ''}${p.available ? '' : ' is-soon'}${
                p.available && travado ? ' is-locked' : ''
              }`}
            >
              <div className="dl__head">
                <h3 className="dl__name">{p.name}</h3>
                {mine && <span className="dl__badge">Seu sistema</span>}
                {!p.available && <span className="dl__badge dl__badge--soon">Em breve</span>}
                {p.available && travado && liberaEm && (
                  <EtiquetaLancamento lancamento={liberaEm} variante="curta" />
                )}
              </div>
              <p className="dl__req">{p.requirement}</p>

              {!p.available ? (
                <>
                  <button type="button" className="btn btn--md btn--full btn--secondary dl__main" disabled>
                    <span className="btn__content">{p.name}: em breve</span>
                  </button>
                  <p className="dl__detail">
                    Versão para {p.name} em preparação. Avisamos por e-mail quem estiver inscrito na
                    beta.
                  </p>
                </>
              ) : travado ? (
                <>
                  <button type="button" className="btn btn--md btn--full btn--secondary dl__main" disabled>
                    <span className="btn__content">
                      <Icon name="cadeado" size={18} />
                      Disponível em {dia}
                    </span>
                  </button>
                  <p className="dl__detail">
                    O download abre no lançamento, em {liberaEm ? diaPorExtenso(liberaEm) : dia}.
                    {vitrine ? ' Inscreva-se antes para receber o acesso.' : ''}
                  </p>
                </>
              ) : vitrine ? (
                <p className="dl__detail dl__detail--ok">
                  <Icon name="check" size={18} /> Disponível para quem se inscreve na beta.
                </p>
              ) : (
                <>
                  <a
                    className={`btn btn--md btn--full ${mine ? 'btn--primary' : 'btn--secondary'} dl__main`}
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
                      {a.label} <span>({a.detail})</span>
                    </a>
                  ))}
                </>
              )}
            </li>
          )
        })}
      </ul>

      {teste && (
        <p className="dl__teste">
          <Icon name="monitor" size={20} />
          <span>
            Antes de baixar,{' '}
            <Link to="/meu-computador" className="link-ok">
              veja se o seu computador funciona
            </Link>
            : câmera, placa de vídeo, processador e memória, aqui no navegador.
          </span>
        </p>
      )}

      {apk && !vitrine && <AppDoCuidador liberaEm={liberaEm} />}

      {baixa && (
        <div className="dl__foot">
          <a className="dl__all" href={releasesPage} target="_blank" rel="noopener noreferrer">
            Todas as versões
            <span className="sr-only"> (abre o GitHub em outra aba)</span>
          </a>
          {!compact && (
            <div className="dl__note">
              <Icon name="info" size={18} />
              <div className="dl__note-texto">
                <p>
                  O IrisFlow abre em <strong>tela cheia</strong>, para os alvos ficarem grandes e nada
                  distrair o olhar. Ele está em <strong>beta</strong>: recebe atualizações frequentes, e
                  o próprio aplicativo baixa e instala as novas versões automaticamente.
                </p>
                <p className="dl__smartscreen">
                  Na hora de instalar, o Windows pode mostrar “O Windows protegeu o computador”, porque o
                  instalador ainda não tem assinatura digital. Clique em <strong>Mais informações</strong>{' '}
                  e depois em <strong>Executar assim mesmo</strong>.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * O IrisFlow Cuidador para Android, com o APK do mesmo release dos
 * instaladores (useDownloads). No computador, um código QR leva o celular de
 * quem cuida direto ao arquivo (/app); no celular, o botão já basta. Antes do
 * lançamento, o dia (a mesma trava do computador). Release sem o APK: o aviso,
 * no lugar de um link que daria 404. Site sem APK configurado: nada.
 *
 * Usado dentro do painel e sozinho nas páginas que, no celular, trocam o
 * painel por "leve este link para o computador" (/beta, /perfil).
 */
export function AppDoCuidador({ liberaEm = null }: { liberaEm?: string | null }) {
  const { apk } = useDownloads()
  const lancou = useJaLancou(liberaEm ?? '')
  const titulo = useId()
  if (apk.situacao === 'nao-oferecido') return null
  const celular = ehCelular()

  return (
    <section className="dl__celular" aria-labelledby={titulo}>
      <img className="dl__celular-icone" src="/brand/cuidador-icone.png" alt="" width={48} height={48} />
      <div className="dl__celular-texto">
        <h3 id={titulo} className="dl__name">
          IrisFlow Cuidador para Android
        </h3>
        <p className="dl__req">Para o celular de quem cuida. Entra com a mesma conta.</p>
        <ApkDoRelease lancou={lancou} liberaEm={liberaEm ?? ''} compacto={!celular} />
      </div>
      {!celular && apk.situacao === 'disponivel' && lancou && (
        <div className="dl__celular-qr">
          <QrCode valor={`${SITE_URL}/app`} tamanho={104} rotulo="Código QR que abre o download do app no celular" />
          <span>Aponte a câmera do celular</span>
        </div>
      )}
    </section>
  )
}

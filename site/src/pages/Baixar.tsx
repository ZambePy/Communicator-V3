import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { DownloadPanel } from '@/components/ui/DownloadPanel'
import { QrCode } from '@/components/ui/QrCode'
import { SelosDasLojas } from '@/components/ui/SelosDasLojas'
import { EtiquetaLancamento } from '@/components/ui/EtiquetaLancamento'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { diaPorExtenso } from '@/lib/lancamento'
import { ehCelular } from '@/lib/aparelho'
import { BETA, BETA_CTA, SITE_URL } from '@/data/content'
import '@/components/home/home.css'
import './baixar.css'

/** No celular não se instala o app do computador: mandar o link para ele. */
function LevarAoComputador() {
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

/**
 * /baixar — os dois aplicativos, como nos produtos que distribuem app pelo
 * site: o do computador com o sistema do visitante na frente, o do celular
 * com os selos das lojas (e um código QR no computador). Antes do lançamento,
 * os instaladores aparecem travados com o dia; depois, liberam sozinhos. O
 * download é público: quem instala entra no app com a conta criada na beta.
 */
export default function Baixar() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const celular = ehCelular()

  const communicator = (
    <Reveal as="article" anim="up" className="baixar-app" id="communicator">
      <header className="baixar-app__cabeca">
        <img src="/brand/irisflow-simbolo.svg" alt="" width={48} height={48} />
        <div>
          <h2 className="baixar-app__nome">IrisFlow Communicator</h2>
          <p className="baixar-app__para">Para o computador do paciente</p>
        </div>
      </header>
      {celular ? <LevarAoComputador /> : <DownloadPanel liberaEm={program.launchAt} />}
    </Reveal>
  )

  const cuidador = (
    <Reveal as="article" anim="up" className="baixar-app" id="cuidador">
      <header className="baixar-app__cabeca">
        <img className="baixar-app__icone" src="/brand/cuidador-icone.png" alt="" width={48} height={48} />
        <div>
          <h2 className="baixar-app__nome">IrisFlow Cuidador</h2>
          <p className="baixar-app__para">Para o celular de quem cuida</p>
        </div>
      </header>
      <div className="baixar-app__lojas">
        <div>
          <SelosDasLojas />
          <Link to="/cuidador" className="link-seta">
            O que o app faz
          </Link>
        </div>
        {!celular && (
          <div className="baixar-app__qr">
            <QrCode valor={`${SITE_URL}/app`} tamanho={112} rotulo="Código QR que abre a loja de aplicativos do celular" />
            <span>Aponte a câmera do celular</span>
          </div>
        )}
      </div>
    </Reveal>
  )

  return (
    <>
      <section className="baixar-hero on-dark" aria-labelledby="baixar-titulo">
        <AmbientBackground />
        <div className="container baixar-hero__inner">
          {BETA.ativo && !lancou && (
            <p className="hero-produto__aviso anim-entrada">
              <EtiquetaLancamento lancamento={program.launchAt} variante="curta" />
              <span>Download a partir de {diaPorExtenso(program.launchAt)}</span>
            </p>
          )}
          <h1 id="baixar-titulo" className="baixar-hero__titulo anim-entrada anim-entrada--2">
            Baixe o IrisFlow
          </h1>
          <p className="baixar-hero__lead anim-entrada anim-entrada--3">
            {lancou
              ? 'Um app para o computador do paciente e outro para o celular de quem cuida. Os dois entram com a mesma conta.'
              : 'Crie a conta agora e entre no primeiro dia. Os dois apps usam a mesma conta: a do computador do paciente e a do celular de quem cuida.'}
          </p>
        </div>
      </section>

      <section className="baixar-apps on-light">
        <div className="container baixar-apps__lista">
          {/* No celular, o que dá para instalar ali vem primeiro. */}
          {celular ? (
            <>
              {cuidador}
              {communicator}
            </>
          ) : (
            <>
              {communicator}
              {cuidador}
            </>
          )}
        </div>
      </section>

      <section className="baixar-passos on-dark" aria-labelledby="comecar-titulo">
        <AmbientBackground variante="suave" />
        <div className="container baixar-passos__inner">
          <h2 id="comecar-titulo" className="titulo-capitulo">
            Para começar
          </h2>
          <ol className="passos">
            <li className="passo">
              <span className="passo__numero" aria-hidden="true">1</span>
              <h3 className="passo__titulo">Crie a conta</h3>
              <p>
                Na <Link to={BETA_CTA.to}>página da beta</Link>, com e-mail e senha. Um código de 4
                dígitos confirma o e-mail.
              </p>
            </li>
            <li className="passo">
              <span className="passo__numero" aria-hidden="true">2</span>
              <h3 className="passo__titulo">Instale e entre</h3>
              <p>No computador, abra o IrisFlow Communicator e entre com a mesma conta.</p>
            </li>
            <li className="passo">
              <span className="passo__numero" aria-hidden="true">3</span>
              <h3 className="passo__titulo">Calibre</h3>
              <p>A pessoa acompanha alguns pontos com o olhar. Leva cerca de meio minuto.</p>
            </li>
          </ol>
        </div>
      </section>
    </>
  )
}

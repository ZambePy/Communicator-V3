import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { CelularDemo, CelularTela } from '@/components/home/Aparelhos'
import { QrCode } from '@/components/ui/QrCode'
import { SelosDasLojas } from '@/components/ui/SelosDasLojas'
import { ApkDoRelease } from '@/components/ui/BaixarApk'
import { Icon } from '@/components/ui/Icon'
import { FraseQueChega } from '@/components/cuidador/FraseQueChega'
import { CUIDADOR, PASSOS_DO_CUIDADOR, RECURSOS_DO_CUIDADOR } from '@/data/cuidador'
import { SITE_URL, BETA, BETA_CTA } from '@/data/content'
import { DEMO_CUIDADOR } from '@/data/home'
import { LOJAS } from '@/lib/lojas'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import '@/components/home/home.css'
import './cuidador.css'
import { FundoDaPagina } from '@/components/layout/FundoDaPagina'

/**
 * O IrisFlow Cuidador: a página do app de celular. Pensada primeiro para o
 * celular — é nele que quem chega aqui vai instalar. No computador, um código
 * QR leva o celular direto para a loja certa (/app).
 */
export default function Cuidador() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  return (
    <>
      <FundoDaPagina />
      <section className="cuidador-hero on-dark" aria-labelledby="cuidador-titulo">
        <div className="container cuidador-hero__grade">
          <div className="cuidador-hero__texto">
            <img
              className="cuidador-hero__marca anim-entrada"
              src="/brand/irisflow-cuidador-negativo.svg"
              alt="IrisFlow Cuidador"
              width={141}
              height={152}
            />
            <h1 id="cuidador-titulo" className="cuidador-hero__titulo anim-entrada anim-entrada--2">
              {CUIDADOR.titulo}
            </h1>
            <p className="cuidador-hero__lead anim-entrada anim-entrada--3">{CUIDADOR.lead}</p>
            <div className="anim-entrada anim-entrada--4">
              <SelosDasLojas tom="claro" />
            </div>
            <div className="cuidador-hero__qr anim-entrada anim-entrada--5">
              <QrCode valor={`${SITE_URL}/app`} rotulo="Código QR que abre a loja de aplicativos do celular" />
              <p>
                Aponte a câmera do celular para o código: ele abre a loja certa, no iPhone ou no
                Android.
              </p>
            </div>
          </div>
          <div className="cuidador-hero__aparelho anim-entrada anim-entrada--3">
            <CelularDemo demo={DEMO_CUIDADOR} />
            <p className="cuidador-hero__legenda">Gravação real do app, com dados de demonstração.</p>
          </div>
        </div>
      </section>

      <section className="cuidador-recursos on-raised" aria-labelledby="recursos-titulo">
        <div className="container">
          <Reveal anim="up">
            <h2 id="recursos-titulo" className="titulo-capitulo">
              O que você precisa, no celular.
            </h2>
          </Reveal>
          {/* No celular a lista rola na horizontal: focável, para rolar pelo teclado. */}
          <ul className="cuidador-recursos__lista" tabIndex={0} aria-label="O que o app faz (no celular, role para o lado)">
            {RECURSOS_DO_CUIDADOR.map((r, i) => (
              <Reveal key={r.id} as="li" anim="up" delay={70 * i} className="recurso">
                <CelularTela src={r.tela.src} alt={r.tela.alt} />
                <div className="recurso__texto">
                  <h3 className="recurso__titulo">{r.titulo}</h3>
                  <p>{r.texto}</p>
                  {r.nota && <p className="recurso__nota">{r.nota}</p>}
                  {r.plano && <span className="recurso__plano">Planos {r.plano}</span>}
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="cuidador-passos on-dark" aria-labelledby="passos-titulo">
        <div className="container">
          {/* A frase indo do computador ao celular: o que a mesma conta faz
              (o único trecho da página que se mexe sozinho, uma vez). */}
          <div className="cuidador-passos__cabeca">
            <Reveal anim="up">
              <h2 id="passos-titulo" className="titulo-capitulo">
                Uma conta, três lugares.
              </h2>
              <p className="texto-capitulo">
                O site, o computador da pessoa e o celular de quem cuida usam a mesma conta. Não
                existe código de pareamento para digitar.
              </p>
            </Reveal>
            <FraseQueChega />
          </div>
          <ol className="passos">
            {PASSOS_DO_CUIDADOR.map((p, i) => (
              <Reveal key={p.titulo} as="li" anim="up" delay={90 * i} className="passo">
                <span className="passo__numero" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="passo__titulo">{p.titulo}</h3>
                <p>{p.texto}</p>
              </Reveal>
            ))}
          </ol>
          {BETA.ativo && (
            <Link to={BETA_CTA.to} className="link-seta">
              Criar a conta na beta
            </Link>
          )}
        </div>
      </section>

      <section className="cuidador-disponivel on-raised" id="disponibilidade" aria-labelledby="disponivel-titulo">
        <div className="container cuidador-disponivel__inner">
          <div>
            <h2 id="disponivel-titulo" className="titulo-capitulo">
              Onde baixar
            </h2>
            <ul className="disponibilidade">
              <li>
                <strong>Android</strong>
                <span>
                  {LOJAS.googlePlay ? 'Google Play.' : 'Chega ao Google Play em breve.'}
                  {LOJAS.apk && ' Na beta, instale pelo arquivo APK:'}
                </span>
                {/* A mesma trava dos instaladores do computador: o arquivo sai
                    no dia do lançamento da beta. */}
                <ApkDoRelease lancou={lancou} liberaEm={program.launchAt} />
              </li>
              <li>
                <strong>iPhone</strong>
                <span>{LOJAS.appStore ? 'App Store.' : 'Chega à App Store em breve.'}</span>
              </li>
            </ul>
            <SelosDasLojas />
          </div>
          <p className="cuidador-disponivel__privacidade">
            <Icon name="cadeado" size={22} />
            <span>
              O app recebe só o que a pessoa escolheu dizer, os alertas e os números de uso. Nenhuma
              imagem da câmera sai do computador.
            </span>
          </p>
        </div>
      </section>
    </>
  )
}

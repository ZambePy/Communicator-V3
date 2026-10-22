import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { BaixarApk } from '@/components/ui/BaixarApk'
import { Icon } from '@/components/ui/Icon'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { ehAndroid, ehCelular } from '@/lib/aparelho'
import { LOJAS } from '@/lib/lojas'
import {
  abrirNoApp,
  codigoCapturado,
  emNavegadorDeOutroApp,
  linkDoAndroid,
  linkDoApp,
  MARCA_SEM_APP,
  ROTA_DO_PAREAMENTO,
} from '@/lib/pareamento'
import { FundoDaPagina } from '@/components/layout/FundoDaPagina'
import './parear.css'

/**
 * /parear — a ponte entre o código QR do computador e o app do cuidador
 * (pedido do dono de 19/10/2026: conectar o celular sem digitar código nem
 * senha).
 *
 * O QR leva a /parear#t=<código>. O main.tsx já tirou o código da barra de
 * endereço (lib/pareamento.ts); aqui ele só é passado ao app — nunca a um
 * servidor, nunca ao armazenamento do navegador. No Android a página tenta
 * abrir o app sozinha (o link "intent" com o pacote do app: sem o app, o
 * Chrome volta para cá com #sem-app). Em qualquer aparelho fica o botão,
 * porque há navegador que só abre outro app depois de um toque; se depois
 * de alguns segundos a página continua na frente, ela explica e oferece o
 * download. Feita só com componentes e classes que já existem: o visual
 * acompanha o resto do site.
 */

/** Quanto esperar o app abrir antes de oferecer ajuda. */
export const ESPERA_DO_APP_MS = 2_500

export default function Parear() {
  const [codigo] = useState(codigoCapturado)
  const [naoAbriu, setNaoAbriu] = useState(false)
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const celular = ehCelular()
  const android = ehAndroid()
  const embutido = emNavegadorDeOutroApp()
  const semApp = typeof window !== 'undefined' && window.location.hash === MARCA_SEM_APP
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)

  const link =
    codigo && celular
      ? android
        ? linkDoAndroid(codigo, `${window.location.origin}${ROTA_DO_PAREAMENTO}${MARCA_SEM_APP}`)
        : linkDoApp(codigo)
      : null

  /**
   * Depois de pedir o app: se a página continua visível depois da espera, o
   * app não abriu. Quando ele abre, o navegador vai para trás e a página fica
   * escondida.
   */
  const vigiarAbertura = useCallback(() => {
    if (espera.current) clearTimeout(espera.current)
    espera.current = setTimeout(() => {
      if (document.visibilityState === 'visible') setNaoAbriu(true)
    }, ESPERA_DO_APP_MS)
  }, [])

  useEffect(() => {
    // Tentativa automática só no Android: o intent tem volta limpa sem o app.
    // No iPhone, um link de app que não existe mostra um alerta de erro do
    // Safari — lá a pessoa toca no botão.
    if (!link || !android || embutido) return
    abrirNoApp(link)
    vigiarAbertura()
  }, [link, android, embutido, vigiarAbertura])

  useEffect(
    () => () => {
      if (espera.current) clearTimeout(espera.current)
    },
    [],
  )

  // Onde baixar, pelo que está configurado (lib/lojas.ts) — a mesma regra da /app.
  let ondeBaixar: ReactNode
  if (android && LOJAS.googlePlay) {
    ondeBaixar = (
      <div className="actions-row">
        <Button href={LOJAS.googlePlay} size="lg" icon={<Icon name="download" size={20} />}>
          Baixar no Google Play
        </Button>
      </div>
    )
  } else if (android && LOJAS.apk) {
    ondeBaixar = <BaixarApk lancou={lancou} liberaEm={program.launchAt} compacto />
  } else if (!android && LOJAS.appStore) {
    ondeBaixar = (
      <div className="actions-row">
        <Button href={LOJAS.appStore} size="lg" icon={<Icon name="download" size={20} />}>
          Baixar na App Store
        </Button>
      </div>
    )
  } else if (!android) {
    ondeBaixar = (
      <p className="texto-capitulo">
        No iPhone, o IrisFlow Cuidador ainda não está na App Store.{' '}
        <Link to="/cuidador#disponibilidade" className="link-ok">
          Veja quando ele chega
        </Link>
        .
      </p>
    )
  } else {
    ondeBaixar = (
      <p className="texto-capitulo">
        <Link to="/cuidador" className="link-ok">
          Veja como baixar o IrisFlow Cuidador
        </Link>
        .
      </p>
    )
  }

  const download = (
    <div className="stack">
      {ondeBaixar}
      <p className="texto-capitulo">
        Depois de instalar, gere um código novo no computador da pessoa e aponte a câmera do celular para ele de
        novo: cada código vale só por 3 minutos.
      </p>
    </div>
  )

  let titulo: string
  let conteudo: ReactNode
  if (link && !embutido) {
    titulo = 'Abrindo o IrisFlow Cuidador…'
    conteudo = (
      <>
        <p className="texto-capitulo">
          O celular vai entrar na conta da família sem senha. No app, confirme tocando em Conectar este celular.
        </p>
        <div className="actions-row">
          <Button href={link} externo={false} size="lg" icon={<Icon name="olho" size={20} />} onClick={vigiarAbertura}>
            Abrir o IrisFlow Cuidador
          </Button>
        </div>
        <p className="texto-capitulo">
          O código vale uma vez só, por 3 minutos. Esta página não guarda nem envia o código: ele vai direto para o app.
        </p>
        {naoAbriu && (
          <div className="stack" role="status">
            <h2 className="titulo-capitulo">O app não abriu?</h2>
            <p className="texto-capitulo">Talvez ele ainda não esteja instalado neste celular.</p>
            {download}
          </div>
        )}
      </>
    )
  } else if (codigo && embutido) {
    titulo = 'Abra pela câmera do celular'
    conteudo = (
      <p className="texto-capitulo">
        Este endereço foi aberto por dentro de outro aplicativo, que não consegue abrir o IrisFlow Cuidador. Feche esta
        tela e aponte a câmera do celular (o app Câmera) para o código no computador de novo.
      </p>
    )
  } else if (codigo) {
    titulo = 'Este código é para o celular'
    conteudo = (
      <p className="texto-capitulo">
        Aponte a câmera do celular de quem cuida para o código que está na tela do computador. O celular abre o app
        e entra na conta da família.
      </p>
    )
  } else if (semApp) {
    titulo = 'Falta instalar o IrisFlow Cuidador'
    conteudo = (
      <>
        <p className="texto-capitulo">O app do cuidador ainda não está neste celular.</p>
        {download}
      </>
    )
  } else {
    titulo = 'Conectar o celular do cuidador'
    conteudo = (
      <>
        <p className="texto-capitulo">
          Esta página abre o app IrisFlow Cuidador com o código que aparece no computador. Para conectar um celular:
        </p>
        <ol className="texto-capitulo parear__passos">
          <li>No computador da pessoa, abra Configurações e clique em Mostrar o código.</li>
          <li>Aponte a câmera do celular para o código e toque no endereço que aparecer.</li>
          <li>No app, toque em Conectar este celular.</li>
        </ol>
        <p className="texto-capitulo">
          Se esta página abriu depois de recarregar, gere um código novo no computador: por segurança, ela não guarda o
          código.
        </p>
        <div className="parear__acoes">
          <Button to="/cuidador" variant="secondary">
            Conhecer o app do cuidador
          </Button>
        </div>
      </>
    )
  }

  return (
    <section className="section on-raised parear">
      <FundoDaPagina variante="calmo" />
      <div className="container container--narrow stack">
        <h1 className="titulo-capitulo">{titulo}</h1>
        {conteudo}
      </div>
    </section>
  )
}

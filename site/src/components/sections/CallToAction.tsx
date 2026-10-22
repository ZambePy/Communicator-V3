import { Fragment } from 'react'
import { AlvosDeCalibracao } from '@/components/effects/Ilustracoes'
import { Button } from '@/components/ui/Button'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { diaPorExtenso } from '@/lib/lancamento'
import { BETA, BETA_CTA, TRIAL_DAYS } from '@/data/content'
import './cta.css'

type Acao = { label: string; to: string }

type Props = {
  /**
   * O fecho da página, em uma ou duas frases curtas (uma por linha no
   * computador). Sem ele, é o fecho da home. Cada página de dentro passa o
   * seu: a mesma frase copiada em sete rotas perdia a força (auditoria de
   * 21/10/2026, P2-16).
   */
  titulo?: string | readonly [string, string]
  /** A frase de apoio. Sem ela, a da home. */
  texto?: string
  /**
   * O botão principal, quando não é o do download. Sem ele: "Entrar na beta"
   * antes do lançamento, "Baixar grátis" depois (um caminho só para o download).
   */
  principal?: Acao
  /** O botão de apoio; sem ele, "Falar com a equipe". `false` tira o botão. */
  secundario?: Acao | false
}

const TITULO_DA_HOME = ['A pessoa continua lá.', 'Só falta a voz.'] as const

/** Chamada final das páginas de conteúdo: uma frase, duas ações e, antes do
 *  lançamento, o dia em que o download abre. É a única faixa no azul da
 *  marca, chapado — o fecho de toda página —, com a tela da calibração ao
 *  lado: o primeiro passo depois do clique. */
export function CallToAction({ titulo = TITULO_DA_HOME, texto, principal, secundario }: Props = {}) {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const linhas = typeof titulo === 'string' ? [titulo] : titulo
  const apoio =
    texto ??
    `Instale no computador que já está em casa e veja se funciona no seu caso. ${
      BETA.ativo ? 'É grátis na beta e não pede cartão.' : 'Sem cartão para começar.'
    }`
  const doDownload = !principal

  return (
    <section className="cta" aria-labelledby="cta-titulo">
      <div className="container cta__inner">
        <div className="cta__texto">
          <h2 id="cta-titulo" className="cta__title">
            {linhas.map((linha, i) => (
              <Fragment key={linha}>
                {i > 0 && ' '}
                <span>{linha}</span>
              </Fragment>
            ))}
          </h2>

          <p className="cta__lead">{apoio}</p>

          <div className="cta__actions">
            {principal ? (
              <Button to={principal.to} size="lg" variant="teal" chamada>
                {principal.label}
              </Button>
            ) : BETA.ativo ? (
              <Button to={lancou ? '/baixar' : BETA_CTA.to} size="lg" variant="teal" chamada>
                {lancou ? 'Baixar grátis' : BETA_CTA.labelLong}
              </Button>
            ) : (
              <Button to="/cadastro" size="lg" variant="teal" chamada>
                Começar os {TRIAL_DAYS} dias gratuitos
              </Button>
            )}
            {secundario !== false && (
              <Button to={secundario?.to ?? '/contato'} size="lg" variant="secondary">
                {secundario?.label ?? 'Falar com a equipe'}
              </Button>
            )}
          </div>

          {doDownload && BETA.ativo && (
            <p className="cta__data">
              {lancou
                ? `Download gratuito para ${BETA.sistemaDoLancamento}`
                : `Download a partir de ${diaPorExtenso(program.launchAt)}`}
            </p>
          )}
        </div>

        <figure className="cta__desenho">
          <AlvosDeCalibracao />
          <figcaption>Os 13 pontos da calibração, a primeira tela do IrisFlow.</figcaption>
        </figure>
      </div>
    </section>
  )
}

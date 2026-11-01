import { Fragment } from 'react'
import { Reveal } from '@/components/effects/Reveal'
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
  /** A frase de apoio. Sem ela, a padrão; `false` tira a frase (o fecho da home). */
  texto?: string | false
  /**
   * O botão principal, quando não é o do download. Sem ele: "Entrar na beta"
   * antes do lançamento, "Baixar grátis" depois (um caminho só para o download).
   */
  principal?: Acao
  /** O botão de apoio; sem ele, "Falar com a equipe". `false` tira o botão. */
  secundario?: Acao | false
}

const TITULO_DA_HOME = ['A pessoa continua lá.', 'Só falta a voz.'] as const

/** Chamada final das páginas de conteúdo: uma frase grande, duas ações e,
 *  antes do lançamento, o dia em que o download abre. Desde 31/10/2026 (o
 *  fecho do desenho aprovado da home) é uma faixa da noite que corre direto
 *  para o rodapé, sem fundo vivo nem painel ao lado: a frase é o desenho. */
export function CallToAction({ titulo = TITULO_DA_HOME, texto, principal, secundario }: Props = {}) {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const linhas = typeof titulo === 'string' ? [titulo] : titulo
  const apoio =
    texto === false
      ? null
      : texto ??
    `Instale no computador que já está em casa e veja se funciona no seu caso. ${
      BETA.ativo ? 'É grátis na beta e não pede cartão.' : 'Sem cartão para começar.'
    }`
  const doDownload = !principal

  return (
    <section className="cta" aria-labelledby="cta-titulo">
      <div className="container cta__inner">
        <Reveal>
          <h2 id="cta-titulo" className="cta__title">
            {linhas.map((linha, i) => (
              <Fragment key={linha}>
                {i > 0 && ' '}
                <span>{linha}</span>
              </Fragment>
            ))}
          </h2>
          {apoio && <p className="cta__lead">{apoio}</p>}
        </Reveal>

        <Reveal className="cta__actions" delay={80}>
          {principal ? (
            <Button to={principal.to} size="lg" variant="teal" chamada>
              {principal.label}
            </Button>
          ) : BETA.ativo ? (
            <Button to={lancou ? '/baixar' : BETA_CTA.to} size="lg" variant="teal" chamada>
              {lancou ? `Baixar grátis para ${BETA.sistemaDoLancamento}` : BETA_CTA.labelLong}
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
        </Reveal>

        {doDownload && BETA.ativo && !lancou && (
          <p className="cta__data">Download a partir de {diaPorExtenso(program.launchAt)}</p>
        )}
      </div>
    </section>
  )
}

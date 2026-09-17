import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { SessionLoading } from '@/components/ui/Skeleton'
import { useAccount } from '@/context/AccountContext'
import { brl, daysUntil, formatDate } from '@/utils/format'
import { useDownloads } from '@/hooks/useDownloads'
import { LinkedDevices } from '@/components/sections/LinkedDevices'
import { BETA, BETA_CTA, TRIAL_DAYS } from '@/data/content'
import { usePlans } from '@/hooks/usePlans'
import './checkout.css'
import './conta.css'

const STATUS_LABEL = {
  avaliacao: { text: 'Em avaliação gratuita', tone: 'tag--wip' },
  ativa: { text: 'Assinatura ativa', tone: 'tag--ok' },
  cancelada: { text: 'Cancelada', tone: 'tag--neutral' },
  inadimplente: { text: 'Pagamento pendente', tone: 'tag--wip' },
} as const

export default function Conta() {
  const { account, authenticated, loading, sessionError, cancel, reactivate, refresh, signOut } =
    useAccount()
  const navigate = useNavigate()
  const downloads = useDownloads()
  const { getPlan } = usePlans()
  const [confirming, setConfirming] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  const executar = async (acao: () => Promise<void>) => {
    setOcupado(true)
    setFalha(null)
    try {
      await acao()
      setConfirming(false)
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível concluir a operação.')
    } finally {
      setOcupado(false)
    }
  }

  if (loading) return <SessionLoading />

  // A conta não veio, mas não porque não existe: a leitura falhou por rede.
  // Mandar para /cadastro aqui afirmaria "seu cadastro está pela metade", que
  // é falso, e para /entrar afirmaria que a sessão acabou, também falso.
  if (!account && sessionError) {
    return (
      <div className="flow">
        <div className="container container--narrow flow__inner">
          <div className="notice notice--warn" role="alert">
            <span className="notice__icon">
              <Icon name="alerta" size={20} />
            </span>
            <p>
              Não foi possível carregar os dados da sua conta ({sessionError}). Você continua
              conectado — isto é uma falha de conexão com o servidor, não um problema no seu
              cadastro.
            </p>
          </div>
          <div style={{ marginTop: 'var(--sp-5)' }}>
            <Button onClick={() => void refresh()}>Tentar de novo</Button>
          </div>
        </div>
      </div>
    )
  }

  // logado mas sem assinatura: o cadastro ficou pela metade (na beta, o
  // cadastro é a própria página /beta)
  if (!account) {
    const destino = BETA.ativo ? BETA_CTA.to : '/cadastro'
    return <Navigate to={authenticated ? destino : '/entrar'} replace />
  }

  // Conta do programa beta: nada de cobrança, forma de pagamento nem
  // cancelamento (docs/BETA.md §3). O acesso vale até next_charge_at, que
  // a inscrição gravou como o fim do programa.
  const naBeta = account.planId === 'beta'
  const status = naBeta
    ? { text: `Programa beta · acesso até ${formatDate(account.nextChargeAt)}`, tone: 'tag--ok' }
    : STATUS_LABEL[account.status]
  const remaining = daysUntil(account.trialEndsAt)
  const progress =
    account.status === 'avaliacao'
      ? Math.min(1, (TRIAL_DAYS - remaining) / TRIAL_DAYS)
      : 1
  const plan = getPlan(account.planId)

  return (
    <div className="flow">
      <AmbientBackground particles={10} scan={false} light />

      <div className="container flow__inner">
        <Reveal anim="fade">
          <span className="eyebrow">Painel</span>
        </Reveal>

        <Reveal anim="up">
          <div className="conta__head">
            <div>
              <h1 className="flow__title" style={{ marginBottom: 'var(--sp-2)' }}>
                Olá, {account.profile.buyerName.split(' ')[0]}
              </h1>
              <p style={{ margin: 0, color: 'var(--text-dim)' }}>{account.profile.email}</p>
            </div>
            <Button
              variant="ghost"
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
            >
              Sair
            </Button>
          </div>
        </Reveal>

        {falha && (
          <p className="field__error" role="alert" style={{ marginTop: 'var(--sp-5)' }}>
            {falha}
          </p>
        )}

        {/* A sessão continua valendo: só a releitura da conta falhou. Em vez de
            deslogar, o painel avisa que o que está na tela pode estar velho. */}
        {sessionError && (
          <div className="notice notice--warn" style={{ marginTop: 'var(--sp-5)' }} role="status">
            <span className="notice__icon">
              <Icon name="alerta" size={20} />
            </span>
            <p>
              Não foi possível atualizar os dados da conta agora ({sessionError}). Você continua
              conectado e o que aparece abaixo é a última leitura que deu certo.{' '}
              <button
                type="button"
                className="underline-grow"
                onClick={() => void refresh()}
                style={{
                  background: 'none',
                  border: 0,
                  padding: 0,
                  font: 'inherit',
                  color: 'inherit',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Tentar de novo
              </button>
              .
            </p>
          </div>
        )}

          <Reveal anim="up" delay={100}>
            <div className="conta__plan panel">
              <div className="conta__plan-head">
                <div>
                  <span className={`tag ${status.tone}`}>{status.text}</span>
                  <h2 className="conta__plan-name">Plano {plan.name}</h2>
                </div>
                {naBeta ? (
                  <p className="conta__plan-price">
                    R$ 0<span>sem cobrança</span>
                  </p>
                ) : (
                  <p className="conta__plan-price">
                    {brl(account.priceBRL)}
                    <span>/mês</span>
                  </p>
                )}
              </div>

              {!naBeta && account.status === 'avaliacao' && (
                <div className="conta__trial">
                  <div className="conta__trial-top">
                    <span>
                      <strong>{remaining}</strong> dias restantes de avaliação
                    </span>
                    <span>termina em {formatDate(account.trialEndsAt)}</span>
                  </div>
                  <div className="conta__bar" role="presentation">
                    <span style={{ transform: `scaleX(${progress})` }} />
                  </div>
                </div>
              )}

              <dl className="summary" style={{ marginTop: 'var(--sp-5)' }}>
                <div>
                  <dt>Usuário</dt>
                  <dd>{account.profile.userName}</dd>
                </div>
                {naBeta ? (
                  <div>
                    <dt>Acesso beta até</dt>
                    <dd>{formatDate(account.nextChargeAt)}</dd>
                  </div>
                ) : (
                  <>
                    <div>
                      <dt>Forma de pagamento</dt>
                      <dd>
                        {account.payment
                          ? account.payment.cardLast4
                            ? `${account.payment.cardBrand} final ${account.payment.cardLast4}`
                            : account.payment.method === 'pix'
                              ? 'Pix mensal'
                              : 'Boleto mensal'
                          : 'Não informada'}
                      </dd>
                    </div>
                    <div>
                      <dt>Próxima cobrança</dt>
                      <dd>
                        {account.status === 'cancelada'
                          ? 'Nenhuma, assinatura cancelada'
                          : `${brl(account.priceBRL)} em ${formatDate(account.nextChargeAt)}`}
                      </dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>Conta criada em</dt>
                  <dd>{formatDate(account.createdAt)}</dd>
                </div>
              </dl>

              {naBeta ? (
                <div className="conta__actions">
                  <Button to={BETA_CTA.to} variant="teal">
                    Baixar o aplicativo
                  </Button>
                  <Button to="/contato" variant="ghost">
                    Dar retorno sobre a beta
                  </Button>
                </div>
              ) : (
              <div className="conta__actions">
                {account.status === 'cancelada' ? (
                  <Button
                    variant="teal"
                    loading={ocupado}
                    onClick={() => executar(reactivate)}
                  >
                    Reativar assinatura
                  </Button>
                ) : confirming ? (
                  <div className="conta__confirm">
                    <p>
                      O cancelamento é imediato e sem multa. O acesso continua até{' '}
                      {formatDate(account.nextChargeAt)}.
                    </p>
                    <div>
                      <Button
                        variant="secondary"
                        loading={ocupado}
                        onClick={() => executar(cancel)}
                      >
                        Confirmar cancelamento
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirming(false)}>
                        Manter assinatura
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Sem gateway durante a beta, /pagamento redireciona para /beta:
                        o botão só faz sentido com a venda reaberta. */}
                    {!BETA.ativo && (
                      <Button to="/pagamento" variant="secondary">
                        Alterar forma de pagamento
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => setConfirming(true)}>
                      Cancelar assinatura
                    </Button>
                  </>
                )}
              </div>
              )}
            </div>
          </Reveal>

          <Reveal anim="up" delay={140}>
            <LinkedDevices />
          </Reveal>

          <div className="grid grid--3" style={{ marginTop: 'var(--sp-6)' }}>
            <Reveal anim="up" delay={160}>
              <Card as="div">
                <CardIcon tone="teal">
                  <Icon name="download" size={26} />
                </CardIcon>
                <h3>{naBeta ? 'Baixar o aplicativo' : 'Instaladores'}</h3>
                <p>
                  {naBeta
                    ? 'A página da beta tem os instaladores dos três sistemas, o app do cuidador e a verificação de compatibilidade.'
                    : 'Baixe novamente o aplicativo para qualquer um dos três sistemas.'}
                </p>
                {naBeta && (
                  <Link to={BETA_CTA.to} className="conta__link" style={{ marginBottom: 8 }}>
                    Ir para a página da beta
                  </Link>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
                  <a href={downloads.windows} className="conta__link">
                    Windows
                  </a>
                  <a href={downloads.macos} className="conta__link">
                    macOS
                  </a>
                  <a href={downloads.linux} className="conta__link">
                    Linux
                  </a>
                </div>
              </Card>
            </Reveal>

            <Reveal anim="up" delay={240}>
              <Card as="div">
                <CardIcon>
                  <Icon name="alvo" size={26} />
                </CardIcon>
                <h3>Primeiros passos</h3>
                <p>
                  Prepare o posto de uso, calibre em nove pontos e comece pelo teclado e pelas
                  frases rápidas, os módulos mais usados no primeiro dia.
                </p>
                <Link to="/como-funciona" className="conta__link" style={{ marginTop: 'auto' }}>
                  Ver o guia
                </Link>
              </Card>
            </Reveal>

            <Reveal anim="up" delay={320}>
              <Card as="div">
                <CardIcon>
                  <Icon name="email" size={26} />
                </CardIcon>
                <h3>Suporte direto</h3>
                <p>
                  A equipe responde sem intermediário. Se algo não calibrou ou o rastreamento
                  está instável, descreva as condições da sala.
                </p>
                <Link to="/contato" className="conta__link" style={{ marginTop: 'auto' }}>
                  Falar com a equipe
                </Link>
              </Card>
            </Reveal>
          </div>

          <Reveal anim="fade" delay={420}>
            <p className="flow__foot">
              Os dados desta conta ficam no banco da IrisFlow, protegidos por políticas que
              limitam cada assinante às próprias informações.{' '}
              {naBeta
                ? 'Na beta não há cobrança nem cancelamento a fazer: o acesso vale até o fim do programa.'
                : 'O cancelamento é imediato e não passa por atendimento.'}
            </p>
          </Reveal>
      </div>
    </div>
  )
}

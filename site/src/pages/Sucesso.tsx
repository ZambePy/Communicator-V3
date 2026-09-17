import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Card, CardIcon } from '@/components/ui/Card'
import { DownloadButton } from '@/components/ui/DownloadButton'
import { SessionLoading } from '@/components/ui/Skeleton'
import { Icon, type IconName } from '@/components/ui/Icon'
import { CompatCheck } from '@/components/sections/CompatCheck'
import { useAccount } from '@/context/AccountContext'
import { brl, daysUntil, formatDate } from '@/utils/format'
import { useDownloads } from '@/hooks/useDownloads'
import { BRAND, TRIAL_DAYS } from '@/data/content'
import './checkout.css'
import './sucesso.css'

/* A verificação de compatibilidade (`diagnosticar`) mora em
   src/utils/compat.ts e o bloco que a exibe em
   components/sections/CompatCheck.tsx — os dois são compartilhados com a
   página /beta. */

export const NEXT_STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'download',
    title: 'Baixe e instale',
    text: 'O instalador do sistema que você escolheu está liberado abaixo. A instalação não pede permissão especial nem drivers de câmera.',
  },
  {
    icon: 'webcam',
    title: 'Prepare o posto de uso',
    text: `Deixe o ${BRAND.product} medir distância, enquadramento e iluminação antes de calibrar. Ele indica o que ajustar quando não consegue corrigir sozinho.`,
  },
  {
    icon: 'alvo',
    title: 'Calibre e experimente',
    text: 'Nove pontos, menos de trinta segundos. Depois disso, comece pelo teclado e pelas frases rápidas, que são os módulos mais usados no primeiro dia.',
  },
]

export default function Sucesso() {
  const { account, authenticated, loading } = useAccount()
  const downloads = useDownloads()
  const [ready, setReady] = useState(false)

  // Pequena espera para que a animação de confirmação seja percebida.
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 450)
    return () => window.clearTimeout(t)
  }, [])

  if (loading) return <SessionLoading />
  if (!account) return <Navigate to={authenticated ? '/cadastro' : '/entrar'} replace />

  return (
    <div className="flow">
      <AmbientBackground particles={18} light />

      <div className="container container--narrow flow__inner">
        <div className="success">
          <span className="success__badge" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path
                d="M4 12.5 9.5 18 20 6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="success__ring" />
            <span className="success__ring success__ring--2" />
          </span>

          <Reveal anim="up" delay={200}>
            <h1 className="success__title">
              Pronto, {account.profile.buyerName.split(' ')[0]}.
            </h1>
          </Reveal>

          <Reveal anim="up" delay={300}>
            <p className="lead success__lead">
              A avaliação de {TRIAL_DAYS} dias começou. Até{' '}
              <strong>{formatDate(account.trialEndsAt)}</strong> vocês têm acesso completo à
              plataforma, sem nenhuma cobrança.
            </p>
          </Reveal>
        </div>

        <Reveal anim="zoom" delay={380}>
          <div className="flow__card panel" style={{ marginBottom: 'var(--sp-5)' }}>
            <dl className="summary" style={{ marginBottom: 0 }}>
              <div>
                <dt>Conta</dt>
                <dd>{account.profile.email}</dd>
              </div>
              <div>
                <dt>Usuário</dt>
                <dd>{account.profile.userName}</dd>
              </div>
              <div>
                <dt>Situação</dt>
                <dd style={{ color: 'var(--ok)' }}>
                  Em avaliação, {daysUntil(account.trialEndsAt)} dias restantes
                </dd>
              </div>
              <div>
                <dt>Primeira cobrança</dt>
                <dd>
                  {brl(account.priceBRL)} em {formatDate(account.nextChargeAt)}
                  {account.payment?.cardLast4
                    ? ` · ${account.payment.cardBrand} final ${account.payment.cardLast4}`
                    : account.payment
                      ? ` · via ${account.payment.method}`
                      : ''}
                </dd>
              </div>
            </dl>
          </div>
        </Reveal>

        <Reveal anim="up" delay={460}>
          <div className="download">
            <h2 className="download__title">Baixe o {BRAND.product}</h2>
            <p className="download__note">
              Os links vêm da tabela <code>app_releases</code>. Enquanto não houver uma versão
              publicada lá, os botões ficam desabilitados.
            </p>
            <div className="download__buttons">
              <DownloadButton href={downloads.windows} variant="teal" ready={ready}>
                Windows
              </DownloadButton>
              <DownloadButton href={downloads.macos} variant="secondary" ready={ready}>
                macOS
              </DownloadButton>
              <DownloadButton href={downloads.linux} variant="secondary" ready={ready}>
                Linux
              </DownloadButton>
            </div>
          </div>
        </Reveal>

        <CompatCheck delay={520} />

        <div className="grid grid--3" style={{ marginTop: 'var(--sp-7)' }}>
          {NEXT_STEPS.map((s, i) => (
            <Reveal key={s.title} anim="up" delay={560 + i * 100}>
              <Card as="div">
                <CardIcon tone={i === 2 ? 'teal' : 'blue'}>
                  <Icon name={s.icon} size={26} />
                </CardIcon>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </Card>
            </Reveal>
          ))}
        </div>

        <Reveal anim="fade" delay={900}>
          <p className="flow__foot">
            <Link to="/conta" className="underline-grow" style={{ color: 'var(--ok)' }}>
              Ir para o painel da conta
            </Link>{' '}
            · Dúvidas na instalação?{' '}
            <Link to="/contato" className="underline-grow">
              Fale com a equipe
            </Link>
          </p>
        </Reveal>
      </div>
    </div>
  )
}

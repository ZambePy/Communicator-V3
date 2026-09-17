import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Field, SelectField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { useAccount, type Payment } from '@/context/AccountContext'
import { SessionLoading } from '@/components/ui/Skeleton'
import {
  brl,
  cardBrand,
  formatDate,
  isCardNumber,
  isExpiryValid,
  last4,
  maskCVV,
  maskCard,
  maskExpiry,
} from '@/utils/format'
import { usePlans } from '@/hooks/usePlans'
import './checkout.css'

type Method = Payment['method']

const METHODS: { id: Method; icon: IconName; name: string; note: string }[] = [
  { id: 'cartao', icon: 'cartao', name: 'Cartão de crédito', note: 'Renovação automática' },
  { id: 'pix', icon: 'codigo-qr', name: 'Pix', note: 'Cobrança mensal avulsa' },
  { id: 'boleto', icon: 'boleto', name: 'Boleto', note: 'Vencimento em 3 dias úteis' },
]

type CardForm = { number: string; holder: string; expiry: string; cvv: string; installments: number }
type Errors = Partial<Record<keyof CardForm, string>>

export default function Pagamento() {
  const { account, authenticated, loading, attachPayment } = useAccount()
  const { getPlan } = usePlans()
  const navigate = useNavigate()
  const [method, setMethod] = useState<Method>('cartao')
  const [card, setCard] = useState<CardForm>({
    number: '',
    holder: '',
    expiry: '',
    cvv: '',
    installments: 1,
  })
  const [errors, setErrors] = useState<Errors>({})
  const [processing, setProcessing] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  if (loading) return <SessionLoading />
  if (!account) return <Navigate to={authenticated ? '/cadastro' : '/entrar'} replace />

  // Fonte da verdade do valor cobrado é a assinatura no banco (account.priceBRL),
  // não o preço do catálogo: se um dia os planos subirem de preço, quem já
  // assinou continua pagando o valor acertado.
  const plan = getPlan(account.planId)
  const price = account.priceBRL

  const set =
    (key: keyof CardForm, mask?: (v: string) => string) =>
    (e: { target: { value: string } }) => {
      const value = mask ? mask(e.target.value) : e.target.value
      setCard((c) => ({ ...c, [key]: value }))
      setErrors((prev) => ({ ...prev, [key]: undefined }))
    }

  const validate = () => {
    if (method !== 'cartao') return true
    const next: Errors = {}
    if (!isCardNumber(card.number)) next.number = 'Número de cartão inválido.'
    if (card.holder.trim().split(' ').length < 2) next.holder = 'Informe o nome como está no cartão.'
    if (!isExpiryValid(card.expiry)) next.expiry = 'Validade inválida ou vencida.'
    if (card.cvv.length < 3) next.cvv = 'Código de segurança incompleto.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setProcessing(true)
    setFalha(null)

    // Sem gateway ainda: o cartão não é cobrado e o número completo não sai
    // desta tela. O que segue para o banco (e é dito ao usuário no aviso
    // acima) são o nome do titular, a bandeira e os quatro últimos dígitos.
    // Quando o gateway entrar, tokenize aqui com tokenizeCard e mande o
    // token junto, em src/services/api.ts.
    const payment: Payment =
      method === 'cartao'
        ? {
            method,
            cardLast4: last4(card.number),
            cardBrand: cardBrand(card.number),
            holder: card.holder,
            installments: card.installments,
          }
        : { method }

    try {
      await attachPayment(payment)
      navigate('/sucesso')
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível salvar a forma de pagamento.')
    } finally {
      setProcessing(false)
    }
  }

  const brand = cardBrand(card.number)

  return (
    <div className="flow">
      <AmbientBackground particles={14} scan={false} light />

      <div className="container container--narrow flow__inner">
        <Reveal anim="fade">
          <span className="eyebrow">Forma de pagamento</span>
        </Reveal>

        <Reveal anim="up">
          <h1 className="flow__title">Escolha como pagar depois da avaliação.</h1>
        </Reveal>

        <Reveal anim="up" delay={120}>
          <p className="lead flow__lead">
            Nada é cobrado hoje. A primeira cobrança de {brl(price)} acontece em{' '}
            <strong>{formatDate(account.trialEndsAt)}</strong>, e você pode cancelar antes disso
            pelo painel, sem multa.
          </p>
        </Reveal>

        <Reveal anim="up" delay={200}>
          <div className="flow__card panel">
            <div className="notice">
              <span className="notice__icon">
                <Icon name="info" size={20} />
              </span>
              <p>
                <strong>Ambiente de demonstração.</strong> Este projeto foi entregue sem gateway
                de pagamento, então <strong>nenhum número de cartão completo é processado ou
                armazenado</strong> e nenhuma cobrança é feita: o número e o código de segurança
                não saem desta tela. O que <em>é</em> gravado na sua conta, no banco de dados:{' '}
                <strong>o nome do titular, a bandeira e os quatro últimos dígitos</strong>, que
                depois aparecem no painel. Por isso, use dados de teste — cartão{' '}
                <code>4111 1111 1111 1111</code> e um nome fictício no lugar do seu.
              </p>
            </div>

            <form onSubmit={submit} noValidate>
              <div
                className="methods"
                role="radiogroup"
                aria-label="Escolha a forma de pagamento"
              >
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={method === m.id}
                    className={`method${method === m.id ? ' is-on' : ''}`}
                    onClick={() => setMethod(m.id)}
                  >
                    <span className="method__icon">
                      <Icon name={m.icon} size={22} />
                    </span>
                    <span className="method__name">{m.name}</span>
                    <span className="method__note">{m.note}</span>
                  </button>
                ))}
              </div>

              {method === 'cartao' && (
                <div className="flow__fieldset" key="cartao">
                  {/* pré-visualização do cartão, atualizada enquanto se digita */}
                  <div className="creditcard" aria-hidden="true">
                    <div className="creditcard__row">
                      <span className="creditcard__chip" />
                      <span className="creditcard__brand">{card.number ? brand : 'IrisFlow'}</span>
                    </div>
                    <p className="creditcard__number">
                      {card.number || '•••• •••• •••• ••••'}
                    </p>
                    <div className="creditcard__meta">
                      <span>
                        titular
                        <strong>{card.holder || 'NOME NO CARTÃO'}</strong>
                      </span>
                      <span>
                        validade
                        <strong>{card.expiry || 'MM/AA'}</strong>
                      </span>
                    </div>
                  </div>

                  <Field
                    label="Número do cartão"
                    value={card.number}
                    onChange={set('number', maskCard)}
                    error={errors.number}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="0000 0000 0000 0000"
                  />

                  <Field
                    label="Nome impresso no cartão"
                    value={card.holder}
                    onChange={set('holder')}
                    error={errors.holder}
                    autoComplete="cc-name"
                    placeholder="MARIA A SOUZA"
                    style={{ textTransform: 'uppercase' }}
                  />

                  <div className="flow__row">
                    <Field
                      label="Validade"
                      value={card.expiry}
                      onChange={set('expiry', maskExpiry)}
                      error={errors.expiry}
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/AA"
                    />
                    <Field
                      label="Código de segurança"
                      value={card.cvv}
                      onChange={set('cvv', maskCVV)}
                      error={errors.cvv}
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="000"
                      hint="Três dígitos no verso do cartão."
                    />
                  </div>

                  <SelectField
                    label="Cobrança"
                    value={String(card.installments)}
                    onChange={(e) =>
                      setCard((c) => ({ ...c, installments: Number(e.target.value) }))
                    }
                    hint="A assinatura é mensal e renova automaticamente até o cancelamento."
                  >
                    <option value="1">Mensal: {brl(price)} por mês</option>
                    <option value="12">
                      Anual: {brl(price * 10)} à vista, o equivalente a 2 meses de desconto
                    </option>
                  </SelectField>
                </div>
              )}

              {method === 'pix' && (
                <div className="flow__fieldset" key="pix">
                  <div className="pix">
                    <PixPlaceholder />
                    <p style={{ margin: 0, maxWidth: '46ch' }}>
                      No fim da avaliação você recebe por e-mail um Pix de {brl(price)} com
                      vencimento em três dias. O acesso continua ativo enquanto o pagamento não
                      vence.
                    </p>
                    <code className="pix__code">
                      00020126_codigo_de_demonstracao_sem_gateway_conectado_5204000053039865802BR
                    </code>
                  </div>
                </div>
              )}

              {method === 'boleto' && (
                <div className="flow__fieldset" key="boleto">
                  <div className="notice notice--warn">
                    <span className="notice__icon">
                      <Icon name="alerta" size={20} />
                    </span>
                    <p>
                      O boleto tem compensação de até três dias úteis. Para não haver interrupção
                      de acesso, ele é emitido cinco dias antes do fim da avaliação.
                    </p>
                  </div>
                  <dl className="summary">
                    <div>
                      <dt>Valor</dt>
                      <dd>{brl(price)}</dd>
                    </div>
                    <div>
                      <dt>Emissão</dt>
                      <dd>5 dias antes de {formatDate(account.trialEndsAt)}</dd>
                    </div>
                    <div>
                      <dt>Enviado para</dt>
                      <dd>{account.profile.email}</dd>
                    </div>
                  </dl>
                </div>
              )}

              <dl className="summary">
                <div>
                  <dt>Plano</dt>
                  <dd>{plan.name}</dd>
                </div>
                <div>
                  <dt>Hoje você paga</dt>
                  <dd style={{ color: 'var(--ok)' }}>{brl(0)}</dd>
                </div>
                <div>
                  <dt>Primeira cobrança</dt>
                  <dd>
                    {brl(price)} em {formatDate(account.trialEndsAt)}
                  </dd>
                </div>
              </dl>

              {falha && (
                <p className="field__error" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
                  {falha}
                </p>
              )}

              <div className="flow__actions">
                <Button to="/cadastro" variant="ghost" icon={<Icon name="seta-esquerda" size={18} />}>
                  Voltar
                </Button>
                <Button type="submit" loading={processing} variant="teal">
                  {processing ? 'Confirmando…' : 'Confirmar e liberar o download'}
                </Button>
              </div>
            </form>
          </div>
        </Reveal>

        <Reveal anim="fade" delay={320}>
          <p className="flow__foot">
            Dados de cartão nunca devem trafegar pelo servidor da própria aplicação. Na
            integração real, o cartão é tokenizado no navegador pelo SDK do gateway e apenas o
            token é enviado.
          </p>
        </Reveal>
      </div>
    </div>
  )
}

/** Marca visual no lugar do QR Code real, que só o gateway pode gerar. */
function PixPlaceholder() {
  const cells = Array.from({ length: 121 }, (_, i) => {
    const r = Math.floor(i / 11)
    const c = i % 11
    const corner = (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3)
    return corner || (r * 7 + c * 3) % 5 < 2
  })

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(11, 1fr)',
        gap: 3,
        width: 176,
        height: 176,
        padding: 12,
        borderRadius: 'var(--r-md)',
        background: '#fff',
      }}
      aria-hidden="true"
    >
      {cells.map((on, i) => (
        <span
          key={i}
          style={{
            background: on ? '#0b1b3a' : 'transparent',
            borderRadius: 2,
            animation: `fade-in 500ms var(--ease-out) ${i * 4}ms both`,
          }}
        />
      ))}
    </div>
  )
}

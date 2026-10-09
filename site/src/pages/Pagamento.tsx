import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Field, SelectField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { CartaoAnimado } from '@/components/ui/CartaoAnimado'
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
type Etapa = 'formulario' | 'processando' | 'sucesso' | 'erro'

/** Quanto o "processando" dura no mínimo e quanto o sucesso e o erro ficam na tela. */
const MIN_PROCESSANDO_MS = 1400
const SUCESSO_MS = 1300
const ERRO_MS = 1100

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const movimentoReduzido = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

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
  const [etapa, setEtapa] = useState<Etapa>('formulario')
  const [cvvEmFoco, setCvvEmFoco] = useState(false)
  const formulario = useRef<HTMLFormElement>(null)

  // Enquanto a camada de confirmação cobre o formulário, ele sai do alcance
  // do teclado e do leitor de tela.
  useEffect(() => {
    formulario.current?.toggleAttribute('inert', etapa !== 'formulario')
  }, [etapa])

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
    setEtapa('processando')
    const reduzido = movimentoReduzido()
    const inicio = Date.now()

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
      // Segura o "processando" um instante, para a confirmação não piscar e sumir.
      await esperar(Math.max(0, (reduzido ? 0 : MIN_PROCESSANDO_MS) - (Date.now() - inicio)))
      setEtapa('sucesso')
      await esperar(reduzido ? 400 : SUCESSO_MS)
      navigate('/sucesso')
    } catch (e) {
      setEtapa('erro')
      await esperar(reduzido ? 0 : ERRO_MS)
      setEtapa('formulario')
      setFalha(e instanceof Error ? e.message : 'Não foi possível salvar a forma de pagamento.')
    } finally {
      setProcessing(false)
    }
  }

  const brand = cardBrand(card.number)

  return (
    <div className="flow">
      <AmbientBackground variante="suave" />

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
            {etapa !== 'formulario' && (
              <StatusDaConfirmacao
                etapa={etapa}
                cobranca={`${brl(price)} em ${formatDate(account.trialEndsAt)}`}
                cartao={
                  method === 'cartao' ? (
                    <CartaoAnimado
                      numero={card.number}
                      titular={card.holder}
                      validade={card.expiry}
                      digitosCvv={card.cvv.length}
                      bandeira={brand}
                      estado={etapa}
                    />
                  ) : null
                }
              />
            )}

            {import.meta.env.DEV && (
              <div className="notice">
                <span className="notice__icon">
                  <Icon name="info" size={20} />
                </span>
                <p>
                  <strong>[dev] Sem gateway de pagamento.</strong> Nenhum número de cartão
                  completo é processado ou armazenado e nenhuma cobrança é feita; só ficam o nome
                  do titular, a bandeira e os quatro últimos dígitos. Use dados de teste — cartão{' '}
                  <code>4111 1111 1111 1111</code>.
                </p>
              </div>
            )}

            <form ref={formulario} onSubmit={submit} noValidate>
              {/* Rádios nativos, visualmente escondidos: as setas do teclado
                  trocam a opção e o leitor de tela anuncia "1 de 3". */}
              <fieldset className="methods">
                <legend className="sr-only">Escolha a forma de pagamento</legend>
                {METHODS.map((m) => (
                  <label key={m.id} className={`method${method === m.id ? ' is-on' : ''}`}>
                    <input
                      type="radio"
                      name="metodo"
                      value={m.id}
                      className="method__input"
                      checked={method === m.id}
                      onChange={() => setMethod(m.id)}
                    />
                    <span className="method__icon">
                      <Icon name={m.icon} size={22} />
                    </span>
                    <span className="method__name">{m.name}</span>
                    <span className="method__note">{m.note}</span>
                  </label>
                ))}
              </fieldset>

              {method === 'cartao' && (
                <div className="flow__fieldset" key="cartao">
                  {/* pré-visualização do cartão: atualiza enquanto se digita e vira
                      para o verso enquanto o código de segurança está em foco */}
                  <CartaoAnimado
                    numero={card.number}
                    titular={card.holder}
                    validade={card.expiry}
                    digitosCvv={card.cvv.length}
                    bandeira={brand}
                    virado={cvvEmFoco}
                  />

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
                      onFocus={() => setCvvEmFoco(true)}
                      onBlur={() => setCvvEmFoco(false)}
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
                    {/* O código Pix de verdade só existe quando o gateway gera a cobrança;
                        ele vai no e-mail, e nenhum código de exemplo aparece aqui. */}
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

/** Camada sobre o formulário enquanto a forma de pagamento é salva. */
function StatusDaConfirmacao({
  etapa,
  cartao,
  cobranca,
}: {
  etapa: Exclude<Etapa, 'formulario'>
  cartao: ReactNode
  cobranca: string
}) {
  const conteudo = useRef<HTMLDivElement>(null)

  // O botão de confirmar fica no fim de um formulário longo: ao abrir, a
  // página sobe até o cartão para a animação acontecer à vista.
  useEffect(() => {
    conteudo.current?.scrollIntoView?.({
      block: 'center',
      behavior: movimentoReduzido() ? 'auto' : 'smooth',
    })
  }, [])

  const texto = {
    processando: { titulo: 'Salvando a forma de pagamento…', sub: 'Leva só um instante.' },
    sucesso: {
      titulo: 'Tudo certo!',
      sub: `Nada foi cobrado hoje. A primeira cobrança é de ${cobranca}.`,
    },
    erro: { titulo: 'Não foi possível salvar.', sub: 'Confira os dados e tente de novo.' },
  }[etapa]

  return (
    <div className={`checkout-status checkout-status--${etapa}`} role="status" aria-live="polite">
      <div className="checkout-status__conteudo" ref={conteudo}>
        {cartao}
        <span className="checkout-status__marca" aria-hidden="true">
          {etapa === 'processando' && <span className="checkout-status__giro" />}
          {etapa === 'sucesso' && (
            <svg viewBox="0 0 24 24" className="checkout-status__check">
              <path d="M5 12.5 10 17.5 19 7" />
            </svg>
          )}
          {etapa === 'erro' && (
            <svg viewBox="0 0 24 24" className="checkout-status__x">
              <path d="M7 7 17 17M17 7 7 17" />
            </svg>
          )}
        </span>
        <p className="checkout-status__titulo">{texto.titulo}</p>
        <p className="checkout-status__sub">{texto.sub}</p>
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

import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Stepper } from '@/components/ui/Stepper'
import { Field, SelectField, CheckField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { useAccount, type Profile } from '@/context/AccountContext'
import { maskCPF, maskPhone, osLabel } from '@/utils/format'
import { SENHA_MINIMA, validar } from '@/utils/validation'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { TRIAL_DAYS } from '@/data/content'
import { usePlans } from '@/hooks/usePlans'
import './checkout.css'

const STEPS = ['Quem paga', 'Quem usa', 'Confirmação']

type Form = Profile & { terms: boolean; password: string; passwordConfirm: string }

const EMPTY: Form = {
  buyerName: '',
  email: '',
  phone: '',
  document: '',
  userName: '',
  relation: '',
  condition: '',
  os: '',
  prescriberName: '',
  prescriberRole: '',
  newsletter: true,
  terms: false,
  password: '',
  passwordConfirm: '',
}

const RULES: Rules<Form> = {
  buyerName: validar.nomeCompleto,
  email: validar.email,
  phone: validar.telefone,
  document: validar.cpf,
  password: validar.senha,
  passwordConfirm: (v, all) => validar.confirmacao(v, all.password),
  userName: (v) => (v.trim().length < 3 ? 'Informe o nome de quem vai usar (ao menos 3 letras).' : undefined),
  relation: (v) => validar.escolha(v, 'Selecione a relação com o usuário.'),
  condition: (v) => validar.escolha(v, 'Selecione a condição principal.'),
  os: (v) => validar.escolha(v, 'Selecione o sistema operacional do computador.'),
  terms: validar.aceite,
}

const STEP_FIELDS: (keyof Form)[][] = [
  ['buyerName', 'email', 'phone', 'document', 'password', 'passwordConfirm'],
  ['userName', 'relation', 'condition', 'os'],
  ['terms'],
]

export default function Cadastro() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form>(EMPTY)
  // Ao trocar de etapa, a página rola até o cartão do formulário, não até o topo:
  // antes, cada 'Continuar' jogava a pessoa de volta ao cabeçalho da página.
  const cardRef = useRef<HTMLDivElement>(null)
  const rolarParaOFormulario = () =>
    cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  const v = useFormValidation(form, RULES)
  const errors = Object.fromEntries(
    (Object.keys(RULES) as (keyof Form)[]).map((k) => [k, v.errorOf(k)]),
  ) as Partial<Record<keyof Form, string>>
  const blur = (key: keyof Form) => () => v.touch(key)
  const stepValid = v.isValid(STEP_FIELDS[step])
  const [saving, setSaving] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const { register } = useAccount()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // O plano vem da URL (?plano=essencial|completo|voz). Se a URL não trouxer
  // nada — quando o usuário chega direto no /cadastro — cai no recomendado.
  // Nome e preço são os da tabela `plans` (usePlans), os mesmos que a
  // complete_registration vai gravar na assinatura.
  const { getPlan } = usePlans()
  const requested = getPlan(params.get('plano'))
  // Um plano que o banco marcou como não contratável (ex.: Voz, ainda em
  // validação) não pode ser assinado pela URL: cai no recomendado.
  const plan = requested.purchasable === false ? getPlan(null) : requested
  const planoTrocado = requested.id !== plan.id

  const set =
    (key: keyof Form, mask?: (v: string) => string) =>
    (e: { target: { value: string } }) => {
      const value = mask ? mask(e.target.value) : e.target.value
      setForm((f) => ({ ...f, [key]: value }))
    }

  const toggle = (key: keyof Form) => (e: { target: { checked: boolean } }) => {
    setForm((f) => ({ ...f, [key]: e.target.checked }))
    v.touch(key)
  }

  const validateStep = (s: number) => {
    v.touch(...STEP_FIELDS[s])
    return v.isValid(STEP_FIELDS[s])
  }

  const next = () => {
    if (!validateStep(step)) return
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
    rolarParaOFormulario()
  }

  const back = () => {
    setStep((s) => Math.max(s - 1, 0))
    rolarParaOFormulario()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validateStep(2)) return

    setSaving(true)
    setFalha(null)

    // A senha vai para o Supabase Auth, não para a tabela de perfis:
    // por isso ela sai daqui antes de o restante virar Profile.
    const { terms: _terms, password, passwordConfirm: _confirm, ...profile } = form
    void _terms
    void _confirm

    try {
      await register(profile, password, plan.id)
      navigate('/pagamento')
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível criar a conta.')
      rolarParaOFormulario()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flow">
      <AmbientBackground particles={14} scan={false} light />

      <div className="container container--narrow flow__inner">
        <Reveal anim="fade">
          <span className="eyebrow">Avaliação gratuita</span>
        </Reveal>

        <Reveal anim="up">
          <h1 className="flow__title">
            {TRIAL_DAYS} dias para descobrir se a IrisFlow funciona para o seu caso.
          </h1>
        </Reveal>

        <Reveal anim="up" delay={120}>
          <p className="lead flow__lead">
            Plano escolhido: <strong>{plan.name}</strong>, R$ {plan.price} {plan.period}. Não
            pedimos cartão agora. A forma de pagamento só entra na etapa seguinte, e a primeira
            cobrança acontece depois dos {TRIAL_DAYS} dias, se vocês decidirem continuar.
          </p>
        </Reveal>

        <Reveal anim="up" delay={200}>
          <div className="flow__card panel" id="cadastro" ref={cardRef}>
            {falha && (
              <div className="notice notice--warn" role="alert">
                <span className="notice__icon">
                  <Icon name="alerta" size={20} />
                </span>
                <p>{falha}</p>
              </div>
            )}

            {planoTrocado && (
              <div className="notice" role="status">
                <span className="notice__icon">
                  <Icon name="info" size={20} />
                </span>
                <p>
                  O plano {requested.name} ainda não está em comercialização. Seguimos com o
                  plano {plan.name}; dá para mudar depois pelo painel.
                </p>
              </div>
            )}

            <Stepper steps={STEPS} current={step} />

            <form onSubmit={submit} noValidate>
              {step === 0 && (
                <fieldset className="flow__fieldset">
                  <legend className="flow__legend">
                    Dados de quem responde pela assinatura
                    <span>
                      Normalmente o familiar responsável ou o cuidador principal, quem decide e
                      paga.
                    </span>
                  </legend>

                  <Field
                    label="Nome completo"
                    value={form.buyerName}
                    onChange={set('buyerName')}
                    onBlur={blur('buyerName')}
                    error={errors.buyerName}
                    autoComplete="name"
                    placeholder="Maria Aparecida Souza"
                  />

                  <div className="flow__row">
                    <Field
                      label="E-mail"
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                    onBlur={blur('email')}
                      error={errors.email}
                      autoComplete="email"
                      placeholder="voce@exemplo.com.br"
                      hint="Usado para acessar a conta e receber o link de download."
                    />
                    <Field
                      label="Telefone"
                      type="tel"
                      value={form.phone}
                      onChange={set('phone', maskPhone)}
                    onBlur={blur('phone')}
                      error={errors.phone}
                      autoComplete="tel"
                      placeholder="(11) 90000-0000"
                      inputMode="numeric"
                    />
                  </div>

                  <Field
                    label="CPF"
                    value={form.document}
                    onChange={set('document', maskCPF)}
                    onBlur={blur('document')}
                    error={errors.document}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    hint="Necessário para emissão da nota fiscal da assinatura."
                  />

                  <div className="flow__row">
                    <Field
                      label="Senha"
                      type="password"
                      value={form.password}
                      onChange={set('password')}
                    onBlur={blur('password')}
                      error={errors.password}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      hint={`Ao menos ${SENHA_MINIMA} caracteres. É com ela que vocês entram depois.`}
                      describedById="cadastro-senha-forca"
                    />
                    <Field
                      label="Confirmar senha"
                      type="password"
                      value={form.passwordConfirm}
                      onChange={set('passwordConfirm')}
                    onBlur={blur('passwordConfirm')}
                      error={errors.passwordConfirm}
                      autoComplete="new-password"
                      placeholder="••••••••"
                    />
                  </div>
                  <PasswordStrength value={form.password} id="cadastro-senha-forca" />
                </fieldset>
              )}

              {step === 1 && (
                <fieldset className="flow__fieldset">
                  <legend className="flow__legend">
                    Dados de quem vai usar a IrisFlow
                    <span>
                      Quem opera a solução e a beneficiária direta. Esses dados ajustam o perfil
                      inicial de calibração e de sensibilidade.
                    </span>
                  </legend>

                  <Field
                    label="Nome da pessoa que vai usar"
                    value={form.userName}
                    onChange={set('userName')}
                    onBlur={blur('userName')}
                    error={errors.userName}
                    placeholder="Como ela gosta de ser chamada"
                  />

                  <div className="flow__row">
                    <SelectField
                      label="Sua relação com ela"
                      value={form.relation}
                      onChange={set('relation')}
                    onBlur={blur('relation')}
                      error={errors.relation}
                    >
                      <option value="">Selecione…</option>
                      <option value="conjuge">Cônjuge</option>
                      <option value="filho">Filho ou filha</option>
                      <option value="pai-mae">Pai ou mãe</option>
                      <option value="irmao">Irmão ou irmã</option>
                      <option value="cuidador">Cuidador contratado</option>
                      <option value="proprio">Sou eu quem vai usar</option>
                      <option value="outro">Outro</option>
                    </SelectField>

                    <SelectField
                      label="Condição principal"
                      value={form.condition}
                      onChange={set('condition')}
                    onBlur={blur('condition')}
                      error={errors.condition}
                    >
                      <option value="">Selecione…</option>
                      <option value="ela">Esclerose lateral amiotrófica (ELA)</option>
                      <option value="tetraplegia">Tetraplegia alta</option>
                      <option value="pc">Paralisia cerebral severa</option>
                      <option value="avc">Sequela grave de AVC</option>
                      <option value="distrofia">Distrofia muscular avançada</option>
                      <option value="outra">Outra</option>
                      <option value="prefiro-nao">Prefiro não informar</option>
                    </SelectField>
                  </div>

                  <SelectField
                    label="Sistema do computador onde a IrisFlow será instalada"
                    value={form.os}
                    onChange={set('os')}
                    onBlur={blur('os')}
                    error={errors.os}
                    hint="Uma webcam comum já basta. Não é preciso comprar câmera."
                  >
                    <option value="">Selecione…</option>
                    <option value="windows">Windows</option>
                    <option value="macos">macOS</option>
                    <option value="linux">Linux</option>
                    <option value="nao-sei">Não sei dizer</option>
                  </SelectField>

                  <div className="flow__optional">
                    <p className="flow__optional-title">
                      Profissional que acompanha o caso <span>opcional</span>
                    </p>
                    <div className="flow__row">
                      <Field
                        label="Nome do profissional"
                        value={form.prescriberName ?? ''}
                        onChange={set('prescriberName')}
                        placeholder="Terapeuta ocupacional, fono, neuro…"
                      />
                      <Field
                        label="Especialidade"
                        value={form.prescriberRole ?? ''}
                        onChange={set('prescriberRole')}
                        placeholder="Fonoaudiologia, por exemplo"
                      />
                    </div>
                  </div>
                </fieldset>
              )}

              {step === 2 && (
                <fieldset className="flow__fieldset">
                  <legend className="flow__legend">
                    Confira antes de começar
                    <span>Nada é cobrado nesta etapa.</span>
                  </legend>

                  <dl className="summary">
                    <div>
                      <dt>Responsável</dt>
                      <dd>{form.buyerName}</dd>
                    </div>
                    <div>
                      <dt>E-mail</dt>
                      <dd>{form.email}</dd>
                    </div>
                    <div>
                      <dt>Telefone</dt>
                      <dd>{form.phone}</dd>
                    </div>
                    <div>
                      <dt>Quem vai usar</dt>
                      <dd>{form.userName}</dd>
                    </div>
                    <div>
                      <dt>Sistema</dt>
                      <dd>{osLabel(form.os)}</dd>
                    </div>
                    <div>
                      <dt>Plano</dt>
                      <dd>
                        {plan.name}: {TRIAL_DAYS} dias grátis, depois R$ {plan.price} {plan.period}
                      </dd>
                    </div>
                  </dl>

                  <CheckField
                    label={
                      <>
                        Li e aceito os{' '}
                        <Link to="/termos" style={{ color: 'var(--ok)', fontWeight: 600 }}>
                          termos de uso
                        </Link>{' '}
                        e a{' '}
                        <Link to="/privacidade" style={{ color: 'var(--ok)', fontWeight: 600 }}>
                          política de privacidade
                        </Link>
                        .
                      </>
                    }
                    checked={form.terms}
                    onChange={toggle('terms')}
                    error={errors.terms}
                  />

                  <CheckField
                    label="Quero receber novidades sobre o desenvolvimento do produto e do programa de validação clínica."
                    checked={form.newsletter}
                    onChange={toggle('newsletter')}
                  />
                </fieldset>
              )}

              <div className="flow__actions">
                {step > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={back}
                    icon={<Icon name="seta-esquerda" size={18} />}
                  >
                    Voltar
                  </Button>
                ) : (
                  <Button to="/planos" variant="ghost" icon={<Icon name="seta-esquerda" size={18} />}>
                    Ver os planos
                  </Button>
                )}

                {step < STEPS.length - 1 ? (
                  <Button type="button" onClick={next} disabled={!stepValid}>
                    Continuar
                  </Button>
                ) : (
                  <Button type="submit" loading={saving} disabled={!stepValid || saving}>
                    {saving ? 'Criando conta…' : 'Criar conta e começar'}
                  </Button>
                )}
              </div>
            </form>
          </div>
        </Reveal>

        <Reveal anim="fade" delay={320}>
          <p className="flow__foot">
            Já tem conta?{' '}
            <Link to="/entrar" className="underline-grow" style={{ color: 'var(--ok)' }}>
              Entrar
            </Link>
          </p>
        </Reveal>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Stepper } from '@/components/ui/Stepper'
import { Field, SelectField, CheckField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Card, CardIcon } from '@/components/ui/Card'
import { DownloadButton } from '@/components/ui/DownloadButton'
import { SessionLoading } from '@/components/ui/Skeleton'
import { Icon, type IconName } from '@/components/ui/Icon'
import { CompatCheck } from '@/components/sections/CompatCheck'
import { useAccount, type Account, type BetaProfile } from '@/context/AccountContext'
import {
  APP_CUIDADOR_URL,
  BETA_PROGRAM_RESERVA,
  fetchBetaProgram,
  markBetaDownload,
  type BetaProgram,
} from '@/services/api'
import { useDownloads } from '@/hooks/useDownloads'
import { formatDate, isCPF, isEmail, isPhone, maskCPF, maskPhone } from '@/utils/format'
import { BRAND } from '@/data/content'
import './checkout.css'
import './sucesso.css'
import './beta.css'

/* ============================================================
   Página /beta — a porta de entrada durante o programa beta.

   Três estados, decididos pela sessão (docs/BETA.md §1):
   - sem conta: cabeçalho explicando a beta + formulário em 3 etapas
     (mesmo desenho do /cadastro, com CPF opcional e sem plano a escolher);
   - com conta: painel de download (desktop + app do cuidador), com
     "acesso beta até <fim do programa>";
   - inscrições fechadas (`beta_program.open = false`): aviso e link para
     o contato, sem formulário.
   ============================================================ */

const STEPS = ['Quem responde', 'Quem usa', 'Confirmação']

type Form = BetaProfile & { terms: boolean; password: string; passwordConfirm: string }

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
  wantsCaregiverApp: true,
  feedbackConsent: true,
  howFound: '',
  terms: false,
  password: '',
  passwordConfirm: '',
}

/** Mesmo mínimo exigido pelo Supabase Auth por padrão. */
const SENHA_MINIMA = 8

type Errors = Partial<Record<keyof Form, string>>

/** O que a pessoa recebe e o que se espera dela, no cabeçalho da página. */
const O_QUE_RECEBE: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'download',
    title: 'O aplicativo no computador',
    text: `O ${BRAND.product} completo para Windows, macOS ou Linux, com todos os módulos liberados, sem limite de computadores.`,
  },
  {
    icon: 'pessoas',
    title: 'O app do cuidador no celular',
    text: 'O que o paciente escreve com os olhos chega ao celular da família; o que a família responde é falado na tela. Opcional.',
  },
  {
    icon: 'conversa',
    title: 'O que pedimos em troca',
    text: 'Retorno sincero: o que funcionou, o que travou, em que condições de luz e distância. É com isso que a versão final é feita.',
  },
]

const PROXIMOS_PASSOS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'download',
    title: 'Baixe e instale',
    text: 'Escolha o instalador do seu sistema. A instalação não pede permissão especial nem drivers de câmera. Entre com o mesmo e-mail e senha desta conta.',
  },
  {
    icon: 'webcam',
    title: 'Prepare o posto de uso',
    text: `Deixe o ${BRAND.product} medir distância, enquadramento e iluminação antes de calibrar. Ele indica o que ajustar quando não consegue corrigir sozinho.`,
  },
  {
    icon: 'conversa',
    title: 'Conte como foi',
    text: 'Depois das primeiras sessões, responda ao contato da equipe ou escreva pelo site. Cada relato muda a próxima versão.',
  },
]

/* ---------------- painel de download (com conta) ---------------- */

function PainelDownload({ account, program }: { account: Account; program: BetaProgram }) {
  const downloads = useDownloads()
  const [ready, setReady] = useState(false)

  // Pequena espera para que a animação de confirmação seja percebida.
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 450)
    return () => window.clearTimeout(t)
  }, [])

  // A data de fim mora na assinatura (next_charge_at = fim do programa na
  // inscrição). Uma conta antiga, de plano pago, mostra a data que tiver.
  const acessoAte = formatDate(account.nextChargeAt)
  const naBeta = account.planId === 'beta'

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
              Bem-vindo(a) à beta, {account.profile.buyerName.split(' ')[0]}.
            </h1>
          </Reveal>

          <Reveal anim="up" delay={300}>
            <p className="lead success__lead">
              {naBeta ? (
                <>
                  Acesso completo, sem cobrança, até <strong>{acessoAte}</strong>. Baixe o
                  aplicativo abaixo e entre com o mesmo e-mail e senha desta conta.
                </>
              ) : (
                <>
                  Sua conta já existe. Os instaladores da versão{' '}
                  <strong>{program.currentVersion}</strong> estão liberados abaixo.
                </>
              )}
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
                  {naBeta ? `Acesso beta até ${acessoAte}` : 'Conta ativa'}
                </dd>
              </div>
              <div>
                <dt>Versão</dt>
                <dd>{program.currentVersion}</dd>
              </div>
            </dl>
          </div>
        </Reveal>

        <Reveal anim="up" delay={460}>
          <div className="download">
            <h2 className="download__title">Baixe o {BRAND.product}</h2>
            <p className="download__note">
              Versão {program.currentVersion}. Se o botão do seu sistema estiver desabilitado, a
              versão ainda não foi publicada para ele — avisamos por e-mail assim que sair.
            </p>
            <div className="download__buttons">
              <DownloadButton
                href={downloads.windows}
                variant="teal"
                ready={ready}
                onDownload={() => void markBetaDownload('windows')}
              >
                Windows
              </DownloadButton>
              <DownloadButton
                href={downloads.macos}
                variant="secondary"
                ready={ready}
                onDownload={() => void markBetaDownload('macos')}
              >
                macOS
              </DownloadButton>
              <DownloadButton
                href={downloads.linux}
                variant="secondary"
                ready={ready}
                onDownload={() => void markBetaDownload('linux')}
              >
                Linux
              </DownloadButton>
            </div>
          </div>
        </Reveal>

        <Reveal anim="up" delay={500}>
          <div className="beta__cuidador panel">
            <div>
              <h2 className="beta__cuidador-title">App do cuidador</h2>
              <p className="beta__cuidador-text">
                {APP_CUIDADOR_URL
                  ? 'Para o celular de quem acompanha. Entre com o mesmo e-mail e senha desta conta.'
                  : 'O link do app do cuidador chega por e-mail, no endereço desta conta, assim que a versão da beta for publicada.'}
              </p>
            </div>
            {APP_CUIDADOR_URL && (
              <Button href={APP_CUIDADOR_URL} variant="secondary">
                Baixar app do cuidador
              </Button>
            )}
          </div>
        </Reveal>

        <CompatCheck delay={540} />

        <div className="grid grid--3" style={{ marginTop: 'var(--sp-7)' }}>
          {PROXIMOS_PASSOS.map((s, i) => (
            <Reveal key={s.title} anim="up" delay={580 + i * 100}>
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

/* ---------------- inscrições fechadas ---------------- */

function InscricoesFechadas({ program }: { program: BetaProgram }) {
  return (
    <div className="flow">
      <AmbientBackground particles={12} scan={false} light />
      <div className="container container--narrow flow__inner">
        <Reveal anim="fade">
          <span className="eyebrow">Programa beta</span>
        </Reveal>
        <Reveal anim="up">
          <h1 className="flow__title">As inscrições da beta estão fechadas no momento.</h1>
        </Reveal>
        <Reveal anim="up" delay={120}>
          <p className="lead flow__lead">
            A turma atual vai até {formatDate(program.endsAt)}. Deixe seu contato e avisamos
            quando abrir de novo — quem já se inscreveu continua entrando normalmente.
          </p>
        </Reveal>
        <Reveal anim="up" delay={200}>
          <div className="beta__closed-actions">
            <Button to="/contato">Deixar meu contato</Button>
            <Button to="/entrar" variant="ghost">
              Já tenho conta
            </Button>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

/* ---------------- formulário (sem conta) ---------------- */

function FormularioBeta({
  program,
  contaPelaMetade,
}: {
  program: BetaProgram
  /** Há sessão aberta, mas o cadastro não foi concluído. */
  contaPelaMetade: boolean
}) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Form>(EMPTY)
  // Ao trocar de etapa, a página rola até o cartão do formulário, não até o topo:
  // antes, cada 'Continuar' jogava a pessoa de volta ao cabeçalho da página.
  const cardRef = useRef<HTMLDivElement>(null)
  const rolarParaOFormulario = () =>
    cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const { registerBeta } = useAccount()

  const set =
    (key: keyof Form, mask?: (v: string) => string) =>
    (e: { target: { value: string } }) => {
      const value = mask ? mask(e.target.value) : e.target.value
      setForm((f) => ({ ...f, [key]: value }))
      setErrors((prev) => ({ ...prev, [key]: undefined }))
    }

  const toggle = (key: keyof Form) => (e: { target: { checked: boolean } }) => {
    setForm((f) => ({ ...f, [key]: e.target.checked }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validateStep = (s: number) => {
    const next: Errors = {}

    if (s === 0) {
      if (form.buyerName.trim().split(' ').length < 2)
        next.buyerName = 'Informe nome e sobrenome.'
      if (!isEmail(form.email)) next.email = 'Informe um e-mail válido.'
      if (!isPhone(form.phone)) next.phone = 'Informe um telefone com DDD.'
      // CPF opcional na beta: só valida se a pessoa preencheu algo.
      if (form.document.trim() && !isCPF(form.document))
        next.document = 'CPF inválido. Confira os dígitos ou deixe em branco.'
      if (form.password.length < SENHA_MINIMA)
        next.password = `A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`
      if (form.passwordConfirm !== form.password)
        next.passwordConfirm = 'As duas senhas precisam ser iguais.'
    }

    if (s === 1) {
      if (form.userName.trim().length < 3) next.userName = 'Informe o nome de quem vai usar.'
      if (!form.relation) next.relation = 'Selecione a relação com o usuário.'
      if (!form.condition) next.condition = 'Selecione a condição principal.'
      if (!form.os) next.os = 'Selecione o sistema operacional do computador.'
    }

    if (s === 2) {
      if (!form.terms) next.terms = 'É preciso aceitar os termos para continuar.'
    }

    setErrors(next)
    return Object.keys(next).length === 0
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
    // por isso ela sai daqui antes de o restante virar BetaProfile.
    const { terms: _terms, password, passwordConfirm: _confirm, ...profile } = form
    void _terms
    void _confirm

    try {
      // Com a conta carregada no contexto, esta mesma página passa a
      // mostrar o painel de download — não há navegação.
      await registerBeta(profile, password)
      rolarParaOFormulario()
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível concluir a inscrição.')
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
          <span className="eyebrow">Programa beta</span>
        </Reveal>

        <Reveal anim="up">
          <h1 className="flow__title">
            Use o {BRAND.product} de graça durante a beta e nos diga o que precisa mudar.
          </h1>
        </Reveal>

        <Reveal anim="up" delay={120}>
          <p className="lead flow__lead">
            A beta é fechada e gratuita: quem se inscreve recebe o aplicativo completo até{' '}
            <strong>{formatDate(program.endsAt)}</strong>, sem cartão, sem cobrança e sem
            fidelidade. Em troca, pedimos retorno sobre o uso real.
          </p>
        </Reveal>

        <Reveal anim="up" delay={160}>
          <ul className="beta__facts" aria-label="Resumo do programa beta">
            <li>
              <span>Custo</span>
              <strong>R$ 0</strong>
            </li>
            <li>
              <span>Acesso até</span>
              <strong>{formatDate(program.endsAt)}</strong>
            </li>
            <li>
              <span>Versão atual</span>
              <strong>{program.currentVersion}</strong>
            </li>
            <li>
              <span>Sistemas</span>
              <strong>Windows · macOS · Linux</strong>
            </li>
          </ul>
        </Reveal>

        <div className="grid grid--3 beta__receives">
          {O_QUE_RECEBE.map((item, i) => (
            <Reveal key={item.title} anim="up" delay={200 + i * 90}>
              <Card as="div">
                <CardIcon tone={i === 2 ? 'teal' : 'blue'}>
                  <Icon name={item.icon} size={24} />
                </CardIcon>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </Card>
            </Reveal>
          ))}
        </div>

        <Reveal anim="up" delay={320}>
          <div className="flow__card panel" id="inscricao" ref={cardRef}>
            {falha && (
              <div className="notice notice--warn" role="alert">
                <span className="notice__icon">
                  <Icon name="alerta" size={20} />
                </span>
                <p>{falha}</p>
              </div>
            )}

            {contaPelaMetade && !falha && (
              <div className="notice" role="status">
                <span className="notice__icon">
                  <Icon name="info" size={20} />
                </span>
                <p>
                  Sua conta já foi criada, mas a inscrição na beta ficou pela metade. Preencha
                  os dados abaixo com o mesmo e-mail para concluir.
                </p>
              </div>
            )}

            <Stepper steps={STEPS} current={step} />

            <form onSubmit={submit} noValidate>
              {step === 0 && (
                <fieldset className="flow__fieldset">
                  <legend className="flow__legend">
                    Dados de quem responde pela inscrição
                    <span>
                      Normalmente o familiar responsável ou o cuidador principal. É com este
                      e-mail e senha que o aplicativo e o app do cuidador são abertos.
                    </span>
                  </legend>

                  <Field
                    label="Nome completo"
                    value={form.buyerName}
                    onChange={set('buyerName')}
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
                      error={errors.email}
                      autoComplete="email"
                      placeholder="voce@exemplo.com.br"
                      hint="Usado para acessar a conta e receber os links de download."
                    />
                    <Field
                      label="Telefone"
                      type="tel"
                      value={form.phone}
                      onChange={set('phone', maskPhone)}
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
                    error={errors.document}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    hint="Opcional na beta. Se preencher, precisa ser um CPF válido."
                  />

                  <div className="flow__row">
                    <Field
                      label="Senha"
                      type="password"
                      value={form.password}
                      onChange={set('password')}
                      error={errors.password}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      hint={`Ao menos ${SENHA_MINIMA} caracteres. É com ela que vocês entram depois.`}
                    />
                    <Field
                      label="Confirmar senha"
                      type="password"
                      value={form.passwordConfirm}
                      onChange={set('passwordConfirm')}
                      error={errors.passwordConfirm}
                      autoComplete="new-password"
                      placeholder="••••••••"
                    />
                  </div>
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
                    error={errors.userName}
                    placeholder="Como ela gosta de ser chamada"
                  />

                  <div className="flow__row">
                    <SelectField
                      label="Sua relação com ela"
                      value={form.relation}
                      onChange={set('relation')}
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
                    Confira antes de entrar
                    <span>Nada é cobrado, agora nem depois. A beta é gratuita até o fim.</span>
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
                      <dd style={{ textTransform: 'capitalize' }}>{form.os}</dd>
                    </div>
                    <div>
                      <dt>Acesso</dt>
                      <dd>Beta gratuita até {formatDate(program.endsAt)}</dd>
                    </div>
                  </dl>

                  <CheckField
                    label="Quero também o app do cuidador no celular."
                    checked={form.wantsCaregiverApp}
                    onChange={toggle('wantsCaregiverApp')}
                  />

                  <CheckField
                    label="Aceito ser contatado(a) pela equipe para dar retorno sobre a beta."
                    checked={form.feedbackConsent}
                    onChange={toggle('feedbackConsent')}
                  />

                  <Field
                    label="Como conheceu a IrisFlow?"
                    value={form.howFound ?? ''}
                    onChange={set('howFound')}
                    placeholder="Indicação de um profissional, associação, redes sociais…"
                    hint="Opcional."
                  />

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
                  <Button to="/solucao" variant="ghost" icon={<Icon name="seta-esquerda" size={18} />}>
                    Ver a solução
                  </Button>
                )}

                {step < STEPS.length - 1 ? (
                  <Button type="button" onClick={next}>
                    Continuar
                  </Button>
                ) : (
                  <Button type="submit" loading={saving}>
                    {saving ? 'Inscrevendo…' : 'Entrar na beta'}
                  </Button>
                )}
              </div>
            </form>
          </div>
        </Reveal>

        <Reveal anim="fade" delay={420}>
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

/* ---------------- a página ---------------- */

export default function Beta() {
  const { account, authenticated, loading } = useAccount()
  const [program, setProgram] = useState<BetaProgram>(BETA_PROGRAM_RESERVA)

  // A leitura é pública (sem login) e nunca rejeita: em falha, fica a reserva.
  useEffect(() => {
    let vivo = true
    fetchBetaProgram().then((p) => {
      if (vivo) setProgram(p)
    })
    return () => {
      vivo = false
    }
  }, [])

  if (loading) return <SessionLoading />
  if (account) return <PainelDownload account={account} program={program} />
  if (!program.open) return <InscricoesFechadas program={program} />
  return <FormularioBeta program={program} contaPelaMetade={authenticated} />
}

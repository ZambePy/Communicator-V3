import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Stepper } from '@/components/ui/Stepper'
import { Field, SelectField, CheckField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Card, CardIcon } from '@/components/ui/Card'
import { DownloadPanel } from '@/components/ui/DownloadPanel'
import { SessionLoading } from '@/components/ui/Skeleton'
import { Icon, type IconName } from '@/components/ui/Icon'
import { CompatCheck } from '@/components/sections/CompatCheck'
import { useAccount, type Account, type BetaProfile } from '@/context/AccountContext'
import {
  APP_CUIDADOR_URL,
  BETA_PROGRAM_RESERVA,
  ConfirmacaoDeEmailPendente,
  fetchBetaProgram,
  fetchPerfilBasico,
  markBetaDownload,
  reenviarConfirmacao,
  type BetaProgram,
} from '@/services/api'
import { formatDate, isCPF, isEmail, isPhone, maskCPF, maskPhone, osLabel } from '@/utils/format'
import { SENHA_MINIMA, validar } from '@/utils/validation'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { useDownloads } from '@/hooks/useDownloads'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { BRAND, PLATFORMS, PRIVACY_LINE } from '@/data/content'
import { osOptionLabel } from '@/lib/releases'
import { lerRascunhoBeta, salvarRascunhoBeta } from '@/lib/rascunhoBeta'
import './checkout.css'
import './sucesso.css'
import './beta.css'

/* ============================================================
   Página /beta — a porta de entrada durante o programa beta.

   Estados, decididos pela sessão (README da raiz, seção "Site (site/)"):
   - sem conta: cabeçalho explicando a beta + formulário em 3 etapas
     (mesmo desenho do /cadastro, com CPF e telefone opcionais e sem plano
     a escolher);
   - "Confirm email" ligado no Supabase: depois de enviar, o formulário dá
     lugar ao aviso "confirme o e-mail" (com reenvio). O que não é sensível
     fica num rascunho local (lib/rascunhoBeta.ts);
   - sessão aberta sem inscrição (voltou pelo link do e-mail, ou abandonou
     no meio): o mesmo formulário, em modo "concluir" — sem nome, e-mail e
     senha, que já são da conta —, pré-preenchido com o perfil e o rascunho.
     CPF e condição de saúde são sempre pedidos de novo;
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

/** Regras de cada campo (src/utils/validation.ts), avaliadas enquanto se digita. */
const RULES_COMUNS: Rules<Form> = {
  // Telefone e CPF opcionais na beta: só validam se a pessoa preencheu algo.
  phone: validar.telefoneOpcional,
  document: validar.cpfOpcional,
  userName: (v) => (v.trim().length < 3 ? 'Informe o nome de quem vai usar (ao menos 3 letras).' : undefined),
  relation: (v) => validar.escolha(v, 'Selecione a relação com o usuário.'),
  condition: (v) => validar.escolha(v, 'Selecione a condição principal.'),
  os: (v) => validar.escolha(v, 'Selecione o sistema operacional do computador.'),
  terms: validar.aceite,
}

/** Inscrição nova: cria a conta, então pede nome, e-mail e senha. */
const RULES: Rules<Form> = {
  ...RULES_COMUNS,
  buyerName: validar.nomeCompleto,
  email: validar.email,
  password: validar.senha,
  passwordConfirm: (v, all) => validar.confirmacao(v, all.password),
}

/** Concluir a inscrição de uma conta que já existe (sessão aberta): nome,
    e-mail e senha são da conta e não passam pelo formulário. */
const RULES_CONCLUIR: Rules<Form> = RULES_COMUNS

/** Campos de cada etapa: o "Continuar" só habilita quando os da etapa passam. */
const STEP_FIELDS: (keyof Form)[][] = [
  ['buyerName', 'email', 'phone', 'document', 'password', 'passwordConfirm'],
  ['userName', 'relation', 'condition', 'os'],
  ['terms'],
]

const STEP_FIELDS_CONCLUIR: (keyof Form)[][] = [
  ['phone', 'document'],
  ['userName', 'relation', 'condition', 'os'],
  ['terms'],
]

/** O que a pessoa recebe e o que se espera dela, no cabeçalho da página. */
const O_QUE_RECEBE: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'download',
    title: 'O aplicativo no computador',
    text: `O ${BRAND.product} completo para ${PLATFORMS.long}, com todos os módulos liberados, sem limite de computadores.`,
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
  // A data de fim mora na assinatura (next_charge_at = fim do programa na
  // inscrição). Uma conta antiga, de plano pago, mostra a data que tiver.
  const acessoAte = formatDate(account.nextChargeAt)
  const naBeta = account.planId === 'beta'
  // A frase de sistemas acompanha o que o painel logo abaixo oferece (último
  // release do GitHub), e não só a configuração do build.
  const { platformsText } = useDownloads()

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
          <div className="flow__card panel beta__summary">
            <dl className="summary">
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
                <dd className="beta__ok">
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
              Versão {program.currentVersion}, para {platformsText.long}. Entre no aplicativo com
              o mesmo e-mail e senha desta conta.
            </p>
            <DownloadPanel onDownload={(os) => void markBetaDownload(os)} />
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

        <div className="grid grid--3 beta__steps">
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
            <Link to="/conta" className="underline-grow link-ok">
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

/* ---------------- confirmação de e-mail pendente ----------------
   Só aparece com "Confirm email" ligado no Supabase: o signUp criou o
   usuário, mas sem sessão, e a inscrição só termina depois do clique no
   link (que abre /entrar já autenticado e, de lá, volta para cá).
   ---------------------------------------------------------------- */

function ConfirmeOEmail({ email, onCorrigir }: { email: string; onCorrigir: () => void }) {
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const tituloRef = useRef<HTMLHeadingElement>(null)

  // O formulário some: o foco vai para o título novo, para o leitor de tela
  // anunciar a troca, e a página volta ao topo.
  useEffect(() => {
    window.scrollTo?.({ top: 0 })
    tituloRef.current?.focus()
  }, [])

  const reenviar = async () => {
    setEnviando(true)
    setAviso(null)
    try {
      await reenviarConfirmacao(email)
      setAviso({ ok: true, texto: `Enviamos de novo para ${email}. Vale o link mais recente.` })
    } catch (e) {
      setAviso({ ok: false, texto: e instanceof Error ? e.message : 'Não foi possível reenviar agora.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flow">
      <AmbientBackground particles={12} scan={false} light />
      <div className="container container--narrow flow__inner">
        <Reveal anim="fade">
          <span className="eyebrow">Programa beta</span>
        </Reveal>
        <h1 className="flow__title" ref={tituloRef} tabIndex={-1}>
          Falta confirmar o seu e-mail.
        </h1>
        <p className="lead flow__lead">
          Enviamos um link para <strong>{email}</strong>. Abra-o neste ou em outro aparelho: ele
          confirma o endereço e leva você de volta para concluir a inscrição, com o que já foi
          preenchido.
        </p>

        <div className="flow__card panel">
          <div className="notice" role="status">
            <span className="notice__icon">
              <Icon name="email" size={20} />
            </span>
            <p>
              Não chegou em alguns minutos? Confira o spam e as abas de promoções. Se este e-mail
              já tinha uma conta, nenhum link novo é enviado: é só{' '}
              <Link to="/entrar" className="link-ok">
                entrar com a senha
              </Link>
              .
            </p>
          </div>

          <p className="beta__pendente-privacidade">
            Por segurança, a condição de saúde e o CPF não ficam guardados neste navegador: eles
            são pedidos de novo na hora de concluir.
          </p>

          {aviso && (
            <div className={`notice${aviso.ok ? '' : ' notice--warn'}`} role={aviso.ok ? 'status' : 'alert'}>
              <span className="notice__icon">
                <Icon name={aviso.ok ? 'check' : 'alerta'} size={20} />
              </span>
              <p>{aviso.texto}</p>
            </div>
          )}

          <div className="flow__actions">
            <Button type="button" variant="ghost" onClick={onCorrigir}>
              Corrigir o e-mail
            </Button>
            <div className="beta__pendente-acoes">
              <Button type="button" variant="secondary" loading={enviando} onClick={() => void reenviar()}>
                {enviando ? 'Reenviando…' : 'Reenviar o link'}
              </Button>
              <Button to="/entrar">Já confirmei, entrar</Button>
            </div>
          </div>
        </div>
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
  // Modo "concluir": a conta já existe, então nome, e-mail e senha saem do
  // formulário (a RPC não os altera, e a senha seria ignorada).
  const concluir = contaPelaMetade
  const rules = concluir ? RULES_CONCLUIR : RULES
  const stepFields = concluir ? STEP_FIELDS_CONCLUIR : STEP_FIELDS
  // E-mail à espera de confirmação ("Confirm email" ligado no Supabase).
  const [pendente, setPendente] = useState<string | null>(null)
  // O formulário foi pré-preenchido com o rascunho guardado neste navegador.
  const [restaurado, setRestaurado] = useState(false)
  // Ao trocar de etapa, a página rola até o cartão do formulário, não até o topo:
  // antes, cada 'Continuar' jogava a pessoa de volta ao cabeçalho da página.
  const cardRef = useRef<HTMLDivElement>(null)
  const rolarParaOFormulario = () =>
    cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  const v = useFormValidation(form, rules)

  // A confirmação aconteceu em outra aba (o supabase-js avisa esta): sai do
  // aviso e segue para concluir, com o que já está preenchido aqui.
  useEffect(() => {
    if (concluir) setPendente(null)
  }, [concluir])

  // Conta já criada: traz nome, e-mail e telefone do perfil e, se houver, o
  // rascunho deste navegador. Nada disso sobrescreve o que já foi digitado.
  useEffect(() => {
    if (!concluir) return
    let vivo = true
    void fetchPerfilBasico().then((perfil) => {
      if (!vivo || !perfil) return
      const rascunho = lerRascunhoBeta(perfil.email)
      setForm((f) => {
        // Formulário em branco (chegou agora pelo link do e-mail): o rascunho
        // entra inteiro. Com dados em memória (mesma aba), eles valem mais.
        const emBranco = !f.userName && !f.relation && !f.os
        return {
          ...f,
          ...(rascunho && emBranco ? rascunho : {}),
          buyerName: perfil.buyerName || f.buyerName,
          email: perfil.email || f.email,
          phone: f.phone || (perfil.phone ? maskPhone(perfil.phone) : ''),
          newsletter: emBranco ? perfil.newsletter : f.newsletter,
        }
      })
      if (rascunho && Object.keys(rascunho).length > 0) setRestaurado(true)
    })
    return () => {
      vivo = false
    }
  }, [concluir])

  const errors = {
    buyerName: v.errorOf('buyerName'),
    email: v.errorOf('email'),
    phone: v.errorOf('phone'),
    document: v.errorOf('document'),
    password: v.errorOf('password'),
    passwordConfirm: v.errorOf('passwordConfirm'),
    userName: v.errorOf('userName'),
    relation: v.errorOf('relation'),
    condition: v.errorOf('condition'),
    os: v.errorOf('os'),
    terms: v.errorOf('terms'),
  }
  const blur = (key: keyof Form) => () => v.touch(key)
  const stepValid = v.isValid(stepFields[step])
  const [saving, setSaving] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const { registerBeta, signOut } = useAccount()

  const set =
    (key: keyof Form, mask?: (v: string) => string) =>
    (e: { target: { value: string } }) => {
      const value = mask ? mask(e.target.value) : e.target.value
      setForm((f) => ({ ...f, [key]: value }))
    }

  const toggle = (key: keyof Form) => (e: { target: { checked: boolean } }) => {
    setForm((f) => ({ ...f, [key]: e.target.checked }))
    // Caixa de seleção não tem "digitação": a escolha já conta como tocada.
    v.touch(key)
  }

  const validateStep = (s: number) => {
    v.touch(...stepFields[s])
    return v.isValid(stepFields[s])
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
      // mostrar o painel de download — não há navegação. Concluindo uma
      // conta que já existe, a sessão está aberta e a senha não é usada.
      await registerBeta(profile, concluir ? '' : password)
      rolarParaOFormulario()
    } catch (e) {
      if (e instanceof ConfirmacaoDeEmailPendente) {
        // Conta criada, e-mail a confirmar. Fica no navegador só o que não é
        // sensível (lib/rascunhoBeta.ts filtra: sem CPF, condição e senha).
        salvarRascunhoBeta(e.email, profile)
        setPendente(e.email)
        return
      }
      setFalha(e instanceof Error ? e.message : 'Não foi possível concluir a inscrição.')
      rolarParaOFormulario()
    } finally {
      setSaving(false)
    }
  }

  const campoTelefone = (
    <Field
      label="Telefone (opcional)"
      type="tel"
      value={form.phone}
      onChange={set('phone', maskPhone)}
      onBlur={blur('phone')}
      error={errors.phone}
      valid={isPhone(form.phone)}
      autoComplete="tel"
      placeholder="(11) 90000-0000"
      inputMode="numeric"
      hint="Com DDD. Pode deixar em branco: falamos com você por e-mail."
    />
  )

  const campoCpf = (
    <Field
      label="CPF"
      value={form.document}
      onChange={set('document', maskCPF)}
      onBlur={blur('document')}
      error={errors.document}
      valid={isCPF(form.document)}
      placeholder="000.000.000-00"
      inputMode="numeric"
      hint="Opcional na beta. Se preencher, precisa ser um CPF válido."
    />
  )

  if (pendente) {
    return (
      <ConfirmeOEmail
        email={pendente}
        onCorrigir={() => {
          setPendente(null)
          setStep(0)
        }}
      />
    )
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
            fidelidade. Em troca, pedimos retorno sobre o uso real. {PRIVACY_LINE}
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
              <span>Sistema</span>
              <strong>{PLATFORMS.short}</strong>
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

            {concluir && !falha && (
              <div className="notice" role="status">
                <span className="notice__icon">
                  <Icon name="info" size={20} />
                </span>
                <p>
                  Sua conta já existe, mas a inscrição na beta ficou pela metade. Confira os dados
                  abaixo para concluir.
                  {restaurado && ' Recuperamos o que ficou salvo neste navegador.'}
                  {!form.condition &&
                    ' Por segurança, a condição de saúde e o CPF nunca ficam guardados: informe de novo se já tinha preenchido.'}
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
                      {concluir
                        ? 'Nome e e-mail vêm da conta já criada. O aplicativo e o app do cuidador abrem com esse mesmo e-mail e a senha que você escolheu.'
                        : 'Normalmente o familiar responsável ou o cuidador principal. É com este e-mail e senha que o aplicativo e o app do cuidador são abertos.'}
                    </span>
                  </legend>

                  {concluir ? (
                    <>
                      <dl className="summary">
                        <div>
                          <dt>Responsável</dt>
                          <dd>{form.buyerName || '…'}</dd>
                        </div>
                        <div>
                          <dt>E-mail da conta</dt>
                          <dd>{form.email || '…'}</dd>
                        </div>
                      </dl>
                      <div className="flow__row">
                        {campoTelefone}
                        {campoCpf}
                      </div>
                    </>
                  ) : (
                    <>
                      <Field
                        label="Nome completo"
                        value={form.buyerName}
                        onChange={set('buyerName')}
                        onBlur={blur('buyerName')}
                        error={errors.buyerName}
                        valid={form.buyerName.trim().split(' ').length >= 2}
                        autoComplete="name"
                        placeholder="Maria Aparecida Souza"
                        hint="Nome e sobrenome."
                      />

                      <div className="flow__row">
                        <Field
                          label="E-mail"
                          type="email"
                          value={form.email}
                          onChange={set('email')}
                          onBlur={blur('email')}
                          error={errors.email}
                          valid={isEmail(form.email)}
                          autoComplete="email"
                          placeholder="voce@exemplo.com.br"
                          hint="Usado para acessar a conta e receber os links de download."
                        />
                        {campoTelefone}
                      </div>

                      {campoCpf}

                      <div className="flow__row">
                        <Field
                          label="Senha"
                          type="password"
                          value={form.password}
                          onChange={set('password')}
                          onBlur={blur('password')}
                          error={errors.password}
                          valid={form.password.length >= SENHA_MINIMA}
                          autoComplete="new-password"
                          hint={`Ao menos ${SENHA_MINIMA} caracteres. É com ela que vocês entram depois.`}
                          describedById="beta-senha-forca"
                          required
                        />
                        <Field
                          label="Confirmar senha"
                          type="password"
                          value={form.passwordConfirm}
                          onChange={set('passwordConfirm')}
                          onBlur={blur('passwordConfirm')}
                          error={errors.passwordConfirm}
                          valid={
                            form.passwordConfirm.length > 0 && form.passwordConfirm === form.password
                          }
                          autoComplete="new-password"
                          hint="Repita a mesma senha."
                          required
                        />
                      </div>
                      <PasswordStrength value={form.password} id="beta-senha-forca" />
                    </>
                  )}
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
                      {/* O enum condition_t do banco não tem valor próprio para
                          esclerose múltipla: entra em "outra" até a migração. */}
                      <option value="outra">Outra (esclerose múltipla, encarceramento…)</option>
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
                    <option value="windows">{osOptionLabel('windows')}</option>
                    <option value="macos">{osOptionLabel('macos')}</option>
                    <option value="linux">{osOptionLabel('linux')}</option>
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
                      <dd>{form.phone.trim() || 'Não informado'}</dd>
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
                    hint="Opcional. Indicação de profissional, associação, redes sociais…"
                  />

                  <CheckField
                    label={
                      <>
                        Li e aceito os{' '}
                        <Link to="/termos" className="link-ok">
                          termos de uso
                        </Link>{' '}
                        e a{' '}
                        <Link to="/privacidade" className="link-ok">
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
                  <Button type="button" onClick={next} disabled={!stepValid}>
                    Continuar
                  </Button>
                ) : (
                  <Button type="submit" loading={saving} disabled={!stepValid || saving}>
                    {saving ? 'Inscrevendo…' : 'Entrar na beta'}
                  </Button>
                )}
              </div>
              {!stepValid && (
                <p className="form-hint" aria-live="polite">
                  {step === 2
                    ? 'Marque o aceite dos termos e da política de privacidade para entrar.'
                    : 'Preencha os campos obrigatórios desta etapa para continuar.'}
                </p>
              )}
            </form>
          </div>
        </Reveal>

        <Reveal anim="fade" delay={420}>
          {concluir ? (
            <p className="flow__foot">
              Não é a sua conta?{' '}
              <button type="button" className="underline-grow link-ok beta__sair" onClick={() => void signOut()}>
                Sair
              </button>
            </p>
          ) : (
            <p className="flow__foot">
              Já tem conta?{' '}
              <Link to="/entrar" className="underline-grow link-ok">
                Entrar
              </Link>
            </p>
          )}
        </Reveal>
      </div>
    </div>
  )
}

/* ---------------- a página ---------------- */

export default function Beta() {
  const { account, authenticated, loading, sessionError, refresh } = useAccount()
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

  // Sessão aberta, mas a leitura da conta falhou por rede: não dá para
  // afirmar que a inscrição "ficou pela metade" (mesma regra do /conta).
  if (authenticated && sessionError) {
    return (
      <div className="flow">
        <div className="container container--narrow flow__inner">
          <div className="notice notice--warn" role="alert">
            <span className="notice__icon">
              <Icon name="alerta" size={20} />
            </span>
            <p>
              Não foi possível carregar os dados da sua conta ({sessionError}). Você continua
              conectado — isto é uma falha de conexão com o servidor, não um problema na inscrição.
            </p>
          </div>
          <Button onClick={() => void refresh()}>Tentar de novo</Button>
        </div>
      </div>
    )
  }

  if (!program.open) return <InscricoesFechadas program={program} />
  return <FormularioBeta program={program} contaPelaMetade={authenticated} />
}

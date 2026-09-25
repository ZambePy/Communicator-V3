import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { FormularioPesquisa } from '@/components/beta/FormularioPesquisa'
import { CompatCheck } from '@/components/sections/CompatCheck'
import { Button } from '@/components/ui/Button'
import { Card, CardIcon } from '@/components/ui/Card'
import { DownloadPanel } from '@/components/ui/DownloadPanel'
import { EtiquetaLancamento } from '@/components/ui/EtiquetaLancamento'
import { CheckField, Field } from '@/components/ui/Field'
import { Icon, type IconName } from '@/components/ui/Icon'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { SessionLoading } from '@/components/ui/Skeleton'
import { Stepper } from '@/components/ui/Stepper'
import { useAccount, type Account } from '@/context/AccountContext'
import { BETA, BRAND, ETAPAS_DA_BETA, PLATFORMS, PRIVACY_LINE } from '@/data/content'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { diaEMes, diaPorExtenso } from '@/lib/lancamento'
import {
  APP_CUIDADOR_URL,
  fetchPerfilBasico,
  markBetaDownload,
  reenviarConfirmacao,
  type BetaProgram,
} from '@/services/api'
import { formatDate, isEmail, osLabel } from '@/utils/format'
import { SENHA_MINIMA, validar } from '@/utils/validation'
import './checkout.css'
import './sucesso.css'
import './beta.css'

/* ============================================================
   Página /beta — a inscrição inteira, em quatro etapas com a trilha
   sempre à vista (ETAPAS_DA_BETA, content.ts):

   1. Criar conta — nome, e-mail e senha. Nada mais.
   2. Confirmar e-mail — "Confirm email" ligado no Supabase: o link abre
      /confirmar-email, que faz o login no aparelho onde foi clicado
      (celular ou computador) e agradece. Nesta aba, se a confirmação
      acontecer no mesmo navegador, a página segue sozinha.
   3. Pesquisa rápida — quem vai usar, condição, computador, app do
      cuidador (components/beta/FormularioPesquisa.tsx). É ela que abre a
      assinatura 'beta' (complete_beta_registration).
   4. Download — os três sistemas; o de lançamento (Windows) libera em
      beta_program.launch_at, com a etiqueta vermelha do dia até lá.

   A etapa vem da sessão, não de um estado da página: sem sessão = 1 (ou 2,
   logo depois de criar a conta); sessão sem conta = 3; conta = 4. Então F5,
   voltar outro dia ou abrir em outro aparelho sempre cai no lugar certo.
   ============================================================ */

/** O que a pessoa recebe na beta, ao lado do formulário. */
const O_QUE_RECEBE: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'download',
    title: 'O aplicativo no computador',
    text: `O ${BRAND.product} completo, com todos os módulos liberados e sem limite de computadores.`,
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

/** Título novo em foco e página no topo: quem usa leitor de tela ouve a troca de etapa. */
function useTituloEmFoco() {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    window.scrollTo?.({ top: 0 })
    ref.current?.focus()
  }, [])
  return ref
}

/* ---------------- etapa 1: criar conta ---------------- */

type FormConta = {
  nome: string
  email: string
  senha: string
  confirmacao: string
  termos: boolean
  newsletter: boolean
}

const RULES_CONTA: Rules<FormConta> = {
  nome: validar.nomeCompleto,
  email: validar.email,
  senha: validar.senha,
  confirmacao: (v, all) => validar.confirmacao(v, all.senha),
  termos: validar.aceite,
}

const CAMPOS_CONTA: (keyof FormConta)[] = ['nome', 'email', 'senha', 'confirmacao', 'termos']

const NOME_DO_CAMPO_CONTA: Record<keyof FormConta, string> = {
  nome: 'nome completo',
  email: 'e-mail',
  senha: 'senha',
  confirmacao: 'confirmação da senha',
  termos: 'aceite dos termos e da política de privacidade',
  newsletter: 'novidades',
}

/** "a, b e c" */
function lista(itens: string[]): string {
  if (itens.length <= 1) return itens.join('')
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

function CriarConta({ program }: { program: BetaProgram }) {
  const { criarContaBeta } = useAccount()
  const lancou = useJaLancou(program.launchAt)
  const [form, setForm] = useState<FormConta>({
    nome: '',
    email: '',
    senha: '',
    confirmacao: '',
    termos: false,
    newsletter: true,
  })
  const v = useFormValidation(form, RULES_CONTA)
  const [tentou, setTentou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  // E-mail à espera da confirmação (etapa 2).
  const [pendente, setPendente] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const set = (key: keyof FormConta) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const marcar = (key: 'termos' | 'newsletter') => (e: { target: { checked: boolean } }) => {
    setForm((f) => ({ ...f, [key]: e.target.checked }))
    v.touch(key)
  }

  const faltando = CAMPOS_CONTA.filter((k) => v.errors[k])

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    setFalha(null)
    v.touch(...CAMPOS_CONTA)
    if (faltando.length > 0) {
      formRef.current?.querySelector<HTMLElement>(`[data-campo="${faltando[0]}"] input`)?.focus()
      return
    }
    setEnviando(true)
    try {
      const resultado = await criarContaBeta({
        nome: form.nome,
        email: form.email,
        senha: form.senha,
        newsletter: form.newsletter,
      })
      // 'sessao': o projeto não exige confirmar o e-mail; a página já passa
      // para a pesquisa, porque a sessão chegou ao contexto.
      if (resultado === 'confirmar') setPendente(form.email.trim().toLowerCase())
    } catch (err) {
      setFalha(err instanceof Error ? err.message : 'Não foi possível criar a conta agora.')
    } finally {
      setEnviando(false)
    }
  }

  if (pendente) {
    return (
      <ConfirmeOEmail
        email={pendente}
        onCorrigir={() => {
          setPendente(null)
          setForm((f) => ({ ...f, senha: '', confirmacao: '' }))
          setTentou(false)
        }}
      />
    )
  }

  return (
    <div className="flow">
      <AmbientBackground particles={14} scan={false} light />

      <div className="container flow__inner beta">
        <div className="beta__abertura">
          <div className="beta__pitch">
            <Reveal anim="fade">
              <span className="eyebrow">Programa beta · gratuito</span>
            </Reveal>

            <Reveal anim="up">
              <h1 className="flow__title beta__titulo">
                Use o {BRAND.product} de graça durante a beta.
              </h1>
            </Reveal>

            <Reveal anim="up" delay={100}>
              {lancou ? (
                <p className="lead flow__lead">
                  A beta está aberta para {BETA.sistemaDoLancamento}. Crie sua conta, responda uma
                  pesquisa rápida e baixe o aplicativo. Sem cartão e sem cobrança. {PRIVACY_LINE}
                </p>
              ) : (
                <>
                  <p className="beta__lancamento">
                    <EtiquetaLancamento lancamento={program.launchAt} />
                    <span>
                      A beta fica disponível em <strong>{diaPorExtenso(program.launchAt)}</strong>,
                      primeiro para {BETA.sistemaDoLancamento}.
                    </span>
                  </p>
                  <p className="lead flow__lead">
                    Crie sua conta agora e responda uma pesquisa rápida: no dia do lançamento, o
                    download aparece para você aqui e no seu perfil. Sem cartão e sem cobrança.{' '}
                    {PRIVACY_LINE}
                  </p>
                </>
              )}
            </Reveal>

            <Reveal anim="up" delay={160}>
              <ul className="beta__facts" aria-label="Resumo do programa beta">
                <li>
                  <span>Custo</span>
                  <strong>R$ 0</strong>
                </li>
                <li className={lancou ? undefined : 'beta__fact--lancamento'}>
                  <span>Lançamento</span>
                  <strong>{lancou ? 'Aberta' : diaEMes(program.launchAt)}</strong>
                </li>
                <li>
                  <span>Sistema</span>
                  <strong>{PLATFORMS.short}</strong>
                </li>
                <li>
                  <span>Acesso até</span>
                  <strong>{formatDate(program.endsAt)}</strong>
                </li>
              </ul>
            </Reveal>

          </div>

          <Reveal anim="up" delay={120} className="beta__cartao-area">
            <div className="flow__card panel beta__cartao" id="inscricao">
              <Stepper steps={ETAPAS_DA_BETA} current={0} />

              <h2 className="beta__cartao-titulo">Crie sua conta</h2>
              <p className="beta__cartao-texto">
                O e-mail e a senha daqui abrem o site, o aplicativo e o app do cuidador.
              </p>

              {falha && (
                <div className="notice notice--warn" role="alert">
                  <span className="notice__icon">
                    <Icon name="alerta" size={20} />
                  </span>
                  <p>{falha}</p>
                </div>
              )}

              <form ref={formRef} onSubmit={enviar} noValidate>
                <div data-campo="nome">
                  <Field
                    label="Nome completo"
                    value={form.nome}
                    onChange={set('nome')}
                    {...v.bind('nome')}
                    valid={!v.errors.nome}
                    autoComplete="name"
                    placeholder="Maria Aparecida Souza"
                    hint="De quem responde pela inscrição: normalmente o familiar ou o cuidador principal."
                  />
                </div>

                <div data-campo="email">
                  <Field
                    label="E-mail"
                    type="email"
                    value={form.email}
                    onChange={set('email')}
                    {...v.bind('email')}
                    valid={isEmail(form.email)}
                    autoComplete="email"
                    inputMode="email"
                    placeholder="voce@exemplo.com.br"
                    hint="Enviamos para ele o link de confirmação."
                  />
                </div>

                <div className="flow__row">
                  <div data-campo="senha">
                    <Field
                      label="Senha"
                      type="password"
                      value={form.senha}
                      onChange={set('senha')}
                      {...v.bind('senha')}
                      valid={form.senha.length >= SENHA_MINIMA}
                      autoComplete="new-password"
                      hint={`Ao menos ${SENHA_MINIMA} caracteres.`}
                      describedById="beta-senha-forca"
                    />
                  </div>
                  <div data-campo="confirmacao">
                    <Field
                      label="Confirmar senha"
                      type="password"
                      value={form.confirmacao}
                      onChange={set('confirmacao')}
                      {...v.bind('confirmacao')}
                      valid={form.confirmacao.length > 0 && form.confirmacao === form.senha}
                      autoComplete="new-password"
                      hint="Repita a mesma senha."
                    />
                  </div>
                </div>
                <PasswordStrength value={form.senha} id="beta-senha-forca" />

                <div data-campo="termos">
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
                    checked={form.termos}
                    onChange={marcar('termos')}
                    error={v.errorOf('termos')}
                  />
                </div>

                <CheckField
                  label="Quero receber novidades do produto e do programa de validação clínica."
                  checked={form.newsletter}
                  onChange={marcar('newsletter')}
                />

                <Button type="submit" full size="lg" loading={enviando} disabled={enviando}>
                  {enviando ? 'Criando a conta…' : 'Criar conta'}
                </Button>

                {tentou && faltando.length > 0 && (
                  <p className="form-hint" role="status" aria-live="polite">
                    Para continuar, falta preencher ou corrigir:{' '}
                    {lista(faltando.map((k) => NOME_DO_CAMPO_CONTA[k]))}.
                  </p>
                )}
              </form>

              <p className="flow__foot">
                Já tem conta?{' '}
                <Link to="/entrar" className="underline-grow link-ok">
                  Entrar
                </Link>
              </p>
            </div>
          </Reveal>

          <ul className="beta__recebe">
            {O_QUE_RECEBE.map((item, i) => (
              <Reveal as="li" key={item.title} anim="up" delay={200 + i * 80}>
                <span className="beta__recebe-icone" aria-hidden="true">
                  <Icon name={item.icon} size={22} />
                </span>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.text}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/* ---------------- etapa 2: confirmar o e-mail ---------------- */

function ConfirmeOEmail({ email, onCorrigir }: { email: string; onCorrigir: () => void }) {
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const tituloRef = useTituloEmFoco()

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
        <div className="flow__card panel">
          <Stepper steps={ETAPAS_DA_BETA} current={1} />

          <span className="beta__icone-grande" aria-hidden="true">
            <Icon name="email" size={30} />
          </span>
          <h1 className="flow__title beta__etapa-titulo" ref={tituloRef} tabIndex={-1}>
            Confirme seu e-mail para continuar
          </h1>
          <p className="lead beta__etapa-texto">
            Enviamos um link para <strong>{email}</strong>. Pode abrir no celular ou no computador:
            ao confirmar, você já entra na conta nesse aparelho e segue para a pesquisa rápida.
          </p>

          <div className="notice" role="status">
            <span className="notice__icon">
              <Icon name="info" size={20} />
            </span>
            <p>
              Não chegou em alguns minutos? Confira o spam e a aba Promoções. Se este e-mail já tinha
              conta, nenhum link novo é enviado: é só{' '}
              <Link to="/entrar" className="link-ok">
                entrar com a senha
              </Link>
              .
            </p>
          </div>

          {aviso && (
            <div className={`notice${aviso.ok ? '' : ' notice--warn'}`} role={aviso.ok ? 'status' : 'alert'}>
              <span className="notice__icon">
                <Icon name={aviso.ok ? 'check' : 'alerta'} size={20} />
              </span>
              <p>{aviso.texto}</p>
            </div>
          )}

          <div className="beta__confirme-acoes">
            <Button to={`/entrar?email=${encodeURIComponent(email)}`} full size="lg">
              Já confirmei, continuar aqui
            </Button>
            <div className="beta__confirme-secundarias">
              <Button type="button" variant="secondary" loading={enviando} onClick={() => void reenviar()}>
                {enviando ? 'Reenviando…' : 'Reenviar o link'}
              </Button>
              <Button type="button" variant="ghost" onClick={onCorrigir}>
                Corrigir o e-mail
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- etapa 3: pesquisa rápida ---------------- */

function Pesquisa({ program }: { program: BetaProgram }) {
  const { responderPesquisa, signOut } = useAccount()
  const [perfil, setPerfil] = useState<{ nome: string; newsletter: boolean } | null>(null)
  const [carregado, setCarregado] = useState(false)
  const tituloRef = useTituloEmFoco()

  // O nome de quem se inscreveu: vira o "nome de quem vai usar" quando é a
  // própria pessoa, e dá o "Olá". Sem rede, a pesquisa segue sem ele.
  useEffect(() => {
    let vivo = true
    void fetchPerfilBasico().then((p) => {
      if (!vivo) return
      setPerfil(p ? { nome: p.buyerName, newsletter: p.newsletter } : null)
      setCarregado(true)
    })
    return () => {
      vivo = false
    }
  }, [])

  const primeiroNome = perfil?.nome.split(' ')[0] ?? ''

  return (
    <div className="flow">
      <AmbientBackground particles={12} scan={false} light />
      <div className="container container--narrow flow__inner">
        <div className="flow__card panel">
          <Stepper steps={ETAPAS_DA_BETA} current={2} />

          <h1 className="flow__title beta__etapa-titulo" ref={tituloRef} tabIndex={-1}>
            {primeiroNome ? `${primeiroNome}, falta só a pesquisa rápida` : 'Falta só a pesquisa rápida'}
          </h1>
          <p className="lead beta__etapa-texto">
            Sua conta está criada. Conte quem vai usar o {BRAND.product}: são poucas perguntas, e
            no fim aparece a área de download.
          </p>

          {carregado ? (
            <FormularioPesquisa
              nomeDoResponsavel={perfil?.nome ?? ''}
              lancamento={program.launchAt}
              textoDoBotao="Concluir inscrição"
              onEnviar={async (respostas) => {
                await responderPesquisa(respostas)
              }}
            />
          ) : (
            <SessionLoading />
          )}
        </div>

        <p className="flow__foot">
          Não é a sua conta?{' '}
          <button type="button" className="underline-grow link-ok beta__sair" onClick={() => void signOut()}>
            Sair
          </button>
        </p>
      </div>
    </div>
  )
}

/* ---------------- etapa 4: download ---------------- */

function Download({ account, program }: { account: Account; program: BetaProgram }) {
  const lancou = useJaLancou(program.launchAt)
  const naBeta = account.planId === 'beta'
  const primeiroNome = account.profile.buyerName.split(' ')[0]
  const acessoAte = formatDate(account.nextChargeAt)
  const tituloRef = useTituloEmFoco()

  const resumo = useMemo(
    () => [
      { dt: 'Conta', dd: account.profile.email },
      { dt: 'Quem vai usar', dd: account.profile.userName || '—' },
      { dt: 'Computador', dd: osLabel(account.profile.os) || '—' },
      {
        dt: 'Situação',
        dd: naBeta ? `Inscrição completa · acesso gratuito até ${acessoAte}` : 'Conta ativa',
      },
    ],
    [account, naBeta, acessoAte],
  )

  return (
    <div className="flow">
      <AmbientBackground particles={18} light />

      <div className="container container--narrow flow__inner">
        <div className="flow__card panel beta__trilha-final">
          <Stepper steps={ETAPAS_DA_BETA} current={lancou ? 4 : 3} />
        </div>

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

          <h1 className="success__title" ref={tituloRef} tabIndex={-1}>
            {lancou ? `Tudo pronto, ${primeiroNome}! Baixe o IrisFlow.` : `Inscrição concluída, ${primeiroNome}!`}
          </h1>

          {lancou ? (
            <p className="lead success__lead">
              {naBeta ? (
                <>
                  Acesso completo, sem cobrança, até <strong>{acessoAte}</strong>. Entre no
                  aplicativo com o mesmo e-mail e senha desta conta.
                </>
              ) : (
                <>
                  Sua conta já existe. Os instaladores da versão{' '}
                  <strong>{program.currentVersion}</strong> estão liberados abaixo.
                </>
              )}
            </p>
          ) : (
            <>
              <p className="beta__lancamento beta__lancamento--centro">
                <EtiquetaLancamento lancamento={program.launchAt} />
              </p>
              <p className="lead success__lead">
                A beta fica disponível em <strong>{diaPorExtenso(program.launchAt)}</strong>. Nesse
                dia, o download para {BETA.sistemaDoLancamento} é liberado aqui e no seu perfil: é só
                voltar e baixar.
              </p>
            </>
          )}
        </div>

        <div className="flow__card panel beta__summary">
          <dl className="summary">
            {resumo.map((r) => (
              <div key={r.dt}>
                <dt>{r.dt}</dt>
                <dd>{r.dd}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="download" id="download">
          <h2 className="download__title">
            {lancou ? `Baixe o ${BRAND.product}` : 'Instaladores da beta'}
          </h2>
          <p className="download__note">
            {lancou
              ? `Versão ${program.currentVersion}. Entre no aplicativo com o mesmo e-mail e senha desta conta.`
              : `${BETA.sistemaDoLancamento} abre em ${diaEMes(program.launchAt)}. macOS e Linux estão em preparação: avisamos por e-mail quando saírem.`}
          </p>
          <DownloadPanel liberaEm={program.launchAt} onDownload={(os) => void markBetaDownload(os)} />
        </div>

        <div className="beta__cuidador panel">
          <div>
            <h2 className="beta__cuidador-title">App do cuidador</h2>
            <p className="beta__cuidador-text">
              {!lancou
                ? `Para o celular de quem acompanha. Também abre em ${diaEMes(program.launchAt)}, com o mesmo e-mail e senha desta conta.`
                : APP_CUIDADOR_URL
                  ? 'Para o celular de quem acompanha. Entre com o mesmo e-mail e senha desta conta.'
                  : 'O link do app do cuidador chega por e-mail, no endereço desta conta, assim que a versão da beta for publicada.'}
            </p>
          </div>
          {lancou && APP_CUIDADOR_URL ? (
            <Button href={APP_CUIDADOR_URL} variant="secondary">
              Baixar app do cuidador
            </Button>
          ) : !lancou ? (
            <EtiquetaLancamento lancamento={program.launchAt} />
          ) : null}
        </div>

        {lancou && (
          <>
            <CompatCheck delay={120} />
            <div className="grid grid--3 beta__steps">
              {PROXIMOS_PASSOS.map((s, i) => (
                <Card as="div" key={s.title}>
                  <CardIcon tone={i === 2 ? 'teal' : 'blue'}>
                    <Icon name={s.icon} size={26} />
                  </CardIcon>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </Card>
              ))}
            </div>
          </>
        )}

        <div className="beta__fim">
          <Button to="/perfil" variant={lancou ? 'secondary' : 'primary'}>
            Ver meu perfil
          </Button>
          <Button to="/contato" variant="ghost">
            Falar com a equipe
          </Button>
        </div>
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
        <span className="eyebrow">Programa beta</span>
        <h1 className="flow__title">As inscrições da beta estão fechadas no momento.</h1>
        <p className="lead flow__lead">
          A turma atual vai até {formatDate(program.endsAt)}. Deixe seu contato e avisamos quando
          abrir de novo — quem já se inscreveu continua entrando normalmente.
        </p>
        <div className="beta__closed-actions">
          <Button to="/contato">Deixar meu contato</Button>
          <Button to="/entrar" variant="ghost">
            Já tenho conta
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ---------------- a página ---------------- */

export default function Beta() {
  const { account, authenticated, loading, sessionError, refresh } = useAccount()
  const program = useBetaProgram()

  if (loading) return <SessionLoading />
  if (account) return <Download account={account} program={program} />

  // Sessão aberta, mas a leitura da conta falhou por rede: não dá para
  // afirmar que falta a pesquisa (mesma regra do /perfil).
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

  if (authenticated) return <Pesquisa program={program} />
  if (!program.open) return <InscricoesFechadas program={program} />
  return <CriarConta program={program} />
}

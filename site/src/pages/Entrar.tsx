import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { SessionLoading } from '@/components/ui/Skeleton'
import { useAccount } from '@/context/AccountContext'
import { EMAIL_NAO_CONFIRMADO } from '@/lib/supabase'
import { ApiError, reenviarConfirmacao, verificarLinkDoEmail } from '@/services/api'
import { CodigoDeVerificacao } from '@/components/beta/CodigoDeVerificacao'
import { isEmail } from '@/utils/format'
import { motivoDoLinkNaUrl } from '@/utils/linkDeEmail'
import { validar } from '@/utils/validation'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { Icon } from '@/components/ui/Icon'
import { BETA, BETA_CTA } from '@/data/content'
import './checkout.css'
import { FundoDaPagina } from '@/components/layout/FundoDaPagina'

type Form = { email: string; password: string }

const NOME_DO_CAMPO: Record<keyof Form, string> = { email: 'e-mail', password: 'senha' }

const RULES: Rules<Form> = {
  email: validar.email,
  password: validar.senhaAtual,
}

/** Login recusado porque o e-mail ainda não foi confirmado ("Confirm email" ligado). */
function ehEmailNaoConfirmado(e: unknown): boolean {
  return e instanceof ApiError && (e.code === 'email_not_confirmed' || e.message === EMAIL_NAO_CONFIRMADO)
}

/* ============================================================
   Tela de acesso. Depois de entrar, cada um segue para a etapa em que
   está: quem ainda não respondeu a pesquisa da beta vai para /beta (a
   pesquisa); quem já respondeu, para /perfil.

   `?email=` preenche o e-mail — é o caminho do "Confirmei pelo botão do
   e-mail" da /beta, para quem confirmou no celular e voltou ao computador.
   E-mail ainda não confirmado: o código de 4 dígitos aparece aqui mesmo. Links de confirmação antigos (de antes da /confirmar-email)
   ainda caem aqui com a sessão no endereço, ou com o motivo quando o link
   venceu, dito acima do formulário.
   ============================================================ */

export default function Entrar() {
  const [busca] = useSearchParams()
  const [email, setEmail] = useState(() => busca.get('email')?.trim() ?? '')
  const [password, setPassword] = useState('')
  const values = useMemo(() => ({ email, password }), [email, password])
  const v = useFormValidation(values, RULES)
  // Erro do servidor (senha errada, rede): fica acima do botão, não num campo.
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // O botão não fica apagado: apertar com campo vazio mostra o que falta e
  // leva o foco ao primeiro campo (um botão desabilitado não recebe foco nem
  // explica o motivo a quem usa leitor de tela; P2-10, 21/10/2026).
  const [tentou, setTentou] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const [naoConfirmado, setNaoConfirmado] = useState(false)
  const { signIn, authenticated, account, loading: carregandoSessao, refresh } = useAccount()
  const navigate = useNavigate()
  const motivo = useMemo(() => motivoDoLinkNaUrl(), [])

  // Já há sessão (inclusive quem chegou por um link de confirmação antigo):
  // não faz sentido pedir a senha. Segue para a etapa em que a pessoa está.
  useEffect(() => {
    if (!carregandoSessao && authenticated && !loading) {
      navigate(account ? '/perfil' : '/beta', { replace: true })
    }
  }, [carregandoSessao, authenticated, account, loading, navigate])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNaoConfirmado(false)
    setTentou(true)
    v.touch('email', 'password')
    if (!v.isValid()) {
      const primeiro = v.errors.email ? 'email' : 'password'
      formRef.current?.querySelector<HTMLElement>(`[data-campo="${primeiro}"] input`)?.focus()
      return
    }

    setLoading(true)
    try {
      const conta = await signIn(email, password)
      navigate(conta ? '/perfil' : '/beta', { replace: true })
    } catch (e) {
      setNaoConfirmado(ehEmailNaoConfirmado(e))
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  // Espera a sessão ser lida: quem chega pelo link do e-mail já está entrando.
  if (carregandoSessao) return <SessionLoading />

  const faltando = (['email', 'password'] as const).filter((k) => v.errors[k])

  return (
    <div className="flow">
      <FundoDaPagina variante="calmo" />
      <div className="container flow__inner flow__inner--narrow">
        <Reveal anim="up">
          <h1 className="flow__title">Entrar na sua conta</h1>
        </Reveal>

        <Reveal anim="up" delay={140}>
          <div className="flow__card panel">
            {motivo && !error && (
              <div className="notice notice--warn" role="alert">
                <span className="notice__icon">
                  <Icon name="alerta" size={20} />
                </span>
                <p>
                  {motivo} Entre com o e-mail e a senha da inscrição: se o endereço ainda não
                  estiver confirmado, você pode pedir um código novo aqui mesmo.
                </p>
              </div>
            )}

            <form ref={formRef} onSubmit={submit} noValidate>
              <div data-campo="email">
                <Field
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  {...v.bind('email')}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="voce@exemplo.com.br"
                  valid={isEmail(email)}
                  hint="O mesmo e-mail usado na inscrição."
                  required
                />
              </div>

              <div data-campo="password">
                <Field
                  label="Senha"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  {...v.bind('password')}
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div className="notice notice--warn" role="alert">
                  <span className="notice__icon">
                    <Icon name="alerta" size={20} />
                  </span>
                  <p>{error}</p>
                </div>
              )}

              {naoConfirmado && (
                <div className="entrar__codigo">
                  <CodigoDeVerificacao
                    email={email.trim().toLowerCase()}
                    esperaInicial={0}
                    instrucao={
                      <>
                        Digite o código de 4 dígitos do último e-mail que enviamos para{' '}
                        <strong>{email.trim()}</strong>, ou peça outro.
                      </>
                    }
                    aoConfirmar={async (tokenHash) => {
                      // Com o e-mail confirmado, a sessão já nasce aqui; o efeito
                      // acima leva a pessoa para a etapa em que ela está.
                      await verificarLinkDoEmail(tokenHash, 'email')
                      await refresh()
                    }}
                    aoReenviar={() => reenviarConfirmacao(email)}
                  />
                </div>
              )}

              <Button type="submit" full size="lg" loading={loading} disabled={loading}>
                {loading ? 'Entrando…' : 'Entrar'}
              </Button>
              {tentou && faltando.length > 0 && (
                <p className="form-hint" role="status" aria-live="polite">
                  Para entrar, falta preencher: {faltando.map((k) => NOME_DO_CAMPO[k]).join(' e ')}.
                </p>
              )}
            </form>

            <p className="flow__foot flow__foot--junto">
              <Link to="/recuperar-senha" className="underline-grow">
                Esqueci minha senha
              </Link>
            </p>

            <p className="flow__foot flow__foot--junto">
              Ainda não tem conta?{' '}
              {BETA.ativo ? (
                <Link to={BETA_CTA.to} className="underline-grow">
                  Criar conta na beta
                </Link>
              ) : (
                <Link to="/cadastro" className="underline-grow">
                  Começar a avaliação gratuita
                </Link>
              )}
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

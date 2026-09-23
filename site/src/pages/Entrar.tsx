import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { SessionLoading } from '@/components/ui/Skeleton'
import { useAccount } from '@/context/AccountContext'
import { EMAIL_NAO_CONFIRMADO } from '@/lib/supabase'
import { ApiError, reenviarConfirmacao } from '@/services/api'
import { isEmail } from '@/utils/format'
import { motivoDoLinkNaUrl } from '@/utils/linkDeEmail'
import { SENHA_MINIMA, validar } from '@/utils/validation'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { Icon } from '@/components/ui/Icon'
import { BETA, BETA_CTA } from '@/data/content'
import './checkout.css'

type Form = { email: string; password: string }

const RULES: Rules<Form> = {
  email: validar.email,
  password: validar.senhaAtual,
}

/** Login recusado porque o e-mail ainda não foi confirmado ("Confirm email" ligado). */
function ehEmailNaoConfirmado(e: unknown): boolean {
  return e instanceof ApiError && (e.code === 'email_not_confirmed' || e.message === EMAIL_NAO_CONFIRMADO)
}

/* ============================================================
   Tela de acesso. Também é o destino do link de confirmação do cadastro
   (emailRedirectTo em services/api.ts): o supabase-js abre a sessão a
   partir da URL e esta tela segue para /conta, que leva uma conta sem
   inscrição concluída de volta para /beta. Link vencido ou já usado
   volta para cá com o motivo na URL, dito acima do formulário.
   ============================================================ */

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const values = useMemo(() => ({ email, password }), [email, password])
  const v = useFormValidation(values, RULES)
  // Erro do servidor (senha errada, rede): fica acima do botão, não num campo.
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [naoConfirmado, setNaoConfirmado] = useState(false)
  const [reenviando, setReenviando] = useState(false)
  const [reenvio, setReenvio] = useState<{ ok: boolean; texto: string } | null>(null)
  const { signIn, authenticated, loading: carregandoSessao } = useAccount()
  const navigate = useNavigate()
  const motivo = useMemo(() => motivoDoLinkNaUrl(), [])

  // Já há sessão (inclusive quem acabou de chegar pelo link de confirmação):
  // não faz sentido pedir a senha. O painel decide o resto.
  useEffect(() => {
    if (!carregandoSessao && authenticated && !loading) navigate('/conta', { replace: true })
  }, [carregandoSessao, authenticated, loading, navigate])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setNaoConfirmado(false)
    setReenvio(null)
    v.touch('email', 'password')
    if (!v.isValid()) return

    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/conta')
    } catch (e) {
      setNaoConfirmado(ehEmailNaoConfirmado(e))
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  const reenviar = async () => {
    setReenviando(true)
    setReenvio(null)
    try {
      await reenviarConfirmacao(email)
      setReenvio({ ok: true, texto: `Enviamos um novo link para ${email.trim()}. Vale o mais recente.` })
    } catch (e) {
      setReenvio({ ok: false, texto: e instanceof Error ? e.message : 'Não foi possível reenviar agora.' })
    } finally {
      setReenviando(false)
    }
  }

  // Espera a sessão ser lida: quem chega pelo link do e-mail já está entrando.
  if (carregandoSessao) return <SessionLoading />

  return (
    <div className="flow">
      <AmbientBackground particles={12} scan={false} light />

      <div className="container flow__inner flow__inner--narrow">
        <Reveal anim="fade">
          <span className="eyebrow">Acesso</span>
        </Reveal>

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
                  estiver confirmado, você pode pedir um link novo aqui mesmo.
                </p>
              </div>
            )}

            <form onSubmit={submit} noValidate>
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

              <Field
                label="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                {...v.bind('password')}
                autoComplete="current-password"
                hint={`Ao menos ${SENHA_MINIMA} caracteres.`}
                required
              />

              {error && (
                <div className="notice notice--warn" role="alert">
                  <span className="notice__icon">
                    <Icon name="alerta" size={20} />
                  </span>
                  <p>{error}</p>
                </div>
              )}

              {naoConfirmado && (
                <div className="entrar__reenvio">
                  <Button
                    type="button"
                    variant="secondary"
                    full
                    loading={reenviando}
                    onClick={() => void reenviar()}
                  >
                    {reenviando ? 'Reenviando…' : 'Reenviar o link de confirmação'}
                  </Button>
                  {reenvio && (
                    <p
                      className={reenvio.ok ? 'form-hint' : 'field__error'}
                      role={reenvio.ok ? 'status' : 'alert'}
                    >
                      {reenvio.texto}
                    </p>
                  )}
                </div>
              )}

              <Button type="submit" full size="lg" loading={loading} disabled={!v.isValid() || loading}>
                {loading ? 'Entrando…' : 'Entrar'}
              </Button>
              {!v.isValid() && (
                <p className="form-hint">Preencha e-mail e senha para entrar.</p>
              )}
            </form>

            <p className="flow__foot" style={{ marginBottom: 0 }}>
              <Link to="/recuperar-senha" className="underline-grow">
                Esqueci minha senha
              </Link>
            </p>

            <p className="flow__foot" style={{ marginBottom: 0 }}>
              Ainda não tem conta?{' '}
              {BETA.ativo ? (
                <Link to={BETA_CTA.to} className="underline-grow" style={{ color: 'var(--ok)' }}>
                  {BETA_CTA.labelLong}
                </Link>
              ) : (
                <Link to="/cadastro" className="underline-grow" style={{ color: 'var(--ok)' }}>
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

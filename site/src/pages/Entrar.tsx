import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { useAccount } from '@/context/AccountContext'
import { isEmail } from '@/utils/format'
import { BETA, BETA_CTA } from '@/data/content'
import './checkout.css'

export default function Entrar() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { signIn } = useAccount()
  const navigate = useNavigate()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isEmail(email)) {
      setError('Informe um e-mail válido.')
      return
    }
    if (password.length < 6) {
      setError('A senha precisa ter ao menos 6 caracteres.')
      return
    }

    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/conta')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flow">
      <AmbientBackground particles={12} scan={false} light />

      <div className="container flow__inner" style={{ maxWidth: 520 }}>
        <Reveal anim="fade">
          <span className="eyebrow">Acesso</span>
        </Reveal>

        <Reveal anim="up">
          <h1 className="flow__title">Entrar na sua conta</h1>
        </Reveal>

        <Reveal anim="up" delay={140}>
          <div className="flow__card panel">
            <form onSubmit={submit} noValidate>
              <Field
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="voce@exemplo.com.br"
              />

              <Field
                label="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                error={error ?? undefined}
              />

              <Button type="submit" full size="lg" loading={loading}>
                {loading ? 'Entrando…' : 'Entrar'}
              </Button>
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

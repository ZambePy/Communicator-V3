import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { requestPasswordReset } from '@/services/api'
import { isEmail } from '@/utils/format'
import './checkout.css'

/**
 * Para onde o link do e-mail leva. É a origem em que o site está rodando
 * (localhost em desenvolvimento, o domínio em produção), e cada uma delas
 * precisa estar em Authentication > URL Configuration > Redirect URLs no
 * painel do Supabase — ver README, "Recuperação de senha".
 */
export function urlDeNovaSenha(): string {
  return `${window.location.origin}/nova-senha`
}

export default function RecuperarSenha() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isEmail(email)) {
      setError('Informe um e-mail válido.')
      return
    }

    setLoading(true)
    try {
      await requestPasswordReset(email, urlDeNovaSenha())
      setEnviado(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o e-mail agora.')
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
          <h1 className="flow__title">Recuperar a senha</h1>
        </Reveal>

        <Reveal anim="up" delay={140}>
          <div className="flow__card panel">
            {enviado ? (
              /* A mensagem é a mesma exista a conta ou não: dizer "não achamos
                 esse e-mail" permitiria descobrir quem é cliente testando
                 endereços. */
              <div className="notice" role="status" style={{ marginBottom: 0 }}>
                <span className="notice__icon">
                  <Icon name="email" size={20} />
                </span>
                <p>
                  Se existir uma conta com o e-mail <strong>{email.trim()}</strong>, enviamos um
                  link para criar uma nova senha. Confira também a pasta de spam. O link vale por
                  pouco tempo; se expirar, é só pedir outro.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <p style={{ marginTop: 0 }}>
                  Digite o e-mail da conta. Você vai receber um link para escolher uma senha nova.
                </p>

                <Field
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="voce@exemplo.com.br"
                  error={error ?? undefined}
                />

                <Button type="submit" full size="lg" loading={loading}>
                  {loading ? 'Enviando…' : 'Enviar link'}
                </Button>
              </form>
            )}

            <p className="flow__foot" style={{ marginBottom: 0 }}>
              Lembrou a senha?{' '}
              <Link to="/entrar" className="underline-grow" style={{ color: 'var(--ok)' }}>
                Voltar para o acesso
              </Link>
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

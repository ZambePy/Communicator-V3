import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Reveal } from '@/components/effects/Reveal'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { AUTH_REDIRECT, requestPasswordReset } from '@/services/api'
import { isEmail } from '@/utils/format'
import { validar } from '@/utils/validation'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'

const RULES: Rules<{ email: string }> = { email: validar.email }
import './checkout.css'
import { FundoDaPagina } from '@/components/layout/FundoDaPagina'

/**
 * Para onde o link do e-mail leva: /nova-senha na origem pública do site
 * (VITE_SITE_URL), não na da aba atual — o link pode ser aberto em outro
 * aparelho. A URL precisa estar em Authentication > URL Configuration >
 * Redirect URLs no painel do Supabase.
 */
export function urlDeNovaSenha(): string {
  return AUTH_REDIRECT.novaSenha
}

export default function RecuperarSenha() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const values = useMemo(() => ({ email }), [email])
  const v = useFormValidation(values, RULES)
  // O botão não fica apagado: apertar com o e-mail em branco ou errado diz o
  // que falta e leva o foco ao campo (um botão desabilitado não recebe foco,
  // não deixa o Enter enviar e não explica o motivo; P2-10, como no /entrar).
  const [tentou, setTentou] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setTentou(true)
    v.touch('email')
    if (!v.isValid()) {
      formRef.current?.querySelector<HTMLElement>('input')?.focus()
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
      <FundoDaPagina variante="calmo" />
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
              <form ref={formRef} onSubmit={submit} noValidate>
                <p style={{ marginTop: 0 }}>
                  Digite o e-mail da conta. Você vai receber um link para escolher uma senha nova.
                </p>

                <Field
                  label="E-mail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={v.bind('email').onBlur}
                  error={v.errorOf('email') ?? error ?? undefined}
                  valid={isEmail(email)}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="voce@exemplo.com.br"
                  required
                />

                <Button type="submit" full size="lg" loading={loading} disabled={loading}>
                  {loading ? 'Enviando…' : 'Enviar link'}
                </Button>
                {tentou && !v.isValid() && (
                  <p className="form-hint" role="status" aria-live="polite">
                    Para enviar o link, falta preencher ou corrigir: e-mail.
                  </p>
                )}
              </form>
            )}

            <p className="flow__foot flow__foot--junto">
              Lembrou a senha?{' '}
              <Link to="/entrar" className="underline-grow">
                Voltar para o acesso
              </Link>
            </p>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

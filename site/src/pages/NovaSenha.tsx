import { useMemo, useState, type FormEvent } from 'react'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { validar } from '@/utils/validation'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { Link, useNavigate } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { SessionLoading } from '@/components/ui/Skeleton'
import { useAccount } from '@/context/AccountContext'
import { updatePassword } from '@/services/api'
import { motivoDoLinkNaUrl } from '@/utils/linkDeEmail'
import './checkout.css'

type Form = { password: string; confirm: string }

const RULES: Rules<Form> = {
  password: validar.senha,
  confirm: (v, all) => validar.confirmacao(v, all.password),
}

/**
 * Quando o link do e-mail já expirou ou foi usado, o Supabase não abre
 * sessão e volta para cá com o motivo na URL (utils/linkDeEmail.ts). Lido
 * uma vez, só para a tela dizer o que houve em vez de um genérico.
 */
const motivoNaUrl = () => motivoDoLinkNaUrl()

export default function NovaSenha() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { authenticated, loading: carregandoSessao } = useAccount()
  const navigate = useNavigate()
  const motivo = useMemo(motivoNaUrl, [])
  const values = useMemo(() => ({ password, confirm }), [password, confirm])
  const v = useFormValidation(values, RULES)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    v.touch('password', 'confirm')
    if (!v.isValid()) return

    setLoading(true)
    try {
      await updatePassword(password)
      navigate('/conta', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível trocar a senha.')
    } finally {
      setLoading(false)
    }
  }

  /* A sessão de recuperação é aberta pelo próprio supabase-js ao ler o
     token da URL; o AccountContext espera isso terminar antes de dizer se
     há sessão. Sem esta espera, a tela diria "link inválido" por um instante
     mesmo com o link bom. */
  if (carregandoSessao) return <SessionLoading />

  return (
    <div className="flow">
      <AmbientBackground particles={12} scan={false} light />

      <div className="container flow__inner" style={{ maxWidth: 520 }}>
        <Reveal anim="fade">
          <span className="eyebrow">Acesso</span>
        </Reveal>

        <Reveal anim="up">
          <h1 className="flow__title">Criar uma nova senha</h1>
        </Reveal>

        <Reveal anim="up" delay={140}>
          <div className="flow__card panel">
            {!authenticated ? (
              <>
                <div className="notice notice--warn" role="alert">
                  <span className="notice__icon">
                    <Icon name="alerta" size={20} />
                  </span>
                  <p>
                    {/* O cliente usa o fluxo implícito (tokens no endereço): o link
                        vale em qualquer navegador, inclusive quando o pedido saiu do
                        app do cuidador. */}
                    {motivo ?? 'Este link não é mais válido ou já foi usado.'} Peça um novo
                    link, pelo site ou pelo app do cuidador.
                  </p>
                </div>
                <Button to="/recuperar-senha" full size="lg">
                  Pedir outro link
                </Button>
              </>
            ) : (
              <form onSubmit={submit} noValidate>
                <Field
                  label="Nova senha"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  {...v.bind('password')}
                  valid={!v.errors.password}
                  autoComplete="new-password"
                  hint="Ao menos 8 caracteres. Uma frase curta é fácil de lembrar e difícil de adivinhar."
                  describedById="nova-senha-forca"
                  required
                />
                <PasswordStrength value={password} id="nova-senha-forca" />

                <Field
                  label="Confirmar nova senha"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  {...v.bind('confirm')}
                  valid={confirm.length > 0 && !v.errors.confirm}
                  autoComplete="new-password"
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

                <Button
                  type="submit"
                  full
                  size="lg"
                  loading={loading}
                  disabled={!v.isValid() || loading}
                >
                  {loading ? 'Salvando…' : 'Salvar nova senha'}
                </Button>
              </form>
            )}

            <p className="flow__foot" style={{ marginBottom: 0 }}>
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

import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { SessionLoading } from '@/components/ui/Skeleton'
import { useAccount } from '@/context/AccountContext'
import { updatePassword } from '@/services/api'
import './checkout.css'

/** Mesmo mínimo do cadastro. */
const SENHA_MINIMA = 8

/**
 * Quando o link do e-mail já expirou ou foi usado, o Supabase não abre
 * sessão e volta para cá com o motivo no fragmento da URL
 * (#error=access_denied&error_code=otp_expired&error_description=...).
 * Lido uma vez, só para a tela dizer o que houve em vez de um genérico.
 */
function motivoNaUrl(): string | null {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  if (!params.get('error')) return null
  const codigo = params.get('error_code')
  if (codigo === 'otp_expired') return 'O link expirou.'
  return params.get('error_description')?.replace(/\+/g, ' ') ?? 'O link não é válido.'
}

export default function NovaSenha() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { authenticated, loading: carregandoSessao } = useAccount()
  const navigate = useNavigate()
  const motivo = useMemo(motivoNaUrl, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < SENHA_MINIMA) {
      setError(`A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`)
      return
    }
    if (confirm !== password) {
      setError('As duas senhas precisam ser iguais.')
      return
    }

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
                    {motivo ?? 'Este link não é mais válido ou já foi usado.'} Peça um novo
                    link e abra-o no mesmo navegador em que fez o pedido.
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
                  autoComplete="new-password"
                  placeholder="••••••••"
                  hint={`Ao menos ${SENHA_MINIMA} caracteres.`}
                />

                <Field
                  label="Confirmar nova senha"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  error={error ?? undefined}
                />

                <Button type="submit" full size="lg" loading={loading}>
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

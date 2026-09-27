import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { validar } from '@/utils/validation'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Reveal } from '@/components/effects/Reveal'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { SessionLoading } from '@/components/ui/Skeleton'
import { useAccount } from '@/context/AccountContext'
import { emailDaSessao, updatePassword, verificarLinkDoEmail } from '@/services/api'
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
  const { authenticated, loading: carregandoSessao, refresh } = useAccount()
  const navigate = useNavigate()
  const motivo = useMemo(motivoNaUrl, [])
  // Modelo de e-mail do repositório (supabase/templates/recuperacao.html): o
  // link traz o token_hash e a sessão de recuperação nasce aqui, no aparelho
  // do clique — um antivírus que "visita" o link antes não gasta o token.
  // O convite da equipe (type=invite) também termina aqui: a pessoa convidada
  // ainda não tem senha e cria a primeira.
  const [busca] = useSearchParams()
  const tipoNaUrl = busca.get('type')
  const convite = tipoNaUrl === 'invite' || busca.get('convite') === '1'
  const tokenHash = tipoNaUrl === 'recovery' || tipoNaUrl === 'invite' ? busca.get('token_hash') : null
  const [verificando, setVerificando] = useState(Boolean(tokenHash))
  const [erroDoLink, setErroDoLink] = useState<string | null>(null)
  const [emailDaConta, setEmailDaConta] = useState<string | null>(null)

  useEffect(() => {
    if (!tokenHash) return
    let vivo = true
    verificarLinkDoEmail(tokenHash, tipoNaUrl === 'invite' ? 'invite' : 'recovery')
      .then(() => refresh())
      .then(() => {
        if (!vivo) return
        setVerificando(false)
        navigate({ search: convite ? '?convite=1' : '' }, { replace: true })
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setErroDoLink(e instanceof Error ? e.message : 'O link não é válido.')
        setVerificando(false)
      })
    return () => {
      vivo = false
    }
  }, [tokenHash]) // navigate e refresh são estáveis

  // De qual conta é a senha que vai ser trocada: num computador da família
  // pode haver outra pessoa logada.
  useEffect(() => {
    if (!authenticated || erroDoLink) return
    let vivo = true
    emailDaSessao()
      .then((email) => vivo && setEmailDaConta(email))
      .catch(() => undefined)
    return () => {
      vivo = false
    }
  }, [authenticated, erroDoLink])

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
      navigate('/perfil', {
        replace: true,
        state: {
          aviso: convite
            ? 'Senha criada. Use este e-mail e a senha para entrar no site, no computador e no app do cuidador.'
            : 'Senha trocada. Use a nova senha para entrar no site, no computador e no app do cuidador.',
        },
      })
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
  if (carregandoSessao || verificando) return <SessionLoading />

  return (
    <div className="flow">
      <AmbientBackground variante="suave" />

      <div className="container flow__inner" style={{ maxWidth: 520 }}>
        <Reveal anim="fade">
          <span className="eyebrow">Acesso</span>
        </Reveal>

        <Reveal anim="up">
          <h1 className="flow__title">{convite ? 'Crie sua senha' : 'Criar uma nova senha'}</h1>
        </Reveal>

        <Reveal anim="up" delay={140}>
          <div className="flow__card panel">
            {/* Link que falhou mostra o erro MESMO com alguém logado: senão o
                formulário trocava a senha de quem estivesse conectado neste
                computador (outra pessoa da família). */}
            {!authenticated || erroDoLink ? (
              <>
                <div className="notice notice--warn" role="alert">
                  <span className="notice__icon">
                    <Icon name="alerta" size={20} />
                  </span>
                  <p>
                    {/* O cliente usa o fluxo implícito (tokens no endereço): o link
                        vale em qualquer navegador, inclusive quando o pedido saiu do
                        app do cuidador. */}
                    {erroDoLink ?? motivo ?? 'Este link não é mais válido ou já foi usado.'} Peça um novo
                    link, pelo site ou pelo app do cuidador.
                  </p>
                </div>
                <Button to="/recuperar-senha" full size="lg">
                  Pedir outro link
                </Button>
              </>
            ) : (
              <form onSubmit={submit} noValidate>
                {emailDaConta && (
                  <p className="flow__lead nova-senha__conta">
                    Senha da conta <strong>{emailDaConta}</strong>.
                  </p>
                )}
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

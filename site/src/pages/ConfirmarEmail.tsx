import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Skeleton'
import { Stepper } from '@/components/ui/Stepper'
import { useAccount } from '@/context/AccountContext'
import { ETAPAS_DA_BETA } from '@/data/content'
import {
  fetchPerfilBasico,
  reenviarConfirmacao,
  verificarLinkDoEmail,
  type TipoDeLink,
} from '@/services/api'
import { isEmail } from '@/utils/format'
import { motivoDoLinkNaUrl } from '@/utils/linkDeEmail'
import './checkout.css'
import './beta.css'

/* ============================================================
   /confirmar-email — destino do link de confirmação do cadastro.

   O link pode ser aberto em qualquer aparelho, inclusive em um diferente
   daquele onde a conta foi criada (o caso comum: conta no computador,
   e-mail no celular). Por isso a confirmação acontece AQUI, e é aqui que a
   sessão nasce — no aparelho do clique:

   - modelo de e-mail do repositório (supabase/templates/confirmacao.html):
     `?token_hash=…&type=email` → verificarLinkDoEmail troca o token por
     uma sessão. Só roda quando a página abre, então um antivírus que
     "visita" o link antes da pessoa não gasta o token;
   - modelo padrão do Supabase ({{ .ConfirmationURL }}): o Supabase já
     verificou e volta com a sessão no endereço (#access_token=…), que o
     supabase-js lê sozinho ao carregar;
   - link vencido ou já usado: o motivo vem no endereço (#error=…).

   Com a sessão aberta: "Obrigado!" e o próximo passo — a pesquisa rápida,
   ou o perfil se a inscrição já estiver completa.
   ============================================================ */

const TIPOS: TipoDeLink[] = ['email', 'signup', 'magiclink', 'invite', 'email_change']

type Estado = 'verificando' | 'ok' | 'erro' | 'parado'

export default function ConfirmarEmail() {
  const { authenticated, account, loading, refresh } = useAccount()
  const [busca] = useSearchParams()
  const navigate = useNavigate()
  const tokenHash = busca.get('token_hash')
  const tipoNaUrl = busca.get('type') as TipoDeLink | null
  const tipo: TipoDeLink = tipoNaUrl && TIPOS.includes(tipoNaUrl) ? tipoNaUrl : 'email'
  const motivoNaUrl = useMemo(() => motivoDoLinkNaUrl(), [])
  const [estado, setEstado] = useState<Estado>(tokenHash ? 'verificando' : 'parado')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!tokenHash) return
    let vivo = true
    verificarLinkDoEmail(tokenHash, tipo)
      // a sessão nova precisa chegar ao contexto antes do "obrigado"
      .then(() => refresh())
      .then(() => {
        if (!vivo) return
        setEstado('ok')
        // tira o token do endereço: um F5 não tenta verificar de novo
        navigate({ search: '' }, { replace: true })
      })
      .catch((e: unknown) => {
        if (!vivo) return
        setErro(e instanceof Error ? e.message : 'O link não é válido.')
        setEstado('erro')
      })
    return () => {
      vivo = false
    }
    // navigate e refresh são estáveis: o que dispara a verificação é o token
  }, [tokenHash, tipo])

  if (estado === 'verificando' || (loading && estado === 'parado')) {
    return (
      <div className="flow">
        <AmbientBackground particles={10} scan={false} light />
        <div className="container container--narrow flow__inner">
          <div className="flow__card panel confirmar__carregando" role="status">
            <Spinner size={28} />
            <p>Confirmando seu e-mail…</p>
          </div>
        </div>
      </div>
    )
  }

  // Sessão aberta neste aparelho: pelo token, pelo endereço (modelo padrão)
  // ou porque a pessoa já estava logada e abriu um link repetido.
  if (estado === 'ok' || authenticated) {
    return (
      <Obrigado
        inscricaoCompleta={Boolean(account)}
        jaEstavaConfirmado={estado !== 'ok' && Boolean(erro ?? motivoNaUrl)}
      />
    )
  }

  if (estado === 'erro' || motivoNaUrl) {
    return <LinkInvalido motivo={erro ?? motivoNaUrl ?? 'O link não é válido.'} />
  }

  return <SemLink />
}

/* ---------------- obrigado ---------------- */

function Obrigado({
  inscricaoCompleta,
  jaEstavaConfirmado,
}: {
  inscricaoCompleta: boolean
  jaEstavaConfirmado: boolean
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const tituloRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    window.scrollTo?.({ top: 0 })
    tituloRef.current?.focus()
    let vivo = true
    void fetchPerfilBasico().then((p) => {
      if (!vivo || !p) return
      setNome(p.buyerName.split(' ')[0] ?? '')
      setEmail(p.email)
    })
    return () => {
      vivo = false
    }
  }, [])

  return (
    <div className="flow">
      <AmbientBackground particles={16} light />
      <div className="container container--narrow flow__inner">
        <div className="flow__card panel">
          <Stepper steps={ETAPAS_DA_BETA} current={inscricaoCompleta ? 3 : 2} />

          <span className="beta__icone-grande beta__icone-grande--ok" aria-hidden="true">
            <Icon name="check" size={30} />
          </span>
          <h1 className="flow__title beta__etapa-titulo" ref={tituloRef} tabIndex={-1}>
            {jaEstavaConfirmado
              ? 'Seu e-mail já está confirmado.'
              : nome
                ? `Obrigado, ${nome}! Seu e-mail foi confirmado.`
                : 'Obrigado! Seu e-mail foi confirmado.'}
          </h1>
          <p className="lead beta__etapa-texto">
            Você já está conectado(a) neste aparelho
            {email ? (
              <>
                {' '}
                como <strong>{email}</strong>
              </>
            ) : null}
            .{' '}
            {inscricaoCompleta
              ? 'Sua inscrição na beta está completa: o perfil mostra seus dados e o download.'
              : 'Falta só a pesquisa rápida sobre quem vai usar — leva cerca de 1 minuto.'}
          </p>

          <div className="beta__confirme-acoes">
            {inscricaoCompleta ? (
              <Button to="/perfil" full size="lg">
                Ver meu perfil
              </Button>
            ) : (
              <>
                <Button to="/beta" full size="lg">
                  Responder a pesquisa rápida
                </Button>
                <Button to="/perfil" variant="ghost" full>
                  Fazer depois e ver meu perfil
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------- link vencido ou já usado ---------------- */

function LinkInvalido({ motivo }: { motivo: string }) {
  const [email, setEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const reenviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!isEmail(email)) {
      setAviso({ ok: false, texto: 'Informe o e-mail da conta para receber um link novo.' })
      return
    }
    setEnviando(true)
    setAviso(null)
    try {
      await reenviarConfirmacao(email)
      setAviso({
        ok: true,
        texto: `Se ${email.trim()} tiver uma conta a confirmar, um link novo chega em instantes. Vale o mais recente.`,
      })
    } catch (err) {
      setAviso({ ok: false, texto: err instanceof Error ? err.message : 'Não foi possível reenviar agora.' })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flow">
      <AmbientBackground particles={10} scan={false} light />
      <div className="container container--narrow flow__inner">
        <div className="flow__card panel">
          <span className="beta__icone-grande" aria-hidden="true">
            <Icon name="alerta" size={30} />
          </span>
          <h1 className="flow__title beta__etapa-titulo">Este link não vale mais</h1>
          <p className="lead beta__etapa-texto">
            {motivo} Se você já confirmou o e-mail antes, é só entrar com o e-mail e a senha da conta.
          </p>

          <div className="beta__confirme-acoes">
            <Button to="/entrar" full size="lg">
              Entrar na conta
            </Button>
          </div>

          <form onSubmit={reenviar} noValidate className="confirmar__reenvio">
            <p className="flow__optional-title">Ainda não confirmou? Peça um link novo</p>
            <Field
              label="E-mail da conta"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="voce@exemplo.com.br"
            />
            {aviso && (
              <div className={`notice${aviso.ok ? '' : ' notice--warn'}`} role={aviso.ok ? 'status' : 'alert'}>
                <span className="notice__icon">
                  <Icon name={aviso.ok ? 'check' : 'alerta'} size={20} />
                </span>
                <p>{aviso.texto}</p>
              </div>
            )}
            <Button type="submit" variant="secondary" loading={enviando} disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar um link novo'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

/* ---------------- aberta sem link ---------------- */

function SemLink() {
  return (
    <div className="flow">
      <AmbientBackground particles={10} scan={false} light />
      <div className="container container--narrow flow__inner">
        <div className="flow__card panel">
          <span className="beta__icone-grande" aria-hidden="true">
            <Icon name="email" size={30} />
          </span>
          <h1 className="flow__title beta__etapa-titulo">Abra o link que enviamos por e-mail</h1>
          <p className="lead beta__etapa-texto">
            Esta página confirma o e-mail da conta a partir do link da mensagem “Confirme seu e-mail
            no IrisFlow”. Se você já confirmou, entre com o e-mail e a senha.
          </p>
          <div className="beta__confirme-acoes">
            <Button to="/entrar" full size="lg">
              Entrar na conta
            </Button>
            <p className="flow__foot">
              Ainda não tem conta?{' '}
              <Link to="/beta" className="underline-grow link-ok">
                Entrar na beta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

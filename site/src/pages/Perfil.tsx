import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { FormularioPesquisa } from '@/components/beta/FormularioPesquisa'
import { LinkedDevices } from '@/components/sections/LinkedDevices'
import { Button } from '@/components/ui/Button'
import { DownloadPanel } from '@/components/ui/DownloadPanel'
import { EtiquetaLancamento } from '@/components/ui/EtiquetaLancamento'
import { CheckField, Field } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { SessionLoading } from '@/components/ui/Skeleton'
import { useAccount } from '@/context/AccountContext'
import { BETA, BRAND } from '@/data/content'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { diaPorExtenso } from '@/lib/lancamento'
import {
  fetchInscricaoBeta,
  fetchPerfilBasico,
  markBetaDownload,
  type InscricaoBeta,
  type PerfilBasico,
} from '@/services/api'
import { condicaoLabel, formatDate, isPhone, maskPhone, osLabel, relacaoLabel } from '@/utils/format'
import { validar } from '@/utils/validation'
import './checkout.css'
import './sucesso.css'
import './perfil.css'

/* ============================================================
   /perfil — "Meu perfil": tudo o que a conta tem, num lugar só.

   - situação da inscrição na beta (completa ou falta a pesquisa) e o dia
     do lançamento, com a etiqueta vermelha até lá;
   - dados da conta (nome, e-mail, telefone, novidades, datas), editáveis
     menos o e-mail, que é o login do site, do desktop e do app;
   - as respostas da pesquisa (quem vai usar, condição, computador, app do
     cuidador…), editáveis pelo mesmo formulário da inscrição;
   - download (travado até o lançamento) e os computadores vinculados.

   Serve a quem já respondeu a pesquisa e a quem ainda não: sem ela, o
   perfil mostra o que existe (conta) e chama para a pesquisa, em vez de
   redirecionar — a pessoa quer ver os próprios dados. Durante a beta,
   /conta cai aqui (App.tsx).
   ============================================================ */

type Aviso = { ok: boolean; texto: string } | null

export default function Perfil() {
  const { account, authenticated, loading, sessionError, refresh, signOut } = useAccount()
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const navigate = useNavigate()
  const [perfil, setPerfil] = useState<PerfilBasico | null>(null)
  const [inscricao, setInscricao] = useState<InscricaoBeta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<'conta' | 'pesquisa' | null>(null)
  const [aviso, setAviso] = useState<Aviso>(null)

  const carregar = useCallback(async () => {
    const [p, i] = await Promise.all([fetchPerfilBasico(), fetchInscricaoBeta()])
    setPerfil(p)
    setInscricao(i)
    setCarregando(false)
  }, [])

  useEffect(() => {
    if (!authenticated) return
    void carregar()
  }, [authenticated, carregar, account])

  if (loading) return <SessionLoading />
  if (!authenticated) return <Navigate to="/entrar" replace />
  if (carregando && !account) return <SessionLoading />

  const completa = Boolean(account)
  const nome = account?.profile.buyerName || perfil?.buyerName || ''
  const email = account?.profile.email || perfil?.email || ''
  const primeiroNome = nome.split(' ')[0]

  const sair = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="flow">
      <AmbientBackground particles={10} scan={false} light />

      <div className="container flow__inner perfil">
        <header className="perfil__cabeca">
          <div>
            <span className="eyebrow">Meu perfil</span>
            <h1 className="flow__title perfil__titulo">
              {primeiroNome ? `Olá, ${primeiroNome}` : 'Meu perfil'}
            </h1>
            <p className="perfil__email">{email}</p>
          </div>
          <Button variant="ghost" onClick={() => void sair()}>
            Sair
          </Button>
        </header>

        {sessionError && (
          <div className="notice notice--warn" role="status">
            <span className="notice__icon">
              <Icon name="alerta" size={20} />
            </span>
            <p>
              Não foi possível atualizar os dados agora ({sessionError}). Você continua conectado(a)
              e o que aparece abaixo é a última leitura que deu certo.{' '}
              <button type="button" className="perfil__link-botao" onClick={() => void refresh()}>
                Tentar de novo
              </button>
            </p>
          </div>
        )}

        {aviso && (
          <div className={`notice${aviso.ok ? '' : ' notice--warn'}`} role={aviso.ok ? 'status' : 'alert'}>
            <span className="notice__icon">
              <Icon name={aviso.ok ? 'check' : 'alerta'} size={20} />
            </span>
            <p>{aviso.texto}</p>
          </div>
        )}

        {/* ---- situação da inscrição ---- */}
        <section className="panel perfil__situacao" aria-labelledby="perfil-situacao">
          <div className="perfil__situacao-texto">
            <span className={`tag ${completa ? 'tag--ok' : 'tag--wip'}`}>
              {completa ? 'Inscrição completa' : 'Falta a pesquisa rápida'}
            </span>
            <h2 id="perfil-situacao" className="perfil__situacao-titulo">
              {!completa
                ? 'Complete sua inscrição na beta'
                : lancou
                  ? 'A beta está aberta: baixe o aplicativo'
                  : `A beta abre em ${diaPorExtenso(program.launchAt)}`}
            </h2>
            <p>
              {!completa
                ? 'Sua conta está criada. Responda a pesquisa rápida sobre quem vai usar (cerca de 1 minuto) para liberar o download.'
                : lancou
                  ? `Acesso completo e gratuito até ${formatDate(account!.nextChargeAt)}. Entre no aplicativo com o mesmo e-mail e senha desta conta.`
                  : `Nesse dia o download para ${BETA.sistemaDoLancamento} é liberado aqui mesmo. O acesso gratuito vale até ${formatDate(account!.nextChargeAt)}.`}
            </p>
          </div>
          <div className="perfil__situacao-acao">
            {!completa ? (
              <Button to="/beta">Responder a pesquisa rápida</Button>
            ) : lancou ? (
              <Button href="#downloads" variant="teal">
                Baixar o {BRAND.product}
              </Button>
            ) : (
              <EtiquetaLancamento lancamento={program.launchAt} />
            )}
          </div>
        </section>

        <div className="perfil__grade">
          {/* ---- dados da conta ---- */}
          <section
            className={`panel perfil__secao${editando === 'conta' ? ' is-editando' : ''}`}
            aria-labelledby="perfil-conta"
          >
            <div className="perfil__secao-cabeca">
              <h2 id="perfil-conta">Dados da conta</h2>
              {editando !== 'conta' && perfil && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAviso(null)
                    setEditando('conta')
                  }}
                >
                  Editar
                </Button>
              )}
            </div>

            {editando === 'conta' && perfil ? (
              <FormDadosDaConta
                perfil={perfil}
                onCancelar={() => setEditando(null)}
                onSalvo={async () => {
                  await carregar()
                  setEditando(null)
                  setAviso({ ok: true, texto: 'Dados da conta salvos.' })
                }}
              />
            ) : (
              <dl className="summary">
                <div>
                  <dt>Nome</dt>
                  <dd>{nome || '—'}</dd>
                </div>
                <div>
                  <dt>E-mail (login)</dt>
                  <dd>
                    {email || '—'}
                    {perfil?.emailConfirmedAt && <span className="perfil__confirmado"> · confirmado</span>}
                  </dd>
                </div>
                <div>
                  <dt>Telefone</dt>
                  <dd>{perfil?.phone ? maskPhone(perfil.phone) : 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Novidades por e-mail</dt>
                  <dd>{perfil ? (perfil.newsletter ? 'Sim' : 'Não') : '—'}</dd>
                </div>
                <div>
                  <dt>Conta criada em</dt>
                  <dd>{perfil?.createdAt ? formatDate(perfil.createdAt) : '—'}</dd>
                </div>
              </dl>
            )}
          </section>

          {/* ---- respostas da pesquisa ---- */}
          <section
            className={`panel perfil__secao${editando === 'pesquisa' ? ' is-editando' : ''}`}
            aria-labelledby="perfil-pesquisa"
          >
            <div className="perfil__secao-cabeca">
              <h2 id="perfil-pesquisa">Quem vai usar</h2>
              {completa && editando !== 'pesquisa' && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAviso(null)
                    setEditando('pesquisa')
                  }}
                >
                  Editar respostas
                </Button>
              )}
            </div>

            {!completa ? (
              <div className="perfil__vazio">
                <p>
                  Estas são as respostas da pesquisa rápida: quem vai usar o {BRAND.product}, a
                  condição principal e o computador. Você ainda não respondeu.
                </p>
                <Button to="/beta" variant="secondary">
                  Responder agora
                </Button>
              </div>
            ) : editando === 'pesquisa' ? (
              <EditarPesquisa
                nomeDoResponsavel={nome}
                lancamento={program.launchAt}
                inicial={{
                  relation: account!.profile.relation,
                  userName: account!.profile.userName,
                  condition: account!.profile.condition,
                  os: account!.profile.os,
                  wantsCaregiverApp: inscricao?.wantsCaregiverApp,
                  feedbackConsent: inscricao?.feedbackConsent,
                  howFound: inscricao?.howFound ?? '',
                  phone: perfil?.phone ?? '',
                }}
                onCancelar={() => setEditando(null)}
                onSalvo={async () => {
                  await carregar()
                  setEditando(null)
                  setAviso({ ok: true, texto: 'Respostas da pesquisa salvas.' })
                }}
              />
            ) : (
              <dl className="summary">
                <div>
                  <dt>Nome de quem usa</dt>
                  <dd>{account!.profile.userName || '—'}</dd>
                </div>
                <div>
                  <dt>Relação</dt>
                  <dd>{relacaoLabel(account!.profile.relation) || '—'}</dd>
                </div>
                <div>
                  <dt>Condição principal</dt>
                  <dd>{condicaoLabel(account!.profile.condition) || '—'}</dd>
                </div>
                <div>
                  <dt>Computador</dt>
                  <dd>{osLabel(account!.profile.os) || '—'}</dd>
                </div>
                {inscricao && (
                  <>
                    <div>
                      <dt>App do cuidador</dt>
                      <dd>{inscricao.wantsCaregiverApp ? 'Quer usar' : 'Agora não'}</dd>
                    </div>
                    <div>
                      <dt>Contato da equipe</dt>
                      <dd>{inscricao.feedbackConsent ? 'Autorizado' : 'Não autorizado'}</dd>
                    </div>
                    <div>
                      <dt>Como conheceu</dt>
                      <dd>{inscricao.howFound || 'Não informado'}</dd>
                    </div>
                    <div>
                      <dt>Inscrição feita em</dt>
                      <dd>{formatDate(inscricao.registeredAt)}</dd>
                    </div>
                  </>
                )}
              </dl>
            )}
          </section>
        </div>

        {/* ---- download e computadores ---- */}
        {completa && (
          <>
            <section className="download perfil__download" id="downloads" aria-labelledby="perfil-download">
              <h2 id="perfil-download" className="download__title">
                {lancou ? `Baixar o ${BRAND.product}` : 'Instaladores da beta'}
              </h2>
              <p className="download__note">
                {lancou
                  ? 'Entre no aplicativo com o mesmo e-mail e senha desta conta.'
                  : `O download abre em ${diaPorExtenso(program.launchAt)}, primeiro para ${BETA.sistemaDoLancamento}. macOS e Linux estão em preparação.`}
              </p>
              <DownloadPanel liberaEm={program.launchAt} onDownload={(os) => void markBetaDownload(os)} />
            </section>

            {/* Computadores só existem depois do download: antes do lançamento
                o painel diria "aplicativo liberado" sem ter o que instalar. */}
            {lancou && <LinkedDevices />}
          </>
        )}

        {/* ---- segurança ---- */}
        <section className="panel perfil__secao perfil__seguranca" aria-labelledby="perfil-seguranca">
          <div className="perfil__secao-cabeca">
            <h2 id="perfil-seguranca">Senha e acesso</h2>
          </div>
          <p>
            A senha desta conta abre o site, o aplicativo no computador e o app do cuidador. Para
            trocá-la, enviamos um link para <strong>{email}</strong>.
          </p>
          <div className="perfil__acoes">
            <Button to="/recuperar-senha" variant="secondary">
              Trocar a senha
            </Button>
            <Button variant="ghost" onClick={() => void sair()}>
              Sair deste aparelho
            </Button>
          </div>
        </section>

        <p className="flow__foot">
          Seus dados ficam no banco da IrisFlow, protegidos por regras que limitam cada conta às
          próprias informações (veja a{' '}
          <Link to="/privacidade" className="underline-grow">
            política de privacidade
          </Link>
          ). Para apagar a conta,{' '}
          <Link to="/contato" className="underline-grow">
            fale com a equipe
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

/* ---------------- editar os dados da conta ---------------- */

type FormConta = { nome: string; telefone: string; newsletter: boolean }

const RULES_CONTA: Rules<FormConta> = {
  nome: validar.nomeCompleto,
  telefone: validar.telefoneOpcional,
}

function FormDadosDaConta({
  perfil,
  onCancelar,
  onSalvo,
}: {
  perfil: PerfilBasico
  onCancelar: () => void
  onSalvo: () => Promise<void>
}) {
  const { atualizarDadosDaConta } = useAccount()
  const [form, setForm] = useState<FormConta>({
    nome: perfil.buyerName,
    telefone: perfil.phone ? maskPhone(perfil.phone) : '',
    newsletter: perfil.newsletter,
  })
  const v = useFormValidation(form, RULES_CONTA)
  const [salvando, setSalvando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    v.touch('nome', 'telefone')
    if (!v.isValid()) return
    setSalvando(true)
    setFalha(null)
    try {
      await atualizarDadosDaConta(form)
      await onSalvo()
    } catch (err) {
      setFalha(err instanceof Error ? err.message : 'Não foi possível salvar agora.')
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={salvar} noValidate className="perfil__form">
      {falha && (
        <div className="notice notice--warn" role="alert">
          <span className="notice__icon">
            <Icon name="alerta" size={20} />
          </span>
          <p>{falha}</p>
        </div>
      )}
      <Field
        label="Nome completo"
        value={form.nome}
        onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
        {...v.bind('nome')}
        autoComplete="name"
      />
      <Field
        label="Telefone (opcional)"
        type="tel"
        value={form.telefone}
        onChange={(e) => setForm((f) => ({ ...f, telefone: maskPhone(e.target.value) }))}
        {...v.bind('telefone')}
        valid={isPhone(form.telefone)}
        autoComplete="tel"
        inputMode="numeric"
        placeholder="(11) 90000-0000"
        hint="Com DDD. Deixe em branco para apagar o número."
      />
      <p className="perfil__nota">
        O e-mail não muda por aqui: ele é o login do site, do aplicativo e do app do cuidador.
      </p>
      <CheckField
        label="Quero receber novidades do produto e do programa de validação clínica."
        checked={form.newsletter}
        onChange={(e) => setForm((f) => ({ ...f, newsletter: e.target.checked }))}
      />
      <div className="perfil__acoes">
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" loading={salvando} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}

/* ---------------- editar as respostas da pesquisa ---------------- */

function EditarPesquisa({
  nomeDoResponsavel,
  lancamento,
  inicial,
  onCancelar,
  onSalvo,
}: {
  nomeDoResponsavel: string
  lancamento: string
  inicial: Parameters<typeof FormularioPesquisa>[0]['inicial']
  onCancelar: () => void
  onSalvo: () => Promise<void>
}) {
  const { responderPesquisa } = useAccount()
  // As respostas iniciais só são lidas ao abrir a edição (o formulário as
  // copia para o próprio estado): salvar não embaralha o que está sendo digitado.
  return (
    <FormularioPesquisa
      inicial={inicial}
      nomeDoResponsavel={nomeDoResponsavel}
      lancamento={lancamento}
      textoDoBotao="Salvar respostas"
      onCancelar={onCancelar}
      onEnviar={async (r) => {
        await responderPesquisa(r)
        await onSalvo()
      }}
    />
  )
}

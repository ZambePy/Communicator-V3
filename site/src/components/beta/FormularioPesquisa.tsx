import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { CheckField, Field, SelectField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { diaEMes, jaLancou } from '@/lib/lancamento'
import { BETA } from '@/data/content'
import type { RespostasPesquisa } from '@/services/api'
import { CONDICAO_LABELS, isPhone, maskPhone } from '@/utils/format'
import { validar } from '@/utils/validation'
import './pesquisa.css'

/* ============================================================
   A pesquisa rápida da beta (etapa 3), também usada para editar as
   respostas no /perfil.

   Cinco perguntas obrigatórias, todas de um toque (quem vai usar, como a
   pessoa gosta de ser chamada, condição, computador e app do cuidador), e
   duas opcionais. O botão de enviar fica sempre habilitado: se falta algo,
   o clique mostra o erro de cada campo, a lista do que falta e leva o foco
   ao primeiro — um botão apagado sem dizer por quê era o "botão travado"
   da versão anterior.
   ============================================================ */

type Form = {
  relation: string
  userName: string
  condition: string
  os: string
  /** 'sim' | 'nao' | '' (ainda não respondeu) */
  app: string
  phone: string
  howFound: string
  feedbackConsent: boolean
}

const RELACOES: { valor: string; titulo: string; nota?: string }[] = [
  { valor: 'proprio', titulo: 'Eu mesmo(a)', nota: 'Sou eu quem vai usar' },
  { valor: 'conjuge', titulo: 'Meu cônjuge' },
  { valor: 'pai-mae', titulo: 'Meu pai ou minha mãe' },
  { valor: 'filho', titulo: 'Meu filho ou minha filha' },
  { valor: 'irmao', titulo: 'Meu irmão ou minha irmã' },
  { valor: 'cuidador', titulo: 'Alguém de quem cuido', nota: 'Sou cuidador(a)' },
  { valor: 'outro', titulo: 'Outra pessoa' },
]

const SISTEMAS: { valor: string; titulo: string }[] = [
  { valor: 'windows', titulo: 'Windows' },
  { valor: 'macos', titulo: 'macOS' },
  { valor: 'linux', titulo: 'Linux' },
  { valor: 'nao-sei', titulo: 'Não sei' },
]

const NOME_DO_CAMPO: Record<keyof Form, string> = {
  relation: 'quem vai usar',
  userName: 'como a pessoa gosta de ser chamada',
  condition: 'condição principal',
  os: 'sistema do computador',
  app: 'app do cuidador',
  phone: 'telefone',
  howFound: 'como conheceu',
  feedbackConsent: 'retorno',
}

/** Ordem em que os campos aparecem: é a ordem da lista do que falta e do foco. */
const ORDEM: (keyof Form)[] = ['relation', 'userName', 'condition', 'os', 'app', 'phone']

/** "a, b e c" */
function lista(itens: string[]): string {
  if (itens.length <= 1) return itens.join('')
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

type Props = {
  /** Respostas atuais (edição no /perfil). Vazio na primeira vez. */
  inicial?: Partial<RespostasPesquisa>
  /**
   * Nome de quem se inscreveu. Quando é a própria pessoa que vai usar, é este
   * o nome gravado — ela não precisa digitar de novo.
   */
  nomeDoResponsavel: string
  /** Data do lançamento (beta_program.launch_at), para a nota do sistema. */
  lancamento: string
  textoDoBotao: string
  onEnviar: (respostas: RespostasPesquisa) => Promise<void>
  /** Na edição: volta a mostrar as respostas sem salvar. */
  onCancelar?: () => void
}

export function FormularioPesquisa({
  inicial,
  nomeDoResponsavel,
  lancamento,
  textoDoBotao,
  onEnviar,
  onCancelar,
}: Props) {
  const nomeProprio = nomeDoResponsavel.trim()
  const [form, setForm] = useState<Form>(() => ({
    relation: inicial?.relation ?? '',
    // na própria pessoa o nome vem da conta: o campo só aparece se faltar
    userName: inicial?.relation === 'proprio' ? '' : (inicial?.userName ?? ''),
    condition: inicial?.condition ?? '',
    os: inicial?.os ?? '',
    app: inicial?.wantsCaregiverApp === undefined ? '' : inicial.wantsCaregiverApp ? 'sim' : 'nao',
    phone: inicial?.phone ? maskPhone(inicial.phone) : '',
    howFound: inicial?.howFound ?? '',
    feedbackConsent: inicial?.feedbackConsent ?? true,
  }))
  const [enviando, setEnviando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [tentou, setTentou] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // O nome só é pedido depois de escolher quem vai usar, e nunca quando é a
  // própria pessoa (a conta já tem o nome dela).
  const pedeONome = form.relation !== '' && (form.relation !== 'proprio' || !nomeProprio)

  const rules = useMemo<Rules<Form>>(
    () => ({
      relation: (v) => validar.escolha(v, 'Escolha quem vai usar o IrisFlow.'),
      userName: (v, all) =>
        !all.relation || (all.relation === 'proprio' && nomeProprio)
          ? undefined
          : v.trim().length < 2
            ? 'Diga como a pessoa gosta de ser chamada.'
            : undefined,
      condition: (v) =>
        validar.escolha(v, 'Escolha a condição principal (ou “Prefiro não informar”).'),
      os: (v) => validar.escolha(v, 'Escolha o sistema do computador (ou “Não sei”).'),
      app: (v) => validar.escolha(v, 'Diga se quer o app do cuidador no celular.'),
      phone: validar.telefoneOpcional,
    }),
    [nomeProprio],
  )
  const v = useFormValidation(form, rules)

  const set = (key: keyof Form) => (valor: string) => setForm((f) => ({ ...f, [key]: valor }))
  const escolher = (key: keyof Form) => (valor: string) => {
    set(key)(valor)
    v.touch(key)
  }

  const faltando = ORDEM.filter((k) => v.errors[k])

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    setFalha(null)
    v.touch(...ORDEM)
    if (faltando.length > 0) {
      // leva o foco ao primeiro campo com problema (o grupo de opções ou o campo)
      const primeiro = formRef.current?.querySelector<HTMLElement>(
        `[data-campo="${faltando[0]}"] input, [data-campo="${faltando[0]}"] select`,
      )
      primeiro?.focus()
      return
    }

    setEnviando(true)
    try {
      await onEnviar({
        relation: form.relation,
        userName: pedeONome ? form.userName : nomeProprio,
        condition: form.condition,
        os: form.os,
        wantsCaregiverApp: form.app === 'sim',
        feedbackConsent: form.feedbackConsent,
        howFound: form.howFound,
        phone: form.phone,
      })
    } catch (err) {
      setFalha(err instanceof Error ? err.message : 'Não foi possível salvar as respostas agora.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={enviar} noValidate className="pesquisa">
      {falha && (
        <div className="notice notice--warn" role="alert">
          <span className="notice__icon">
            <Icon name="alerta" size={20} />
          </span>
          <p>{falha}</p>
        </div>
      )}

      <Escolhas
        campo="relation"
        legenda="Quem vai usar o IrisFlow?"
        opcoes={RELACOES}
        valor={form.relation}
        onEscolher={escolher('relation')}
        erro={v.errorOf('relation')}
        colunas={2}
      />

      {pedeONome && (
        <div data-campo="userName">
          <Field
            label={
              form.relation === 'proprio'
                ? 'Como você gosta de ser chamado(a)?'
                : 'Como essa pessoa gosta de ser chamada?'
            }
            value={form.userName}
            onChange={(e) => set('userName')(e.target.value)}
            {...v.bind('userName')}
            autoComplete="off"
            placeholder="Nome ou apelido"
            hint="É o nome que o aplicativo usa nas telas e nas mensagens para a família."
          />
        </div>
      )}

      <div data-campo="condition">
        <SelectField
          label="Condição principal"
          value={form.condition}
          onChange={(e) => escolher('condition')(e.target.value)}
          {...v.bind('condition')}
          hint="Ajuda a equipe a preparar a calibração. “Prefiro não informar” também vale."
        >
          <option value="">Selecione…</option>
          {Object.entries(CONDICAO_LABELS).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </SelectField>
      </div>

      <Escolhas
        campo="os"
        legenda="Em qual computador vai instalar?"
        nota={
          jaLancou(lancamento)
            ? `A beta já está aberta para ${BETA.sistemaDoLancamento}. macOS e Linux estão em preparação: quem escolher um deles é avisado quando a versão sair.`
            : `No lançamento, em ${diaEMes(lancamento)}, a beta abre para ${BETA.sistemaDoLancamento}. macOS e Linux estão em preparação: quem escolher um deles é avisado quando a versão sair.`
        }
        opcoes={SISTEMAS}
        valor={form.os}
        onEscolher={escolher('os')}
        erro={v.errorOf('os')}
        colunas={4}
      />

      <Escolhas
        campo="app"
        legenda="Quer o app do cuidador no celular?"
        nota="O que o paciente escreve com os olhos chega ao celular da família, e a resposta é falada na tela."
        opcoes={[
          { valor: 'sim', titulo: 'Sim, quero' },
          { valor: 'nao', titulo: 'Agora não' },
        ]}
        valor={form.app}
        onEscolher={escolher('app')}
        erro={v.errorOf('app')}
        colunas={2}
        curtas
      />

      <div className="flow__optional">
        <p className="flow__optional-title">
          Para a equipe <span>opcional</span>
        </p>
        <div className="flow__row">
          <div data-campo="phone">
            <Field
              label="Telefone (opcional)"
              type="tel"
              value={form.phone}
              onChange={(e) => set('phone')(maskPhone(e.target.value))}
              {...v.bind('phone')}
              valid={isPhone(form.phone)}
              autoComplete="tel"
              inputMode="numeric"
              placeholder="(11) 90000-0000"
              hint="Com DDD. Em branco, falamos com você por e-mail."
            />
          </div>
          <Field
            label="Como conheceu a IrisFlow? (opcional)"
            value={form.howFound}
            onChange={(e) => set('howFound')(e.target.value)}
            placeholder="Indicação, associação, redes sociais…"
          />
        </div>
        <CheckField
          label="Aceito que a equipe entre em contato para saber como foi o uso."
          checked={form.feedbackConsent}
          onChange={(e) => setForm((f) => ({ ...f, feedbackConsent: e.target.checked }))}
        />
      </div>

      <div className="flow__actions">
        {onCancelar ? (
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
        ) : (
          <span className="pesquisa__tempo">
            <Icon name="relogio" size={18} /> Leva cerca de 1 minuto
          </span>
        )}
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? 'Salvando…' : textoDoBotao}
        </Button>
      </div>

      {tentou && faltando.length > 0 && (
        <p className="form-hint" role="status" aria-live="polite">
          Para continuar, falta responder: {lista(faltando.map((k) => NOME_DO_CAMPO[k]))}.
        </p>
      )}
    </form>
  )
}

/* ---------------- grupo de opções (um toque) ---------------- */

function Escolhas({
  campo,
  legenda,
  nota,
  opcoes,
  valor,
  onEscolher,
  erro,
  colunas,
  curtas = false,
}: {
  campo: keyof Form
  legenda: string
  nota?: ReactNode
  opcoes: { valor: string; titulo: string; nota?: string }[]
  valor: string
  onEscolher: (valor: string) => void
  erro?: string
  colunas: 2 | 4
  /** Opções curtas (sim/não): ficam em duas colunas mesmo no celular. */
  curtas?: boolean
}) {
  const idErro = `pesquisa-${campo}-erro`
  return (
    <fieldset
      className={`escolhas${erro ? ' escolhas--erro' : ''}`}
      data-campo={campo}
      aria-describedby={erro ? idErro : undefined}
    >
      <legend className="escolhas__legenda">{legenda}</legend>
      {nota && <p className="escolhas__nota">{nota}</p>}
      <div className={`escolhas__grade escolhas__grade--${colunas}${curtas ? ' escolhas__grade--curta' : ''}`}>
        {opcoes.map((o) => (
          <label key={o.valor} className={`escolha${valor === o.valor ? ' is-on' : ''}`}>
            <input
              type="radio"
              className="escolha__input"
              name={`pesquisa-${campo}`}
              value={o.valor}
              checked={valor === o.valor}
              onChange={() => onEscolher(o.valor)}
            />
            <span className="escolha__marca" aria-hidden="true" />
            <span className="escolha__texto">
              <span className="escolha__titulo">{o.titulo}</span>
              {o.nota && <span className="escolha__nota">{o.nota}</span>}
            </span>
          </label>
        ))}
      </div>
      {erro && (
        <p id={idErro} className="field__error" role="alert">
          {erro}
        </p>
      )}
    </fieldset>
  )
}

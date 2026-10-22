import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageHead } from '@/components/layout/PageHead'
import { Reveal } from '@/components/effects/Reveal'
import { Field, SelectField, TextareaField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { isEmail } from '@/utils/format'
import { CONTATO, validar } from '@/utils/validation'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { sendContactMessage } from '@/services/api'
import { BRAND } from '@/data/content'
import './contato.css'
import { FundoDaPagina } from '@/components/layout/FundoDaPagina'

type Form = { name: string; email: string; role: string; message: string }

/* Os mesmos limites dos CHECKs de contact_messages no banco (CONTATO): antes,
   um relato longo passava aqui e voltava do banco como erro técnico. */
const RULES: Rules<Form> = {
  name: (v) => validar.nome(v, CONTATO.nomeMinimo, CONTATO.nomeMaximo),
  email: validar.email,
  role: (v) => validar.escolha(v, 'Escolha a opção que melhor descreve você.'),
  message: (v) => validar.mensagem(v, CONTATO.mensagemMinima, CONTATO.mensagemMaxima),
}

const CAMPOS = ['name', 'email', 'role', 'message'] as const
const NOME_DO_CAMPO: Record<(typeof CAMPOS)[number], string> = {
  name: 'nome',
  email: 'e-mail',
  role: 'quem é você',
  message: 'mensagem',
}

/** "a, b e c" */
function lista(itens: string[]): string {
  if (itens.length <= 1) return itens.join('')
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`
}

export default function Contato() {
  const [form, setForm] = useState<Form>({ name: '', email: '', role: '', message: '' })
  const v = useFormValidation(form, RULES)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  // O botão de enviar não fica apagado: apertar com campo faltando diz qual
  // e leva o foco a ele (auditoria de 21/10/2026, P2-10).
  const [tentou, setTentou] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  // Campo-isca: invisível para pessoas (e fora do leitor de tela); robô que
  // preenche tudo cai aqui e "envia" sem gravar nada.
  const [isca, setIsca] = useState('')

  const set = (key: keyof Form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    v.touch(...CAMPOS)
    const primeiro = CAMPOS.find((k) => v.errors[k])
    if (primeiro) {
      formRef.current
        ?.querySelector<HTMLElement>(`[data-campo="${primeiro}"] :is(input, select, textarea)`)
        ?.focus()
      return
    }
    setSending(true)
    setFalha(null)
    try {
      if (!isca) await sendContactMessage(form)
      setSent(true)
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível enviar a mensagem.')
    } finally {
      setSending(false)
    }
  }

  const faltando = CAMPOS.filter((k) => v.errors[k])

  return (
    <>
      <FundoDaPagina variante="calmo" />
      <PageHead
        title="Fale com quem construiu a IrisFlow."
        lead="Somos três e respondemos nós mesmos, em geral em até dois dias úteis. Família, profissional de saúde ou instituição: conte o caso."
      />

      <section className="section">
        <div className="container">
          <div className="contact__split">
            <Reveal anim="right">
              <div className="panel contact__panel">
                {sent ? (
                  <div className="contact__sent" role="status">
                    <span className="contact__sent-badge" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="30" height="30">
                        <path
                          d="M4 12.5 9.5 18 20 6.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <h2 className="contact__h">Mensagem recebida</h2>
                    <p className="contact__sent-text">
                      Obrigado por escrever. A equipe responde pelo próprio {BRAND.email},
                      normalmente em até dois dias úteis.
                    </p>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setForm({ name: '', email: '', role: '', message: '' })
                        v.reset()
                        setSent(false)
                      }}
                    >
                      Escrever outra
                    </Button>
                  </div>
                ) : (
                  <form ref={formRef} onSubmit={submit} noValidate data-sticky-hide>
                    <h2 className="contact__h contact__h--form">Envie uma mensagem</h2>

                    <div data-campo="name">
                      <Field
                        label="Nome completo"
                        value={form.name}
                        onChange={set('name')}
                        {...v.bind('name')}
                        required
                        valid={form.name.trim().length >= CONTATO.nomeMinimo}
                        maxLength={CONTATO.nomeMaximo}
                        autoComplete="name"
                        placeholder="Como devemos chamar você"
                      />
                    </div>

                    <div data-campo="email">
                      <Field
                        label="E-mail"
                        type="email"
                        value={form.email}
                        onChange={set('email')}
                        {...v.bind('email')}
                        inputMode="email"
                        required
                        valid={isEmail(form.email)}
                        autoComplete="email"
                        placeholder="voce@exemplo.com.br"
                        hint="Respondemos por este endereço."
                      />
                    </div>

                    <div data-campo="role">
                      <SelectField
                        label="Você é"
                        value={form.role}
                        onChange={set('role')}
                        {...v.bind('role')}
                        valid={!!form.role}
                        required
                      >
                        <option value="">Selecione…</option>
                        <option value="familiar">Familiar ou cuidador</option>
                        <option value="usuario">Pessoa que vai usar a IrisFlow</option>
                        <option value="profissional">Profissional de saúde</option>
                        <option value="clinica">Clínica ou associação</option>
                        <option value="imprensa">Imprensa</option>
                        <option value="outro">Outro</option>
                      </SelectField>
                    </div>

                    <div data-campo="message">
                      <TextareaField
                        label="Mensagem"
                        rows={5}
                        value={form.message}
                        onChange={set('message')}
                        {...v.bind('message')}
                        required
                        valid={form.message.trim().length >= CONTATO.mensagemMinima}
                        maxLength={CONTATO.mensagemMaxima}
                        hint={`Ajuda contar: quem vai usar, qual é a condição e há quanto tempo, se a pessoa ainda controla bem os olhos, que computador e webcam vocês têm, e o que já tentaram. ${form.message.length.toLocaleString('pt-BR')} de ${CONTATO.mensagemMaxima.toLocaleString('pt-BR')} caracteres.`}
                      />
                    </div>

                    <div className="contact__isca" aria-hidden="true">
                      <label>
                        Site da empresa (deixe em branco)
                        <input
                          type="text"
                          name="site"
                          tabIndex={-1}
                          autoComplete="off"
                          value={isca}
                          onChange={(e) => setIsca(e.target.value)}
                        />
                      </label>
                    </div>

                    {falha && (
                      <p className="field__error contact__fail" role="alert">
                        {falha}
                      </p>
                    )}

                    <p className="contact__consent">
                      Usamos estes dados só para responder você. Veja a{' '}
                      <Link to="/privacidade" className="link-ok">
                        política de privacidade
                      </Link>
                      .
                    </p>

                    <Button type="submit" full size="lg" loading={sending} disabled={sending}>
                      {sending ? 'Enviando…' : 'Enviar mensagem'}
                    </Button>
                    {tentou && faltando.length > 0 && (
                      <p className="form-hint" role="status" aria-live="polite">
                        Para enviar, falta preencher ou corrigir: {lista(faltando.map((k) => NOME_DO_CAMPO[k]))}.
                      </p>
                    )}
                  </form>
                )}
              </div>
            </Reveal>

            <div className="stack">
              {/* O rodapé e a seção de planos linkam /contato#validacao. O id
                  fica no invólucro, e não no <h3>, para que a âncora pare no
                  começo do cartão inteiro. O recuo sob o cabeçalho fixo vem da
                  regra [id] em global.css. */}
              <Reveal anim="left" delay={120} id="validacao">
                <Card as="div">
                  <CardIcon tone="teal">
                    <Icon name="pessoas" size={26} />
                  </CardIcon>
                  <h3>Programa de validação</h3>
                  <p>
                    São noventa dias. Clínicas de reabilitação neurológica, associações de
                    pacientes e profissionais que prescrevem recebem licenças gratuitas durante
                    todo o período. Recebem também instalação e calibração acompanhadas,
                    treinamento da equipe, um canal direto com os fundadores e ajustes do produto a
                    cada quinze dias, com base no que for relatado.
                  </p>
                  <p>
                    Em troca, pedimos acesso a pacientes reais, com consentimento, observação
                    clínica qualificada, retorno estruturado e autorização para documentar o caso
                    sem identificar ninguém. A troca está por escrito para que nenhuma das partes
                    ache que faz favor à outra.
                  </p>
                  <p>
                    A pessoa pode parar de participar a qualquer momento, sem dar explicação. Ao
                    fim dos noventa dias, a família decide livremente se quer assinar, e as
                    famílias dessa primeira turma ficam com uma condição diferenciada permanente.
                  </p>
                </Card>
              </Reveal>

              <Reveal anim="left" delay={220}>
                <Card as="div">
                  <CardIcon>
                    <Icon name="email" size={26} />
                  </CardIcon>
                  <h3>Canais diretos</h3>
                  <div className="contact__canais">
                    <p>
                      E-mail:{' '}
                      <a href={`mailto:${BRAND.email}`} className="link-ok">
                        {BRAND.email}
                      </a>
                    </p>
                    <p>
                      Redes:{' '}
                      <a href={BRAND.instagram} target="_blank" rel="noreferrer noopener" className="link-ok">
                        Instagram
                        <span className="sr-only"> (abre em outra aba)</span>
                      </a>
                      {' e '}
                      <a href={BRAND.linkedin} target="_blank" rel="noreferrer noopener" className="link-ok">
                        LinkedIn
                        <span className="sr-only"> (abre em outra aba)</span>
                      </a>
                    </p>
                  </div>
                </Card>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

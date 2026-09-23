import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { PageHead } from '@/components/layout/PageHead'
import { Reveal } from '@/components/effects/Reveal'
import { Field, SelectField, TextareaField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { isEmail } from '@/utils/format'
import { validar } from '@/utils/validation'
import { useFormValidation, type Rules } from '@/hooks/useFormValidation'
import { sendContactMessage } from '@/services/api'
import { BRAND, CONDITIONS_SHORT } from '@/data/content'
import './contato.css'

type Form = { name: string; email: string; role: string; message: string }

const RULES: Rules<Form> = {
  name: (v) => validar.nome(v, 3),
  email: validar.email,
  role: (v) => validar.escolha(v, 'Escolha a opção que melhor descreve você.'),
  message: (v) => validar.mensagem(v, 15),
}

export default function Contato() {
  const [form, setForm] = useState<Form>({ name: '', email: '', role: '', message: '' })
  const v = useFormValidation(form, RULES)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  const set = (key: keyof Form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    v.touch('name', 'email', 'role', 'message')
    if (!v.isValid()) return
    setSending(true)
    setFalha(null)
    try {
      await sendContactMessage(form)
      setSent(true)
    } catch (e) {
      setFalha(e instanceof Error ? e.message : 'Não foi possível enviar a mensagem.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Contato"
        title="Fale com quem construiu a IrisFlow."
        highlight={['construiu']}
        lead={`Somos três pessoas e respondemos nós mesmos, normalmente em até dois dias úteis. Escreva se você é familiar ou cuidador de alguém com ${CONDITIONS_SHORT} e quer saber se a pessoa conseguiria usar o IrisFlow; se é fisioterapeuta, terapeuta ocupacional, fonoaudiólogo ou neurologista e quer avaliar o produto para indicar; ou se representa uma clínica ou associação interessada no programa de validação.`}
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
                  <form onSubmit={submit} noValidate data-sticky-hide>
                    <h2 className="contact__h contact__h--form">Envie uma mensagem</h2>

                    <Field
                      label="Nome completo"
                      value={form.name}
                      onChange={set('name')}
                      {...v.bind('name')}
                      required
                      valid={form.name.trim().length >= 3}
                      autoComplete="name"
                      placeholder="Como devemos chamar você"
                    />

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

                    <TextareaField
                      label="Mensagem"
                      rows={5}
                      value={form.message}
                      onChange={set('message')}
                      {...v.bind('message')}
                      required
                      valid={form.message.trim().length >= 15}
                      hint="Ajuda contar: quem vai usar, qual é a condição e há quanto tempo, se a pessoa ainda controla bem os olhos, que computador e webcam vocês têm, e o que já tentaram."
                    />

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

                    <Button
                      type="submit"
                      full
                      size="lg"
                      loading={sending}
                      disabled={!v.isValid() || sending}
                    >
                      {sending ? 'Enviando…' : 'Enviar mensagem'}
                    </Button>
                    {!v.isValid() && (
                      <p className="form-hint">Preencha os quatro campos para enviar.</p>
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
                    pacientes e profissionais prescritores recebem licenças gratuitas durante todo
                    o período, instalação e calibração acompanhadas, treinamento da equipe, canal
                    direto com os fundadores e ciclos quinzenais de ajuste do produto a partir do
                    que for relatado.
                  </p>
                  <p>
                    Em contrapartida, pedimos acesso a pacientes reais mediante consentimento,
                    observação clínica qualificada, retorno estruturado e autorização para
                    documentar o caso de forma anonimizada. É uma troca declarada, e está por
                    escrito justamente para que nenhuma das partes ache que está fazendo favor à
                    outra.
                  </p>
                  <p>
                    O paciente pode interromper a participação a qualquer momento, sem justificar.
                    Ao fim dos noventa dias a família decide livremente pela assinatura, e as
                    famílias dessa primeira safra ficam com condição diferenciada permanente.
                  </p>
                </Card>
              </Reveal>

              <Reveal anim="left" delay={220}>
                <Card as="div">
                  <CardIcon>
                    <Icon name="email" size={26} />
                  </CardIcon>
                  <h3>Canais diretos</h3>
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
                    </a>{' '}
                    ·{' '}
                    <a href={BRAND.linkedin} target="_blank" rel="noreferrer noopener" className="link-ok">
                      LinkedIn
                    </a>
                  </p>
                </Card>
              </Reveal>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

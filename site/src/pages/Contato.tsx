import { useState, type FormEvent } from 'react'
import { PageHead } from '@/components/layout/PageHead'
import { Reveal } from '@/components/effects/Reveal'
import { Field, SelectField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { isEmail } from '@/utils/format'
import { sendContactMessage } from '@/services/api'
import { BRAND } from '@/data/content'

type Form = { name: string; email: string; role: string; message: string }
type Errors = Partial<Record<keyof Form, string>>

export default function Contato() {
  const [form, setForm] = useState<Form>({ name: '', email: '', role: '', message: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  const set = (key: keyof Form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const validate = () => {
    const next: Errors = {}
    if (form.name.trim().length < 3) next.name = 'Informe seu nome completo.'
    if (!isEmail(form.email)) next.email = 'Informe um e-mail válido.'
    if (!form.role) next.role = 'Escolha a opção que melhor descreve você.'
    if (form.message.trim().length < 15) next.message = 'Conte um pouco mais: pelo menos 15 caracteres.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
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
        lead="Somos três pessoas e respondemos nós mesmos, normalmente em até dois dias úteis. Escreva se você é familiar ou cuidador de alguém com ELA, tetraplegia, sequela de AVC ou paralisia cerebral e quer saber se a pessoa conseguiria usar o IrisFlow; se é fisioterapeuta, terapeuta ocupacional, fonoaudiólogo ou neurologista e quer avaliar o produto para indicar; ou se representa uma clínica ou associação interessada no programa de validação."
      />

      <section className="section">
        <div className="container">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.05fr) minmax(0, 0.95fr)',
              gap: 'var(--sp-7)',
              alignItems: 'start',
            }}
          >
            <Reveal anim="right">
              <div className="panel" style={{ padding: 'var(--sp-6)' }}>
                {sent ? (
                  <div style={{ textAlign: 'center', padding: 'var(--sp-5) 0' }}>
                    <span
                      style={{
                        display: 'grid',
                        placeItems: 'center',
                        width: 68,
                        height: 68,
                        borderRadius: '50%',
                        margin: '0 auto var(--sp-4)',
                        background: 'var(--ok-soft)',
                        color: 'var(--ok)',
                        animation: 'pop-check 480ms var(--ease-spring) both',
                      }}
                    >
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
                    <h2 style={{ fontSize: '1.5rem' }}>Mensagem recebida</h2>
                    <p style={{ maxWidth: '46ch', marginInline: 'auto' }}>
                      Obrigado por escrever. A equipe responde pelo próprio {BRAND.email},
                      normalmente em até dois dias úteis.
                    </p>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setForm({ name: '', email: '', role: '', message: '' })
                        setSent(false)
                      }}
                    >
                      Escrever outra
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={submit} noValidate>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: 'var(--sp-5)' }}>
                      Envie uma mensagem
                    </h2>

                    <Field
                      label="Nome completo"
                      value={form.name}
                      onChange={set('name')}
                      error={errors.name}
                      autoComplete="name"
                      placeholder="Como devemos chamar você"
                    />

                    <Field
                      label="E-mail"
                      type="email"
                      value={form.email}
                      onChange={set('email')}
                      error={errors.email}
                      autoComplete="email"
                      placeholder="voce@exemplo.com.br"
                    />

                    <SelectField
                      label="Você é"
                      value={form.role}
                      onChange={set('role')}
                      error={errors.role}
                    >
                      <option value="">Selecione…</option>
                      <option value="familiar">Familiar ou cuidador</option>
                      <option value="usuario">Pessoa que vai usar a IrisFlow</option>
                      <option value="profissional">Profissional de saúde</option>
                      <option value="clinica">Clínica ou associação</option>
                      <option value="imprensa">Imprensa</option>
                      <option value="outro">Outro</option>
                    </SelectField>

                    <div className="field">
                      <label className="field__label" htmlFor="msg">
                        Mensagem
                      </label>
                      <textarea
                        id="msg"
                        className="field__input"
                        rows={5}
                        value={form.message}
                        onChange={set('message')}
                        placeholder="Quem vai usar, qual é a condição e há quanto tempo, se a pessoa ainda controla bem os olhos, que computador e webcam vocês têm, e o que já tentaram."
                        style={{ resize: 'vertical', fontFamily: 'inherit' }}
                      />
                      {errors.message && (
                        <p className="field__error" role="alert">
                          {errors.message}
                        </p>
                      )}
                    </div>

                    {falha && (
                      <p className="field__error" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
                        {falha}
                      </p>
                    )}

                    <Button type="submit" full size="lg" loading={sending}>
                      {sending ? 'Enviando…' : 'Enviar mensagem'}
                    </Button>
                  </form>
                )}
              </div>
            </Reveal>

            <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
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
                    <a href={`mailto:${BRAND.email}`} style={{ color: 'var(--ok)' }}>
                      {BRAND.email}
                    </a>
                  </p>
                  <p>
                    Redes:{' '}
                    <a href={BRAND.instagram} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--ok)' }}>
                      Instagram
                    </a>{' '}
                    ·{' '}
                    <a href={BRAND.linkedin} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--ok)' }}>
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

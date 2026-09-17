import { PageHead } from '@/components/layout/PageHead'
import { Pricing } from '@/components/sections/Pricing'
import { Comparison } from '@/components/sections/Comparison'
import { Faq } from '@/components/sections/Faq'
import { CallToAction } from '@/components/sections/CallToAction'
import { Reveal } from '@/components/effects/Reveal'
import { Counter } from '@/components/effects/Counter'
import { BETA, BRAND, TRIAL_DAYS } from '@/data/content'
import { usePlans } from '@/hooks/usePlans'

export default function Planos() {
  const { cheapest } = usePlans()

  return (
    <>
      <PageHead
        eyebrow="Planos"
        title={`A partir de R$ ${cheapest.price} por mês, contra R$ 15.000 a R$ 80.000 de entrada.`}
        highlight={[String(cheapest.price)]}
        lead={`Antes de ser uma diferença de preço, é uma diferença de risco. No modelo de equipamento, a família desembolsa dezenas de milhares de reais antes de saber se a solução funciona para o seu caso. Aqui ela instala o ${BRAND.product} no computador que já tem, testa gratuitamente e só passa a pagar se o paciente conseguir operar o sistema.${BETA.ativo ? ' Durante a beta, a contratação está pausada e o acesso é gratuito.' : ''}`}
      />

      <section className="section section--tight">
        <div className="container">
          <div className="grid grid--3">
            {[
              BETA.ativo
                ? { v: 0, s: '', l: 'reais durante a beta: acesso completo sem cartão e sem cobrança' }
                : { v: TRIAL_DAYS, s: ' dias', l: 'de avaliação gratuita antes da primeira cobrança' },
              { v: 0, s: '', l: 'reais de taxa de adesão, de equipamento e de multa por cancelamento' },
              { v: 3, s: '', l: 'planos, do essencial ao completo com clonagem de voz' },
            ].map((item, i) => (
              <Reveal key={item.l} anim="up" delay={i * 110}>
                <div style={{ padding: 'var(--sp-5)', borderLeft: '2px solid var(--line-strong)' }}>
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-display)',
                      fontSize: 'clamp(2.2rem, 4.6vw, 3.2rem)',
                      lineHeight: 1,
                      marginBottom: 'var(--sp-3)',
                      color: 'var(--text)',
                    }}
                  >
                    <Counter value={item.v} suffix={item.s} />
                  </span>
                  <p style={{ margin: 0, fontSize: '0.98rem', maxWidth: '32ch' }}>{item.l}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Pricing />
      <Comparison />
      <Faq />
      <CallToAction />
    </>
  )
}

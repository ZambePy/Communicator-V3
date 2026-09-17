import { PageHead } from '@/components/layout/PageHead'
import { Pipeline } from '@/components/sections/Pipeline'
import { DwellDemo } from '@/components/sections/DwellDemo'
import { CallToAction } from '@/components/sections/CallToAction'
import { Reveal } from '@/components/effects/Reveal'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { IrisMark } from '@/components/layout/Logo'
import { Parallax } from '@/components/effects/Parallax'

const STEPS_USER = [
  {
    n: '01',
    title: 'Instale no computador que já existe em casa',
    text: 'Instalador para Windows 10/11 (macOS e Linux em preparação). Nenhum equipamento novo e nenhuma câmera especial: a webcam do notebook basta.',
  },
  {
    n: '02',
    title: 'Deixe o sistema preparar o posto de uso',
    text: 'Antes de calibrar, a IrisFlow mede distância, enquadramento, postura, iluminação, contraste, reflexo em lentes e cintilação da rede, e ajusta zoom, brilho e contraste da câmera em malha fechada. Quando o driver não permite o ajuste, informa qual providência física é necessária.',
  },
  {
    n: '03',
    title: 'Calibre em menos de trinta segundos',
    text: 'Nove pontos em grade de três por três, com ordem embaralhada. Os primeiros quatrocentos milissegundos de cada ponto são descartados, porque correspondem à sacada e à acomodação do olho. O procedimento leva de dezenove a vinte e nove segundos.',
  },
  {
    n: '04',
    title: 'Comece a falar',
    text: 'Teclado ordenado pela frequência do português, banco de frases, pictogramas, síntese de voz e o cursor do sistema operacional. A emergência fica sempre no mesmo lugar, em todas as telas.',
  },
]

const SAFETY: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'relogio',
    title: 'Tempo de fixação configurável',
    text: 'De 800 a 2500 milissegundos, com retorno visual em três estágios. O usuário tem uma janela explícita para desistir antes que a seleção se complete.',
  },
  {
    icon: 'bloqueio',
    title: 'Período refratário de 800 ms',
    text: 'Depois de cada acionamento, o mesmo alvo fica bloqueado, o que impede o disparo duplo enquanto o olho ainda está sobre ele.',
  },
  {
    icon: 'alerta',
    title: 'Bloqueio em estado degradado',
    text: 'Quando o rastreamento perde confiabilidade, nenhuma seleção é aceita. A exceção é deliberada: o botão de emergência continua acionável, com tempo de fixação ampliado.',
  },
  {
    icon: 'olho',
    title: 'Monitoramento de postura e fadiga',
    text: 'Acima de sessenta pixels de desvio acumulado, o cuidador recebe um aviso que distingue o desvio lento, que só exige reapoiar a nuca, do desvio errático, que pede recalibração. A taxa de piscadas indica fadiga.',
  },
]

export default function ComoFunciona() {
  return (
    <>
      <PageHead
        eyebrow="Como funciona"
        title="Do olho até a palavra, sem nada sair do computador."
        highlight={['sem', 'nada', 'sair']}
        lead="Quadros da câmera, posição bruta da íris e coeficientes do modelo de calibração são processados e permanecem exclusivamente no dispositivo do usuário. Nenhuma imagem e nenhum vetor de calibração trafega pela rede."
      />

      <section className="section">
        <div className="container">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)',
              gap: 'var(--sp-7)',
              alignItems: 'center',
            }}
            className="how__split"
          >
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--sp-5)' }}>
              {STEPS_USER.map((s, i) => (
                <Reveal key={s.n} anim="right" delay={i * 110} as="li">
                  <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
                    <span
                      style={{
                        flex: 'none',
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.05rem',
                        color: 'var(--ok)',
                        paddingTop: '4px',
                      }}
                    >
                      {s.n}
                    </span>
                    <div>
                      <h3 style={{ fontSize: '1.25rem', marginBottom: 'var(--sp-2)' }}>{s.title}</h3>
                      <p style={{ margin: 0, maxWidth: '58ch' }}>{s.text}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>

            <Parallax speed={-0.08}>
              <IrisMark size={320} tone="positivo" />
            </Parallax>
          </div>
        </div>
      </section>

      <Pipeline />
      <DwellDemo />

      <section className="section">
        <div className="container">
          <Reveal anim="fade">
            <span className="eyebrow">Segurança da seleção</span>
          </Reveal>
          <Reveal anim="up">
            <h2 style={{ maxWidth: '24ch', marginBottom: 'var(--sp-4)' }}>
              Quatro mecanismos contra o acionamento acidental.
            </h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead" style={{ maxWidth: '72ch', marginBottom: 'var(--sp-7)' }}>
              A taxa de falsos cliques ainda não foi medida em uso contínuo real. Medi-la exige
              sessões longas com o público-alvo, que é justamente o objetivo do programa de
              validação. A meta declarada é ficar abaixo de um acionamento acidental por hora.
            </p>
          </Reveal>

          <div className="grid grid--2">
            {SAFETY.map((s, i) => (
              <Reveal key={s.title} anim="up" delay={i * 90}>
                <Card as="div">
                  <CardIcon tone={i % 2 === 0 ? 'teal' : 'blue'}>
                    <Icon name={s.icon} size={26} />
                  </CardIcon>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CallToAction />
    </>
  )
}

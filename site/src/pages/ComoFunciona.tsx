import { PageHead } from '@/components/layout/PageHead'
import { Pipeline } from '@/components/sections/Pipeline'
import { DwellDemo } from '@/components/sections/DwellDemo'
import { CallToAction } from '@/components/sections/CallToAction'
import { Reveal } from '@/components/effects/Reveal'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { IrisMark } from '@/components/layout/Logo'
import { Parallax } from '@/components/effects/Parallax'
import { PLATFORMS } from '@/data/content'
import './como-funciona.css'

const STEPS_USER = [
  {
    n: '01',
    title: 'Instale no computador que já existe em casa',
    text: `Instalador para ${PLATFORMS.long}. Nenhum equipamento novo e nenhuma câmera especial: a webcam do notebook basta.`,
  },
  {
    n: '02',
    title: 'Deixe o sistema preparar o posto de uso',
    text: 'Antes de calibrar, a IrisFlow confere distância, enquadramento, postura e iluminação — inclusive reflexo nos óculos — e ajusta a câmera sozinha quando dá. Quando o ajuste depende de algo físico, ela diz exatamente o que mudar.',
  },
  {
    n: '03',
    title: 'Calibre em cerca de meio minuto',
    text: 'A pessoa só acompanha com o olhar alguns pontos que aparecem na tela. Em cerca de meio minuto, a calibração aprende o jeito de olhar dela, naquele computador e naquela posição.',
  },
  {
    n: '04',
    title: 'Comece a falar',
    text: 'Teclado com sugestões que aprendem com a pessoa, frases prontas, pictogramas e síntese de voz — e, no Modo Computador, o Windows inteiro. A emergência fica sempre no mesmo lugar, em todas as telas.',
  },
]

const SAFETY: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'relogio',
    title: 'Tempo de fixação configurável',
    text: 'De 0,4 a 4 segundos, com atalhos para 0,8, 1,5 e 2,5 s, e retorno visual em três estágios. O usuário tem uma janela explícita para desistir antes que a seleção se complete.',
  },
  {
    icon: 'bloqueio',
    title: 'Pausa depois de cada seleção',
    text: 'Depois de cada acionamento, o mesmo alvo fica bloqueado por um instante, o que impede o disparo duplo enquanto o olho ainda está sobre ele.',
  },
  {
    icon: 'alerta',
    title: 'Bloqueio em estado degradado',
    text: 'Quando o rastreamento perde confiabilidade, nenhuma seleção é aceita. A exceção é deliberada: o botão de emergência continua acionável, com tempo de fixação ampliado.',
  },
  {
    icon: 'olho',
    title: 'Avisos de postura e de cansaço',
    text: 'Quando a cabeça sai da posição da calibração, a tela avisa e oferece um reajuste de dois segundos; se a precisão cai além do medido, sugere recalibrar. O sistema também acompanha sinais de cansaço visual.',
  },
]

export default function ComoFunciona() {
  return (
    <>
      <PageHead
        eyebrow="Como funciona"
        title="Do olho até a palavra, sem nada sair do computador."
        highlight={['sem', 'nada', 'sair']}
        lead="As imagens da câmera, a posição dos olhos e os dados de calibração são processados e permanecem exclusivamente no computador do usuário. Nenhuma imagem e nenhum dado de calibração trafega pela rede."
      />

      <section className="section">
        <div className="container">
          <div className="how__split">
            <ol className="how__steps">
              {STEPS_USER.map((s, i) => (
                <Reveal key={s.n} anim="right" delay={i * 110} as="li">
                  <div className="how__step">
                    <span className="how__n">{s.n}</span>
                    <div>
                      <h3 className="how__step-title">{s.title}</h3>
                      <p className="how__step-text">{s.text}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </ol>

            <Parallax speed={-0.08}>
              <IrisMark size={320} />
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
            <h2 className="section-title">Quatro mecanismos contra o acionamento acidental.</h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead section-lead">
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

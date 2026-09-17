import { PageHead } from '@/components/layout/PageHead'
import { Modules } from '@/components/sections/Modules'
import { Differentiators } from '@/components/sections/Differentiators'
import { Comparison } from '@/components/sections/Comparison'
import { CallToAction } from '@/components/sections/CallToAction'
import { Reveal } from '@/components/effects/Reveal'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { useDownloads } from '@/hooks/useDownloads'
import { BRAND } from '@/data/content'

const LIMITS = [
  {
    title: `O que o ${BRAND.product} entrega`,
    tone: 'ok' as const,
    items: [
      'Controle pleno dentro das próprias telas, desenhadas com alvos grandes e bem espaçados',
      'Controle do cursor do sistema operacional em nível funcional: abrir um programa, navegar, clicar em botões de tamanho razoável',
      'Composição de texto por fixação, com um evento por caractere e tempo aproximadamente constante',
      'Funcionamento offline do núcleo de rastreamento, do teclado e das frases rápidas',
    ],
  },
  {
    title: 'O que ela ainda não entrega',
    tone: 'warn' as const,
    items: [
      'Interfaces de terceiros com alvos pequenos, menus densos ou elementos que exigem arraste preciso',
      'Uso confortável por quem apresenta movimento involuntário acentuado, espasticidade ou tremor, condições ainda não avaliadas',
      'Taxa de acionamento acidental medida em uso contínuo real, que só o programa de validação vai responder',
      'Estudo clínico publicado, atributo em que as soluções internacionais têm décadas de vantagem',
    ],
  },
]

const ADOPTION: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'webcam',
    title: 'Primeiro uso guiado',
    text: 'A família é conduzida passo a passo pela posição da câmera, pela iluminação do ambiente e pela calibração inicial, antes de qualquer tentativa de uso real.',
  },
  {
    icon: 'monitor',
    title: 'Tutorial dentro do produto',
    text: 'A explicação fica onde a dúvida aparece, na própria tela, e não em um manual que ninguém abre depois da instalação.',
  },
  {
    icon: 'documento',
    title: 'Orientação em linguagem simples',
    text: 'Material escrito para quem vai cuidar, não para quem vai programar. Sem jargão de engenharia e sem depender de tradução.',
  },
  {
    icon: 'email',
    title: 'Suporte em português, com gente',
    text: 'O canal de suporte é atendido pela própria equipe. Em um produto usado por horas por dia, sem assistência técnica presente, isso não é acessório.',
  },
]

export default function Solucao() {
  const downloads = useDownloads()

  return (
    <>
      <PageHead
        eyebrow="O produto"
        title={`${BRAND.product}: uma plataforma de comunicação, não um rastreador.`}
        highlight={['comunicação,']}
        lead="Aplicação instalável para Windows 10/11 (macOS e Linux em preparação), construída sobre Electron, que roda integralmente no dispositivo do usuário. O rastreamento ocular é a camada de entrada; sobre ela foram construídos ambientes completos de comunicação, controle, lazer, cuidado e emergência."
      />

      <section className="section section--tight">
        <div className="container">
          <div className="grid grid--2">
            {LIMITS.map((block, i) => (
              <Reveal key={block.title} anim={i === 0 ? 'right' : 'left'} delay={i * 120}>
                <Card as="div">
                  <CardIcon tone={block.tone === 'ok' ? 'teal' : 'blue'}>
                    <Icon name={block.tone === 'ok' ? 'check' : 'alerta'} size={26} />
                  </CardIcon>
                  <h3>{block.title}</h3>
                  <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
                    {block.items.map((it) => (
                      <li key={it} style={{ fontSize: '0.96rem' }}>
                        {it}
                      </li>
                    ))}
                  </ul>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal anim="fade" delay={280}>
            <p
              style={{
                marginTop: 'var(--sp-6)',
                maxWidth: '88ch',
                fontSize: '0.96rem',
                color: 'var(--text-dim)',
                paddingLeft: 'var(--sp-5)',
                borderLeft: '2px solid var(--line)',
              }}
            >
              Preferimos declarar o limite a prometer o que a física do sensor não permite. É a
              mesma razão pela qual publicamos os indicadores de precisão junto com as condições
              em que foram medidos.
            </p>
          </Reveal>
        </div>
      </section>

      <Modules />

      {/* A entrega não termina no instalador: a principal causa de abandono
          de tecnologia assistiva é falta de apoio na adoção, não falha do
          produto. Isso precisa aparecer antes dos diferenciais técnicos. */}
      <section className="section">
        <div className="container">
          <Reveal anim="fade">
            <span className="eyebrow">O que vai junto</span>
          </Reveal>
          <Reveal anim="up">
            <h2 style={{ maxWidth: '26ch', marginBottom: 'var(--sp-4)' }}>
              A entrega não é o arquivo de instalação.
            </h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead" style={{ maxWidth: '70ch', marginBottom: 'var(--sp-6)' }}>
              A principal causa de abandono de tecnologia assistiva não é falha do produto: é falta
              de apoio na hora de adotar. Um software que funciona mas que a família não consegue
              instalar, calibrar ou ajustar termina na gaveta. Por isso o acompanhamento do
              primeiro uso faz parte da assinatura, e não de um serviço à parte.
            </p>
          </Reveal>

          <div className="grid grid--2">
            {ADOPTION.map((item, i) => (
              <Reveal key={item.title} anim="up" delay={i * 90}>
                <Card as="div">
                  <CardIcon tone={i % 2 === 0 ? 'teal' : 'blue'}>
                    <Icon name={item.icon} size={26} />
                  </CardIcon>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Differentiators />
      <Comparison />

      <section className="section section--tight">
        <div className="container center">
          <Reveal anim="up">
            <h2>Disponível para os três sistemas</h2>
            <p className="lead" style={{ maxWidth: '58ch', marginInline: 'auto' }}>
              Uma base de código única gera o instalador para Windows; os de macOS e Linux estão em preparação e saem da mesma base. O download
              fica liberado assim que a conta é criada.
            </p>
          </Reveal>
          <Reveal anim="up" delay={160}>
            <div
              style={{
                display: 'flex',
                gap: 'var(--sp-3)',
                justifyContent: 'center',
                flexWrap: 'wrap',
                marginTop: 'var(--sp-5)',
              }}
            >
              <Button href={downloads.windows} variant="secondary">
                Windows
              </Button>
              <Button href={downloads.macos} variant="secondary">
                macOS
              </Button>
              <Button href={downloads.linux} variant="secondary">
                Linux
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      <CallToAction />
    </>
  )
}

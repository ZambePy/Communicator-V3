import { PageHead } from '@/components/layout/PageHead'
import { Modules } from '@/components/sections/Modules'
import { Differentiators } from '@/components/sections/Differentiators'
import { Comparison } from '@/components/sections/Comparison'
import { CallToAction } from '@/components/sections/CallToAction'
import { Reveal } from '@/components/effects/Reveal'
import { Card, CardIcon } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { DownloadPanel } from '@/components/ui/DownloadPanel'
import { BETA, BETA_CTA, BRAND } from '@/data/content'
import { Button } from '@/components/ui/Button'
import { useDownloads } from '@/hooks/useDownloads'
import './solucao.css'

const LIMITS = [
  {
    title: `O que o ${BRAND.product} entrega`,
    tone: 'ok' as const,
    items: [
      'Controle pleno dentro das próprias telas, desenhadas com alvos grandes e bem espaçados',
      'Modo Computador no Windows: clicar, arrastar, rolar e digitar em qualquer programa, com uma lupa para os alvos pequenos',
      'Escrita por fixação, com sugestões de palavras e de frases que aprendem com a pessoa',
      'Funcionamento offline do rastreamento, do teclado e das frases rápidas',
    ],
  },
  {
    title: 'O que ele ainda não entrega',
    tone: 'warn' as const,
    items: [
      'Arraste fino e menus muito densos, que continuam trabalhosos com a precisão de uma webcam, mesmo com a lupa',
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
    title: 'Guia para quem cuida',
    text: 'A área do cuidador traz um guia de instalação e explica o resultado do teste de precisão em linguagem simples, escrito para quem vai cuidar, não para quem vai programar.',
  },
  {
    icon: 'email',
    title: 'Suporte em português, com gente',
    text: 'O canal de suporte é atendido pela própria equipe. Em um produto usado por horas por dia, sem assistência técnica presente, isso não é acessório.',
  },
]

export default function Solucao() {
  // Sistemas com instalador: os mesmos do painel de download desta página.
  const { platformsText } = useDownloads()

  return (
    <>
      <PageHead
        eyebrow="O produto"
        title={`${BRAND.product}: uma plataforma de comunicação, não um rastreador.`}
        highlight={['comunicação,']}
        lead={`Aplicação instalável para ${platformsText.long}, que roda integralmente no dispositivo do usuário. O rastreamento ocular é a camada de entrada; sobre ela foram construídos ambientes completos de comunicação, controle, lazer, cuidado e emergência.`}
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
                  <ul className="limits__list">
                    {block.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal anim="fade" delay={280}>
            <p className="aside-note">
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
            <h2 className="section-title">A entrega não é o arquivo de instalação.</h2>
          </Reveal>
          <Reveal anim="up" delay={120}>
            <p className="lead section-lead section-lead--tight">
              A principal causa de abandono de tecnologia assistiva não é falha do produto: é falta
              de apoio na hora de adotar. Um software que funciona mas que a família não consegue
              instalar, calibrar ou ajustar termina na gaveta. Por isso o acompanhamento do
              primeiro uso faz parte do produto, e não de um serviço à parte.
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

      <section className="section section--tight download-strip" id="download">
        <div className="container center">
          <Reveal anim="up">
            <h2 className="section-title section-title--center">
              Instalador para {platformsText.short}
            </h2>
            <p className="lead section-lead section-lead--center">
              Uma base de código única gera os instaladores de todos os sistemas.{' '}
              {BETA.ativo
                ? 'Para usar, inscreva-se na beta gratuita: o login no aplicativo é o mesmo e-mail e senha da conta.'
                : 'Para usar, crie a conta: o login no aplicativo é o mesmo e-mail e senha.'}
            </p>
          </Reveal>
          <Reveal anim="up" delay={160}>
            <DownloadPanel />
            {BETA.ativo && (
              <p className="download-strip__fine">
                Ainda sem conta?{' '}
                <Button to={BETA_CTA.to} variant="ghost">
                  {BETA_CTA.label}
                </Button>
              </p>
            )}
          </Reveal>
        </div>
      </section>

      <CallToAction />
    </>
  )
}

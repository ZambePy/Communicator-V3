import { AmbientBackground } from '@/components/effects/AmbientBackground'
import { IrisMark } from '@/components/layout/Logo'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'

export default function NotFound() {
  return (
    <div
      className="on-dark"
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        overflow: 'hidden',
        padding: 'calc(var(--header-h) + var(--sp-7)) 0 var(--sp-8)',
      }}
    >
      <AmbientBackground particles={18} />

      <div className="container center" style={{ position: 'relative', zIndex: 1 }}>
        <Reveal anim="zoom">
          <IrisMark size={190} />
        </Reveal>

        <Reveal anim="up" delay={180}>
          <h1
            className="glitch"
            data-text="404"
            style={{ fontSize: 'clamp(3.2rem, 11vw, 6rem)', margin: 'var(--sp-5) 0 var(--sp-3)' }}
          >
            404
          </h1>
        </Reveal>

        <Reveal anim="up" delay={280}>
          <p className="lead" style={{ maxWidth: '46ch', marginInline: 'auto' }}>
            Procuramos, mas essa página não está em lugar nenhum da tela.
          </p>
        </Reveal>

        <Reveal anim="up" delay={380}>
          <div
            style={{
              display: 'flex',
              gap: 'var(--sp-3)',
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginTop: 'var(--sp-5)',
            }}
          >
            <Button to="/">Voltar ao início</Button>
            <Button to="/contato" variant="secondary">
              Falar com a equipe
            </Button>
          </div>
        </Reveal>
      </div>
    </div>
  )
}

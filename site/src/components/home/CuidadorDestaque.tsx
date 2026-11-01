import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { CUIDADOR_DESTAQUE as C } from '@/data/home'
import { RESSALVA_DOS_ALERTAS } from '@/data/cuidador'
import { LOJAS } from '@/lib/lojas'
import { MensagemQueChega } from './MensagemQueChega'
import './aparelhos.css'
import './cuidador-destaque.css'

type Destino = { to: string } | { href: string; externo?: boolean }

/**
 * O app de quem cuida, na faixa da noite (desenho de 31/10/2026): à esquerda,
 * o celular com a tela real da conversa e o cartão "Quero água." que chega uma
 * vez quando a faixa entra na tela (MensagemQueChega); à direita, a marca do
 * IrisFlow Cuidador, o título, três pontos, a ressalva dos alertas (a única
 * vez na home: auditoria P2-14) e as duas chamadas.
 *
 * O botão do Android leva ao mesmo destino de antes: a ficha do Google Play
 * quando existir; antes dela, o APK da beta depois do lançamento; sem nenhum
 * dos dois, à parte de disponibilidade de /cuidador (a reserva do selo).
 */
export function CuidadorDestaque() {
  const program = useBetaProgram()
  const lancou = useJaLancou(program.launchAt)
  const android: Destino = LOJAS.googlePlay
    ? { href: LOJAS.googlePlay }
    : LOJAS.apk && lancou
      ? { href: LOJAS.apk, externo: false }
      : { to: '/cuidador#disponibilidade' }

  return (
    <section className="cuidador-destaque home-faixa on-dark" aria-labelledby="cuidador-destaque-titulo">
      <div className="container cuidador-destaque__grade">
        <Reveal className="cuidador-destaque__aparelho" delay={120}>
          <div className="celular cuidador-destaque__celular">
            <div className="celular__moldura">
              <div className="celular__tela">
                <img
                  className="celular__video"
                  src={C.tela.src}
                  alt={C.tela.alt}
                  width={C.tela.largura}
                  height={C.tela.altura}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <span className="celular__camera" aria-hidden="true" />
            </div>
            <MensagemQueChega nome={C.chega.nome} iniciais={C.chega.iniciais} frase={C.chega.frase} variante="fora" />
          </div>
        </Reveal>

        <div className="cuidador-destaque__texto">
          <Reveal>
            <img
              className="cuidador-destaque__marca"
              src="/brand/irisflow-cuidador-negativo.svg"
              alt="IrisFlow Cuidador"
              width={141}
              height={152}
            />
            <h2 id="cuidador-destaque-titulo" className="home-titulo cuidador-destaque__titulo">
              {C.titulo}
            </h2>
            <p className="home-sub">{C.texto}</p>
          </Reveal>
          <Reveal delay={80}>
            <ul className="cuidador-destaque__pontos">
              {C.pontos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <p className="cuidador-destaque__ressalva">{RESSALVA_DOS_ALERTAS}</p>
          </Reveal>
          <Reveal delay={160} className="cuidador-destaque__acoes">
            {'to' in android ? (
              <Button to={android.to} size="lg">
                {C.botaoAndroid}
              </Button>
            ) : (
              <Button href={android.href} externo={android.externo} size="lg">
                {C.botaoAndroid}
              </Button>
            )}
            <Button to="/cuidador" size="lg" variant="secondary">
              {C.botaoConhecer}
            </Button>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

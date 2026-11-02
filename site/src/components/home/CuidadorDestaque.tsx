import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Reveal } from '@/components/effects/Reveal'
import { Button } from '@/components/ui/Button'
import { useBetaProgram, useJaLancou } from '@/hooks/useBetaProgram'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { CUIDADOR_DESTAQUE as C } from '@/data/home'
import { RESSALVA_DOS_ALERTAS } from '@/data/cuidador'
import { LOJAS } from '@/lib/lojas'
import './aparelhos.css'
import './cuidador-destaque.css'

type Destino = { to: string } | { href: string; externo?: boolean }
type IdDaFuncao = (typeof C.funcoes)[number]['id']

/** Quanto tempo cada função fica no celular antes da próxima (o aro dela fecha nesse tempo). */
const TEMPO_DA_FUNCAO_MS = 6000

/**
 * O controle de cada função, em tamanho de pôster, ao lado do celular: o
 * pedaço do app que a função mostra (as respostas rápidas, o botão do
 * socorro, o tempo de fixação, as frases por dia). Desenho do próprio app,
 * decorativo: o texto da função ao lado diz o mesmo.
 */
function ControleDaFuncao({ id }: { id: IdDaFuncao }) {
  switch (id) {
    case 'conversa':
      return (
        <div className="cd-respostas">
          <span className="cd-resposta cd-resposta--sim">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            Sim
          </span>
          <span className="cd-resposta cd-resposta--nao">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            Não
          </span>
          <span className="cd-resposta cd-resposta--indo">Já estou indo</span>
        </div>
      )
    case 'socorro':
      return (
        <span className="cd-socorro">
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="10" />
            <path d="M7.5 12.5l3 3 6-6.5" />
          </svg>
          Estou indo!
        </span>
      )
    case 'ajustes':
      return (
        <div className="cd-ajuste">
          <span className="cd-ajuste__titulo">Tempo de fixação</span>
          <span className="cd-ajuste__opcoes">
            <span>
              <b>800 ms</b>rápido
            </span>
            <span className="is-escolhida">
              <b>1500 ms</b>padrão
            </span>
            <span>
              <b>2500 ms</b>seguro
            </span>
          </span>
        </div>
      )
    case 'relatorios':
      return (
        <div className="cd-barras">
          <span className="cd-barras__titulo">Frases faladas por dia</span>
          <span className="cd-barras__grade">
            {[29, 22, 12, 26, 18, 31, 23].map((v, i) => (
              <span key={i} className={i === 6 ? 'is-hoje' : undefined} style={{ '--v': v / 31 } as CSSProperties}>
                <i />
                {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][i]}
              </span>
            ))}
          </span>
        </div>
      )
  }
}

/**
 * O app de quem cuida (redesenho de 01/11/2026, segunda volta, pedido do
 * dono: a faixa não apresentava o app). Um capítulo de cor inteira: cada
 * função do app pinta o campo com a cor dela (a conversa no azul da marca, o
 * socorro no vermelho do alerta, os ajustes no verde-azulado escuro, os
 * relatórios no marinho), e o celular grande troca para a tela real dela, com
 * o controle da função ampliado ao lado. À esquerda, o ícone do app, o título
 * e as quatro funções.
 *
 * Enquanto a faixa está à vista, as funções se revezam sozinhas: o aro da
 * função ativa fecha em 6 s (o gesto do olhar parado que vira clique) e passa
 * à próxima. Apontar, focar ou tocar uma função escolhe a função e para o
 * revezamento enquanto o ponteiro ou o foco estiver lá. Com movimento
 * reduzido, nada se reveza e as cores trocam sem transição.
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

  const reduzido = useReducedMotion()
  const [ativo, setAtivo] = useState(0)
  const [segurando, setSegurando] = useState(false)
  const [aVista, setAVista] = useState(false)
  const faixa = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = faixa.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setAVista(e.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const revezando = !reduzido && aVista && !segurando
  const total = C.funcoes.length

  return (
    <section
      ref={faixa}
      className="cuidador-destaque home-faixa on-dark"
      aria-labelledby="cuidador-destaque-titulo"
      data-revezando={revezando ? 'sim' : 'nao'}
      style={{ '--tempo-da-funcao': `${TEMPO_DA_FUNCAO_MS}ms` } as CSSProperties}
    >
      {/* Os campos de cor, um por função, um sobre o outro: troca por opacidade. */}
      <div className="cuidador-destaque__campos" aria-hidden="true">
        {C.funcoes.map((f, i) => (
          <span key={f.id} className={`cuidador-destaque__campo cuidador-destaque__campo--${f.id}${i === ativo ? ' is-ativo' : ''}`} />
        ))}
      </div>

      <div className="container cuidador-destaque__grade">
        <div className="cuidador-destaque__texto">
          <Reveal>
            <div className="cuidador-destaque__app">
              <img src="/brand/cuidador-icone.png" alt="" width={192} height={192} />
              <span>
                <strong>IrisFlow Cuidador</strong>
                O app de quem cuida, para Android
              </span>
            </div>
            <h2 id="cuidador-destaque-titulo" className="cuidador-destaque__titulo">
              {C.titulo}
            </h2>
            <p className="cuidador-destaque__sub">{C.texto}</p>
          </Reveal>

          <ul
            className="cuidador-destaque__funcoes"
            onPointerEnter={() => setSegurando(true)}
            onPointerLeave={() => setSegurando(false)}
            onFocus={() => setSegurando(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSegurando(false)
            }}
          >
            {C.funcoes.map((f, i) => (
              <Reveal as="li" key={f.id} delay={80 + i * 70}>
                <button
                  type="button"
                  className={`cuidador-destaque__funcao${i === ativo ? ' is-ativo' : ''}`}
                  aria-current={i === ativo ? 'true' : undefined}
                  onPointerEnter={() => setAtivo(i)}
                  onFocus={() => setAtivo(i)}
                  onClick={() => setAtivo(i)}
                >
                  <svg className="cuidador-destaque__aro" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
                    <circle className="cuidador-destaque__aro-trilho" cx="20" cy="20" r="16" />
                    <circle
                      key={i === ativo ? `ativo-${ativo}` : 'parado'}
                      className="cuidador-destaque__aro-traco"
                      cx="20"
                      cy="20"
                      r="16"
                      pathLength={1}
                      onAnimationEnd={() => {
                        if (i === ativo) setAtivo((a) => (a + 1) % total)
                      }}
                    />
                  </svg>
                  <span className="cuidador-destaque__funcao-nome">{f.nome}</span>
                  <span className="cuidador-destaque__funcao-texto">{f.texto}</span>
                </button>
              </Reveal>
            ))}
          </ul>
          <p className="cuidador-destaque__ressalva">{RESSALVA_DOS_ALERTAS}</p>

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

        <Reveal className="cuidador-destaque__palco" delay={120}>
          <div className="celular cuidador-destaque__celular">
            <div className="celular__moldura">
              <div className="celular__tela">
                {C.funcoes.map((f, i) => (
                  <img
                    key={f.id}
                    className={`celular__video cuidador-destaque__tela${i === ativo ? ' is-ativo' : ''}`}
                    src={f.tela}
                    alt={f.id === 'conversa' ? C.tela.alt : (f.alt ?? '')}
                    aria-hidden={i === ativo ? undefined : true}
                    width={C.tela.largura}
                    height={C.tela.altura}
                    loading="lazy"
                    decoding="async"
                  />
                ))}
              </div>
              <span className="celular__camera" aria-hidden="true" />
            </div>
            <div className="cuidador-destaque__controles" aria-hidden="true" data-ui>
              {C.funcoes.map((f, i) => (
                <div key={f.id} className={`cuidador-destaque__controle${i === ativo ? ' is-ativo' : ''}`}>
                  <ControleDaFuncao id={f.id} />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

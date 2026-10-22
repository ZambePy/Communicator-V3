import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  INICIO,
  TECLAS_DA_GRADE,
  celulas,
  chaveDoNivel,
  teclasAtivas,
  type Celula,
  type EstadoDoTeclado,
  type IdDaTecla,
} from './maquinaDoTeclado'
import { QUADRO_FINAL } from './frasesDaAbertura'
import type { Flip, Modo, Motor, PecasDaTecla } from './motorDoOlhar'
import './escrita-pelo-olhar.css'

/**
 * O olhar escrevendo no teclado do IrisFlow (pedido de 20/10/2026). Foi a
 * abertura da home até a rodada 3 (21/10/2026), quando a gravação real voltou
 * para o topo; desde então mora em "Como funciona" (ComoFunciona.tsx).
 *
 * Desenhado na página — não é vídeo. As teclas são as do app
 * (maquinaDoTeclado.ts); o tempo, o roteiro (roteiroDoOlhar.ts); o laço de
 * quadros, o motor (motorDoOlhar.ts), que chega sob demanda logo depois da
 * página. Aqui só se desenha a tela.
 *
 * - Toca só com o teclado na tela e a aba à vista, duas frases, e para no
 *   quadro final com "Ver de novo". Pausar e continuar a qualquer momento
 *   (WCAG 2.2.2).
 * - Com o mouse no teclado, a pessoa assume: o ponto segue o mouse com o
 *   atraso de um cursor de olhar, e parar numa tecla a aciona (ou clicar).
 *   No toque nada muda: a abertura só toca, e a página rola.
 * - Com movimento reduzido: o quadro final, parado, com a frase escrita — e o
 *   motor nem é baixado.
 * - O desenho é decorativo para o leitor de tela, que recebe a descrição.
 */

/* ---------------- glifos das ações (os do app, em traço) ---------------- */

function GlifoEspaco() {
  return (
    <svg className="tecla__glifo" viewBox="0 0 24 12" aria-hidden="true" focusable="false">
      <path d="M2 3v6h20V3" />
    </svg>
  )
}

function GlifoApagar() {
  return (
    <svg className="tecla__glifo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12z" />
      <path d="m11.5 9.5 5 5M16.5 9.5l-5 5" />
    </svg>
  )
}

function GlifoLimpar() {
  return (
    <svg className="tecla__glifo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13" />
    </svg>
  )
}

function GlifoDaAcao({ acao }: { acao: string }) {
  if (acao === 'Espaço') return <GlifoEspaco />
  if (acao === 'Apagar') return <GlifoApagar />
  if (acao === 'Limpar') return <GlifoLimpar />
  return <Icon name="voz" size={24} className="tecla__glifo" />
}

/** O conteúdo de uma tecla da grade. `data-item` é o que o grupo, ao abrir, leva para cada tecla. */
function Conteudo({ celula }: { celula: Celula }) {
  switch (celula.tipo) {
    case 'grupo':
      return (
        <span className="tecla__grupo">
          {[celula.letras.slice(0, 3), celula.letras.slice(3)].map((linha, i) => (
            <span key={i} className="tecla__linha">
              {linha.map((l) => (
                <span key={l} data-item={l}>
                  {l}
                </span>
              ))}
            </span>
          ))}
        </span>
      )
    case 'acoes':
      return (
        <span className="tecla__grupo">
          <span className="tecla__linha">
            <span data-item="Y">Y</span>
            <span data-item="Z">Z</span>
            <span data-item="Espaço">
              <GlifoEspaco />
            </span>
          </span>
          <span className="tecla__linha tecla__linha--icones">
            {['Falar', 'Apagar', 'Limpar'].map((a) => (
              <span key={a} data-item={a}>
                <GlifoDaAcao acao={a} />
              </span>
            ))}
          </span>
        </span>
      )
    case 'previa':
      return (
        <span className="tecla__previa">
          {celula.palavras.map((p) => (
            <span key={p} data-item={p}>
              {p}
            </span>
          ))}
          {celula.frases > 0 && (
            <span className="tecla__mais">
              + {celula.frases} {celula.frases === 1 ? 'frase' : 'frases'}
            </span>
          )}
        </span>
      )
    case 'letra':
      return (
        <span className="tecla__letra" data-item={celula.letra}>
          {celula.letra}
        </span>
      )
    case 'acao':
      return (
        <span className="tecla__acao" data-item={celula.acao}>
          <GlifoDaAcao acao={celula.acao} />
          <span className="tecla__rotulo">{celula.acao}</span>
        </span>
      )
    case 'palavra':
      return (
        <span className="tecla__palavra" data-item={celula.texto}>
          {celula.texto}
        </span>
      )
    case 'frase':
      return (
        <span className="tecla__frase" data-item={celula.texto}>
          {celula.texto}
        </span>
      )
    default:
      return null
  }
}

type Ponto = { x: number; y: number }

export function EscritaPeloOlhar() {
  const reduzido = useReducedMotion()
  const idBase = useId().replace(/:/g, '')

  const [estado, setEstado] = useState<EstadoDoTeclado>(() => (reduzido ? QUADRO_FINAL : INICIO))
  const [chegada, setChegada] = useState(() => (reduzido ? QUADRO_FINAL.texto.length : 0))
  const [modo, setModo] = useState<Modo>(() => (reduzido ? 'fim' : 'auto'))
  const [pausado, setPausado] = useState(false)
  const [acesa, setAcesa] = useState<IdDaTecla | null>(null)
  const [fala, setFala] = useState(0)
  const [apagando, setApagando] = useState(false)

  const telaRef = useRef<HTMLDivElement>(null)
  const gradeRef = useRef<HTMLDivElement>(null)
  const textoRef = useRef<HTMLDivElement>(null)
  const pontoRef = useRef<HTMLSpanElement>(null)
  const teclas = useRef<Partial<Record<IdDaTecla, PecasDaTecla>>>({})

  /* O que o motor lê e escreve sem esperar o React. */
  const estadoRef = useRef(estado)
  const modoRef = useRef<Modo>(modo)
  const pausadoRef = useRef(false)
  const reduzidoRef = useRef(reduzido)
  const flipRef = useRef<Flip | null>(null)
  const motor = useRef<Motor | null>(null)

  useEffect(() => {
    reduzidoRef.current = reduzido
    const tela = telaRef.current
    if (!tela) return
    if (reduzido) {
      // Pediu menos movimento (também no meio do caminho): o quadro final, parado.
      modoRef.current = 'fim'
      estadoRef.current = QUADRO_FINAL
      setModo('fim')
      setEstado(QUADRO_FINAL)
      setChegada(QUADRO_FINAL.texto.length)
      setAcesa(null)
      setFala(0)
      setApagando(false)
      if (pontoRef.current) pontoRef.current.style.opacity = '0'
      return
    }
    let vivo = true
    void import('./motorDoOlhar')
      .then(({ ligarMotor }) => {
        if (!vivo) return
        motor.current = ligarMotor({
          tela,
          grade: () => gradeRef.current,
          texto: () => textoRef.current,
          ponto: () => pontoRef.current,
          teclas: () => teclas.current,
          estado: estadoRef,
          modo: modoRef,
          pausado: pausadoRef,
          flip: flipRef,
          aoMudarEstado: (novo, desde) => {
            setChegada(desde)
            setEstado(novo)
          },
          aoMudarModo: setModo,
          aoAcender: setAcesa,
          aoFalar: setFala,
          aoApagar: setApagando,
        })
      })
      .catch(() => {
        // Sem o motor (rede caiu no meio), a tela fica no primeiro quadro, que
        // é um teclado de verdade parado: nada quebra e nada mente.
      })
    return () => {
      vivo = false
      motor.current?.desligar()
      motor.current = null
    }
  }, [reduzido])

  // O grupo que abriu: cada letra sai de onde estava na tecla do grupo e vai
  // para a sua tecla, crescendo. Ao voltar, os grupos só reaparecem.
  const nivel = chaveDoNivel(estado)
  useLayoutEffect(() => {
    const flip = flipRef.current
    flipRef.current = null
    if (!flip || reduzidoRef.current) return
    for (const id of TECLAS_DA_GRADE) {
      const item = teclas.current[id]?.el.querySelector<HTMLElement>('.tecla__conteudo > *')
      if (!item || typeof item.animate !== 'function') continue
      if (flip.tipo === 'fechar') {
        // De volta ao nível 1: um esmaecer curto que não parte do zero — a
        // grade nunca fica vazia num quadro (a primeira versão, de 0 a 1 em
        // 180 ms, aparecia em branco nas capturas de 20/10/2026).
        item.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' })
        continue
      }
      const para = item.getBoundingClientRect()
      if (!(para.width > 0 && para.height > 0)) continue
      const de = flip.itens.get(item.dataset.item ?? '')
      const cx = (de ? de.left + de.width / 2 : flip.origem.left + flip.origem.width / 2) - (para.left + para.width / 2)
      const cy = (de ? de.top + de.height / 2 : flip.origem.top + flip.origem.height / 2) - (para.top + para.height / 2)
      const escala = de ? Math.max(0.2, Math.min(1, de.height / para.height)) : 0.5
      item.animate(
        [
          { transform: `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) scale(${escala.toFixed(3)})`, opacity: de ? 1 : 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 280, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' },
      )
    }
  }, [nivel])

  useEffect(() => {
    pausadoRef.current = pausado
    if (pausado) motor.current?.parar()
    else motor.current?.agendar()
  }, [pausado])

  const local = (e: PointerEvent<HTMLDivElement>): Ponto => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  // Só o mouse (e a caneta) assume; o toque rola a página como sempre. E só
  // com o mouse se mexendo de verdade: quando a página rola, ou um aviso
  // some, com o ponteiro parado em cima, o navegador manda um movimento
  // "de mentira" (sem deslocamento) — e a pessoa não pediu nada.
  const ehPonteiro = (e: PointerEvent) => e.pointerType === 'mouse' || e.pointerType === 'pen'
  const mexeu = (e: PointerEvent) => e.movementX !== 0 || e.movementY !== 0
  const aoMover = (e: PointerEvent<HTMLDivElement>) => {
    if (reduzido || !ehPonteiro(e)) return
    if (modoRef.current === 'pessoa') motor.current?.mover(local(e))
    else if (mexeu(e)) motor.current?.assumir(local(e))
  }
  const aoClicar = (e: MouseEvent<HTMLDivElement>) => {
    if (reduzidoRef.current || modoRef.current !== 'pessoa') return
    const id = (e.target as Element).closest<HTMLElement>('[data-tecla]')?.dataset.tecla as IdDaTecla | undefined
    if (id) motor.current?.acionar(id)
  }

  const grade = celulas(estado)
  const ativas = new Set(teclasAtivas(estado))
  const vazio = estado.texto === ''

  const refDaTecla = (id: IdDaTecla) => (el: HTMLDivElement | null) => {
    if (!el) {
      delete teclas.current[id]
      return
    }
    teclas.current[id] = {
      el,
      calor: el.querySelector('.tecla__calor') as HTMLElement,
      traco: el.querySelector('.tecla__traco') as HTMLElement,
    }
  }

  const classeDaTecla = (id: IdDaTecla, extra: string) =>
    ['tecla', extra, acesa === id ? 'is-acesa' : '', ativas.has(id) ? '' : 'is-inativa'].filter(Boolean).join(' ')

  return (
    <>
      <div className="olhar" aria-hidden="true">
        <div
          ref={telaRef}
          className={`olhar__tela${modo === 'pessoa' ? ' is-pessoa' : ''}`}
          onPointerMove={aoMover}
          onPointerLeave={(e) => ehPonteiro(e) && motor.current?.soltar()}
          onClick={aoClicar}
        >
          <div className="olhar__barra">
            {(['voltar', 'falar'] as const).map((id) => (
              <div key={id} ref={refDaTecla(id)} data-tecla={id} className={classeDaTecla(id, `tecla--nav tecla--${id}`)}>
                <span className="tecla__calor" />
                <span className="tecla__conteudo">
                  <span className="tecla__acao">
                    <Icon name={id === 'voltar' ? 'seta-esquerda' : 'voz'} size={22} className="tecla__glifo" />
                    <span className="tecla__rotulo">{id === 'voltar' ? 'Voltar' : 'Falar'}</span>
                  </span>
                </span>
                <span className="tecla__traco" />
              </div>
            ))}
            <div ref={textoRef} className={`olhar__texto${vazio ? ' is-vazio' : ''}${fala ? ' is-falou' : ''}`}>
              {vazio ? (
                <span className="olhar__convite">Escolha um grupo</span>
              ) : (
                <>
                  {fala > 0 && (
                    <span key={fala} className="olhar__ondas">
                      <span />
                      <span />
                      <span />
                    </span>
                  )}
                  <span className={`olhar__escrito${apagando ? ' is-apagando' : ''}`}>
                    {estado.texto.slice(0, chegada)}
                    <span key={`${chegada}-${estado.texto}`} className="olhar__chegou">
                      {estado.texto.slice(chegada)}
                    </span>
                  </span>
                </>
              )}
              <span className="olhar__cursor" />
            </div>
          </div>

          <div ref={gradeRef} className="olhar__grade">
            {TECLAS_DA_GRADE.map((id, i) => {
              const c = grade[i]
              return (
                <div key={id} ref={refDaTecla(id)} data-tecla={id} className={classeDaTecla(id, `tecla--${c.tipo}`)}>
                  <span className="tecla__calor" />
                  <span key={nivel} className="tecla__conteudo">
                    <Conteudo celula={c} />
                  </span>
                  <span className="tecla__traco" />
                </div>
              )
            })}
          </div>

          <span ref={pontoRef} className="olhar__ponto" />
        </div>
      </div>

      <figcaption className="olhar__legenda">
        <span className="olhar__explica">
          Simulação do teclado do IrisFlow: o ponto é o olhar.
          <span className="olhar__mouse"> Pare o mouse numa tecla: é assim que o olhar escreve.</span>
        </span>
        {!reduzido &&
          (modo === 'auto' ? (
            <button
              type="button"
              className="olhar__controle"
              onClick={() => setPausado((p) => !p)}
              aria-label={pausado ? 'Continuar a demonstração' : 'Pausar a demonstração'}
            >
              {pausado ? (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4.5 2.8v10.4a.8.8 0 0 0 1.2.7l8.3-5.2a.8.8 0 0 0 0-1.4L5.7 2.1a.8.8 0 0 0-1.2.7Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="3.5" y="2.5" width="3" height="11" rx="1" />
                  <rect x="9.5" y="2.5" width="3" height="11" rx="1" />
                </svg>
              )}
              {pausado ? 'Continuar' : 'Pausar'}
            </button>
          ) : (
            <button
              type="button"
              className="olhar__controle"
              onClick={() => {
                setPausado(false)
                motor.current?.recomecar()
              }}
              aria-label="Ver de novo a demonstração"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path className="olhar__traco-do-icone" d="M3.2 8a4.8 4.8 0 1 0 1.5-3.5M3.2 2.6v2.6h2.6" />
              </svg>
              Ver de novo
            </button>
          ))}
        <span id={`${idBase}-descricao`} className="sr-only">
          Demonstração animada do teclado do IrisFlow. Um ponto, que faz o papel do olhar, para no grupo
          de letras de A a F, que se abre; para na letra E; abre as sugestões e escolhe a frase “Estou com
          sede.”; e para em Falar, e o computador diz a frase em voz alta. Depois escreve “Obrigado, amor.”
          do mesmo jeito.
        </span>
      </figcaption>
    </>
  )
}

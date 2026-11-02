import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import './fundo-vivo.css'

/* ---------- a pausa do fundo, uma só para a página ----------
   O botão da abertura e o do fecho mexem no mesmo estado: pausar num pausa
   os dois fundos e a flutuação do símbolo (o CSS lê data-fundo-pausado). */
let pausadoGlobal = false
const ouvintes = new Set<() => void>()

function pausarFundo(valor: boolean) {
  pausadoGlobal = valor
  if (typeof document !== 'undefined') document.documentElement.dataset.fundoPausado = valor ? 'sim' : 'nao'
  ouvintes.forEach((ouvir) => ouvir())
}

/** O fundo vivo está pausado? (O mesmo botão para as partículas da página inteira.) */
export function useFundoPausado(): boolean {
  return useSyncExternalStore(
    (ouvir) => {
      ouvintes.add(ouvir)
      return () => ouvintes.delete(ouvir)
    },
    () => pausadoGlobal,
    () => false,
  )
}

function prefereMenosMovimento(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** O botão que pausa e continua o fundo vivo (WCAG 2.2.2). Some com movimento reduzido: aí nada se mexe. */
export function BotaoPausarFundo({ className = '' }: { className?: string }) {
  const pausado = useFundoPausado()
  const [reduzido] = useState(prefereMenosMovimento)
  if (reduzido) return null
  return (
    <button type="button" className={`fundo-vivo__pausa ${className}`} aria-pressed={pausado} onClick={() => pausarFundo(!pausado)}>
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {pausado ? <path d="M6 4.5v11l9-5.5z" fill="currentColor" /> : <path d="M6 4h3v12H6zM11 4h3v12h-3z" fill="currentColor" />}
      </svg>
      {pausado ? 'Animar o fundo' : 'Pausar o fundo'}
    </button>
  )
}

/** Uma partícula: posição, profundidade (0 longe, 1 perto), deriva, cor e o brilho que pisca devagar. */
type Particula = { x: number; y: number; z: number; vx: number; vy: number; cor: number; fase: number; ox: number; oy: number }
/** Um feixe de luz: uma faixa larga e difusa que atravessa a tela devagar (ângulo, largura, quanto já andou, quanto dura e a cor). */
type Feixe = { angulo: number; largura: number; vida: number; dura: number; cor: number; forca: number }

/** A família azul da marca e o papel. O menta não entra: ele é só da confirmação. */
const CORES = ['169, 198, 247', '77, 134, 224', '47, 102, 194', '243, 246, 251']

/** Gerador com semente: o fundo nasce sempre igual, e a primeira imagem não pisca. */
function sementeira(semente: number) {
  let s = semente >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

type Props = {
  /** Onde fica o brilho de trás (o símbolo), em fração da largura e da altura. */
  centro?: [number, number]
  /** O botão de pausa no canto da faixa. O fecho põe o botão junto das chamadas (BotaoPausarFundo). */
  comBotao?: boolean
}

/**
 * O fundo vivo da home (01/11/2026, pedido do dono: um fundo preto, com
 * partículas e raios de luz, que deixe o site mais vivo sem parecer forçado).
 * Referências: os campos escuros com partículas e as faixas de luz das homes
 * de produto bem avaliadas na biblioteca da taste.
 *
 * - Partículas em três profundidades: as de longe pequenas e lentas, as de
 *   perto maiores e mais rápidas; todas derivam para cima, devagar, e o
 *   brilho de cada uma respira. O ponteiro afasta as que passam perto e o
 *   campo inteiro se desloca um pouco com ele (as de perto, mais).
 * - De tempos em tempos, um feixe de luz largo e difuso atravessa a tela
 *   devagar, inclinado, e acende de leve as partículas por onde passa (no
 *   lugar dos riscos finos de antes, que pareciam estrelas cadentes).
 * - Atrás do símbolo, um brilho azul largo e calmo, que pulsa devagar.
 *
 * Um canvas só, sem biblioteca. Fora da tela ou com a aba escondida, para.
 * Com movimento reduzido, fica uma imagem parada (sem feixes).
 */
export function FundoVivo({ centro = [0.72, 0.5], comBotao = true }: Props) {
  const tela = useRef<HTMLCanvasElement>(null)
  const pausado = useFundoPausado()
  const pausadoRef = useRef(pausado)
  const [reduzido] = useState(prefereMenosMovimento)
  const [cx, cy] = centro

  useEffect(() => {
    pausadoRef.current = pausado
    if (!pausado) tela.current?.dispatchEvent(new Event('fundo:continuar'))
  }, [pausado])

  useEffect(() => {
    const canvas = tela.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const sorteio = sementeira(41)
    let largura = 0
    let altura = 0
    let particulas: Particula[] = []
    const feixes: Feixe[] = []
    let proximoFeixe = 400
    const ponteiro = { x: -9999, y: -9999, px: 0, py: 0, alvoX: 0, alvoY: 0 }

    function medir() {
      const r = canvas!.getBoundingClientRect()
      const antes = { largura, altura }
      largura = Math.max(1, r.width)
      altura = Math.max(1, r.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.round(largura * dpr)
      canvas!.height = Math.round(altura * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      const quantas = Math.round(Math.min(260, (largura * altura) / 5200))
      // Já havia partículas (um resize, como a barra do navegador do celular
      // aparecendo ao rolar): só reposiciona, na mesma proporção, em vez de
      // sortear tudo de novo, que fazia o campo inteiro pular.
      if (particulas.length && Math.abs(quantas - particulas.length) < particulas.length * 0.25) {
        for (const p of particulas) {
          p.x *= largura / antes.largura
          p.y *= altura / antes.altura
        }
        return
      }
      particulas = Array.from({ length: quantas }, () => {
        const z = sorteio()
        return {
          x: sorteio() * largura,
          y: sorteio() * altura,
          z,
          vx: 0,
          vy: 0,
          cor: sorteio() < 0.12 ? 3 : Math.floor(sorteio() * 3),
          fase: sorteio() * Math.PI * 2,
          ox: 0,
          oy: 0,
        }
      })
    }

    function novoFeixe() {
      feixes.push({
        // Quase em pé, inclinado para a direita, variando um pouco.
        angulo: 1.05 + sorteio() * 0.22,
        largura: 90 + sorteio() * 140,
        vida: 0,
        dura: 8000 + sorteio() * 4000,
        cor: sorteio() < 0.5 ? 0 : 1,
        forca: 0.14 + sorteio() * 0.08,
      })
    }

    /** Onde o feixe está agora: o centro dele anda da esquerda para a direita, fora da tela nas duas pontas. */
    function centroDoFeixe(f: Feixe) {
      const t = f.vida / f.dura
      return { x: -0.3 * largura + t * 1.6 * largura, y: altura / 2, envelope: Math.sin(Math.min(1, t) * Math.PI) }
    }

    function passo(dt: number) {
      const f = dt / 16.67
      ponteiro.px += (ponteiro.alvoX - ponteiro.px) * 0.04 * f
      ponteiro.py += (ponteiro.alvoY - ponteiro.py) * 0.04 * f
      for (const p of particulas) {
        // Deriva para cima, mais rápida nas de perto, com um balanço leve.
        p.y -= (0.08 + p.z * 0.32) * f
        p.x += Math.sin(p.fase + p.y * 0.004) * 0.06 * f
        // O ponteiro afasta as que passam perto; depois elas voltam com uma mola.
        const dx = p.x + p.ox - ponteiro.x
        const dy = p.y + p.oy - ponteiro.y
        const d2 = dx * dx + dy * dy
        if (d2 < 140 * 140 && d2 > 1) {
          const d = Math.sqrt(d2)
          const forca = (1 - d / 140) * 1.6 * (0.4 + p.z)
          p.vx += (dx / d) * forca * f
          p.vy += (dy / d) * forca * f
        }
        p.vx += -p.ox * 0.02 * f
        p.vy += -p.oy * 0.02 * f
        p.vx *= Math.pow(0.88, f)
        p.vy *= Math.pow(0.88, f)
        p.ox += p.vx * f
        p.oy += p.vy * f
        if (p.y < -10) {
          p.y = altura + 10
          p.x = sorteio() * largura
        }
      }
      for (const f of feixes) f.vida += dt
      for (let i = feixes.length - 1; i >= 0; i--) if (feixes[i].vida >= feixes[i].dura) feixes.splice(i, 1)
      proximoFeixe -= dt
      if (proximoFeixe <= 0 && feixes.length < 2) {
        novoFeixe()
        proximoFeixe = 4200 + sorteio() * 3000
      }
    }

    function desenhar(t: number) {
      ctx!.clearRect(0, 0, largura, altura)
      const estreita = largura < 700
      const bx = largura * (estreita ? 0.62 : cx)
      const by = altura * (estreita ? 0.8 : cy)

      // O brilho de trás do símbolo: largo, calmo, pulsando devagar.
      const raioBrilho = Math.min(largura, altura) * (0.78 + Math.sin(t * 0.0006) * 0.05)
      const brilho = ctx!.createRadialGradient(bx, by, 0, bx, by, raioBrilho)
      brilho.addColorStop(0, 'rgba(47, 102, 194, 0.55)')
      brilho.addColorStop(0.35, 'rgba(27, 84, 168, 0.24)')
      brilho.addColorStop(0.7, 'rgba(27, 84, 168, 0.06)')
      brilho.addColorStop(1, 'rgba(27, 84, 168, 0)')
      ctx!.fillStyle = brilho
      ctx!.fillRect(0, 0, largura, altura)

      // Onde cada feixe está neste quadro (uma conta por feixe, não uma por partícula).
      const centros = feixes.map((f) => ({ f, ...centroDoFeixe(f), sen: Math.sin(f.angulo), cos: Math.cos(f.angulo) }))

      // As partículas: as de longe primeiro.
      for (const p of particulas) {
        const desloca = (0.3 + p.z * 0.9) * 14
        const x = p.x + p.ox + ponteiro.px * desloca
        const y = p.y + p.oy + ponteiro.py * desloca
        const tamanho = 0.6 + p.z * 1.9
        let alfa = (0.25 + p.z * 0.55) * (0.65 + Math.sin(t * 0.0012 + p.fase) * 0.35)
        for (const c of centros) {
          // A distância da partícula até o eixo do feixe.
          const dist = Math.abs((x - c.x) * c.sen - (y - c.y) * c.cos)
          if (dist < c.f.largura) alfa = Math.min(1, alfa + (1 - dist / c.f.largura) * 0.5 * c.envelope)
        }
        ctx!.fillStyle = `rgba(${CORES[p.cor]}, ${alfa.toFixed(3)})`
        ctx!.beginPath()
        ctx!.arc(x, y, tamanho, 0, Math.PI * 2)
        ctx!.fill()
      }

      // Os feixes de luz: faixas difusas, somando luz ao que está embaixo.
      const comprimento = Math.hypot(largura, altura) * 1.4
      ctx!.globalCompositeOperation = 'lighter'
      for (const c of centros) {
        const f = c.f
        ctx!.save()
        ctx!.translate(c.x, c.y)
        ctx!.rotate(f.angulo)
        const faixa = ctx!.createLinearGradient(0, -f.largura, 0, f.largura)
        const a = f.forca * c.envelope
        faixa.addColorStop(0, `rgba(${CORES[f.cor]}, 0)`)
        faixa.addColorStop(0.42, `rgba(${CORES[f.cor]}, ${(a * 0.7).toFixed(3)})`)
        faixa.addColorStop(0.5, `rgba(${CORES[0]}, ${a.toFixed(3)})`)
        faixa.addColorStop(0.58, `rgba(${CORES[f.cor]}, ${(a * 0.7).toFixed(3)})`)
        faixa.addColorStop(1, `rgba(${CORES[f.cor]}, 0)`)
        ctx!.fillStyle = faixa
        ctx!.fillRect(-comprimento / 2, -f.largura, comprimento, f.largura * 2)
        ctx!.restore()
      }
      ctx!.globalCompositeOperation = 'source-over'
    }

    medir()
    desenhar(0)
    if (reduzido) {
      const aoMudar = () => {
        medir()
        desenhar(0)
      }
      window.addEventListener('resize', aoMudar)
      return () => window.removeEventListener('resize', aoMudar)
    }

    let quadro = 0
    let naTela = true
    let tempo = 0
    let ultimo = performance.now()
    const laco = (agora: number) => {
      quadro = 0
      if (!naTela || document.hidden || pausadoRef.current) return
      const dt = Math.min(48, agora - ultimo)
      ultimo = agora
      tempo += dt
      passo(dt)
      desenhar(tempo)
      quadro = requestAnimationFrame(laco)
    }
    const continuar = () => {
      if (!quadro && naTela && !document.hidden && !pausadoRef.current) {
        ultimo = performance.now()
        quadro = requestAnimationFrame(laco)
      }
    }
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([e]) => {
            naTela = e.isIntersecting
            continuar()
          })
        : null
    io?.observe(canvas)

    const mover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
      const r = canvas.getBoundingClientRect()
      ponteiro.x = e.clientX - r.left
      ponteiro.y = e.clientY - r.top
      ponteiro.alvoX = (e.clientX / window.innerWidth - 0.5) * 2
      ponteiro.alvoY = (e.clientY / window.innerHeight - 0.5) * 2
    }
    const sair = () => {
      ponteiro.x = ponteiro.y = -9999
      ponteiro.alvoX = ponteiro.alvoY = 0
    }
    const redimensionar = () => {
      medir()
      if (!quadro) desenhar(tempo)
    }
    window.addEventListener('pointermove', mover, { passive: true })
    document.documentElement.addEventListener('pointerleave', sair)
    window.addEventListener('resize', redimensionar)
    document.addEventListener('visibilitychange', continuar)
    canvas.addEventListener('fundo:continuar', continuar)
    continuar()

    return () => {
      cancelAnimationFrame(quadro)
      io?.disconnect()
      window.removeEventListener('pointermove', mover)
      document.documentElement.removeEventListener('pointerleave', sair)
      window.removeEventListener('resize', redimensionar)
      document.removeEventListener('visibilitychange', continuar)
      canvas.removeEventListener('fundo:continuar', continuar)
    }
  }, [reduzido, cx, cy])

  return (
    <div className="fundo-vivo">
      <canvas ref={tela} className="fundo-vivo__tela" aria-hidden="true" />
      {comBotao && <BotaoPausarFundo className="fundo-vivo__pausa--canto" />}
    </div>
  )
}

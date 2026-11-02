import { useEffect, useRef, useState } from 'react'
import { useFundoPausado } from './FundoVivo'

/* O símbolo oficial (as quatro lâminas e a pupila), para a forma da íris. */
const LAMINAS = [
  'M 68.496 101.066 L 74.339 103.175 C 82.496 104.511 90.597 104.320 98.199 100.882 C 116.265 92.707 127.636 76.867 128.632 57.425 C 139.214 80.062 132.238 105.023 113.410 120.300 C 95.996 123.722 77.937 116.941 68.496 101.066',
  'M 102.25 91.375 L 104.328 85.519 C 105.613 77.355 105.382 69.253 101.902 61.671 C 93.625 43.652 77.718 32.371 58.273 31.484 C 80.847 20.773 105.847 27.609 121.230 46.351 C 124.753 63.75 118.070 81.843 102.25 91.375',
  'M 59.730 67.773 L 57.535 73.582 C 56.082 81.722 56.148 89.824 59.476 97.476 C 67.386 115.660 83.058 127.261 102.480 128.539 C 79.695 138.792 54.839 131.449 39.839 112.398 C 36.671 94.937 43.718 76.980 59.730 67.773',
  'M 92.550 57.187 L 86.699 55.105 C 78.535 53.800 70.433 54.019 62.847 57.488 C 44.812 65.738 33.507 81.625 32.589 101.066 C 21.914 78.472 28.792 53.488 47.562 38.132 C 64.960 34.640 83.046 41.351 92.550 57.187',
]
const PUPILA =
  'M 97.664 72.660 C 102.003 83.851 94.531 96.496 82.675 98.003 C 76.667 98.765 71.347 96.339 67.5 92.742 C 63.277 88.785 61.917 83.308 62.402 77.316 C 63.277 66.402 73.515 58.5 84.246 61.507 C 80.976 65.957 80.710 71.339 84.328 74.328 C 88.226 77.542 93.109 77.660 97.664 72.660'

/** O espaço de desenho das formas: 400 × 300, a proporção do visor (4:3). */
const L = 400
const A = 300

export type FormaDoPasso = 'webcam' | 'rosto' | 'iris' | 'tela' | 'clique'

/** Como desenhar cada forma (o que sai pintado vira lugar de partícula). */
const DESENHOS: Record<FormaDoPasso, (c: CanvasRenderingContext2D) => void> = {
  webcam(c) {
    c.lineWidth = 12
    c.beginPath()
    c.roundRect(105, 62, 190, 128, 30)
    c.stroke()
    c.lineWidth = 14
    c.beginPath()
    c.arc(200, 126, 40, 0, Math.PI * 2)
    c.stroke()
    c.beginPath()
    c.arc(200, 126, 13, 0, Math.PI * 2)
    c.fill()
    c.beginPath()
    c.arc(262, 86, 6, 0, Math.PI * 2)
    c.fill()
    c.fillRect(184, 196, 32, 30)
    c.beginPath()
    c.roundRect(140, 228, 120, 14, 7)
    c.fill()
  },
  rosto(c) {
    c.lineWidth = 9
    c.beginPath()
    c.ellipse(200, 150, 88, 112, 0, 0, Math.PI * 2)
    c.stroke()
    for (const x of [165, 235]) {
      c.beginPath()
      c.ellipse(x, 128, 18, 10, 0, 0, Math.PI * 2)
      c.stroke()
      c.beginPath()
      c.arc(x, 128, 5, 0, Math.PI * 2)
      c.fill()
    }
    c.beginPath()
    c.moveTo(200, 140)
    c.lineTo(192, 172)
    c.lineTo(208, 172)
    c.stroke()
    c.beginPath()
    c.arc(200, 190, 26, 0.15 * Math.PI, 0.85 * Math.PI)
    c.stroke()
  },
  iris(c) {
    c.save()
    // A caixa do símbolo (113 × 116) no meio do visor, com folga.
    const escala = 2.25
    c.translate(L / 2 - (24 + 113 / 2) * escala, A / 2 - (22 + 116 / 2) * escala)
    c.scale(escala, escala)
    for (const d of LAMINAS) c.fill(new Path2D(d))
    c.fill(new Path2D(PUPILA))
    c.restore()
  },
  tela(c) {
    c.lineWidth = 10
    c.beginPath()
    c.roundRect(60, 38, 280, 210, 16)
    c.stroke()
    const pontos: [number, number][] = [
      [110, 82], [200, 82], [290, 82], [110, 143], [200, 143], [290, 143],
      [110, 204], [200, 204], [290, 204], [84, 60], [316, 60], [84, 226], [316, 226],
    ]
    for (const [x, y] of pontos) {
      c.beginPath()
      c.arc(x, y, 8, 0, Math.PI * 2)
      c.fill()
    }
  },
  clique(c) {
    c.lineWidth = 10
    c.beginPath()
    c.roundRect(98, 92, 204, 116, 26)
    c.stroke()
    c.lineWidth = 6
    c.beginPath()
    c.roundRect(80, 74, 240, 152, 40)
    c.stroke()
    c.font = '700 64px Sora, "Segoe UI", sans-serif'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('Sim', 200, 152)
  },
}

/** Sorteia `n` pontos dentro do que foi pintado (em 0..1), para as partículas irem até lá. */
function amostrar(forma: FormaDoPasso, n: number, sorteio: () => number): Float32Array {
  const tela = document.createElement('canvas')
  tela.width = L
  tela.height = A
  const c = tela.getContext('2d', { willReadFrequently: true })
  const pontos = new Float32Array(n * 2)
  if (!c) return pontos
  c.fillStyle = '#fff'
  c.strokeStyle = '#fff'
  c.lineCap = 'round'
  c.lineJoin = 'round'
  DESENHOS[forma](c)
  const dados = c.getImageData(0, 0, L, A).data
  const cheios: number[] = []
  for (let i = 3; i < dados.length; i += 8) if (dados[i] > 128) cheios.push((i - 3) / 4)
  if (!cheios.length) return pontos
  for (let k = 0; k < n; k++) {
    const idx = cheios[Math.floor(sorteio() * cheios.length)]
    pontos[k * 2] = ((idx % L) + sorteio()) / L
    pontos[k * 2 + 1] = (Math.floor(idx / L) + sorteio()) / A
  }
  return pontos
}

function sementeira(semente: number) {
  let s = semente >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const CORES = ['243, 246, 251', '169, 198, 247', '77, 134, 224']

type Props = {
  formas: FormaDoPasso[]
  /** Qual forma as partículas estão formando agora. */
  ativa: number
}

/**
 * As partículas que formam o passo (01/11/2026, referência: a nuvem de
 * partículas que muda de forma a cada serviço, num site de agência que o dono
 * mandou). No visor de "Do olhar ao clique", 2.200 partículas formam a
 * webcam, o rosto, o símbolo da íris, a tela com os 13 pontos da calibração e
 * o botão com o aro; quando o passo muda, elas se soltam e se juntam na forma
 * nova. A nuvem respira e gira de leve, como um objeto no espaço, e o
 * ponteiro afasta as que passam perto.
 *
 * Canvas 2D, sem biblioteca. Para fora da tela e com o fundo pausado (o
 * mesmo botão de pausa da abertura). Com movimento reduzido, a forma aparece
 * pronta, parada.
 */
export function ParticulasQueFormam({ formas, ativa }: Props) {
  const tela = useRef<HTMLCanvasElement>(null)
  const ativaRef = useRef(ativa)
  const pausado = useFundoPausado()
  const pausadoRef = useRef(pausado)
  const [reduzido] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const formasChave = formas.join(',')

  useEffect(() => {
    ativaRef.current = ativa
    tela.current?.dispatchEvent(new Event('formas:troca'))
  }, [ativa])

  useEffect(() => {
    pausadoRef.current = pausado
    if (!pausado) tela.current?.dispatchEvent(new Event('formas:continuar'))
  }, [pausado])

  useEffect(() => {
    const canvas = tela.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || typeof Path2D === 'undefined') return

    const N = 2200
    const sorteio = sementeira(17)
    const alvos = formasChave.split(',').map((f) => amostrar(f as FormaDoPasso, N, sorteio))
    // Cada partícula: posição, velocidade, profundidade e cor.
    const x = new Float32Array(N)
    const y = new Float32Array(N)
    const vx = new Float32Array(N)
    const vy = new Float32Array(N)
    const z = new Float32Array(N)
    const cor = new Uint8Array(N)
    let largura = 0
    let altura = 0
    let formaAtual = ativaRef.current
    const ponteiro = { x: -9999, y: -9999 }

    function medir() {
      const r = canvas!.getBoundingClientRect()
      largura = Math.max(1, r.width)
      altura = Math.max(1, r.height)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.round(largura * dpr)
      canvas!.height = Math.round(altura * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    medir()
    const alvo0 = alvos[formaAtual] ?? alvos[0]
    for (let i = 0; i < N; i++) {
      // Começam espalhadas numa nuvem redonda e se juntam na primeira forma.
      const a = sorteio() * Math.PI * 2
      const r = Math.sqrt(sorteio()) * 0.45
      x[i] = reduzido ? alvo0[i * 2] : 0.5 + Math.cos(a) * r * 0.75
      y[i] = reduzido ? alvo0[i * 2 + 1] : 0.5 + Math.sin(a) * r
      z[i] = sorteio()
      cor[i] = sorteio() < 0.18 ? 0 : sorteio() < 0.6 ? 1 : 2
    }

    function trocar() {
      if (ativaRef.current === formaAtual) return
      formaAtual = ativaRef.current
      // Um empurrão para fora antes de se juntar na forma nova.
      for (let i = 0; i < N; i++) {
        const dx = x[i] - 0.5
        const dy = y[i] - 0.5
        vx[i] += dx * 0.03 + (sorteio() - 0.5) * 0.012
        vy[i] += dy * 0.03 + (sorteio() - 0.5) * 0.012
      }
      continuar()
    }

    function passo(f: number) {
      const alvo = alvos[formaAtual] ?? alvos[0]
      const px = ponteiro.x / largura
      const py = ponteiro.y / altura
      for (let i = 0; i < N; i++) {
        vx[i] += (alvo[i * 2] - x[i]) * 0.012 * f
        vy[i] += (alvo[i * 2 + 1] - y[i]) * 0.012 * f
        const dx = x[i] - px
        const dy = y[i] - py
        const d2 = dx * dx + dy * dy
        if (d2 < 0.012) {
          const forca = (1 - d2 / 0.012) * 0.004 * f
          vx[i] += dx * forca * 6
          vy[i] += dy * forca * 6
        }
        vx[i] *= Math.pow(0.86, f)
        vy[i] *= Math.pow(0.86, f)
        x[i] += vx[i] * f
        y[i] += vy[i] * f
      }
    }

    function desenhar(t: number) {
      ctx!.clearRect(0, 0, largura, altura)
      // O brilho do palco, atrás da nuvem.
      const brilho = ctx!.createRadialGradient(largura / 2, altura / 2, 0, largura / 2, altura / 2, Math.max(largura, altura) * 0.6)
      brilho.addColorStop(0, 'rgba(47, 102, 194, 0.35)')
      brilho.addColorStop(1, 'rgba(47, 102, 194, 0)')
      ctx!.fillStyle = brilho
      ctx!.fillRect(0, 0, largura, altura)
      // Um giro leve em torno do eixo vertical e a respiração.
      const giro = reduzido ? 1 : Math.cos(Math.sin(t * 0.00045) * 0.45)
      const respira = reduzido ? 1 : 1 + Math.sin(t * 0.0011) * 0.012
      const escala = Math.min(largura / L, altura / A)
      const ox = (largura - L * escala) / 2
      const oy = (altura - A * escala) / 2
      for (let i = 0; i < N; i++) {
        const sx = ox + (0.5 + (x[i] - 0.5) * giro * respira) * L * escala
        const sy = oy + (0.5 + (y[i] - 0.5) * respira) * A * escala
        const tam = 0.8 + z[i] * 1.6
        ctx!.fillStyle = `rgba(${CORES[cor[i]]}, ${(0.45 + z[i] * 0.5).toFixed(2)})`
        ctx!.fillRect(sx - tam / 2, sy - tam / 2, tam, tam)
      }
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
      passo(dt / 16.67)
      desenhar(tempo)
      quadro = requestAnimationFrame(laco)
    }
    function continuar() {
      if (reduzido) {
        const alvo = alvos[formaAtual] ?? alvos[0]
        x.set(alvo.filter((_, k) => k % 2 === 0))
        y.set(alvo.filter((_, k) => k % 2 === 1))
        desenhar(0)
        return
      }
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
      const r = canvas.getBoundingClientRect()
      ponteiro.x = e.clientX - r.left
      ponteiro.y = e.clientY - r.top
    }
    const sair = () => {
      ponteiro.x = ponteiro.y = -9999
    }
    const redimensionar = () => {
      medir()
      if (!quadro) desenhar(tempo)
    }
    canvas.addEventListener('pointermove', mover)
    canvas.addEventListener('pointerleave', sair)
    canvas.addEventListener('formas:troca', trocar)
    canvas.addEventListener('formas:continuar', continuar)
    window.addEventListener('resize', redimensionar)
    document.addEventListener('visibilitychange', continuar)
    desenhar(0)
    continuar()

    return () => {
      cancelAnimationFrame(quadro)
      io?.disconnect()
      canvas.removeEventListener('pointermove', mover)
      canvas.removeEventListener('pointerleave', sair)
      canvas.removeEventListener('formas:troca', trocar)
      canvas.removeEventListener('formas:continuar', continuar)
      window.removeEventListener('resize', redimensionar)
      document.removeEventListener('visibilitychange', continuar)
    }
  }, [formasChave, reduzido])

  return <canvas ref={tela} className="particulas-formam" aria-hidden="true" />
}

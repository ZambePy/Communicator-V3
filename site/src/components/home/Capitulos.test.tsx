import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Capitulos } from './Capitulos'
import {
  CAPITULOS,
  COMO_FUNCIONA_EM_UMA_FRASE,
  DEMO_COMMUNICATOR,
  DURACAO_DA_DEMO_COMMUNICATOR,
} from '@/data/home'

/* Os capítulos da home: o olho desenhado saiu (não é da identidade visual) e
   a explicação passou a ser contada pela gravação real, que acompanha os
   passos — o tempo do vídeo acende o passo, enche o trilho e troca a legenda;
   clicar num passo (ou rolar até ele, no computador) leva o vídeo até ele. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const PUBLICO = resolve(AQUI, '../../../public')
const matchMediaOriginal = window.matchMedia

afterEach(() => {
  window.matchMedia = matchMediaOriginal
  vi.unstubAllGlobals()
})

/** matchMedia que responde "sim" às consultas pedidas. */
function responderMidia(...consultas: string[]) {
  window.matchMedia = ((q: string) => ({
    matches: consultas.includes(q),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

/** Monta a seção com o relógio do vídeo nas mãos do teste. */
function montar() {
  const r = render(<Capitulos />)
  const video = r.container.querySelector('video') as HTMLVideoElement
  let tempo = 0
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => tempo,
    set: (t: number) => {
      tempo = t
    },
  })
  const noTempo = (t: number) =>
    act(() => {
      tempo = t
      video.dispatchEvent(new Event('timeupdate'))
    })
  return { ...r, video, noTempo, tempo: () => tempo }
}

const passoAtivo = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.capitulos__passo')).findIndex((li) => li.classList.contains('is-ativo'))
const trilhos = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.capitulos__trilho')).map((t) =>
    Number(t.style.getPropertyValue('--progresso') || 0),
  )

describe('<Capitulos />', () => {
  it('sem o olho desenhado: o título, a explicação da solução e três passos', () => {
    const { container } = montar()
    expect(container.querySelector('.ilustracao, .capitulos__olho')).toBeNull()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Feito para ser usado só com os olhos.')
    expect(screen.getByText(COMO_FUNCIONA_EM_UMA_FRASE)).toBeInTheDocument()
    const botoes = screen.getAllByRole('button', { name: /mostrar no vídeo/ })
    expect(botoes).toHaveLength(3)
    CAPITULOS.forEach((c, i) => expect(botoes[i]).toHaveTextContent(c.titulo))
    // O primeiro começa aceso, antes de o vídeo tocar.
    expect(botoes[0]).toHaveAttribute('aria-current', 'step')
    expect(passoAtivo(container)).toBe(0)
  })

  it('o vídeo manda: o passo aceso, a legenda e os trilhos seguem o tempo da gravação', () => {
    const { container, noTempo } = montar()
    noTempo(10.5)
    expect(passoAtivo(container)).toBe(1)
    expect(screen.getByRole('button', { name: new RegExp(CAPITULOS[1].titulo) })).toHaveAttribute('aria-current', 'step')
    const legenda = container.querySelector('.capitulos__legenda')!
    expect(legenda).toHaveTextContent('Escolher')
    expect(legenda).toHaveTextContent('O cartão sob o olhar se acende.')
    const [t1, t2, t3] = trilhos(container)
    expect(t1).toBe(1)
    expect(t2).toBeCloseTo((10.5 - 9) / (16.1 - 9), 3)
    expect(t3).toBe(0)

    // O laço volta ao começo: tudo volta ao primeiro passo.
    noTempo(0.4)
    expect(passoAtivo(container)).toBe(0)
    expect(container.querySelector('.capitulos__legenda')).toHaveTextContent('O círculo é o cursor do olhar.')
    expect(trilhos(container)[1]).toBe(0)
  })

  it('o último passo enche até o fim da gravação', () => {
    const { container, noTempo } = montar()
    noTempo(DURACAO_DA_DEMO_COMMUNICATOR - 0.01)
    expect(passoAtivo(container)).toBe(2)
    expect(trilhos(container)[2]).toBeGreaterThan(0.99)
  })

  it('clicar num passo leva o vídeo ao começo do trecho dele', () => {
    const { container, tempo } = montar()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(CAPITULOS[2].titulo) }))
    expect(tempo()).toBeCloseTo(CAPITULOS[2].inicio + 0.05)
    expect(passoAtivo(container)).toBe(2)
    expect(container.querySelector('.capitulos__legenda')).toHaveTextContent(CAPITULOS[2].legendas[0].texto)
    expect(trilhos(container)).toEqual([1, 1, 0])

    fireEvent.click(screen.getByRole('button', { name: new RegExp(CAPITULOS[0].titulo) }))
    expect(tempo()).toBeCloseTo(0.05)
    expect(passoAtivo(container)).toBe(0)
  })

  it('a legenda fica fora do leitor de tela; a gravação tem descrição e pausa', () => {
    const { container, video } = montar()
    expect(container.querySelector('.capitulos__legenda')).toHaveAttribute('aria-hidden', 'true')
    const idDescricao = video.getAttribute('aria-describedby')!
    expect(document.getElementById(idDescricao)).toHaveTextContent(DEMO_COMMUNICATOR.descricao)
    expect(screen.getByRole('button', { name: /Pausar a demonstração|Reproduzir a demonstração/ })).toBeInTheDocument()
    // Cada passo descreve o próprio botão com o texto dele.
    const botao = screen.getByRole('button', { name: new RegExp(CAPITULOS[1].titulo) })
    expect(document.getElementById(botao.getAttribute('aria-describedby')!)).toHaveTextContent(CAPITULOS[1].texto)
  })

  it('mudo, em laço, embutido, sem baixar nada antes de aparecer; WebM antes do MP4', () => {
    const { video } = montar()
    expect(video.muted).toBe(true)
    expect(video).toHaveAttribute('loop')
    expect(video).toHaveAttribute('playsinline')
    expect(video).toHaveAttribute('preload', 'none')
    expect(video).toHaveAttribute('poster', DEMO_COMMUNICATOR.poster)
    const fontes = Array.from(video.querySelectorAll('source')).map((s) => s.getAttribute('type'))
    expect(fontes).toEqual(['video/webm', 'video/mp4'])
  })

  it('com movimento reduzido nada toca sozinho, e cada passo mostra um quadro parado dele', () => {
    responderMidia('(prefers-reduced-motion: reduce)')
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const { video } = montar()
    expect(video).toHaveAttribute('poster', CAPITULOS[0].quadro)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(CAPITULOS[1].titulo) }))
    expect(video).toHaveAttribute('poster', CAPITULOS[1].quadro)
    expect(screen.getByRole('button', { name: 'Reproduzir a demonstração' })).toBeInTheDocument()
    expect(play).not.toHaveBeenCalled()
    play.mockRestore()
  })

  it('no computador, rolar até um passo leva o vídeo até ele', () => {
    responderMidia('(min-width: 961px)')
    type Aviso = (e: Partial<IntersectionObserverEntry>[]) => void
    const observadores: { aviso: Aviso; margem?: string; alvos: Element[] }[] = []
    class ObservadorFalso {
      private registro: { aviso: Aviso; margem?: string; alvos: Element[] }
      constructor(aviso: Aviso, opcoes?: IntersectionObserverInit) {
        this.registro = { aviso, margem: opcoes?.rootMargin, alvos: [] }
        observadores.push(this.registro)
      }
      observe(el: Element) {
        this.registro.alvos.push(el)
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', ObservadorFalso)
    const { container, tempo } = montar()
    const dosPassos = observadores.find((o) => o.alvos.some((el) => el.classList.contains('capitulos__passo')))!
    expect(dosPassos.alvos).toHaveLength(3)
    const passos = container.querySelectorAll('.capitulos__passo')
    act(() => dosPassos.aviso([{ isIntersecting: true, target: passos[1] }]))
    expect(tempo()).toBeCloseTo(CAPITULOS[1].inicio + 0.05)
    expect(passoAtivo(container)).toBe(1)

    // Rolar de volta ao passo em que o vídeo já está não o reinicia.
    const antes = tempo()
    act(() => dosPassos.aviso([{ isIntersecting: true, target: passos[1] }]))
    expect(tempo()).toBe(antes)
  })

  it('no celular, rolar não mexe no vídeo (ele fica acima dos passos)', () => {
    responderMidia()
    const observados: Element[] = []
    class ObservadorFalso {
      observe(el: Element) {
        observados.push(el)
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', ObservadorFalso)
    montar()
    expect(observados.some((el) => el.classList.contains('capitulos__passo'))).toBe(false)
  })
})

describe('os capítulos e a gravação', () => {
  it('começam em ordem, cada legenda cai dentro do seu capítulo e cabe numa linha', () => {
    CAPITULOS.forEach((c, i) => {
      const fim = CAPITULOS[i + 1]?.inicio ?? DURACAO_DA_DEMO_COMMUNICATOR
      expect(c.inicio).toBeLessThan(fim)
      expect(c.legendas[0].de).toBe(c.inicio)
      c.legendas.forEach((l, j) => {
        expect(l.de).toBeGreaterThanOrEqual(c.inicio)
        expect(l.de).toBeLessThan(fim)
        if (j > 0) expect(l.de).toBeGreaterThan(c.legendas[j - 1].de)
        expect(l.texto.length).toBeLessThanOrEqual(40)
      })
    })
  })

  it('os quadros parados de cada passo existem', () => {
    for (const c of CAPITULOS) expect(existsSync(resolve(PUBLICO, `.${c.quadro}`)), c.quadro).toBe(true)
  })

  it('o CSS só anima transform e opacity', () => {
    const css = readFileSync(resolve(AQUI, 'capitulos.css'), 'utf8')
    const blocos = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []
    expect(blocos.length).toBeGreaterThan(0)
    for (const bloco of blocos) {
      const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
      expect(props.every((p) => p === 'transform' || p === 'opacity')).toBe(true)
    }
  })
})

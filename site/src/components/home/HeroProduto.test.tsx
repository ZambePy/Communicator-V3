import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HeroProduto } from './HeroProduto'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'
import { BETA_CTA, HERO } from '@/data/content'

/* A abertura da home: antes do lançamento a chamada é a da beta, com o dia;
   depois, "Baixar grátis". E o produto de verdade — o vídeo num retângulo
   arredondado com o brilho da marca, sem monitor —, com pausa. */

const { apiFake } = vi.hoisted(() => ({ apiFake: { programa: null as BetaProgram | null } }))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA }
})

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <HeroProduto />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  esquecerBetaProgram()
})

describe('<HeroProduto />', () => {
  it('antes do lançamento: título, chamada da beta e o dia do download', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
    montar()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(HERO.title)
    // A data do banco chega depois da reserva (que já é depois do lançamento).
    expect(await screen.findByText(/Download a partir de 10 de novembro/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: BETA_CTA.label })).toHaveAttribute('href', BETA_CTA.to)
  })

  it('depois do lançamento: a etiqueta vermelha diz "Beta liberada" e "Baixar grátis" leva a /baixar', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    const { container } = montar()
    expect(await screen.findByRole('link', { name: 'Baixar grátis' })).toHaveAttribute('href', '/baixar')
    const pilula = container.querySelector('.aviso-pilula')!
    expect(pilula.querySelector('.etiqueta-lancamento--liberada')).toHaveTextContent('Beta liberada')
    expect(pilula).toHaveTextContent('Download gratuito para Windows.')
  })

  it('texto à esquerda e o vídeo à direita, sem monitor, sobre o fundo de partículas', () => {
    const { container } = montar()
    const grade = container.querySelector('.hero-produto__grade')!
    const [texto, aparelho] = Array.from(grade.children)
    expect(texto).toHaveClass('hero-produto__texto')
    expect(texto.querySelector('h1')).not.toBeNull()
    expect(aparelho).toHaveClass('hero-produto__aparelho')
    expect(aparelho.querySelector('.monitor')).toBeNull()
    expect(aparelho.querySelector('.video-moldura .video-moldura__tela video')).not.toBeNull()
    // O brilho da borda é decoração.
    expect(aparelho.querySelector('.video-moldura__brilho')).toHaveAttribute('aria-hidden', 'true')
    // Halo e anéis por trás do vídeo, fora do leitor de tela.
    expect(aparelho.querySelectorAll('.hero-produto__anel[aria-hidden="true"]')).toHaveLength(2)
    // Fundo animado com partículas e a varredura.
    const fundo = container.querySelector('.hero-produto > .ambient')!
    expect(fundo.querySelectorAll('.ambient__dot').length).toBeGreaterThan(0)
  })

  it('as chamadas escondem a barra fixa do celular enquanto estão na tela', () => {
    const { container } = montar()
    expect(container.querySelector('.hero-produto__acoes')).toHaveAttribute('data-sticky-hide')
  })

  it('a demonstração tem descrição e botão de pausa', () => {
    montar()
    expect(screen.getByRole('button', { name: /Pausar a demonstração|Reproduzir a demonstração/ })).toBeInTheDocument()
    expect(document.querySelector('video')).toHaveAttribute('aria-describedby')
  })

  it('o vídeo é mudo, em laço, embutido, com pôster e sem baixar nada antes de aparecer', () => {
    montar()
    const v = document.querySelector('video')!
    expect(v.muted).toBe(true)
    expect(v).toHaveAttribute('loop')
    expect(v).toHaveAttribute('playsinline')
    expect(v).toHaveAttribute('poster')
    expect(v).toHaveAttribute('preload', 'none')
    // WebM primeiro, MP4 de reserva.
    const fontes = Array.from(v.querySelectorAll('source')).map((f) => f.getAttribute('type'))
    expect(fontes).toEqual(['video/webm', 'video/mp4'])
  })

  it('o brilho da borda, a aura e os anéis só se mexem com o vídeo na tela', () => {
    // Observador de mentira: o teste decide quando a moldura entra e sai.
    const avisos: Array<(e: Partial<IntersectionObserverEntry>[]) => void> = []
    class ObservadorFalso {
      constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) {
        avisos.push(cb)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', ObservadorFalso)
    // O mesmo aviso toca e pausa o vídeo, que o jsdom não reproduz.
    const tocar = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const pausar = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    try {
      const { container } = montar()
      const moldura = container.querySelector('.video-moldura')!
      expect(moldura).not.toHaveClass('is-rodando')
      const entrada = (dentro: boolean) =>
        act(() => avisos.forEach((cb) => cb([{ isIntersecting: dentro, intersectionRatio: dentro ? 1 : 0, boundingClientRect: { height: 400 } as DOMRectReadOnly, rootBounds: null }])))
      entrada(true)
      expect(moldura).toHaveClass('is-rodando')
      // A aura, os anéis e a flutuação seguem o mesmo aviso.
      expect(container.querySelector('.hero-produto__aparelho')).toHaveClass('is-rodando')
      entrada(false)
      expect(moldura).not.toHaveClass('is-rodando')
      expect(container.querySelector('.hero-produto__aparelho')).not.toHaveClass('is-rodando')
    } finally {
      tocar.mockRestore()
      pausar.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})

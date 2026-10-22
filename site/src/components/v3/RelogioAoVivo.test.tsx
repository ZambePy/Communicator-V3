import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { RelogioAoVivo, horaDeBrasilia } from './RelogioAoVivo'

/* O relógio do rodapé (v3, 21/10/2026): a hora de Brasília, qualquer que seja
   o fuso do computador de quem visita. Com movimento reduzido, horas e
   minutos, sem o segundo pulando. */

const matchMediaOriginal = window.matchMedia

function movimentoReduzido(sim: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: sim && q.includes('reduce'),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.matchMedia = matchMediaOriginal
})

describe('horaDeBrasilia', () => {
  it('usa America/Sao_Paulo (UTC−3, sem horário de verão desde 2019)', () => {
    expect(horaDeBrasilia(new Date('2026-10-21T08:44:41Z'))).toBe('05:44:41')
    // Em janeiro também (antes de 2019 seria horário de verão).
    expect(horaDeBrasilia(new Date('2027-01-15T02:05:09Z'))).toBe('23:05:09')
    expect(horaDeBrasilia(new Date('2026-10-21T08:44:41Z'), false)).toBe('05:44')
  })

  it('meia-noite é 00, não 24', () => {
    expect(horaDeBrasilia(new Date('2026-10-21T03:00:00Z'))).toBe('00:00:00')
  })
})

describe('<RelogioAoVivo />', () => {
  it('mostra a hora de Brasília e anda a cada segundo', () => {
    movimentoReduzido(false)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T08:44:41.200Z'))
    render(<RelogioAoVivo />)
    const hora = screen.getByText('05:44:41')
    expect(hora.tagName).toBe('TIME')
    expect(screen.getByText('Horário de Brasília')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('05:44:42')).toBeInTheDocument()
    // Não é região viva: o leitor de tela não lê a hora a cada segundo.
    expect(hora.closest('[aria-live]')).toBeNull()
  })

  it('com movimento reduzido: horas e minutos, trocando só na virada do minuto', () => {
    movimentoReduzido(true)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T08:44:41Z'))
    render(<RelogioAoVivo />)
    expect(screen.getByText('05:44')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByText('05:44')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    expect(screen.getByText('05:45')).toBeInTheDocument()
  })
})

/* Pausa (revisão de 21/10/2026, risco 4 do brief): o relógio é do rodapé, que
   existe em toda página. Com a aba escondida ou o rodapé fora da janela ninguém
   vê a hora, então nenhum timer pode ficar rodando; ao voltar, a hora sai certa
   na hora e o relógio retoma. */
describe('<RelogioAoVivo /> — pausa', () => {
  let avisos: ((entradas: Partial<IntersectionObserverEntry>[]) => void)[] = []
  let escondida = false

  beforeEach(() => {
    avisos = []
    escondida = false
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(aviso: (entradas: Partial<IntersectionObserverEntry>[]) => void) {
          avisos.push(aviso)
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => escondida })
  })

  const naTela = (sim: boolean) => act(() => avisos.forEach((a) => a([{ isIntersecting: sim }])))
  const abaEscondida = (sim: boolean) => {
    escondida = sim
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
  }

  it('com a aba escondida não sobra timer nenhum; ao voltar, mostra a hora certa e retoma', () => {
    movimentoReduzido(false)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T08:44:41.200Z'))
    render(<RelogioAoVivo />)
    expect(vi.getTimerCount()).toBe(1)

    abaEscondida(true)
    expect(vi.getTimerCount()).toBe(0)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    // Nada rodou: a tela ficou como estava.
    expect(screen.getByText('05:44:41')).toBeInTheDocument()

    abaEscondida(false)
    // Volta certo, sem esperar a próxima virada: passou um minuto.
    expect(screen.getByText('05:45:41')).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(1)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('05:45:42')).toBeInTheDocument()
  })

  it('com o rodapé fora da janela não sobra timer; ao entrar, mostra a hora certa e retoma', () => {
    movimentoReduzido(false)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T08:44:41.200Z'))
    render(<RelogioAoVivo />)
    expect(vi.getTimerCount()).toBe(1)

    naTela(false)
    expect(vi.getTimerCount()).toBe(0)
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(screen.getByText('05:44:41')).toBeInTheDocument()

    naTela(true)
    expect(screen.getByText('05:45:11')).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('só anda com a aba à vista E o rodapé na janela; repetir o aviso não empilha timers', () => {
    movimentoReduzido(false)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T08:44:41.200Z'))
    render(<RelogioAoVivo />)

    naTela(false)
    abaEscondida(true)
    naTela(true) // o rodapé volta à janela, mas a aba segue escondida
    expect(vi.getTimerCount()).toBe(0)
    abaEscondida(false)
    expect(vi.getTimerCount()).toBe(1)
    naTela(true)
    naTela(true)
    abaEscondida(false)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('desmontado, tira o ouvinte da aba e não deixa timer', () => {
    movimentoReduzido(false)
    vi.useFakeTimers()
    const { unmount } = render(<RelogioAoVivo />)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    abaEscondida(true)
    abaEscondida(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})

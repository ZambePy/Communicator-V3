import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EscritaPeloOlhar } from './EscritaPeloOlhar'
import { QUADRO_FINAL } from './frasesDaAbertura'
import { estadoFinal, montarRoteiro } from './roteiroDoOlhar'
import type { Ligacoes } from './motorDoOlhar'

/* A abertura da home desenha o teclado; o motor chega sob demanda. Com
   movimento reduzido: o quadro final, parado, sem controle e sem baixar o
   motor. Sem ele: o primeiro quadro, com o botão de pausa. */

const { motorFalso } = vi.hoisted(() => {
  const motorFalso = {
    ligacoes: null as Ligacoes | null,
    chamadas: 0,
    assumidas: 0,
    motor: {
      agendar: () => {},
      parar: () => {},
      recomecar: () => {},
      assumir: () => {
        motorFalso.assumidas += 1
      },
      mover: () => {},
      soltar: () => {},
      acionar: () => {},
      desligar: () => {},
    },
  }
  return { motorFalso }
})

vi.mock('./motorDoOlhar', () => ({
  ligarMotor: (l: Ligacoes) => {
    motorFalso.chamadas += 1
    motorFalso.ligacoes = l
    return motorFalso.motor
  },
}))

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
  window.matchMedia = matchMediaOriginal
  motorFalso.chamadas = 0
  motorFalso.assumidas = 0
  motorFalso.ligacoes = null
})

const montar = () =>
  render(
    <figure>
      <EscritaPeloOlhar />
    </figure>,
  )

describe('<EscritaPeloOlhar />', () => {
  it('o quadro final é a última frase do roteiro', () => {
    expect(QUADRO_FINAL).toEqual(estadoFinal(montarRoteiro()))
  })

  it('com movimento reduzido: a frase escrita, parada; sem controle e sem motor', async () => {
    movimentoReduzido(true)
    const { container } = montar()
    expect(container.querySelector('.olhar__texto')).toHaveTextContent('Obrigado, amor.')
    expect(screen.queryByRole('button')).toBeNull()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(motorFalso.chamadas).toBe(0)
    // O ponto do olhar não aparece.
    expect(container.querySelector<HTMLElement>('.olhar__ponto')!.style.opacity).toBe('0')
  })

  it('sem preferência: o primeiro quadro, o motor ligado e o botão de pausa', async () => {
    movimentoReduzido(false)
    const { container } = montar()
    expect(container.querySelector('.olhar__texto')).toHaveTextContent('Escolha um grupo')
    await waitFor(() => expect(motorFalso.chamadas).toBe(1))
    const pausar = screen.getByRole('button', { name: 'Pausar a demonstração' })
    fireEvent.click(pausar)
    expect(screen.getByRole('button', { name: 'Continuar a demonstração' })).toHaveTextContent('Continuar')
    // O motor avisa o fim: o controle vira "Ver de novo".
    act(() => motorFalso.ligacoes!.aoMudarModo('fim'))
    expect(screen.getByRole('button', { name: 'Ver de novo a demonstração' })).toBeInTheDocument()
  })

  it('o desenho é decorativo e a legenda descreve a demonstração', () => {
    movimentoReduzido(false)
    const { container } = montar()
    expect(container.querySelector('.olhar')).toHaveAttribute('aria-hidden', 'true')
    const legenda = container.querySelector('figcaption')!
    expect(legenda).toHaveTextContent('Simulação do teclado do IrisFlow: o ponto é o olhar.')
    expect(legenda.querySelector('.sr-only')).toHaveTextContent(/para no grupo de letras de A a F/)
    // O mesmo teclado do app: seis teclas, a sexta com as sugestões.
    expect(container.querySelectorAll('.olhar__grade [data-tecla]')).toHaveLength(6)
    expect(container.querySelector('[data-tecla="c5"]')).toHaveTextContent('+ 3 frases')
  })

  it('o CSS só anima transform e opacity', () => {
    const aqui = dirname(fileURLToPath(import.meta.url))
    // Desde a rodada 3 (21/10/2026) o teclado não está mais na abertura da
    // home (que não tem mais entrada animada): o CSS dela é conferido no
    // teste de acessibilidade do v3.
    for (const arquivo of ['escrita-pelo-olhar.css']) {
      const css = readFileSync(resolve(aqui, arquivo), 'utf8')
      const blocos = css.match(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []
      expect(blocos.length, arquivo).toBeGreaterThan(0)
      for (const bloco of blocos) {
        const props = Array.from(bloco.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
        expect(props.every((p) => p === 'transform' || p === 'opacity'), bloco.slice(0, 40)).toBe(true)
      }
    }
  })

  it('o mouse assume só se mexendo de verdade; o toque e o movimento "de mentira" (página rolando), não', async () => {
    movimentoReduzido(false)
    const { container } = montar()
    await waitFor(() => expect(motorFalso.chamadas).toBe(1))
    const tela = container.querySelector('.olhar__tela')!
    const mover = (init: Record<string, unknown>) => {
      const e = new MouseEvent('pointermove', { bubbles: true, clientX: 50, clientY: 50 })
      for (const [k, v] of Object.entries(init)) Object.defineProperty(e, k, { value: v })
      fireEvent(tela, e)
    }
    mover({ pointerType: 'touch', movementX: 4, movementY: 2 })
    mover({ pointerType: 'mouse', movementX: 0, movementY: 0 })
    expect(motorFalso.assumidas).toBe(0)
    mover({ pointerType: 'mouse', movementX: 4, movementY: 0 })
    expect(motorFalso.assumidas).toBe(1)
  })
})

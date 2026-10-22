import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Button } from './Button'

/* O aro de fixação só nas chamadas principais: fecha em 600 ms com o mouse
   parado em cima ou com o foco do teclado, fecha de vez no clique, e nada no
   toque. Só clip-path anima. */

const AQUI = dirname(fileURLToPath(import.meta.url))

describe('<Button chamada />', () => {
  it('a chamada ganha a classe do aro; o botão comum, não; e a prop não vai para o DOM', () => {
    render(
      <MemoryRouter>
        <Button to="/beta" chamada>
          Entrar na beta
        </Button>
        <Button type="submit">Enviar</Button>
      </MemoryRouter>,
    )
    const chamada = screen.getByRole('link', { name: 'Entrar na beta' })
    expect(chamada).toHaveClass('btn', 'btn--primary', 'btn--chamada')
    expect(chamada).not.toHaveAttribute('chamada')
    expect(screen.getByRole('button', { name: 'Enviar' })).not.toHaveClass('btn--chamada')
  })

  it('o CSS: 600 ms no mouse (só com ponteiro fino) e no foco, cheio no clique, só clip-path', () => {
    const css = readFileSync(resolve(AQUI, 'button.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const bloco = css.match(/@keyframes btn-fixacao\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/)
    expect(bloco).not.toBeNull()
    const props = Array.from(bloco![0].matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
    expect(props.every((p) => p === 'clip-path')).toBe(true)
    // O hover só vale com mouse; o foco do teclado, sempre.
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.btn--chamada:hover:not\(:disabled\)::after \{[^}]*btn-fixacao 600ms/)
    expect(css).toMatch(/\.btn--chamada:focus-visible::after \{[^}]*btn-fixacao 600ms/)
    expect(css).toMatch(/\.btn--chamada:active:not\(:disabled\)::after \{[^}]*clip-path: none/)
    // O aro antigo (gradiente cônico com propriedade registrada) saiu.
    expect(css).not.toMatch(/conic-gradient|@property/)
  })
})

/* Estados do botão (rodada 4, 21/10/2026): hover e pressionado (CSS), foco
   (anel global), carregando (aria-busy, o clique não dispara) e desabilitado
   COM explicação (o botão continua no Tab, o motivo é lido e está na tela). */
describe('<Button /> — carregando', () => {
  it('avisa o leitor de tela (aria-busy), não aceita outro clique e mostra o carregando', () => {
    const aoClicar = vi.fn()
    render(
      <Button loading onClick={aoClicar}>
        Enviar
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Enviar' })
    expect(b).toHaveAttribute('aria-busy', 'true')
    expect(b).toBeDisabled()
    expect(b).toHaveClass('is-loading')
    expect(b.querySelector('.spinner')).not.toBeNull()
    fireEvent.click(b)
    expect(aoClicar).not.toHaveBeenCalled()
  })

  it('sem loading, não há aria-busy', () => {
    render(<Button>Enviar</Button>)
    expect(screen.getByRole('button', { name: 'Enviar' })).not.toHaveAttribute('aria-busy')
  })
})

describe('<Button motivo />', () => {
  it('desabilitado com motivo: segue focável (aria-disabled), o motivo está na tela e descreve o botão', () => {
    const aoClicar = vi.fn()
    render(
      <Button disabled motivo="Falta marcar que você leu os termos." onClick={aoClicar}>
        Criar conta
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Criar conta' })
    expect(b).toHaveAttribute('aria-disabled', 'true')
    expect(b).not.toBeDisabled()
    expect(b).toHaveAccessibleDescription('Falta marcar que você leu os termos.')
    expect(screen.getByText('Falta marcar que você leu os termos.')).toBeVisible()
    b.focus()
    expect(document.activeElement).toBe(b)
    fireEvent.click(b)
    expect(aoClicar).not.toHaveBeenCalled()
  })

  it('habilitado, o motivo some e o clique funciona', () => {
    const aoClicar = vi.fn()
    render(
      <Button motivo="Falta algo." onClick={aoClicar}>
        Criar conta
      </Button>,
    )
    expect(screen.queryByText('Falta algo.')).not.toBeInTheDocument()
    const b = screen.getByRole('button', { name: 'Criar conta' })
    expect(b).not.toHaveAttribute('aria-disabled')
    fireEvent.click(b)
    expect(aoClicar).toHaveBeenCalledTimes(1)
  })

  it('desabilitado sem motivo continua sendo o disabled de sempre', () => {
    render(<Button disabled>Criar conta</Button>)
    expect(screen.getByRole('button', { name: 'Criar conta' })).toBeDisabled()
  })

  it('a prop motivo não vai para o DOM como atributo', () => {
    render(
      <Button disabled motivo="x">
        Criar
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Criar' })).not.toHaveAttribute('motivo')
  })
})

describe('button.css — estados', () => {
  const css = readFileSync(resolve(AQUI, 'button.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('cada variante tem o estado pressionado (:active) além do hover', () => {
    for (const v of ['primary', 'secondary', 'ghost']) {
      expect(css, v).toMatch(new RegExp(`\\.btn--${v}:active:not\\(:disabled\\)`))
    }
  })

  it('o motivo do desabilitado tem estilo próprio', () => {
    expect(css).toMatch(/\.btn__motivo\s*\{/)
  })
})

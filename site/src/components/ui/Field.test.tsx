import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CheckField, Field, SelectField, TextareaField } from './Field'

/* Estados dos campos (rodada 4, 21/10/2026): foco, erro e sucesso. O foco é
   neutro (papel, como o anel global), porque o teal é só de confirmação; o erro
   não depende só da cor (leva um ícone); o sucesso é a marca de "válido";
   desabilitado tem estilo próprio. */

const AQUI = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(AQUI, 'field.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function regra(seletor: string): string {
  const escapado = seletor.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&')
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escapado}\\s*\\{([^}]*)\\}`))
  expect(m, `regra ${seletor}`).not.toBeNull()
  return m![1]
}

describe('<Field />', () => {
  it('o rótulo está ligado ao campo e a dica descreve o campo', () => {
    render(<Field label="E-mail" hint="O mesmo da inscrição." />)
    const campo = screen.getByLabelText('E-mail')
    expect(campo).toHaveAccessibleDescription('O mesmo da inscrição.')
    expect(campo).toHaveAttribute('aria-invalid', 'false')
  })

  it('com erro: o erro é anunciado, vira a descrição e substitui a dica', () => {
    render(<Field label="E-mail" hint="O mesmo da inscrição." error="Falta o @ no endereço." />)
    const campo = screen.getByLabelText('E-mail')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Falta o @ no endereço.')
    expect(campo).toHaveAccessibleDescription('Falta o @ no endereço.')
    expect(screen.queryByText('O mesmo da inscrição.')).not.toBeInTheDocument()
  })

  it('válido: mostra a marca de confirmação, escondida do leitor de tela; com erro, nunca', () => {
    const { container, rerender } = render(<Field label="E-mail" valid />)
    expect(container.querySelector('.field--valid')).not.toBeNull()
    expect(container.querySelector('.field__valid')).toHaveAttribute('aria-hidden', 'true')
    rerender(<Field label="E-mail" valid error="Erro." />)
    expect(container.querySelector('.field__valid')).toBeNull()
    expect(container.querySelector('.field--error')).not.toBeNull()
  })

  it('select, área de texto e caixa de marcar seguem o mesmo contrato de erro', () => {
    render(
      <>
        <SelectField label="Condição" error="Escolha uma.">
          <option>—</option>
        </SelectField>
        <TextareaField label="Mensagem" error="Escreva algo." />
        <CheckField label="Li os termos" error="Marque para continuar." />
      </>,
    )
    expect(screen.getByLabelText('Condição')).toHaveAccessibleDescription('Escolha uma.')
    expect(screen.getByLabelText('Mensagem')).toHaveAccessibleDescription('Escreva algo.')
    expect(screen.getByLabelText('Li os termos')).toHaveAccessibleDescription('Marque para continuar.')
  })

  it('desabilitado: o campo fica desabilitado de verdade', () => {
    render(<Field label="E-mail" disabled />)
    expect(screen.getByLabelText('E-mail')).toBeDisabled()
  })
})

describe('field.css — estados', () => {
  it('o foco é neutro (papel), não teal: o teal é da confirmação', () => {
    const foco = regra('.field__input:focus')
    expect(foco).toMatch(/var\(--papel\)/)
    expect(foco).not.toMatch(/teal|--ok/)
  })

  it('o foco da caixa de marcar também é neutro', () => {
    const foco = regra('.check__input:focus-visible + .check__label .check__box')
    expect(foco).toMatch(/var\(--papel\)/)
    expect(foco).not.toMatch(/teal|--ok/)
  })

  it('a caixa marcada não usa teal (marcar é escolher, não confirmar)', () => {
    expect(regra('.check__input:checked + .check__label .check__box')).not.toMatch(/teal|--ok/)
  })

  it('o erro tem ícone, além da cor (WCAG 1.4.1)', () => {
    const icone = regra('.field__error::before')
    expect(icone).toMatch(/content\s*:/)
    expect(icone).toMatch(/mask|background-image/)
  })

  it('o sucesso é teal (a confirmação) e o campo desabilitado tem estilo próprio', () => {
    expect(regra('.field--valid .field__input')).toMatch(/var\(--teal\)/)
    expect(regra('.field__input:disabled')).toMatch(/cursor\s*:\s*not-allowed/)
  })
})

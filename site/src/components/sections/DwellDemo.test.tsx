import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DwellDemo } from './DwellDemo'

/* Quem usa controle por voz diz o que vê ("clicar chamar"). Por isso o nome
   acessível de cada alvo da prancha começa pelo texto que aparece no botão
   (WCAG 2.5.3, auditoria de 21/10/2026, P2-8). */

describe('<DwellDemo />', () => {
  it('o nome de cada pictograma começa pela palavra que está escrita nele', () => {
    render(<DwellDemo />)
    const prancha = screen.getByRole('group', { name: 'Prancha de pictogramas' })
    const botoes = within(prancha).getAllByRole('button')
    expect(botoes.length).toBeGreaterThan(3)
    for (const b of botoes) {
      const visivel = b.querySelector('.demo__word')!.textContent!.trim()
      expect(visivel).not.toBe('')
      const nome = b.getAttribute('aria-label')!
      expect(nome.toLowerCase().startsWith(visivel.toLowerCase())).toBe(true)
      // E o resto do nome ainda diz a frase que o botão fala.
      expect(nome.length).toBeGreaterThan(visivel.length + 2)
    }
  })

  it('as frases rápidas já têm como nome o texto que mostram', () => {
    render(<DwellDemo />)
    const rapidas = screen.getByRole('group', { name: 'Frases rápidas' })
    for (const b of within(rapidas).getAllByRole('button')) {
      expect(b.getAttribute('aria-label')).toBe(b.textContent!.trim())
    }
  })
})

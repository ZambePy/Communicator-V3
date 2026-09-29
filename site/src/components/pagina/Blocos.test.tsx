import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Recursos } from './Blocos'

const ITENS = [
  { titulo: 'Alvos grandes', texto: 'Uma frase.' },
  { titulo: 'Sem pressa', texto: 'Outra frase.' },
]

describe('Recursos — nível dos títulos', () => {
  it('sob o h2 de um capítulo, os itens são h3 (o normal)', () => {
    render(<Recursos itens={ITENS} />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Alvos grandes',
      'Sem pressa',
    ])
  })

  it('direto sob o h1 da página, são h2 — sem pular nível', () => {
    render(<Recursos itens={ITENS} nivel={2} />)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2)
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
    // A aparência não muda com o nível: a classe é a mesma.
    expect(screen.getByRole('heading', { name: 'Sem pressa' })).toHaveClass('recursos__titulo')
  })
})

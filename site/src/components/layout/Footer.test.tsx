import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Footer } from './Footer'

describe('Footer — títulos das colunas', () => {
  it('são h2: o rodapé é uma região própria e, na página 404, vinha h1 → h3 direto', () => {
    render(<MemoryRouter><Footer /></MemoryRouter>)
    for (const coluna of ['Produto', 'Empresa', 'Legal']) {
      const nav = screen.getByRole('navigation', { name: coluna })
      expect(within(nav).getByRole('heading', { level: 2, name: coluna })).toBeInTheDocument()
    }
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })
})

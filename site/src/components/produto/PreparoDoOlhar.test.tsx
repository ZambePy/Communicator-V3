import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CONFERENCIAS, PreparoDoOlhar } from './PreparoDoOlhar'

describe('<PreparoDoOlhar />', () => {
  it('lista as três conferências do preparo e o resultado em palavras', () => {
    render(<PreparoDoOlhar />)
    const itens = screen.getAllByRole('listitem')
    expect(itens).toHaveLength(CONFERENCIAS.length)
    CONFERENCIAS.forEach((c, i) => expect(itens[i]).toHaveTextContent(c.titulo))
    expect(screen.getByText('Calibração: ótima')).toBeInTheDocument()
  })

  it('não desenha os 13 pontos da calibração', () => {
    const { container } = render(<PreparoDoOlhar />)
    expect(container.querySelectorAll('circle, .calib__ponto')).toHaveLength(0)
  })
})

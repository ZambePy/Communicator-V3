import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Pricing } from './Pricing'
import { BETA, BETA_PLAN } from '@/data/content'

// Em /planos a grade vem logo abaixo do h1 da página: os títulos não podem
// pular do h1 para o h3, que é como o leitor de tela lista a página.
const nomes = (nivel: number) =>
  screen.queryAllByRole('heading', { level: nivel }).map((h) => h.textContent?.trim())

describe('Pricing — hierarquia dos títulos', () => {
  const ativo = BETA.ativo
  afterEach(() => {
    BETA.ativo = ativo
  })

  it('na beta: o plano Beta e "Depois da beta" são h2; os planos pagos, h3 abaixo deles', () => {
    BETA.ativo = true
    render(<MemoryRouter><Pricing /></MemoryRouter>)
    expect(nomes(2)).toEqual([BETA_PLAN.name, 'Depois da beta · preços previstos'])
    expect(nomes(3)).toEqual(expect.arrayContaining(['Essencial', 'Completo', 'Voz']))
  })

  it('fora da beta: cada plano é h2', () => {
    BETA.ativo = false
    render(<MemoryRouter><Pricing /></MemoryRouter>)
    expect(nomes(2)).toEqual(expect.arrayContaining(['Essencial', 'Completo', 'Voz']))
    expect(nomes(2)).not.toContain(BETA_PLAN.name)
  })
})

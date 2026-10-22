import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Footer } from './Footer'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => real.BETA_PROGRAM_RESERVA }
})

afterEach(() => {
  vi.useRealTimers()
  esquecerBetaProgram()
})

describe('Footer — títulos das colunas', () => {
  it('são h2: o rodapé é uma região própria e, na página 404, vinha h1 → h3 direto', () => {
    render(<MemoryRouter future={FUTURO_DO_ROTEADOR}><Footer /></MemoryRouter>)
    for (const coluna of ['Produto', 'Empresa', 'Legal']) {
      const nav = screen.getByRole('navigation', { name: coluna })
      expect(within(nav).getByRole('heading', { level: 2, name: coluna })).toBeInTheDocument()
    }
    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0)
  })
})

/* Rodapé v3 (21/10/2026): o relógio ao vivo de Brasília e desde quando a beta
   está no ar (a data é a do lançamento, a mesma do selo da beta). */
describe('Footer — relógio e beta no ar', () => {
  it('mostra a hora de Brasília e "Beta no ar desde 29/09"', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-10-21T08:44:41Z'))
    render(<MemoryRouter future={FUTURO_DO_ROTEADOR}><Footer /></MemoryRouter>)
    expect(screen.getByText('05:44:41')).toBeInTheDocument()
    expect(screen.getByText('Horário de Brasília')).toBeInTheDocument()
    expect(screen.getByText('Beta no ar desde 29/09')).toBeInTheDocument()
  })
})

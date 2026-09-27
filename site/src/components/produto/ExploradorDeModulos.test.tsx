import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ExploradorDeModulos } from './ExploradorDeModulos'
import { MODULOS_EM_TELA } from '@/data/produto'

/* As abas dos módulos: uma aba ativa de cada vez, setas trocam, e a tela do
   módulo é a única descrita para o leitor de tela. */

describe('<ExploradorDeModulos />', () => {
  it('começa no primeiro módulo, com o painel ligado à aba', () => {
    render(<ExploradorDeModulos modulos={MODULOS_EM_TELA} />)
    const abas = screen.getAllByRole('tab')
    expect(abas).toHaveLength(MODULOS_EM_TELA.length)
    expect(abas[0]).toHaveAttribute('aria-selected', 'true')
    expect(abas[0]).toHaveAttribute('tabindex', '0')
    expect(abas[1]).toHaveAttribute('tabindex', '-1')

    const painel = screen.getByRole('tabpanel')
    expect(painel).toHaveAttribute('aria-labelledby', abas[0].id)
    expect(within(painel).getByRole('heading', { level: 2 })).toHaveTextContent(MODULOS_EM_TELA[0].nome)
    // Só a tela ativa tem descrição; as outras ficam fora do leitor de tela.
    expect(within(painel).getByAltText(MODULOS_EM_TELA[0].tela.alt)).toBeInTheDocument()
    expect(within(painel).queryByAltText(MODULOS_EM_TELA[1].tela.alt)).not.toBeInTheDocument()
  })

  it('setas, Home e End trocam a aba e levam o foco junto', () => {
    render(<ExploradorDeModulos modulos={MODULOS_EM_TELA} />)
    const abas = screen.getAllByRole('tab')
    fireEvent.keyDown(abas[0], { key: 'ArrowDown' })
    expect(abas[1]).toHaveAttribute('aria-selected', 'true')
    expect(abas[1]).toHaveFocus()
    fireEvent.keyDown(abas[1], { key: 'ArrowUp' })
    expect(abas[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(abas[0], { key: 'End' })
    expect(abas[abas.length - 1]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(abas[abas.length - 1], { key: 'ArrowRight' })
    expect(abas[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('o módulo que também vive no celular mostra a tela do IrisFlow Cuidador', () => {
    render(<ExploradorDeModulos modulos={MODULOS_EM_TELA} />)
    const emergencia = MODULOS_EM_TELA.find((m) => m.id === 'emergencia')!
    fireEvent.click(screen.getByRole('tab', { name: emergencia.nome }))
    const painel = screen.getByRole('tabpanel')
    expect(within(painel).getByAltText(emergencia.celular!.alt)).toBeInTheDocument()
    expect(within(painel).getByRole('heading', { level: 2 })).toHaveTextContent('Emergência')
  })

  it('marca o que é experimental e em que plano entra', () => {
    render(<ExploradorDeModulos modulos={MODULOS_EM_TELA} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Voz personalizada' }))
    const painel = screen.getByRole('tabpanel')
    expect(within(painel).getByText('Experimental')).toBeInTheDocument()
    expect(within(painel).getByText('Plano Voz')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Lazer e bem-estar' }))
    expect(within(screen.getByRole('tabpanel')).getByText('Planos Completo e Voz')).toBeInTheDocument()
  })
})

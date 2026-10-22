import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/* Auditoria de 21/10/2026 (P2-16): o mesmo fecho, "A pessoa continua lá. Só
   falta a voz.", aparecia em sete rotas, e o menu e a faixa levavam ao mesmo
   download por dois caminhos. Cada página passa o fecho dela; o da home fica
   como padrão; o download tem um caminho só (/baixar depois do lançamento). */

vi.mock('@/services/api', async (importar) => ({
  ...(await importar<typeof import('@/services/api')>()),
  fetchBetaProgram: vi.fn(() => new Promise(() => {})),
}))

import { CallToAction } from './CallToAction'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'

const montar = (ui = <CallToAction />) =>
  render(
    <MemoryRouter>
      {ui}
    </MemoryRouter>,
  )

describe('<CallToAction />', () => {
  beforeEach(() => esquecerBetaProgram())

  it('sem props é o fecho da home, com o apoio novo e o download', () => {
    montar()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('A pessoa continua lá. Só falta a voz.')
    expect(screen.getByText(/veja se funciona no seu caso\. É grátis na beta e não pede cartão\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Baixar grátis' })).toHaveAttribute('href', '/baixar')
    expect(screen.getByRole('link', { name: 'Falar com a equipe' })).toHaveAttribute('href', '/contato')
    expect(screen.getByText('Download gratuito para Windows')).toBeInTheDocument()
  })

  it('a página passa o fecho dela: título e texto próprios', () => {
    montar(<CallToAction titulo="Veja no seu computador." texto="Baixe a beta e veja." />)
    const titulo = screen.getByRole('heading', { level: 2 })
    expect(titulo).toHaveTextContent('Veja no seu computador.')
    expect(titulo).not.toHaveTextContent('Só falta a voz')
    expect(screen.getByText('Baixe a beta e veja.')).toBeInTheDocument()
  })

  it('fecho que não é de download: o botão principal é o da página, sem segundo botão nem linha do download', () => {
    montar(
      <CallToAction
        titulo="Conte o que faltou."
        principal={{ label: 'Falar com a equipe', to: '/contato' }}
        secundario={false}
      />,
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveTextContent('Falar com a equipe')
    expect(links[0]).toHaveAttribute('href', '/contato')
    expect(screen.queryByText(/Download/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Baixar grátis' })).toBeNull()
  })

  it('o segundo botão pode ser trocado', () => {
    montar(<CallToAction secundario={{ label: 'Ver os planos', to: '/planos' }} />)
    expect(screen.getByRole('link', { name: 'Ver os planos' })).toHaveAttribute('href', '/planos')
    expect(screen.queryByRole('link', { name: 'Falar com a equipe' })).toBeNull()
  })
})

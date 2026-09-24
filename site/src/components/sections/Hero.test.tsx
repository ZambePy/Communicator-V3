import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HERO } from '@/data/content'
import { Hero } from './Hero'

// O hero só usa o menor preço, para a linha fina fora da beta.
vi.mock('@/hooks/usePlans', () => ({ usePlans: () => ({ cheapest: { price: '0' } }) }))

const montar = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Hero />
    </MemoryRouter>,
  )

describe('Hero da home', () => {
  it('título "Seu olhar tem voz", com "voz" em destaque, e o subtítulo', () => {
    montar()
    const titulo = screen.getByRole('heading', { level: 1 })
    expect(titulo).toHaveTextContent('Seu olhar tem voz')
    expect(titulo.querySelector('.gradient-text')).toHaveTextContent(/^voz$/)
    expect(
      screen.getByText(
        'O IrisFlow Communicator transforma o olhar em comunicação e controle do computador, usando uma webcam comum.',
      ),
    ).toBeInTheDocument()
  })

  it('mantém as duas chamadas', () => {
    montar()
    expect(screen.getByRole('link', { name: HERO.secondary })).toHaveAttribute('href', '/como-funciona')
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(2)
  })

  it('a imagem é a marca da íris, decorativa, sem legenda nem ilustração antiga', () => {
    const { container } = montar()
    const marca = container.querySelector('.hero__marca .irismark')
    expect(marca).not.toBeNull()
    expect(marca).toHaveAttribute('aria-hidden', 'true')
    expect(marca!.querySelector('img')).toHaveAttribute('src', '/brand/irisflow-symbol-negativo.png')
    expect(container.querySelector('.hero__mock-caption, .gaze-story, .hm')).toBeNull()
  })
})

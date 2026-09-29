import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PassosComTela } from './Passos'
import { PASSOS_DO_PRIMEIRO_USO } from '@/data/produto'

describe('PassosComTela — títulos', () => {
  it('cada passo é h2: a lista vem logo abaixo do h1 de /como-funciona', () => {
    render(<PassosComTela passos={PASSOS_DO_PRIMEIRO_USO} />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(
      PASSOS_DO_PRIMEIRO_USO.map((p) => p.titulo),
    )
  })
})

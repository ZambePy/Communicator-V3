import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { statSync } from 'node:fs'
import path from 'node:path'
import { Logo } from './Logo'

/* P2-4 (auditoria de 21/10/2026): o logo do cabeçalho e do rodapé não pode ser
   o PNG de 1200 px e 66 KB. */
describe('<Logo /> em negativo', () => {
  it('usa a versão de 434 px, com as proporções certas para não saltar o layout', () => {
    const { container } = render(
      <MemoryRouter>
        <Logo tone="negativo" />
      </MemoryRouter>,
    )
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/brand/irisflow-logo-negativo-434.png')
    expect(Number(img.getAttribute('width')) / Number(img.getAttribute('height'))).toBeCloseTo(1200 / 287, 1)
  })

  it('o arquivo existe e pesa menos de 12 KB', () => {
    const arquivo = path.resolve(__dirname, '../../../public/brand/irisflow-logo-negativo-434.png')
    expect(statSync(arquivo).size).toBeLessThan(12 * 1024)
  })
})

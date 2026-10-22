import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotFound from './NotFound'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

/* Auditoria de 21/10/2026 (P3-11): a 404 tinha o texto centralizado (as outras
   páginas são alinhadas à esquerda), um travessão na frase e uma linha de
   atalhos que repetia as seis entradas do menu e quebrava com "Planos"
   sozinho na segunda linha. */

function montar(caminho = '/essa-rota-nao-existe') {
  return render(
    <MemoryRouter initialEntries={[caminho]} future={FUTURO_DO_ROTEADOR}>
      <NotFound />
    </MemoryRouter>,
  )
}

describe('<NotFound />', () => {
  it('diz o que houve em duas frases curtas, sem travessão', () => {
    const { container } = montar()
    const lead = container.querySelector('.not-found__lead')!
    expect(lead.textContent).toBe(
      'Não encontramos /essa-rota-nao-existe. O link pode estar incompleto, ou a página mudou de lugar.',
    )
    expect(container.textContent).not.toMatch(/[—–]/)
  })

  it('oferece voltar ao início, falar com a equipe e só quatro atalhos', () => {
    montar()
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Falar com a equipe' })).toHaveAttribute('href', '/contato')
    const atalhos = screen.getByRole('navigation', { name: 'Páginas sugeridas' }).querySelectorAll('a')
    expect(Array.from(atalhos).map((a) => a.textContent)).toEqual(['O produto', 'Como funciona', 'Baixar', 'Planos'])
  })

  it('o texto é alinhado à esquerda, como nas outras páginas', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'not-found.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    expect(css).not.toMatch(/text-align:\s*center/)
    expect(css).not.toMatch(/justify-content:\s*center/)
  })
})

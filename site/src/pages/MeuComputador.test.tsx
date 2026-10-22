import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { NivelDoVeredito } from '@/utils/compat'

/* /meu-computador (auditoria de 21/10/2026, P2-9, P2-16, P3-2): o fecho só
   manda baixar quando o computador atende; antes do teste da câmera, ou com um
   impedimento, o caminho é conversar com a equipe. E o marco da tabela de
   requisitos não repete o nome da seção. */

let avisar: ((n: NivelDoVeredito) => void) | undefined
vi.mock('@/components/sections/CompatCheck', () => ({
  CompatCheck: ({ aoMudarVeredito }: { aoMudarVeredito?: (n: NivelDoVeredito) => void }) => {
    avisar = aoMudarVeredito
    return <p>o teste</p>
  },
}))
vi.mock('@/services/api', async (importar) => ({
  ...(await importar<typeof import('@/services/api')>()),
  fetchBetaProgram: vi.fn(() => new Promise(() => {})),
}))

import MeuComputador from './MeuComputador'

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MeuComputador />
    </MemoryRouter>,
  )
}

const fecho = () => document.querySelector('#cta-titulo')!.textContent
const links = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('.cta__actions a')).map((a) => a.getAttribute('href'))

describe('<MeuComputador />', () => {
  it('antes do teste: o fecho é a conversa com a equipe, e não o download', () => {
    montar()
    expect(fecho()).toBe('Ficou com dúvida sobre o computador?')
    expect(links()).toEqual(['/contato'])
  })

  it.each([
    ['funciona', 'Seu computador atende. Baixe agora.'],
    ['lento', 'Dá para tentar. Baixe a beta e veja.'],
  ] as const)('veredito "%s": fecha mandando baixar', (nivel, esperado) => {
    montar()
    act(() => avisar!(nivel))
    expect(fecho()).toBe(esperado)
    expect(links()).toContain('/baixar')
  })

  it.each(['nao-funciona', 'falta-camera', 'no-celular'] as const)('veredito "%s": não manda baixar', (nivel) => {
    montar()
    act(() => avisar!('funciona'))
    act(() => avisar!(nivel))
    expect(fecho()).toBe('Ficou com dúvida sobre o computador?')
    expect(links()).toEqual(['/contato'])
  })

  it('a região rolável da tabela tem nome próprio, diferente do da seção (landmark-unique)', () => {
    montar()
    const regiao = screen.getByRole('region', { name: 'Tabela de requisitos' })
    expect(regiao).toHaveAttribute('tabindex', '0')
    const nomes = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? r.getAttribute('aria-labelledby'))
    expect(new Set(nomes).size).toBe(nomes.length)
  })
})

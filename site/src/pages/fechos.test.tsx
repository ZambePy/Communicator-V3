import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/* Auditoria de 21/10/2026 (P2-16 e P3-9): cada página de dentro termina com o
   fecho dela, e o rótulo acima do título (que repetia o nome da página, já no
   menu e na aba) só fica onde diz algo a mais. */

vi.mock('@/components/home/olhar/motorDoOlhar', () => ({
  ligarMotor: () => ({
    agendar: () => {},
    parar: () => {},
    recomecar: () => {},
    assumir: () => {},
    mover: () => {},
    soltar: () => {},
    acionar: () => {},
    desligar: () => {},
  }),
}))
vi.mock('@/services/api', async (importar) => ({
  ...(await importar<typeof import('@/services/api')>()),
  fetchBetaProgram: vi.fn(() => new Promise(() => {})),
  fetchPlans: vi.fn(() => new Promise(() => {})),
}))

import Solucao from './Solucao'
import ComoFunciona from './ComoFunciona'
import Acessibilidade from './Acessibilidade'
import Planos from './Planos'
import Sobre from './Sobre'
import Contato from './Contato'

function montar(Pagina: () => JSX.Element) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Pagina />
    </MemoryRouter>,
  )
}

const PAGINAS: [string, () => JSX.Element, string][] = [
  ['/solucao', Solucao, 'Veja no seu computador.'],
  ['/como-funciona', ComoFunciona, 'Leva poucos minutos para testar.'],
  ['/acessibilidade', Acessibilidade, 'Conte o que faltou.'],
  ['/planos', Planos, 'Comece de graça, sem cartão.'],
  ['/sobre', Sobre, 'Conheça o programa de validação.'],
]

describe('o fecho de cada página', () => {
  it.each(PAGINAS)('%s termina com o próprio fecho, e não com o da home', (_rota, Pagina, esperado) => {
    const { container } = montar(Pagina)
    const fecho = container.querySelector('#cta-titulo')
    expect(fecho).not.toBeNull()
    expect(fecho!.textContent).toBe(esperado)
    expect(fecho!.textContent).not.toMatch(/Só falta a voz/)
  })

  it('os fechos não se repetem', () => {
    const textos = PAGINAS.map(([, P]) => {
      const { container, unmount } = montar(P)
      const t = container.querySelector('#cta-titulo')!.textContent
      unmount()
      return t
    })
    expect(new Set(textos).size).toBe(PAGINAS.length)
  })

  it('só um caminho para o download: o fecho de download leva a /baixar e nenhum fecho aponta para /beta e /baixar ao mesmo tempo', () => {
    for (const [, P] of PAGINAS) {
      const { container, unmount } = montar(P)
      const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('.cta__actions a')).map((a) =>
        a.getAttribute('href'),
      )
      expect(links.filter((h) => h === '/baixar' || h === '/beta').length).toBeLessThanOrEqual(1)
      unmount()
    }
  })
})

describe('o rótulo acima do título não repete o nome da página', () => {
  it.each([
    ['/solucao', Solucao],
    ['/como-funciona', ComoFunciona],
    ['/acessibilidade', Acessibilidade],
    ['/planos', Planos],
    ['/contato', Contato],
  ] as [string, () => JSX.Element][])('%s abre direto no título', (_rota, Pagina) => {
    const { container } = montar(Pagina)
    expect(container.querySelector('.page-head__rotulo')).toBeNull()
  })

  it('/sobre mantém o rótulo "A empresa", que diz algo a mais', () => {
    const { container } = montar(Sobre)
    expect(container.querySelector('.page-head__rotulo')?.textContent).toBe('A empresa')
  })
})

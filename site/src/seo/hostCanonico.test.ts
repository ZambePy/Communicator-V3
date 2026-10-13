import { describe, expect, it, vi } from 'vitest'
import { destinoCanonico, irParaODominioOficial } from './hostCanonico'

const OFICIAL = 'https://irisflow.ia.br'

describe('destinoCanonico', () => {
  it('leva o endereço do Pages ao domínio oficial, com caminho, busca e fragmento', () => {
    expect(destinoCanonico('https://irisflow-communicator.pages.dev/recuperar-senha', OFICIAL)).toBe(
      'https://irisflow.ia.br/recuperar-senha',
    )
    expect(
      destinoCanonico('https://irisflow-communicator.pages.dev/nova-senha?code=abc#type=recovery', OFICIAL),
    ).toBe('https://irisflow.ia.br/nova-senha?code=abc#type=recovery')
    expect(destinoCanonico('https://irisflow-communicator.pages.dev/', OFICIAL)).toBe('https://irisflow.ia.br/')
    expect(destinoCanonico('https://irisflow.pages.dev/beta', OFICIAL)).toBe('https://irisflow.ia.br/beta')
  })

  it('não mexe no próprio domínio nem nas prévias de deploy', () => {
    expect(destinoCanonico('https://irisflow.ia.br/conta', OFICIAL)).toBeNull()
    expect(destinoCanonico('https://www.irisflow.ia.br/', OFICIAL)).toBeNull()
    expect(destinoCanonico('https://abc123.irisflow-communicator.pages.dev/', OFICIAL)).toBeNull()
    expect(destinoCanonico('https://main.irisflow-communicator.pages.dev/planos', OFICIAL)).toBeNull()
    expect(destinoCanonico('http://localhost:5173/entrar', OFICIAL)).toBeNull()
  })

  it('sem domínio próprio no build (SITE_URL no pages.dev), fica onde está: sem laço', () => {
    expect(
      destinoCanonico('https://irisflow-communicator.pages.dev/', 'https://irisflow-communicator.pages.dev'),
    ).toBeNull()
  })

  it('endereço inválido não quebra o boot', () => {
    expect(destinoCanonico('não é url', OFICIAL)).toBeNull()
    expect(destinoCanonico('https://irisflow-communicator.pages.dev/', 'não é url')).toBeNull()
  })
})

describe('irParaODominioOficial', () => {
  it('troca o endereço com replace e avisa que mandou embora', () => {
    const replace = vi.fn()
    const loc = { href: 'https://irisflow-communicator.pages.dev/entrar?de=app', replace } as unknown as Location
    expect(irParaODominioOficial(OFICIAL, loc)).toBe(true)
    expect(replace).toHaveBeenCalledWith('https://irisflow.ia.br/entrar?de=app')
  })

  it('no domínio oficial não faz nada', () => {
    const replace = vi.fn()
    const loc = { href: 'https://irisflow.ia.br/entrar', replace } as unknown as Location
    expect(irParaODominioOficial(OFICIAL, loc)).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })
})

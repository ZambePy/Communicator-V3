import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DwellTarget } from './DwellTarget'

/* Auditoria P2-8 (21/10/2026), WCAG 2.5.3 (rótulo no nome): o botão mostra
   "Rápido" e, embaixo, "0,8 s", mas o nome acessível começava só por "Rápido.
   Mantenha o cursor…". Quem comanda por voz diz o que vê ("clicar Rápido 0,8 s")
   e o comando não achava o botão (axe "label-content-name-mismatch", a violação
   mais séria do site, numa página sobre acessibilidade). */

describe('DwellTarget — nome acessível', () => {
  it('começa pelo texto que aparece no botão (rótulo e dica), e só depois dá a instrução', () => {
    render(<DwellTarget label="Rápido" dwellMs={800} hint="0,8 s" />)
    const botao = screen.getByRole('button')
    const nome = botao.getAttribute('aria-label') ?? ''
    expect(nome.startsWith('Rápido 0,8 s')).toBe(true)
    expect(nome).toMatch(/Mantenha o cursor ou o foco sobre o alvo por 800 milissegundos/)
  })

  it('sem dica, o nome continua começando pelo rótulo', () => {
    render(<DwellTarget label="Chamar" dwellMs={1500} />)
    const nome = screen.getByRole('button').getAttribute('aria-label') ?? ''
    expect(nome.startsWith('Chamar. ')).toBe(true)
  })

  it('o texto do botão, lido como o axe lê (os elementos um depois do outro), cabe inteiro no nome', () => {
    // O axe junta o texto dos elementos sem espaço entre eles: sem um espaço no DOM, o texto lido seria
    // "Confortável2,5 s" e nunca estaria dentro do nome "Confortável 2,5 s. Mantenha…" (WCAG 2.5.3).
    render(<DwellTarget label="Confortável" dwellMs={2500} hint="2,5 s" />)
    const botao = screen.getByRole('button')
    expect(botao.textContent).toBe('Confortável 2,5 s')
    expect(botao.getAttribute('aria-label')).toContain(botao.textContent!)
  })
})

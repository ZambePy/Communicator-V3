import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CartoesNumerados } from './CartoesNumerados'
import { O_QUE_UM_OLHAR_FAZ, RECURSOS_DO_OLHAR } from '@/data/home'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

/* "O que um olhar faz": seis cartões numa grade, cada um com a tela real do
   app, sem nada preso na rolagem. */

function montar() {
  return render(
    <MemoryRouter future={FUTURO_DO_ROTEADOR}>
      <CartoesNumerados itens={RECURSOS_DO_OLHAR} titulo={O_QUE_UM_OLHAR_FAZ.titulo} texto={O_QUE_UM_OLHAR_FAZ.texto} />
    </MemoryRouter>,
  )
}

const cartoes = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.v3-cartao'))

describe('<CartoesNumerados />', () => {
  it('seis cartões, de 01 a 06, na ordem dos dados', () => {
    const { container } = montar()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(O_QUE_UM_OLHAR_FAZ.titulo)
    const lista = cartoes(container)
    expect(lista).toHaveLength(6)
    lista.forEach((el, i) => {
      expect(el.querySelector('.v3-cartao__numero')).toHaveTextContent(String(i + 1).padStart(2, '0'))
      expect(within(el).getByRole('heading', { level: 3 })).toHaveTextContent(RECURSOS_DO_OLHAR[i].titulo)
    })
  })

  it('nada preso na rolagem: sem trilho, sem palco e sem cartão "ativo"', () => {
    const { container } = montar()
    expect(container.querySelector('.v3-recursos__trilho, .v3-recursos__palco')).toBeNull()
    expect(container.querySelector('[aria-current]')).toBeNull()
  })

  it('cada cartão com captura mostra a tela real, com texto alternativo', () => {
    const { container } = montar()
    cartoes(container).forEach((el, i) => {
      const tela = RECURSOS_DO_OLHAR[i].tela
      const img = el.querySelector('img')
      if (tela) {
        expect(img).toHaveAttribute('src', tela.src)
        expect(img).toHaveAttribute('alt', tela.alt)
      } else {
        expect(img).toBeNull()
        expect(el).toHaveClass('v3-cartao--sem-tela')
      }
    })
  })

  it('o título vira link quando o recurso tem página, e a seta acompanha', () => {
    const { container } = montar()
    cartoes(container).forEach((el, i) => {
      const { link } = RECURSOS_DO_OLHAR[i]
      const a = el.querySelector('.v3-cartao__titulo a')
      if (link) {
        expect(a).toHaveAttribute('href', link.to)
        expect(el.querySelector('.v3-cartao__seta')).not.toBeNull()
      } else {
        expect(a).toBeNull()
      }
    })
  })

  it('o cartão 06 ("Mostrar onde dói") não traz nota de "próxima versão"', () => {
    const { container } = montar()
    const sexto = cartoes(container)[5]
    expect(within(sexto).getByRole('heading', { level: 3 })).toHaveTextContent('Mostrar onde dói')
    expect(sexto.querySelector('.v3-cartao__nota')).toBeNull()
  })
})

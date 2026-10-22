import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ListaDeModulos } from './ListaDeModulos'
import { MODULOS_EM_TELA } from '@/data/produto'
import { MODULOS_NA_HOME } from '@/data/home'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

/* Os módulos na home (v3, 21/10/2026): uma lista numerada e, ao lado, a tela
   real do módulo sob o ponteiro. Nada só no passar do mouse: o foco do
   teclado e o toque escolhem a prévia do mesmo jeito. */

function montar() {
  return render(
    <MemoryRouter future={FUTURO_DO_ROTEADOR}>
      <ListaDeModulos modulos={MODULOS_EM_TELA} titulo={MODULOS_NA_HOME.titulo} texto={MODULOS_NA_HOME.texto} />
    </MemoryRouter>,
  )
}

const botoes = () => within(screen.getByRole('list')).getAllByRole('button')
const previa = (c: HTMLElement) => c.querySelector<HTMLImageElement>('.v3-modulos__previa img.is-ativa')

describe('<ListaDeModulos />', () => {
  it('uma linha por módulo, numerada de 01 em diante, com o nome do módulo', () => {
    montar()
    const linhas = botoes()
    expect(linhas).toHaveLength(MODULOS_EM_TELA.length)
    linhas.forEach((b, i) => {
      expect(b).toHaveTextContent(String(i + 1).padStart(2, '0'))
      expect(b).toHaveTextContent(MODULOS_EM_TELA[i].nome)
    })
    expect(linhas[0]).toHaveAttribute('aria-current', 'true')
  })

  it('a prévia é a tela real do módulo ativo, com a descrição dela', () => {
    const { container } = montar()
    expect(previa(container)).toHaveAttribute('src', MODULOS_EM_TELA[0].tela.src)
    expect(previa(container)).toHaveAttribute('alt', MODULOS_EM_TELA[0].tela.alt)
    expect(container.querySelector('.v3-modulos__previa figcaption')).toHaveTextContent(MODULOS_EM_TELA[0].resumo)
  })

  it('passar o mouse, focar com o teclado ou tocar trocam a prévia', () => {
    const { container } = montar()
    fireEvent.pointerEnter(botoes()[3])
    expect(botoes()[3]).toHaveAttribute('aria-current', 'true')
    expect(previa(container)).toHaveAttribute('src', MODULOS_EM_TELA[3].tela.src)

    fireEvent.focus(botoes()[5])
    expect(previa(container)).toHaveAttribute('src', MODULOS_EM_TELA[5].tela.src)

    fireEvent.click(botoes()[1])
    expect(botoes()[1]).toHaveAttribute('aria-current', 'true')
    expect(botoes()[5]).not.toHaveAttribute('aria-current')
    expect(previa(container)).toHaveAttribute('src', MODULOS_EM_TELA[1].tela.src)
  })

  it('as etiquetas dizem o que é experimental e o que é de plano', () => {
    montar()
    const voz = botoes()[MODULOS_EM_TELA.findIndex((m) => m.id === 'voz')]
    expect(voz).toHaveTextContent('Experimental')
    expect(voz).toHaveTextContent('Plano Voz')
    const comunicacao = botoes()[0]
    expect(comunicacao).not.toHaveTextContent('Experimental')
  })

  it('leva à página com todos os módulos', () => {
    montar()
    expect(screen.getByRole('link', { name: /módulos/i })).toHaveAttribute('href', '/solucao')
  })
})

/* Auditoria P2-2 (21/10/2026): abaixo de 960 px a prévia some e a miniatura abre
   dentro da lista. Trocar a linha por hover/foco montava e desmontava uma imagem
   de ~390 px, e a lista inteira pulava sob o ponteiro parado (CLS 0,22 a 390 e 1,02
   a 768). Nesse tamanho só o clique escolhe a linha. */
describe('<ListaDeModulos /> — tela estreita (abaixo de 960 px)', () => {
  const original = window.matchMedia

  function estreita() {
    window.matchMedia = ((consulta: string) => ({
      matches: consulta.includes('max-width: 960px'),
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }

  afterEach(() => {
    window.matchMedia = original
    vi.restoreAllMocks()
  })

  const miniaturas = (c: HTMLElement) => c.querySelectorAll('.v3-modulos__miniatura')

  it('passar o mouse ou focar não trocam a linha aberta: nada se mexe sob o ponteiro', () => {
    estreita()
    const { container } = montar()
    fireEvent.pointerEnter(botoes()[3])
    fireEvent.focus(botoes()[4])
    expect(botoes()[0]).toHaveAttribute('aria-expanded', 'true')
    expect(botoes()[3]).toHaveAttribute('aria-expanded', 'false')
    expect(botoes()[4]).toHaveAttribute('aria-expanded', 'false')
    expect(miniaturas(container)).toHaveLength(1)
    expect(miniaturas(container)[0]).toHaveAttribute('src', MODULOS_EM_TELA[0].tela.src)
  })

  it('o clique abre a linha escolhida e fecha a anterior, sempre uma miniatura só', () => {
    estreita()
    const { container } = montar()
    fireEvent.click(botoes()[2])
    expect(botoes()[2]).toHaveAttribute('aria-expanded', 'true')
    expect(botoes()[0]).toHaveAttribute('aria-expanded', 'false')
    expect(miniaturas(container)).toHaveLength(1)
    expect(miniaturas(container)[0]).toHaveAttribute('src', MODULOS_EM_TELA[2].tela.src)
  })

  it('o botão aponta para a miniatura que abre (aria-controls) e ela tem esse id', () => {
    estreita()
    const { container } = montar()
    const aberta = botoes()[0]
    const id = aberta.getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(container.querySelector(`#${CSS.escape(id!)}`)).toBe(miniaturas(container)[0])
  })
})

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CartoesNumerados, indiceNaRolagem } from './CartoesNumerados'
import { O_QUE_UM_OLHAR_FAZ, RECURSOS_DO_OLHAR } from '@/data/home'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

/* "O que um olhar faz" (v3, 21/10/2026): seis cartões numerados numa faixa
   horizontal, presa na tela enquanto a página rola. O cartão ativo vem
   preenchido e é ele quem decide qual TELA REAL do app aparece ao lado (as
   imagens de public/media; antes eram as partículas, que o dono recusou). A
   troca da imagem só acontece quando o cartão ativo muda. Com movimento
   reduzido, nada fica preso nem desliza: uma grade parada, cada cartão com a
   sua tela pequena. */

const matchMediaOriginal = window.matchMedia
const alturaOriginal = window.innerHeight

function movimentoReduzido(sim: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: sim && q.includes('reduce'),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

afterEach(() => {
  window.matchMedia = matchMediaOriginal
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: alturaOriginal })
})

function montar() {
  return render(
    <MemoryRouter future={FUTURO_DO_ROTEADOR}>
      <CartoesNumerados itens={RECURSOS_DO_OLHAR} titulo={O_QUE_UM_OLHAR_FAZ.titulo} texto={O_QUE_UM_OLHAR_FAZ.texto} />
    </MemoryRouter>,
  )
}

const cartoes = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('.v3-cartao'))
const ativo = (c: HTMLElement) => cartoes(c).findIndex((el) => el.classList.contains('is-ativo'))

/** Rola a faixa até o cartão `i` (6 passos de 600 px numa janela de 900). */
function rolarAte(container: HTMLElement, i: number, dentroDoPasso = 0.5) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
  const trilho = container.querySelector<HTMLElement>('.v3-recursos__trilho')!
  const altura = 900 + 6 * 600
  const progresso = (i + dentroDoPasso) / 6
  trilho.getBoundingClientRect = () =>
    ({ top: -(progresso * (altura - 900)), height: altura, bottom: altura, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  act(() => {
    window.dispatchEvent(new Event('scroll'))
  })
}

describe('indiceNaRolagem', () => {
  it('divide a rolagem em partes iguais, uma por cartão, sem sair das pontas', () => {
    expect(indiceNaRolagem(0, 6)).toBe(0)
    expect(indiceNaRolagem(0.16, 6)).toBe(0)
    expect(indiceNaRolagem(0.17, 6)).toBe(1)
    expect(indiceNaRolagem(0.5, 6)).toBe(3)
    expect(indiceNaRolagem(0.999, 6)).toBe(5)
    expect(indiceNaRolagem(1, 6)).toBe(5)
    expect(indiceNaRolagem(1.4, 6)).toBe(5)
    expect(indiceNaRolagem(-0.2, 6)).toBe(0)
    expect(indiceNaRolagem(Number.NaN, 6)).toBe(0)
  })
})

describe('<CartoesNumerados />', () => {
  it('o cartão 06 ("Mostrar onde dói") não traz mais a nota de que chega na próxima versão: a beta.12 o inclui', () => {
    movimentoReduzido(false)
    const { container } = montar()
    const sexto = cartoes(container)[5]
    expect(within(sexto).getByRole('heading', { level: 3 })).toHaveTextContent('Mostrar onde dói')
    expect(sexto.querySelector('.v3-cartao__nota')).toBeNull()
    expect(sexto).not.toHaveTextContent(/próxima versão|beta 12|ainda não está/i)
  })

  it('seis cartões, de 01 a 06, na ordem dos dados; o primeiro começa ativo', () => {
    movimentoReduzido(false)
    const { container } = montar()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(O_QUE_UM_OLHAR_FAZ.titulo)
    const lista = cartoes(container)
    expect(lista).toHaveLength(6)
    lista.forEach((el, i) => {
      expect(el.querySelector('.v3-cartao__numero')).toHaveTextContent(String(i + 1).padStart(2, '0'))
      expect(within(el).getByRole('heading', { level: 3 })).toHaveTextContent(RECURSOS_DO_OLHAR[i].titulo)
    })
    expect(ativo(container)).toBe(0)
    expect(lista[0]).toHaveAttribute('aria-current', 'step')
  })

  it('rolar a faixa troca o cartão ativo', async () => {
    movimentoReduzido(false)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    const { container } = montar()
    const trilho = container.querySelector<HTMLElement>('.v3-recursos__trilho')!
    // A faixa tem 6 passos; com 3,5 passos rolados, o quarto cartão (índice 3) está ativo.
    const altura = 900 + 6 * 600
    trilho.getBoundingClientRect = () =>
      ({ top: -(0.6 * (altura - 900)), height: altura, bottom: altura, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    act(() => {
      window.dispatchEvent(new Event('scroll'))
    })
    await waitFor(() => expect(ativo(container)).toBe(3))
    expect(cartoes(container)[3]).toHaveAttribute('aria-current', 'step')
    expect(cartoes(container)[0]).not.toHaveAttribute('aria-current')
    // Presa na tela, a faixa esconde a barra fixa de chamada do celular, que
    // cobria o pé do cartão ativo (capturas em 390 × 844).
    expect(trilho).toHaveAttribute('data-sticky-hide')
  })

  // Auditoria P3-10 (21/10/2026): uma seta ↗ em cada um dos 6 cartões deixa de
  // indicar algo. Só o cartão ativo mostra a seta; o título já é o link.
  it('a seta de link aparece só no cartão ativo', () => {
    movimentoReduzido(false)
    const { container } = montar()
    const setas = container.querySelectorAll('.v3-cartao__seta')
    expect(setas.length).toBeLessThanOrEqual(1)
    for (const seta of setas) expect(seta.closest('.v3-cartao')).toHaveClass('is-ativo')
  })

  it('com movimento reduzido (grade parada, nenhum ativo) não há seta em cartão nenhum', () => {
    movimentoReduzido(true)
    const { container } = montar()
    expect(container.querySelectorAll('.v3-cartao__seta')).toHaveLength(0)
  })

  it('o foco do teclado num cartão leva a página até o passo dele', () => {
    movimentoReduzido(false)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    const rolagens: number[] = []
    const scrollToOriginal = window.scrollTo
    window.scrollTo = ((op: ScrollToOptions) => {
      rolagens.push(op.top ?? 0)
    }) as typeof window.scrollTo
    const { container } = montar()
    const trilho = container.querySelector<HTMLElement>('.v3-recursos__trilho')!
    trilho.getBoundingClientRect = () =>
      ({ top: 1000, height: 4500, bottom: 5500, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    const link = within(cartoes(container)[2]).getByRole('link')
    fireEvent.focus(link)
    window.scrollTo = scrollToOriginal
    expect(rolagens).toHaveLength(1)
    // topo da faixa (1000 + scrollY 0) + (2,5 / 6) do curso (4500 − 900)
    expect(rolagens[0]).toBeCloseTo(1000 + (2.5 / 6) * 3600, 0)
  })

  it('com movimento reduzido: grade parada, sem faixa presa nem palco de tela', () => {
    movimentoReduzido(true)
    const { container } = montar()
    expect(container.querySelector('.v3-recursos')).toHaveClass('is-parado')
    expect(container.querySelector('.v3-recursos__trilho')).toBeNull()
    expect(container.querySelector('.v3-recursos__tela')).toBeNull()
    const lista = cartoes(container)
    expect(lista).toHaveLength(6)
    for (const el of lista) expect(el).not.toHaveAttribute('aria-current')
  })

  /* Pedido do dono de 21/10/2026: a coluna ao lado dos cartões deixa de ser o
     olho/forma de partículas e passa a mostrar a TELA REAL do app do cartão
     ativo (o produto de verdade, não um efeito). */
  describe('a tela real do cartão ativo', () => {
    const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
    const imagens = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLImageElement>('.v3-recursos__tela img'))
    const ativaDoPalco = (c: HTMLElement) => c.querySelector<HTMLElement>('.v3-recursos__tela .is-ativa')

    it('começa na tela do cartão 01 (o teclado): o texto alternativo dela, tamanho reservado e carregamento preguiçoso', () => {
      movimentoReduzido(false)
      const { container } = montar()
      const [img] = imagens(container)
      expect(img).toHaveAttribute('src', '/media/telas/teclado.webp')
      expect(img.getAttribute('alt')).toMatch(/teclado/i)
      expect(img).toHaveAttribute('width', '1600')
      expect(img).toHaveAttribute('height', '900')
      expect(img).toHaveAttribute('loading', 'lazy')
      expect(ativaDoPalco(container)).toContainElement(img)
      // Só a tela do cartão ativo está no palco: as outras ainda não foram vistas (e não baixam).
      expect(imagens(container)).toHaveLength(1)
    })

    it('ao mudar o cartão ativo a tela troca: só a do cartão ativo fala ao leitor de tela; a anterior fica por baixo', async () => {
      movimentoReduzido(false)
      const { container } = montar()
      rolarAte(container, 1)
      await waitFor(() => expect(ativo(container)).toBe(1))
      const lista = imagens(container)
      expect(lista.map((img) => img.getAttribute('src'))).toEqual(['/media/telas/teclado.webp', '/media/telas/emergencia.webp'])
      const [teclado, emergencia] = lista
      expect(ativaDoPalco(container)).toContainElement(emergencia)
      expect(emergencia.getAttribute('alt')).toMatch(/emergência/i)
      expect(emergencia).toHaveAttribute('width', '1600')
      expect(emergencia).toHaveAttribute('height', '900')
      expect(emergencia).toHaveAttribute('loading', 'lazy')
      // a do teclado ficou para trás: fora do leitor de tela, esperando a nova carregar
      expect(teclado).toHaveAttribute('alt', '')
      expect(teclado.closest('[aria-hidden="true"]')).not.toBeNull()
      expect(container.querySelector('.v3-recursos__tela .is-anterior')).toContainElement(teclado)
    })

    it('a tela só troca quando o cartão ativo muda: rolar dentro do mesmo passo não mexe em nada', async () => {
      movimentoReduzido(false)
      const { container } = montar()
      rolarAte(container, 3, 0.1)
      await waitFor(() => expect(ativo(container)).toBe(3))
      const antes = imagens(container)
      const html = container.querySelector('.v3-recursos__tela')!.innerHTML
      for (const dentro of [0.3, 0.5, 0.9]) rolarAte(container, 3, dentro)
      expect(ativo(container)).toBe(3)
      expect(imagens(container)).toEqual(antes) // os mesmos elementos, na mesma ordem
      expect(container.querySelector('.v3-recursos__tela')!.innerHTML).toBe(html)
    })

    it('cada cartão tem a tela dele: socorro, quem cuida (no celular), privacidade e voz', async () => {
      movimentoReduzido(false)
      const { container } = montar()
      const esperado: [number, string, RegExp][] = [
        [1, '/media/telas/emergencia.webp', /emergência/i],
        [2, '/media/cuidador/conversa.webp', /cuidador/i],
        [3, '/media/telas/preparo.webp', /nunca sai|c[âa]mera/i],
        [4, '/media/telas/voz.webp', /voz/i],
      ]
      for (const [i, src, alt] of esperado) {
        rolarAte(container, i)
        await waitFor(() => expect(ativo(container)).toBe(i))
        const img = ativaDoPalco(container)!.querySelector('img')!
        expect(img, `cartão ${i + 1}`).toHaveAttribute('src', src)
        expect(img.getAttribute('alt'), `cartão ${i + 1}`).toMatch(alt)
      }
    })

    it('a captura do app do cuidador vai numa moldura de celular, na proporção dela (sem pulo de layout)', async () => {
      movimentoReduzido(false)
      const { container } = montar()
      rolarAte(container, 2)
      await waitFor(() => expect(ativo(container)).toBe(2))
      const tela = ativaDoPalco(container)!
      expect(tela.querySelector('.celular__moldura')).not.toBeNull()
      const img = tela.querySelector('img')!
      expect(img).toHaveAttribute('width', '784')
      expect(img).toHaveAttribute('height', '1544')
      // o monitor, não
      rolarAte(container, 1)
      await waitFor(() => expect(ativo(container)).toBe(1))
      expect(ativaDoPalco(container)!.querySelector('.celular__moldura')).toBeNull()
    })

    it('"Mostrar onde dói" não tem captura: nada é inventado, um painel sóbrio com o nome do recurso, sem "Em breve"', async () => {
      movimentoReduzido(false)
      const { container } = montar()
      rolarAte(container, 5)
      await waitFor(() => expect(ativo(container)).toBe(5))
      const painel = ativaDoPalco(container)!
      expect(painel.querySelector('img')).toBeNull()
      // o recurso sai na beta.12: o painel não diz "em breve" ao lado de um cartão que diz "faz hoje"
      expect(painel).not.toHaveTextContent(/em breve/i)
      expect(painel).toHaveTextContent(RECURSOS_DO_OLHAR[5].titulo)
      expect(painel.closest('[aria-hidden="true"]')).not.toBeNull()
    })

    it('o painel e as telas ficam sempre no mesmo retângulo reservado (o CSS dá o tamanho do palco, não a imagem)', () => {
      const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'cartoes.css'), 'utf8')
      expect(css).toMatch(/\.v3-recursos__tela\s*\{[^}]*(height|aspect-ratio)\s*:/)
      expect(css).toMatch(/\.v3-tela\s*\{[^}]*position:\s*absolute/)
    })

    /* Conferido em captura (21/10/2026): num celular, e num computador de janela
       baixa, o texto do cartão "Pedir socorro" e a nota do mapa da dor passavam do
       pé do cartão, que tinha altura fixa e o texto do que não está ativo fora do
       fluxo (position: absolute). O jsdom não faz layout: o que se guarda aqui é
       a regra do CSS — a altura do cartão é um MÍNIMO e o texto de todos fica no
       fluxo, então o cartão tem a altura do mais alto, em qualquer largura. */
    it('o cartão cresce com o texto: altura mínima (não fixa) e o texto dos cartões de lado no fluxo', () => {
      const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'cartoes.css'), 'utf8')
      const cartao = css.match(/\n\.v3-cartao\s*\{([^}]*)\}/)
      expect(cartao, 'regra .v3-cartao').not.toBeNull()
      expect(cartao![1]).toMatch(/min-height\s*:\s*var\(--cartao-h\)/)
      expect(cartao![1]).not.toMatch(/(^|[;\s])height\s*:/)
      const corpo = css.match(/\n\.v3-cartao__corpo\s*\{([^}]*)\}/)
      expect(corpo, 'regra .v3-cartao__corpo').not.toBeNull()
      expect(corpo![1]).not.toMatch(/position\s*:\s*absolute/)
      // o texto invisível dos cartões de lado segura o espaço, mas não é clicável
      expect(corpo![1]).toMatch(/pointer-events\s*:\s*none/)
    })

    /* A troca da tela real (21/10/2026, pedido do dono: mais animação, ligada ao
       conteúdo): responde à troca de cartão com um cross-fade e uma escala leve
       — a que sai encolhe um pouco ao esmaecer, a que entra assenta no
       tamanho. Só opacity e transform; com movimento reduzido nem há palco
       (a grade parada) e a regra global zera as transições. */
    it('a troca da tela é um cross-fade com escala leve, curto, só com opacity e transform', () => {
      const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'cartoes.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      const base = css.match(/\n\.v3-tela\s*\{([^}]*)\}/)![1]
      expect(base).toMatch(/opacity:\s*0/)
      const escala = base.match(/transform:\s*scale\(([\d.]+)\)/)
      expect(escala, 'a tela que não é a ativa está um pouco menor').not.toBeNull()
      expect(Number(escala![1])).toBeGreaterThanOrEqual(0.95)
      expect(Number(escala![1])).toBeLessThan(1)
      const transicao = base.match(/transition:([^;]*);/)![1]
      expect(transicao).toMatch(/opacity/)
      expect(transicao).toMatch(/transform/)
      expect(transicao).not.toMatch(/width|height|top|left|margin|padding/)
      const duracoes = Array.from(transicao.matchAll(/(\d+)ms/g)).map((m) => Number(m[1]))
      expect(Math.max(...duracoes)).toBeLessThanOrEqual(600)
      // A que está à vista (ativa e a que ainda sai) volta ao tamanho inteiro.
      expect(css).toMatch(/\.v3-tela\.is-ativa\.is-pronta\s*\{[^}]*transform:\s*none/)
      expect(css).toMatch(/\.v3-tela\.is-anterior\.is-pronta\s*\{[^}]*transform:\s*none/)
    })

    it('todas as telas apontadas pelos cartões existem em public/media', () => {
      for (const item of RECURSOS_DO_OLHAR) {
        if (!item.tela) continue
        expect(existsSync(resolve(SITE, 'public', item.tela.src.replace(/^\//, ''))), item.tela.src).toBe(true)
        expect(item.tela.alt.length, item.tela.src).toBeGreaterThan(20)
      }
      // só um cartão fica sem tela, e é o que chega na próxima versão
      expect(RECURSOS_DO_OLHAR.filter((r) => !r.tela).map((r) => r.id)).toEqual(['dor'])
    })

    it('com movimento reduzido cada cartão mostra a sua tela pequena, no lugar da forma em pontos', () => {
      movimentoReduzido(true)
      const { container } = montar()
      const lista = cartoes(container)
      lista.forEach((el, i) => {
        const img = el.querySelector<HTMLImageElement>('img')
        const item = RECURSOS_DO_OLHAR[i]
        if (!item.tela) {
          expect(img, `cartão ${i + 1}`).toBeNull()
          return
        }
        expect(img, `cartão ${i + 1}`).not.toBeNull()
        expect(img).toHaveAttribute('src', item.tela.src)
        expect(img!.getAttribute('alt')).toBe(item.tela.alt)
        expect(img).toHaveAttribute('width', String(item.tela.largura))
        expect(img).toHaveAttribute('height', String(item.tela.altura))
        expect(img).toHaveAttribute('loading', 'lazy')
      })
      expect(container.querySelector('svg.v3-forma-estatica')).toBeNull()
    })
  })

  /* Revisão de 21/10/2026 (I3): os cartões que já saíram de cena ficam
     invisíveis (opacity 0) mas continuavam sobre a coluna das partículas e
     recebiam o clique — clicar na figura jogava a página dois ou mais passos
     para trás. Invisível não é clicável. */
  describe('cartões que já passaram', () => {
    const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'cartoes.css'), 'utf8')

    it('o CSS tira o clique do cartão passado (e não o tira da ordem de tabulação)', () => {
      const regra = CSS.match(/\.v3-cartao\.is-passado\s*\{([^}]*)\}/)
      expect(regra, 'regra .v3-cartao.is-passado').not.toBeNull()
      expect(regra![1]).toMatch(/pointer-events:\s*none/)
      // visibility:hidden ou display:none tirariam os links do Tab: o caminho
      // do teclado até um passo anterior precisa continuar.
      expect(regra![1]).not.toMatch(/visibility:\s*hidden|display:\s*none/)
      // E o cursor de "clicável" não vale para ele.
      expect(CSS).toMatch(/\.v3-cartao:not\(\.is-ativo\):not\(\.is-parado\):not\(\.is-passado\)\s*\{[^}]*cursor:\s*pointer/)
    })

    it('clicar num cartão passado não rola a página; clicar num cartão à frente rola', async () => {
      movimentoReduzido(false)
      const rolagens: number[] = []
      const scrollToOriginal = window.scrollTo
      window.scrollTo = ((op: ScrollToOptions) => {
        rolagens.push(op.top ?? 0)
      }) as typeof window.scrollTo
      try {
        const { container } = montar()
        rolarAte(container, 4)
        await waitFor(() => expect(ativo(container)).toBe(4))
        const lista = cartoes(container)
        expect(lista.slice(0, 4).every((el) => el.classList.contains('is-passado'))).toBe(true)
        expect(lista[4]).not.toHaveClass('is-passado')

        fireEvent.click(lista[1])
        fireEvent.click(lista[3])
        expect(rolagens).toHaveLength(0)

        fireEvent.click(lista[5])
        expect(rolagens).toHaveLength(1)
      } finally {
        window.scrollTo = scrollToOriginal
      }
    })

    it('o foco do teclado num cartão passado ainda leva a página até o passo dele', async () => {
      movimentoReduzido(false)
      const rolagens: number[] = []
      const scrollToOriginal = window.scrollTo
      window.scrollTo = ((op: ScrollToOptions) => {
        rolagens.push(op.top ?? 0)
      }) as typeof window.scrollTo
      try {
        const { container } = montar()
        rolarAte(container, 4)
        await waitFor(() => expect(ativo(container)).toBe(4))
        fireEvent.focus(within(cartoes(container)[1]).getByRole('link'))
        expect(rolagens).toHaveLength(1)
      } finally {
        window.scrollTo = scrollToOriginal
      }
    })
  })
})

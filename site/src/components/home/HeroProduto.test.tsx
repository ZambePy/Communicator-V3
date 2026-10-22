import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { HeroProduto } from './HeroProduto'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'
import { BETA_CTA, HERO } from '@/data/content'

/* A abertura da home: antes do lançamento a chamada é a da beta, com o dia;
   depois, "Baixar grátis". O dono recusou (21/10/2026) a grade, o feixe de
   luz, a marca d'água, o olho de partículas e a aurora — o título e o texto
   ficam sobre o marinho da marca e o produto de verdade (o monitor da seção
   seguinte) é o visual. Depois de aprovar esse desenho, pediu efeitos de fundo
   e animações (21/10/2026, 21:53): entraram só os que nascem do produto — o
   campo dos 13 pontos da calibração, quase invisível, atrás do texto, e o
   título que se fecha como o anel de fixação. O teclado animado está em "Como
   funciona". */

const { apiFake } = vi.hoisted(() => ({ apiFake: { programa: null as BetaProgram | null } }))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA }
})

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <HeroProduto />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  esquecerBetaProgram()
})

describe('<HeroProduto />', () => {
  it('antes do lançamento: título, chamada da beta e o dia do download', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
    montar()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(HERO.title)
    // A data do banco chega depois da reserva (que já é depois do lançamento).
    expect(await screen.findByText(/Download a partir de 10 de novembro/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: BETA_CTA.label })).toHaveAttribute('href', BETA_CTA.to)
  })

  it('depois do lançamento: um selo só, "Beta gratuita para Windows", e "Baixar grátis" leva a /baixar', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2020-11-10T03:00:00Z' }
    const { container } = montar()
    expect(await screen.findByRole('link', { name: 'Baixar grátis' })).toHaveAttribute('href', '/baixar')
    const pilula = container.querySelector('.aviso-pilula')!
    expect(pilula.querySelectorAll('.etiqueta-lancamento')).toHaveLength(1)
    expect(pilula.querySelector('.etiqueta-lancamento--liberada')).toHaveTextContent('Beta gratuita para Windows')
    // a mesma ideia não é dita duas vezes na primeira tela (auditoria P2-6)
    expect(pilula).not.toHaveTextContent('Download gratuito')
    expect(pilula).not.toHaveTextContent('Beta liberada')
  })

  it('a primeira tela diz para quem é: ELA, AVC e lesão medular, antes de dizer como funciona (P1-1)', () => {
    const { container } = montar()
    const lead = container.querySelector('.hero-produto__lead')!
    expect(lead.querySelector('.hero-produto__publico')).toHaveTextContent(/perdeu a fala e o movimento/)
    expect(lead).toHaveTextContent(/ELA/)
    expect(lead).toHaveTextContent(/AVC/)
    expect(lead).toHaveTextContent(/lesão medular/)
    // para quem vem primeiro; "webcam" só uma vez na primeira tela
    expect(lead.textContent!.indexOf('ELA')).toBeLessThan(lead.textContent!.indexOf('webcam'))
    expect(container.textContent!.match(/webcam/gi)).toHaveLength(1)
  })

  it('o título mistura os pesos: o olhar leve, a voz pesada — e lê a frase inteira', () => {
    const { container } = montar()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent?.replace(/\s+/g, ' ').trim()).toBe(HERO.title)
    expect(h1.querySelector('.hero-produto__leve')).toHaveTextContent(HERO.tituloLeve)
    expect(h1.querySelector('.hero-produto__forte')).toHaveTextContent(HERO.title.slice(HERO.tituloLeve.length).trim())
    // Sem palavra em outra cor.
    expect(container.querySelector('h1 .accent-text, h1 .gradient-text')).toBeNull()
  })

  it('os efeitos recusados continuam fora: sem grade, feixe de luz, marca d\'água, olho de partículas nem aurora', () => {
    const { container } = montar()
    const secao = container.querySelector('section.hero-produto')!
    for (const seletor of ['.v3-grade', '.v3-feixe', '.v3-marca-dagua', '.v3-particulas', '.v3-ancora', '.v3-aurora', '[data-particulas]', 'canvas']) {
      expect(secao.querySelector(seletor), seletor).toBeNull()
    }
    expect(secao).not.toHaveAttribute('data-particulas-secao')
    expect(secao.querySelector('.olhar, .olhar__grade, video')).toBeNull()
  })

  it('o único efeito de fundo é o campo dos 13 pontos da calibração: atrás do texto, decorativo, sem nada no foco', () => {
    const { container } = montar()
    const secao = container.querySelector('section.hero-produto')!
    const campo = secao.querySelector('.v3-campo')!
    expect(campo).not.toBeNull()
    expect(campo).toHaveAttribute('aria-hidden', 'true')
    expect(campo.querySelectorAll('.v3-campo__ponto')).toHaveLength(13)
    // Vem antes do texto (fica atrás) e é o único SVG da abertura além dos ícones dos botões.
    expect(secao.firstElementChild).toBe(campo)
    expect(Array.from(secao.querySelectorAll('svg')).filter((s) => !campo.contains(s) && !s.closest('.btn'))).toEqual([])
    expect(campo.querySelector('a, button, input, [tabindex]')).toBeNull()
    // O texto continua com o mesmo conteúdo e o título na mesma árvore.
    expect(secao.querySelector('.hero-produto__grade h1')).not.toBeNull()
  })

  it('o título fica à esquerda; o parágrafo, as chamadas e os fatos num bloco só, à direita', () => {
    const { container } = montar()
    const grade = container.querySelector('.hero-produto__grade')!
    const filhos = Array.from(grade.children).map((el) => el.className.split(' ')[el.className.includes('aviso-pilula') ? 1 : 0])
    expect(filhos).toEqual(['hero-produto__aviso', 'hero-produto__titulo', 'hero-produto__apoio'])
    const apoio = grade.querySelector('.hero-produto__apoio')!
    expect(Array.from(apoio.children).map((el) => el.className)).toEqual(['hero-produto__lead', 'hero-produto__acoes', 'hero-produto__fatos'])
    const fatos = Array.from(apoio.querySelectorAll('.hero-produto__fatos li')).map((li) => li.textContent)
    expect(fatos).toEqual(['A imagem da câmera fica no computador', 'Windows 10 e 11'])
    expect(apoio.querySelector('.hero-produto__fatos')).toHaveAttribute('aria-label', 'Em resumo')
  })

  it('a altura da abertura é a do conteúdo, não a da tela (o monitor da seção seguinte aparece na primeira tela)', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'hero-produto.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/min-height\s*:\s*100(s|d|l)?vh/)
    expect(css).not.toMatch(/(^|[^-])height\s*:\s*100(s|d|l)?vh/)
    expect(css).not.toMatch(/gradient|filter|blur|box-shadow/)
  })

  /* A entrada do título (21/10/2026): "Seu olhar" aparece e "tem voz" se fecha
     da esquerda para a direita, como o anel de fixação, uma vez. É um recorte,
     não uma cor — nenhuma palavra muda de cor (pedido do dono). */
  describe('a entrada do título', () => {
    const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'hero-produto.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const bloco = (nome: string) => css.match(new RegExp(`@keyframes ${nome}\\s*\\{(?:[^{}]*\\{[^{}]*\\})*[^{}]*\\}`))![0]

    it('"tem voz" é recortado da esquerda para a direita em ~600 ms; "Seu olhar" só aparece', () => {
      expect(css).toMatch(/\.hero-produto__forte\s*\{[^}]*animation:\s*titulo-fecha\s+600ms/)
      expect(css).toMatch(/\.hero-produto__leve\s*\{[^}]*animation:\s*titulo-aparece/)
      const fecha = bloco('titulo-fecha')
      expect(fecha).toMatch(/from\s*\{[^}]*clip-path:\s*inset\([^)]*100%/)
      expect(Array.from(fecha.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1]).filter((p) => p !== 'clip-path')).toEqual([])
      const aparece = bloco('titulo-aparece')
      expect(Array.from(aparece.matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1]).every((p) => p === 'opacity' || p === 'transform')).toBe(true)
    })

    it('nenhuma palavra muda de cor na entrada', () => {
      expect(bloco('titulo-fecha')).not.toMatch(/color|background/)
      expect(bloco('titulo-aparece')).not.toMatch(/color|background/)
    })

    it('uma vez só: sem repetição, e o recorte passa da caixa do texto (a ponta das letras não é cortada)', () => {
      expect(css).not.toMatch(/animation[^;]*infinite/)
      expect(bloco('titulo-fecha')).toMatch(/to\s*\{[^}]*inset\(-\d+%\s+-\d+%\s+-\d+%\s+-\d+%\)/)
    })

    it('com movimento reduzido: o título já inteiro, sem atraso', () => {
      const reduzido = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/)![0]
      expect(reduzido).toMatch(/\.hero-produto__forte[\s\S]*animation:\s*none/)
      expect(reduzido).toMatch(/\.hero-produto__leve/)
    })
  })

  it('as chamadas escondem a barra fixa do celular enquanto estão na tela', () => {
    const { container } = montar()
    expect(container.querySelector('.hero-produto__acoes')).toHaveAttribute('data-sticky-hide')
  })

  it('a chamada principal é uma chamada (com o aro de fixação); a secundária, não', () => {
    const { container } = montar()
    const [principal, secundaria] = Array.from(container.querySelectorAll('.hero-produto__acoes .btn'))
    expect(principal).toHaveClass('btn--chamada')
    expect(secundaria).not.toHaveClass('btn--chamada')
  })
})

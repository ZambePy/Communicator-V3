import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from './Home'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA, BETA_PLAN, HERO, PLANS } from '@/data/content'
import { CONDICOES_NA_HOME, CONTRASTE, DEMO_COMMUNICATOR, TECLADO_DO_PALCO, TESTE_AO_VIVO } from '@/data/home'
import { RESSALVA_DOS_ALERTAS } from '@/data/cuidador'
import { MODULOS_EM_TELA } from '@/data/produto'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

/* A home do redesenho de 31/10/2026, na identidade escura da IrisFlow: a
   abertura com o teclado em demonstração (ilustração parada), a gravação real
   com os três passos e o teste com o olhar, as telas do app, o preço no azul
   da marca, as seis condições numa lista, quem cuida, a beta com as perguntas
   e o fecho. Saíram os seis cartões numerados, o arco das condições e o fundo
   vivo da abertura e da chamada. */

const { apiFake } = vi.hoisted(() => ({ apiFake: { programa: null as BetaProgram | null } }))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA }
})

function montar() {
  return render(
    <MemoryRouter future={FUTURO_DO_ROTEADOR}>
      <Home />
    </MemoryRouter>,
  )
}

/* O cliente do Supabase avisa UMA vez por carregamento do módulo que não está
   configurado (nos testes as variáveis ficam vazias de propósito). É o único
   aviso esperado aqui, e no máximo um. */
let avisos: MockInstance<typeof console.warn>
let totalDeAvisos = 0

beforeEach(() => {
  esquecerBetaProgram()
  apiFake.programa = null
  avisos = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  for (const [texto] of avisos.mock.calls) expect(String(texto)).toMatch(/^\[IrisFlow\] Supabase sem configuração/)
  totalDeAvisos += avisos.mock.calls.length
  avisos.mockRestore()
})

afterAll(() => {
  expect(totalDeAvisos).toBeLessThanOrEqual(1)
})

const secoes = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('.home > section, .home > div > div > section'))

describe('<Home /> (redesenho de 31/10/2026)', () => {
  it('as seções na ordem do desenho aprovado', () => {
    const { container } = montar()
    const titulos = Array.from(container.querySelectorAll('h1, h2')).map((h) => h.textContent?.trim())
    expect(titulos).toEqual([
      HERO.title,
      'Feito para ser usado só com os olhos.',
      'As telas do aplicativo.',
      CONTRASTE.titulo,
      'Quando o corpo para, o olhar continua.',
      'Quem cuida acompanha de qualquer lugar.',
      'Na beta, tudo é grátis.',
      'O que as famílias mais perguntam.',
      'A pessoa continua lá. Só falta a voz.',
    ])
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(secoes(container).length).toBeGreaterThanOrEqual(7)
  })

  it('a abertura: o h1 inteiro, o texto com para quem é, as duas chamadas e os fatos', async () => {
    montar()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Seu olhar tem voz.')
    const abertura = h1.closest('section')!
    expect(within(abertura).getByText(HERO.lead)).toBeInTheDocument()
    expect(HERO.lead).toMatch(/perdeu a fala e o movimento/)
    // Depois do lançamento (a reserva: 29/09/2026), a chamada é o download.
    const principal = await within(abertura).findByRole('link', { name: 'Baixar grátis para Windows' })
    expect(principal).toHaveAttribute('href', '/baixar')
    expect(principal).toHaveClass('btn--chamada')
    const secundaria = within(abertura).getByRole('link', { name: HERO.secondary })
    expect(secundaria).toHaveAttribute('href', '/como-funciona')
    expect(secundaria).not.toHaveClass('btn--chamada')
    expect(principal.closest('[data-sticky-hide]')).not.toBeNull()
    const fatos = within(within(abertura).getByRole('list', { name: 'Em resumo' })).getAllByRole('listitem')
    expect(fatos.map((f) => f.textContent)).toEqual([HERO.fatoDaBeta, ...HERO.fatos])
  })

  it('antes do lançamento, a chamada da abertura leva à inscrição na beta', async () => {
    apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
    montar()
    const abertura = screen.getByRole('heading', { level: 1 }).closest('section')!
    expect(await within(abertura).findByRole('link', { name: 'Entrar na beta' })).toHaveAttribute('href', '/beta')
    expect(within(abertura).queryByRole('link', { name: /Baixar grátis/ })).toBeNull()
  })

  it('o teclado da abertura é só demonstração: uma imagem com nome, sem nada que receba foco', () => {
    const { container } = montar()
    const palco = container.querySelector<HTMLElement>('.palco')!
    expect(palco).toHaveAttribute('role', 'img')
    expect(palco).toHaveAttribute('aria-label', TECLADO_DO_PALCO.descricao)
    expect(palco.querySelector('a, button, input, [tabindex]')).toBeNull()
    expect(palco.querySelectorAll('.palco__tecla')).toHaveLength(6)
    expect(palco.querySelectorAll('.palco__tecla.is-alvo')).toHaveLength(1)
    expect(palco.querySelector('.palco__tecla.is-alvo')).toHaveTextContent('STUVWX')
    expect(palco.querySelector('.palco__frase')).toHaveTextContent(TECLADO_DO_PALCO.frase)
  })

  it('a gravação real com os três passos e o teste com o próprio olhar', () => {
    const { container } = montar()
    const demo = container.querySelector<HTMLElement>('#produto')!
    const video = demo.querySelector('video')!
    expect(Array.from(video.querySelectorAll('source')).map((s) => s.getAttribute('src'))).toEqual([
      DEMO_COMMUNICATOR.webm,
      DEMO_COMMUNICATOR.mp4,
    ])
    expect(video.closest('.monitor')).not.toBeNull()
    expect(within(demo).getAllByRole('button', { description: /mostrar no vídeo/i })).toHaveLength(3)
    expect(within(demo).getByRole('button', { name: TESTE_AO_VIVO.botao })).toBeInTheDocument()
    // Sem rótulo acima do título.
    expect(demo.querySelector('.eyebrow')).toBeNull()
  })

  it('as telas do app sem números (não são uma sequência) e as seis condições com a linha de cada uma', () => {
    const { container } = montar()
    expect(container.querySelectorAll('.v3-modulos__linha')).toHaveLength(MODULOS_EM_TELA.length)
    expect(container.querySelector('.v3-modulos__numero')).toBeNull()
    const condicoes = Array.from(container.querySelectorAll<HTMLAnchorElement>('.condicoes__link'))
    expect(condicoes).toHaveLength(CONDICOES_NA_HOME.length)
    condicoes.forEach((a, i) => {
      expect(a).toHaveTextContent(CONDICOES_NA_HOME[i].nome)
      expect(a).toHaveTextContent(CONDICOES_NA_HOME[i].linha)
      expect(a.getAttribute('href')).toBe(CONDICOES_NA_HOME[i].to)
      expect(CONDICOES_NA_HOME[i].to).toMatch(/^\/como-funciona#para-/)
    })
  })

  it('o preço no azul da marca, com o menor plano vindo dos dados', () => {
    const { container } = montar()
    const faixa = container.querySelector<HTMLElement>('.contraste-faixa')!
    expect(faixa).toHaveClass('home-faixa--azul')
    expect(faixa).toHaveTextContent(CONTRASTE.faixa.dedicado.valor)
    expect(faixa).toHaveTextContent(CONTRASTE.faixa.irisflow.valor)
    expect(faixa).toHaveTextContent(`a partir de R$ ${Math.min(...PLANS.map((p) => p.price))} por mês`)
  })

  it('quem cuida: a captura real da conversa, o cartão que chega (decoração) e as chamadas', () => {
    const { container } = montar()
    const faixa = screen.getByRole('heading', { name: 'Quem cuida acompanha de qualquer lugar.' }).closest('section')!
    const img = within(faixa).getByRole('img', { name: /Conversa no app IrisFlow Cuidador/ })
    expect(img).toHaveAttribute('src', '/media/cuidador/conversa.webp')
    expect(img).toHaveAttribute('width', '784')
    expect(img).toHaveAttribute('height', '1544')
    const chega = container.querySelector('.v3-chega--fora')!
    expect(chega).toHaveAttribute('aria-hidden', 'true')
    expect(chega).toHaveTextContent('Quero água.')
    expect(within(faixa).getByRole('link', { name: 'Conhecer o app' })).toHaveAttribute('href', '/cuidador')
    // Sem endereço de loja nem APK configurados nos testes: a reserva de antes (a disponibilidade em /cuidador).
    expect(within(faixa).getByRole('link', { name: 'Baixar o app para Android' })).toHaveAttribute('href', '/cuidador#disponibilidade')
  })

  /* Auditoria P2-14 (21/10/2026): a ressalva dos alertas entra uma vez só. Desde
     31/10/2026, na faixa de quem cuida (os cartões numerados saíram). */
  it('a ressalva dos alertas aparece uma vez só, na faixa de quem cuida', () => {
    const { container } = montar()
    const texto = (container.textContent ?? '').replace(/\s+/g, ' ')
    expect(texto.split(RESSALVA_DOS_ALERTAS).length - 1).toBe(1)
    expect(container.querySelector('.cuidador-destaque')).toHaveTextContent(RESSALVA_DOS_ALERTAS)
  })

  it('beta e planos sem mudança: R$ 0 até o fim da beta e os três preços previstos, dos dados', () => {
    expect(BETA).toEqual({
      ativo: true,
      versaoReserva: '1.0.0-beta.12',
      fimReserva: '2027-03-31T23:59:59-03:00',
      lancamentoReserva: '2026-09-29T21:50:00-03:00',
      sistemaDoLancamento: 'Windows',
    })
    expect(PLANS.map((p) => [p.id, p.name, p.price, p.purchasable])).toEqual([
      ['essencial', 'Essencial', 249, false],
      ['completo', 'Completo', 399, false],
      ['voz', 'Voz', 649, false],
    ])
    expect(BETA_PLAN.price).toBe(0)

    const { container } = montar()
    const cartao = container.querySelector<HTMLElement>('.plano-beta')!
    expect(within(cartao).getByRole('heading', { name: 'Na beta, tudo é grátis.' })).toBeInTheDocument()
    expect(cartao.querySelector('.plano-beta__preco')).toHaveTextContent('R$ 0até 31/03/2027')
    const precos = Array.from(cartao.querySelectorAll('.plano-beta__valor')).map((s) => s.textContent)
    expect(precos).toEqual(['R$ 249', 'R$ 399', 'R$ 649'])
  })

  it('as perguntas da home ao lado do cartão, com o link para todas', () => {
    montar()
    const faq = screen.getByRole('heading', { name: 'O que as famílias mais perguntam.' }).closest('section')!
    expect(within(faq).getAllByRole('button', { expanded: true })).toHaveLength(1)
    expect(within(faq).getByRole('link', { name: 'Ver todas as perguntas' })).toHaveAttribute('href', '/planos#perguntas')
  })

  it('o fecho: a frase grande e as duas chamadas, sem fundo vivo', async () => {
    const { container } = montar()
    const fecho = container.querySelector<HTMLElement>('section.cta')!
    expect(within(fecho).getByRole('heading', { level: 2 })).toHaveTextContent('A pessoa continua lá. Só falta a voz.')
    expect(await within(fecho).findByRole('link', { name: 'Baixar grátis para Windows' })).toHaveAttribute('href', '/baixar')
    expect(within(fecho).getByRole('link', { name: 'Falar com a equipe' })).toHaveAttribute('href', '/contato')
    expect(fecho.querySelector('.cta__lead')).toBeNull()
  })

  it('sem fundo vivo, sem canvas e nada que siga o mouse', () => {
    const { container } = montar()
    for (const seletor of ['.atmosfera', 'canvas', '.v3-campo', '.v3-cursor', '.v3-luz', '.calib', '.v3-cartao', '.v3-arco__item']) {
      expect(container.querySelector(seletor), seletor).toBeNull()
    }
  })

  it('o que é só desenho fica fora do leitor de tela e do foco', () => {
    const { container } = montar()
    for (const seletor of ['.v3-chega', 'svg.capitulos__fixa', '.monitor__pescoco']) {
      const achados = Array.from(container.querySelectorAll<HTMLElement>(seletor))
      expect(achados.length, seletor).toBeGreaterThan(0)
      for (const el of achados) {
        expect(el.getAttribute('aria-hidden'), seletor).toBe('true')
        expect(el.querySelector('a, button, input, select, textarea, [tabindex]'), seletor).toBeNull()
      }
    }
  })

  it('toda imagem tem largura e altura (sem salto de layout)', () => {
    const { container } = montar()
    for (const img of Array.from(container.querySelectorAll('img'))) {
      expect(img.getAttribute('width'), img.getAttribute('src') ?? '').toMatch(/^\d+$/)
      expect(img.getAttribute('height'), img.getAttribute('src') ?? '').toMatch(/^\d+$/)
    }
  })
})

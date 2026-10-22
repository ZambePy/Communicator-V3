import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from './Home'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA, BETA_PLAN, PLANS } from '@/data/content'
import { CONDICOES_NO_ARCO, DEMO_COMMUNICATOR, RECURSOS_DO_OLHAR, TESTE_AO_VIVO } from '@/data/home'
import { RESSALVA_DOS_ALERTAS } from '@/data/cuidador'
import { MODULOS_EM_TELA } from '@/data/produto'
import { FUTURO_DO_ROTEADOR } from '@/test/futuro-do-roteador'

/* A home (21/10/2026): a demonstração real é a seção logo abaixo da abertura,
   num monitor sem brilho; depois os seis cartões (com a tela real ao lado), os
   módulos, as condições no arco e a chamada final no azul da marca. O conteúdo
   de venda (beta e planos) não muda. O dono recusou o olho de partículas, a
   grade, o feixe, a marca d'água e a aurora; pediu depois (21/10/2026) efeitos
   de fundo e animações, e entraram os que nascem do produto — o campo dos 13
   pontos, a luz do olhar, o anel dos passos, o traço do arco, a frase que chega
   ao celular e o anel da chamada final. */

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => real.BETA_PROGRAM_RESERVA }
})

function montar() {
  return render(
    <MemoryRouter future={FUTURO_DO_ROTEADOR}>
      <Home />
    </MemoryRouter>,
  )
}

/* O cliente do Supabase avisa UMA vez por carregamento do módulo que não está
   configurado (nos testes as variáveis ficam vazias de propósito, ver
   vitest.config.ts). É o único aviso esperado aqui: espionado, afirmado e
   fora do stderr (revisão de 21/10/2026, M3). Qual teste dispara depende da
   ordem, então a regra é: nenhum aviso além desse, e no máximo um. */
let avisos: MockInstance<typeof console.warn>
let totalDeAvisos = 0

beforeEach(() => {
  esquecerBetaProgram()
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

describe('<Home /> v3', () => {
  it('a demonstração real é a seção logo depois da abertura, num monitor (sem brilho)', () => {
    const { container } = montar()
    const secoes = Array.from(container.querySelectorAll('main > section, .v3 > section'))
    expect(secoes[0].querySelector('h1')).not.toBeNull()
    const demo = secoes[1]
    const video = demo.querySelector('video')!
    expect(video).not.toBeNull()
    const fontes = Array.from(video.querySelectorAll('source')).map((s) => s.getAttribute('src'))
    expect(fontes).toEqual([DEMO_COMMUNICATOR.webm, DEMO_COMMUNICATOR.mp4])
    expect(video.closest('.monitor')).not.toBeNull()
    expect(demo.querySelector('.v3-monitor-brilho')).toBeNull()
    // Os capítulos continuam com a gravação.
    // (o botão de cada passo diz "Mostrar no vídeo" na descrição, não no nome: P3-13)
    const passos = within(demo as HTMLElement).getAllByRole('button', { description: /mostrar no vídeo/i })
    expect(passos).toHaveLength(3)
    // E o teste com o próprio olhar fica ali, atrás de um botão.
    expect(within(demo as HTMLElement).getByRole('button', { name: TESTE_AO_VIVO.botao })).toBeInTheDocument()
  })

  it('o teclado animado saiu da abertura (foi para Como funciona)', () => {
    const { container } = montar()
    expect(container.querySelector('.olhar__grade')).toBeNull()
  })

  it('os seis cartões, os módulos, o arco das condições e a chamada final', () => {
    const { container } = montar()
    expect(container.querySelectorAll('.v3-cartao')).toHaveLength(RECURSOS_DO_OLHAR.length)
    expect(container.querySelectorAll('.v3-modulos__linha')).toHaveLength(MODULOS_EM_TELA.length)
    expect(container.querySelectorAll('.v3-arco__item')).toHaveLength(CONDICOES_NO_ARCO.length)
    const chamada = container.querySelector('.v3-chamada-final')!
    expect(chamada).not.toBeNull()
    expect(within(chamada as HTMLElement).getByRole('heading', { level: 2 })).toHaveTextContent('A pessoa continua lá.')
    // O campo sólido: nenhuma aurora nem luz atrás dele.
    expect(chamada.querySelector('section.cta')).not.toBeNull()
    expect(chamada.querySelector('.v3-aurora, .v3-aurora__luz, svg.v3-aurora__onda')).toBeNull()
  })

  it('sem efeito de fundo na página inteira: nada de grade, feixe, marca d\'água, partículas nem aurora', () => {
    const { container } = montar()
    for (const seletor of ['.v3-grade', '.v3-feixe', '.v3-marca-dagua', '.v3-particulas', '.v3-ancora', '[data-particulas]', '[data-particulas-secao]', '.v3-aurora', 'canvas']) {
      expect(container.querySelector(seletor), seletor).toBeNull()
    }
  })

  it('os efeitos novos são só decoração: fora do leitor de tela, sem nada no foco, sem canvas nem WebGL', () => {
    const { container } = montar()
    for (const seletor of ['.v3-campo', '.v3-chega', 'svg.capitulos__fixa', '.v3-arco__curva', '.ilustracao--alvos']) {
      const achados = Array.from(container.querySelectorAll<HTMLElement>(seletor))
      expect(achados.length, seletor).toBeGreaterThan(0)
      for (const el of achados) {
        expect(el.getAttribute('aria-hidden'), seletor).toBe('true')
        expect(el.querySelector('a, button, input, select, textarea, [tabindex]'), seletor).toBeNull()
      }
    }
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('a abertura leva o campo dos 13 pontos atrás do texto; o resto da home não ganha outro', () => {
    const { container } = montar()
    expect(container.querySelectorAll('.v3-campo')).toHaveLength(1)
    expect(container.querySelector('section.hero-produto > .v3-campo')).not.toBeNull()
    expect(container.querySelectorAll('.v3-campo__ponto')).toHaveLength(13)
  })

  /* Auditoria P2-14 (21/10/2026): a ressalva dos alertas aparecia duas vezes na home (no
     cartão "Pedir socorro" e na seção do cuidador). Entra uma vez só, onde a promessa é feita
     pela primeira vez. O mapa da dor não tem mais ressalva (a beta.12 sai em 22/10/2026). */
  it('a ressalva dos alertas aparece uma vez só na home, e o mapa da dor não tem ressalva', () => {
    const { container } = montar()
    const texto = (container.textContent ?? '').replace(/\s+/g, ' ')
    const vezes = (trecho: string) => texto.split(trecho).length - 1
    expect(vezes(RESSALVA_DOS_ALERTAS)).toBe(1)
    expect(texto).not.toMatch(/próxima versão do instalador|chega na beta 12/i)
  })

  it('beta e planos sem mudança: a home diz que na beta tudo é grátis, com os preços previstos', () => {
    // O modo beta continua ligado e os valores de reserva são os mesmos.
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
    expect(screen.getByRole('heading', { name: 'Na beta, tudo é grátis.' })).toBeInTheDocument()
    const precos = Array.from(container.querySelectorAll('.plano-mini__preco strong')).map((s) => s.textContent)
    expect(precos).toEqual(['249', '399', '649'])
  })
})

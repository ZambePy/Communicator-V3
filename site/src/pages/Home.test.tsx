import { afterAll, afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Home from './Home'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA, BETA_PLAN, HERO, PLANS } from '@/data/content'
import { CONDICOES_NA_HOME, CONTRASTE, CUIDADOR_DESTAQUE, DEMO_COMMUNICATOR, DO_OLHAR_AO_CLIQUE, EQUIPE_NA_HOME, EXPERIMENTE, MEDIDO, PRIVACIDADE_EM_CAMADAS, PRANCHA, TESTE_AO_VIVO } from '@/data/home'
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

describe('<Home /> (redesenho de 01/11/2026)', () => {
  // A home inteira monta aqui (são onze faixas): com a suíte toda rodando junto, passa dos 8 s padrão.
  it('as seções na ordem do desenho aprovado', () => {
    const { container } = montar()
    const titulos = Array.from(container.querySelectorAll('h1, h2')).map((h) => h.textContent?.trim())
    expect(titulos).toEqual([
      HERO.title,
      EXPERIMENTE.titulo,
      'Feito para ser usado só com os olhos.',
      DO_OLHAR_AO_CLIQUE.titulo,
      'As telas do aplicativo.',
      CONTRASTE.titulo,
      MEDIDO.titulo,
      PRIVACIDADE_EM_CAMADAS.titulo,
      'Quando o corpo para, o olhar continua.',
      'O recado chega no celular.',
      EQUIPE_NA_HOME.titulo,
      'Na beta, tudo é grátis.',
      'O que as famílias mais perguntam.',
      'A pessoa continua lá. Só falta a voz.',
    ])
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(secoes(container).length).toBeGreaterThanOrEqual(7)
  }, 20000)

  it('do olhar ao clique: os cinco passos, cada um com título e texto, e o desenho fora do leitor de tela', () => {
    const { container } = montar()
    const secao = screen.getByRole('heading', { name: DO_OLHAR_AO_CLIQUE.titulo }).closest('section')!
    expect(within(secao).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(DO_OLHAR_AO_CLIQUE.passos.map((p) => p.titulo))
    expect(container.querySelector('.olhar-clique__visor')).toHaveAttribute('aria-hidden', 'true')
  })

  it('a privacidade: as três camadas sempre à vista, e escolher uma acende só ela', () => {
    montar()
    const secao = screen.getByRole('heading', { name: PRIVACIDADE_EM_CAMADAS.titulo }).closest('section')!
    const botoes = within(secao).getAllByRole('button')
    expect(botoes).toHaveLength(3)
    for (const c of PRIVACIDADE_EM_CAMADAS.camadas) expect(within(secao).getByText(c.texto)).toBeInTheDocument()
    botoes[1].click()
    return Promise.resolve().then(() => {
      expect(botoes[1]).toHaveAttribute('aria-current', 'true')
      expect(botoes[0]).not.toHaveAttribute('aria-current')
    })
  })

  it('a frase da prancha é só texto, num parágrafo, sem imagens no meio das palavras', () => {
    const { container } = montar()
    const frase = container.querySelector<HTMLElement>('.prancha__frase')!
    expect(frase.tagName).toBe('P')
    expect(frase.querySelectorAll('img')).toHaveLength(0)
    expect(frase).toHaveTextContent(PRANCHA.antes)
    expect(frase).toHaveTextContent(PRANCHA.depois)
  })

  it('o que foi medido sai sempre com a ressalva, no mesmo quadro', () => {
    montar()
    const secao = screen.getByRole('heading', { name: MEDIDO.titulo }).closest('section')!
    expect(within(secao).getByText(MEDIDO.ressalva)).toBeInTheDocument()
    expect(MEDIDO.ressalva).toMatch(/uma pessoa só/)
    expect(secao.querySelectorAll('.medido__valor')).toHaveLength(MEDIDO.marcas.length)
  })

  it('"Segure o olhar": quatro frases que se escolhem na hora com clique ou Enter, e o tempo do olhar parado se ajusta', async () => {
    const { container } = montar()
    const secao = screen.getByRole('heading', { name: EXPERIMENTE.titulo }).closest('section')!
    const alvos = within(secao).getAllByRole('button', { name: /^Estou/ })
    expect(alvos).toHaveLength(EXPERIMENTE.quantas)
    expect(within(secao).getByRole('radio', { name: '1,5 s' })).toBeChecked()
    alvos[0].click()
    expect(await within(secao).findByText(alvos[0].getAttribute('aria-label')!, { selector: 'strong' })).toBeInTheDocument()
    expect(container.querySelector('.experimente__prancha')).toHaveAttribute('data-ui')
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

  it('a abertura não tem o teclado desenhado nem a íris grande: o fundo vivo e o símbolo em volume, fora do leitor de tela, com botão de pausa', () => {
    const { container } = montar()
    const abertura = screen.getByRole('heading', { level: 1 }).closest('section')!
    expect(container.querySelector('.palco')).toBeNull()
    expect(abertura.querySelector('.iris-marca, .iris-viva, .campo')).toBeNull()
    expect(abertura.querySelector('.simbolo3d')).toHaveAttribute('aria-hidden', 'true')
    expect(abertura.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true')
    expect(within(abertura).getByRole('button', { name: 'Pausar o fundo' })).toHaveAttribute('aria-pressed', 'false')
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
    // Desde 01/11/2026 (segunda volta): uma aba por condição e um painel por aba, com a linha,
    // a tela do app e o link para a parte certa de /como-funciona. Só o painel da aba ativa à vista.
    const abas = within(container.querySelector<HTMLElement>('.para-quem')!).getAllByRole('tab')
    expect(abas).toHaveLength(CONDICOES_NA_HOME.length)
    expect(abas.filter((a) => a.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    const paineis = Array.from(container.querySelectorAll<HTMLElement>('.para-quem__painel'))
    expect(paineis).toHaveLength(CONDICOES_NA_HOME.length)
    expect(paineis.filter((p) => !p.hidden)).toHaveLength(1)
    paineis.forEach((p, i) => {
      expect(abas[i]).toHaveTextContent(CONDICOES_NA_HOME[i].nome)
      expect(p).toHaveTextContent(CONDICOES_NA_HOME[i].linha)
      expect(p.querySelector('a')!.getAttribute('href')).toBe(CONDICOES_NA_HOME[i].to)
      expect(CONDICOES_NA_HOME[i].to).toMatch(/^\/como-funciona#para-/)
    })
    // Sem as classes da página Como funciona, que vazavam para cá.
    expect(container.querySelector('.condicoes, .condicoes__item')).toBeNull()
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
    const faixa = screen.getByRole('heading', { name: 'O recado chega no celular.' }).closest('section')!
    const img = within(faixa).getByRole('img', { name: /Conversa no app IrisFlow Cuidador/ })
    expect(img).toHaveAttribute('src', '/media/cuidador/conversa.webp')
    expect(img).toHaveAttribute('width', '784')
    expect(img).toHaveAttribute('height', '1544')
    // As quatro funções: uma tela real e um controle ampliado (decoração) por função, uma ativa de cada vez.
    const controles = container.querySelector('.cuidador-destaque__controles')!
    expect(controles).toHaveAttribute('aria-hidden', 'true')
    expect(controles.querySelectorAll('.cuidador-destaque__controle')).toHaveLength(CUIDADOR_DESTAQUE.funcoes.length)
    expect(container.querySelectorAll('.cuidador-destaque__tela')).toHaveLength(CUIDADOR_DESTAQUE.funcoes.length)
    const funcoes = within(faixa).getAllByRole('button')
    expect(funcoes).toHaveLength(CUIDADOR_DESTAQUE.funcoes.length)
    expect(funcoes.filter((b) => b.getAttribute('aria-current') === 'true')).toHaveLength(1)
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

  it('o fecho: a frase grande e as duas chamadas', async () => {
    const { container } = montar()
    const fecho = container.querySelector<HTMLElement>('section.cta')!
    expect(within(fecho).getByRole('heading', { level: 2 })).toHaveTextContent('A pessoa continua lá. Só falta a voz.')
    expect(await within(fecho).findByRole('link', { name: 'Baixar grátis para Windows' })).toHaveAttribute('href', '/baixar')
    expect(within(fecho).getByRole('link', { name: 'Falar com a equipe' })).toHaveAttribute('href', '/contato')
    expect(fecho.querySelector('.cta__lead')).toBeNull()
  })

  /* 01/11/2026: o dono pediu um fundo vivo de volta. Ele existe só na abertura e
     no fecho (o fundo pontilhado), sempre fora do leitor de tela e com botão de
     pausa; o fundo antigo (manchas, aurora, os 13 pontos) continua fora. */
  it('o fundo vivo (partículas e raios) só na abertura e no fecho, cada um com pausa', () => {
    const { container } = montar()
    for (const seletor of ['.atmosfera', '.v3-campo', '.v3-cursor', '.v3-luz', '.calib', '.v3-cartao', '.v3-arco__item']) {
      expect(container.querySelector(seletor), seletor).toBeNull()
    }
    const campos = Array.from(container.querySelectorAll('.fundo-vivo'))
    expect(campos.map((c) => c.closest('section')?.className.split(' ')[0])).toEqual(['abertura', 'cta'])
    for (const campo of campos) {
      expect(campo.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true')
      // O botão de pausa: no canto, na abertura; junto das chamadas, no fecho.
      expect(campo.closest('section')!.querySelector('button[aria-pressed]')).not.toBeNull()
    }
  })

  it('o que é só desenho fica fora do leitor de tela e do foco', () => {
    const { container } = montar()
    for (const seletor of ['.cuidador-destaque__controles', 'svg.capitulos__fixa', '.monitor__pescoco']) {
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

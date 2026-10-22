import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PISCADA,
  aguardarPaginaNova,
  depoisDaPintura,
  interceptarParaPiscar,
  paginaNovaPronta,
  piscar,
  quandoTerminarem,
  trocaDePagina,
} from './piscada'

/* A piscada entre páginas: as pálpebras fecham no clique, a rota troca com
   elas fechadas e elas abrem sobre a página nova. Nada com movimento
   reduzido nem em âncora da mesma página. */

const AQUI = dirname(fileURLToPath(import.meta.url))

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('quando piscar', () => {
  it('só troca de página pisca: âncora e busca na mesma página não', () => {
    expect(trocaDePagina('/planos', '/')).toBe(true)
    expect(trocaDePagina('/planos#perguntas', '/')).toBe(true)
    expect(trocaDePagina('/planos#perguntas', '/planos')).toBe(false)
    expect(trocaDePagina('/planos?x=1', '/planos/')).toBe(false)
    expect(trocaDePagina('//outro.site/planos', '/')).toBe(false)
    expect(trocaDePagina('#topo', '/')).toBe(false)
  })

  it('intercepta só o clique comum num link para outra página, sem movimento reduzido', () => {
    const base = { href: '/cuidador', pathnameAtual: '/', botao: 0, comModificador: false, jaTratado: false, reduzido: false }
    expect(interceptarParaPiscar(base)).toBe(true)
    expect(interceptarParaPiscar({ ...base, reduzido: true })).toBe(false)
    expect(interceptarParaPiscar({ ...base, comModificador: true })).toBe(false)
    expect(interceptarParaPiscar({ ...base, botao: 1 })).toBe(false)
    expect(interceptarParaPiscar({ ...base, jaTratado: true })).toBe(false)
    expect(interceptarParaPiscar({ ...base, href: null })).toBe(false)
    expect(interceptarParaPiscar({ ...base, href: '/#produto' })).toBe(false)
  })
})

describe('esperar a página nova', () => {
  function montar(rota: string, conteudo: string) {
    document.body.innerHTML = `<main id="conteudo" data-rota="${rota}">${conteudo}</main>`
  }

  it('pronta quando o <main> é o da rota nova e não traz o esqueleto', () => {
    montar('/planos', '<section>Planos</section>')
    expect(paginaNovaPronta(document, '/planos')).toBe(true)
    expect(paginaNovaPronta(document, '/sobre')).toBe(false)
    montar('/planos', '<div class="route-fallback"></div>')
    expect(paginaNovaPronta(document, '/planos')).toBe(false)
  })

  it('resolve quando a página chega, e no teto se ela não chegar', async () => {
    montar('/', '<section>Home</section>')
    const chegou = aguardarPaginaNova('/planos', document, 2000)
    let pronto = false
    void chegou.then(() => (pronto = true))
    await Promise.resolve()
    expect(pronto).toBe(false)
    montar('/planos', '<section>Planos</section>')
    await chegou
    expect(pronto).toBe(true)

    vi.useFakeTimers()
    const nunca = aguardarPaginaNova('/sobre', document, PISCADA.esperaMaximaMs)
    let desistiu = false
    void nunca.then(() => (desistiu = true))
    await vi.advanceTimersByTimeAsync(PISCADA.esperaMaximaMs + 20)
    expect(desistiu).toBe(true)
  })

  it('a abertura espera a página nova ser pintada uma vez (dois quadros), com teto sem quadros', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    let pintou = false
    void depoisDaPintura(100).then(() => (pintou = true))
    await vi.advanceTimersByTimeAsync(17)
    expect(pintou).toBe(false)
    await vi.advanceTimersByTimeAsync(17)
    expect(pintou).toBe(true)
    // Numa aba escondida não há quadro nenhum: o teto abre assim mesmo.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const semQuadros = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
    let abriu = false
    void depoisDaPintura(100).then(() => (abriu = true))
    await vi.advanceTimersByTimeAsync(99)
    expect(abriu).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(abriu).toBe(true)
    semQuadros.mockRestore()
  })
})

describe('as pálpebras', () => {
  it('duas, de borda curva, numa capa decorativa: fecham no tempo da piscada, abrem e saem', async () => {
    vi.useFakeTimers()
    const { fechadas, abrir } = piscar(document)
    const capa = document.querySelector('.palpebras')!
    expect(capa).toHaveAttribute('aria-hidden', 'true')
    const lados = capa.querySelectorAll('svg')
    expect(Array.from(lados).map((s) => s.getAttribute('class'))).toEqual(['palpebras__cima', 'palpebras__baixo'])
    // A borda é uma curva (Q), não uma reta.
    for (const s of lados) expect(s.querySelector('path')!.getAttribute('d')).toMatch(/Q/)
    let fechou = false
    void fechadas.then(() => (fechou = true))
    await vi.advanceTimersByTimeAsync(PISCADA.fecharMs - 10)
    expect(fechou).toBe(false)
    await vi.advanceTimersByTimeAsync(20)
    expect(fechou).toBe(true)
    expect(capa).not.toHaveClass('is-abrindo')

    let abertas = false
    void abrir().then(() => (abertas = true))
    expect(capa).toHaveClass('is-abrindo')
    await vi.advanceTimersByTimeAsync(PISCADA.abrirMs - 10)
    expect(document.querySelector('.palpebras')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(20)
    expect(abertas).toBe(true)
    expect(document.querySelector('.palpebras')).toBeNull()
  })

  it('cada fase acaba quando a animação acaba de verdade (página ocupada), com teto', async () => {
    vi.useFakeTimers()
    // Uma animação que só termina quando o teste manda, e uma que é cancelada.
    let terminar: () => void = () => {}
    const atrasada = { finished: new Promise<void>((r) => (terminar = r)) }
    const el = { getAnimations: () => [atrasada] } as unknown as Element
    let acabou = false
    void quandoTerminarem(el, 160, 250).then(() => (acabou = true))
    await vi.advanceTimersByTimeAsync(200)
    // Pelo relógio já teria acabado; a animação, não.
    expect(acabou).toBe(false)
    terminar()
    await vi.advanceTimersByTimeAsync(0)
    expect(acabou).toBe(true)

    const nunca = { getAnimations: () => [{ finished: new Promise<void>(() => {}) }] } as unknown as Element
    let noTeto = false
    void quandoTerminarem(nunca, 160, 250).then(() => (noTeto = true))
    await vi.advanceTimersByTimeAsync(400)
    expect(noTeto).toBe(false)
    await vi.advanceTimersByTimeAsync(20)
    expect(noTeto).toBe(true)

    const cancelada = { getAnimations: () => [{ finished: Promise.reject(new Error('AbortError')) }] } as unknown as Element
    await expect(quandoTerminarem(cancelada, 160, 250)).resolves.toBeUndefined()
  })

  it('tirar leva a capa na hora, e abrir depois disso não a traz de volta', async () => {
    const { tirar, abrir } = piscar(document)
    tirar()
    expect(document.querySelector('.palpebras')).toBeNull()
    await abrir()
    expect(document.querySelector('.palpebras')).toBeNull()
  })

  it('o CSS da piscada só anima transform, nos tempos de PISCADA, e some com movimento reduzido', () => {
    const css = readFileSync(resolve(AQUI, '../../styles/animations.css'), 'utf8')
    const nomes = ['palpebra-desce', 'palpebra-sobe', 'palpebra-abre-cima', 'palpebra-abre-baixo']
    for (const nome of nomes) {
      const bloco = css.match(new RegExp(`@keyframes ${nome}\\s*\\{(?:[^{}]*\\{[^{}]*\\})*[^{}]*\\}`))
      expect(bloco, nome).not.toBeNull()
      const props = Array.from(bloco![0].matchAll(/([a-z-]+)\s*:/g)).map((m) => m[1])
      expect(props.every((p) => p === 'transform'), nome).toBe(true)
    }
    expect(css).toMatch(new RegExp(`palpebra-desce ${PISCADA.fecharMs}ms`))
    expect(css).toMatch(new RegExp(`palpebra-sobe ${PISCADA.fecharMs}ms`))
    expect(css).toMatch(new RegExp(`palpebra-abre-cima ${PISCADA.abrirMs}ms`))
    expect(css).toMatch(new RegExp(`palpebra-abre-baixo ${PISCADA.abrirMs}ms`))
    // Sem a View Transitions API: nada de captura da página.
    expect(css).not.toMatch(/view-transition/)
    const reduzido = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduzido).toMatch(/\.palpebras\s*\{\s*display:\s*none/)
  })
})

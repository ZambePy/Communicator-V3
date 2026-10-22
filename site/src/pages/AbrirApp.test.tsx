import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render as renderBase, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import AbrirApp from './AbrirApp'
import { __resetLatestReleaseForTests } from '@/lib/latestRelease'

/** O botão do APK consulta o último release (e pode ter link para o contato). */
const render = (ui: ReactElement) =>
  renderBase(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{ui}</MemoryRouter>)

/* /app é o endereço do código QR: cada celular vai para a sua loja. */

const { aparelho, lojas } = vi.hoisted(() => ({
  aparelho: { ios: false, android: false },
  lojas: {
    googlePlay: 'https://play.google.com/store/apps/details?id=br.com.irisflow.cuidador' as string | null,
    appStore: null as string | null,
    apk: null as string | null,
  },
}))

vi.mock('@/lib/aparelho', () => ({
  ehIOS: () => aparelho.ios,
  ehAndroid: () => aparelho.android,
  ehCelular: () => aparelho.ios || aparelho.android,
}))

vi.mock('@/lib/lojas', () => ({ LOJAS: lojas, SELOS_OFICIAIS: false, PACOTE_ANDROID: 'br.com.irisflow.cuidador' }))

// O botão do APK só abre depois do lançamento da beta: aqui, já lançada.
vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => ({ ...real.BETA_PROGRAM_RESERVA, launchAt: '2026-09-29T15:00:00Z' }) }
})

const replace = vi.fn()

beforeEach(() => {
  Object.assign(aparelho, { ios: false, android: false })
  lojas.appStore = null
  lojas.apk = null
  lojas.googlePlay = 'https://play.google.com/store/apps/details?id=br.com.irisflow.cuidador'
  replace.mockReset()
  Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true })
  // Sem rede nos testes: a consulta do release falha e vale o link configurado.
  window.sessionStorage.clear()
  __resetLatestReleaseForTests()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('/app', () => {
  it('no Android, vai direto para o Google Play', () => {
    aparelho.android = true
    render(<AbrirApp />)
    expect(replace).toHaveBeenCalledWith(lojas.googlePlay)
  })

  it('no Android, sem o app no Google Play ainda, vai para a disponibilidade (e não para a página "não encontrado")', () => {
    aparelho.android = true
    lojas.googlePlay = null
    render(<AbrirApp />)
    expect(replace).toHaveBeenCalledWith('/cuidador#disponibilidade')
  })

  it('no iPhone, sem o app na App Store ainda, vai para a disponibilidade', () => {
    aparelho.ios = true
    render(<AbrirApp />)
    expect(replace).toHaveBeenCalledWith('/cuidador#disponibilidade')
  })

  it('no iPhone, com o endereço da App Store, vai para a loja', () => {
    aparelho.ios = true
    lojas.appStore = 'https://apps.apple.com/br/app/irisflow-cuidador/id000'
    render(<AbrirApp />)
    expect(replace).toHaveBeenCalledWith(lojas.appStore)
  })

  it('no computador, fica e mostra os selos das duas lojas', () => {
    render(<AbrirApp />)
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Baixar no Google Play, para Android' })).toHaveAttribute('href', lojas.googlePlay)
    expect(screen.getByRole('link', { name: 'App Store, para iPhone: em breve' })).toHaveAttribute('href', '/cuidador#disponibilidade')
  })

  it('no Android, sem Google Play mas com o APK da beta, FICA e mostra o botão de baixar o APK', async () => {
    // Relato de 18/10/2026: pelo código QR, o Android caía numa seção da página
    // do app e o download não acontecia. Agora o botão do APK está aqui.
    aparelho.android = true
    lojas.googlePlay = null
    lojas.apk = 'https://github.com/ZambePy/Communicator-V3/releases/latest/download/IrisFlow-Cuidador.apk'
    render(<AbrirApp />)
    expect(replace).not.toHaveBeenCalled()
    const botao = await screen.findByRole('link', { name: /Baixar para Android/ })
    expect(botao).toHaveAttribute('href', lojas.apk)
    // Mesma aba: o arquivo vem como anexo e o navegador baixa sem sair da página.
    expect(botao).not.toHaveAttribute('target')
  })
})


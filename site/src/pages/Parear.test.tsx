import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Parear, { ESPERA_DO_APP_MS } from './Parear'

/* /parear: a ponte entre o QR do computador e o app do cuidador (19/10/2026). */

const CODIGO = 'Qx7_-k2LmN0pRsTuVwXyZ1a2b3c4d5e6f7g8h9i0jAB'
const APK = 'https://github.com/ZambePy/Communicator-V3/releases/latest/download/IrisFlow-Cuidador.apk'

const { aparelho, pareamento, lojas, abrir } = vi.hoisted(() => ({
  aparelho: { ios: false, android: false },
  pareamento: { codigo: null as string | null, embutido: false },
  lojas: { googlePlay: null as string | null, appStore: null as string | null, apk: null as string | null },
  abrir: vi.fn(),
}))

vi.mock('@/lib/aparelho', () => ({
  ehIOS: () => aparelho.ios,
  ehAndroid: () => aparelho.android,
  ehCelular: () => aparelho.ios || aparelho.android,
}))
vi.mock('@/lib/lojas', () => ({ LOJAS: lojas, SELOS_OFICIAIS: false, PACOTE_ANDROID: 'br.com.irisflow.cuidador' }))
vi.mock('@/lib/pareamento', async (original) => {
  const real = await original<typeof import('@/lib/pareamento')>()
  return {
    ...real,
    codigoCapturado: () => pareamento.codigo,
    emNavegadorDeOutroApp: () => pareamento.embutido,
    abrirNoApp: abrir,
  }
})
// O botão do APK só abre depois do lançamento da beta: aqui, já lançada.
vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => ({ ...real.BETA_PROGRAM_RESERVA, launchAt: '2026-09-29T15:00:00Z' }) }
})

let visivel: DocumentVisibilityState = 'visible'
const fetchEspiao = vi.fn(async () => new Response('{}'))

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(aparelho, { ios: false, android: false })
  Object.assign(pareamento, { codigo: null, embutido: false })
  Object.assign(lojas, { googlePlay: null, appStore: null, apk: APK })
  abrir.mockClear()
  visivel = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visivel })
  fetchEspiao.mockClear()
  vi.stubGlobal('fetch', fetchEspiao)
  window.location.hash = ''
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.location.hash = ''
})

function montar() {
  return render(
    <MemoryRouter initialEntries={['/parear']}>
      <Parear />
    </MemoryRouter>,
  )
}

async function esperar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('/parear', () => {
  it('Android com o código: abre o app sozinho pelo intent com o pacote, e o botão leva ao mesmo lugar', async () => {
    aparelho.android = true
    pareamento.codigo = CODIGO
    montar()
    expect(abrir).toHaveBeenCalledTimes(1)
    const link = abrir.mock.calls[0][0] as string
    expect(link.startsWith(`intent://parear?t=${CODIGO}#Intent;scheme=irisflow;package=br.com.irisflow.cuidador;`)).toBe(true)
    expect(link).toContain('S.browser_fallback_url=')
    expect(link.endsWith('%2Fparear%23sem-app;end')).toBe(true)
    expect(screen.getByRole('link', { name: /Abrir o IrisFlow Cuidador/ })).toHaveAttribute('href', link)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Abrindo o IrisFlow Cuidador…')
  })

  it('o app abriu (a página saiu da frente): nada de "não abriu"', async () => {
    aparelho.android = true
    pareamento.codigo = CODIGO
    montar()
    visivel = 'hidden'
    await esperar(ESPERA_DO_APP_MS + 100)
    expect(screen.queryByText('O app não abriu?')).toBeNull()
  })

  it('o app não abriu: explica e oferece o APK, e diz para gerar outro código depois de instalar', async () => {
    aparelho.android = true
    pareamento.codigo = CODIGO
    montar()
    await esperar(ESPERA_DO_APP_MS + 100)
    expect(screen.getByText('O app não abriu?')).toBeInTheDocument()
    await esperar(0)
    expect(screen.getByRole('link', { name: /Baixar para Android/ })).toHaveAttribute('href', APK)
    expect(screen.getAllByText(/gere um código novo no computador/).length).toBeGreaterThan(0)
  })

  it('iPhone: não tenta sozinho (o Safari mostraria um alerta de erro); o toque no botão abre o app', async () => {
    aparelho.ios = true
    pareamento.codigo = CODIGO
    montar()
    expect(abrir).not.toHaveBeenCalled()
    const botao = screen.getByRole('link', { name: /Abrir o IrisFlow Cuidador/ })
    expect(botao).toHaveAttribute('href', `irisflow://parear?t=${CODIGO}`)
    // Mesma aba: é a navegação para o app, não uma página nova.
    expect(botao).not.toHaveAttribute('target')
    // O jsdom não navega para outro app: o clique só não pode ir adiante.
    document.addEventListener('click', (e) => e.preventDefault(), { capture: true, once: true })
    fireEvent.click(botao)
    await esperar(ESPERA_DO_APP_MS + 100)
    expect(screen.getByText('O app não abriu?')).toBeInTheDocument()
    expect(screen.getByText(/ainda não está na App Store/)).toBeInTheDocument()
  })

  it('com o app nas lojas, o "não abriu" leva à loja do aparelho (e não afirma que falta na App Store)', async () => {
    lojas.googlePlay = 'https://play.google.com/store/apps/details?id=br.com.irisflow.cuidador'
    lojas.appStore = 'https://apps.apple.com/br/app/irisflow-cuidador/id000'
    aparelho.android = true
    pareamento.codigo = CODIGO
    const { unmount } = montar()
    await esperar(ESPERA_DO_APP_MS + 100)
    expect(screen.getByRole('link', { name: /Baixar no Google Play/ })).toHaveAttribute('href', lojas.googlePlay)
    expect(screen.queryByRole('link', { name: /Baixar para Android/ })).toBeNull()
    unmount()
    Object.assign(aparelho, { android: false, ios: true })
    montar()
    document.addEventListener('click', (e) => e.preventDefault(), { capture: true, once: true })
    fireEvent.click(screen.getByRole('link', { name: /Abrir o IrisFlow Cuidador/ }))
    await esperar(ESPERA_DO_APP_MS + 100)
    expect(screen.getByRole('link', { name: /Baixar na App Store/ })).toHaveAttribute('href', lojas.appStore)
    expect(screen.queryByText(/ainda não está na App Store/)).toBeNull()
  })

  it('navegador por dentro de outro app: não tenta abrir e pede para ler pela câmera do celular', () => {
    aparelho.android = true
    pareamento.codigo = CODIGO
    pareamento.embutido = true
    montar()
    expect(abrir).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: /Abrir o IrisFlow Cuidador/ })).toBeNull()
    expect(screen.getByText(/aponte a câmera do celular \(o app Câmera\)/)).toBeInTheDocument()
  })

  it('no computador: não tenta abrir app nenhum', () => {
    pareamento.codigo = CODIGO
    montar()
    expect(abrir).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Este código é para o celular')
  })

  it('sem código (aberta direto ou recarregada): explica como conectar, sem botão de abrir', () => {
    aparelho.android = true
    montar()
    expect(abrir).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Conectar o celular do cuidador')
    expect(screen.getByText(/abra Configurações e clique em Mostrar o código/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Abrir o IrisFlow Cuidador/ })).toBeNull()
  })

  it('sem código: a lista fica dentro da margem, o texto fala da pessoa e a página termina com um caminho', () => {
    // Auditoria de 21/10/2026 (P3-11): título colado no menu, números da lista para fora
    // da margem e nenhuma ação no fim.
    aparelho.android = true
    const { container } = montar()
    expect(container.querySelector('section.parear')).not.toBeNull()
    expect(container.querySelector('ol.parear__passos')).not.toBeNull()
    expect(screen.getByText(/No computador da pessoa, abra Configurações/)).toBeInTheDocument()
    expect(screen.getByText(/Esta página abre o app IrisFlow Cuidador com o código que aparece no computador/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/paciente/)
    expect(screen.getByRole('link', { name: 'Conhecer o app do cuidador' })).toHaveAttribute('href', '/cuidador')
  })

  it('volta do Android sem o app (#sem-app): falta instalar, com o APK', async () => {
    aparelho.android = true
    window.location.hash = 'sem-app'
    montar()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Falta instalar o IrisFlow Cuidador')
    await esperar(0)
    expect(screen.getByRole('link', { name: /Baixar para Android/ })).toHaveAttribute('href', APK)
  })

  it('o código não vai para servidor nenhum nem para o armazenamento do navegador', async () => {
    aparelho.android = true
    pareamento.codigo = CODIGO
    montar()
    await esperar(ESPERA_DO_APP_MS + 100)
    for (const chamada of fetchEspiao.mock.calls) expect(JSON.stringify(chamada)).not.toContain(CODIGO)
    for (const area of [localStorage, sessionStorage]) {
      for (let i = 0; i < area.length; i++) expect(area.getItem(area.key(i)!) ?? '').not.toContain(CODIGO)
    }
    expect(document.cookie).not.toContain(CODIGO)
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Baixar from './Baixar'
import { esquecerBetaProgram } from '@/hooks/useBetaProgram'
import { BETA_PROGRAM_RESERVA, type BetaProgram } from '@/services/api'
import { __resetLatestReleaseForTests } from '@/lib/latestRelease'

/* /baixar: os dois apps. No celular, o que dá para instalar ali vem primeiro,
   e o app do computador vira "leve este link para o computador". */

const { aparelho, apiFake } = vi.hoisted(() => ({
  aparelho: { celular: false },
  apiFake: { programa: null as BetaProgram | null },
}))

vi.mock('@/lib/aparelho', () => ({
  ehIOS: () => false,
  ehAndroid: () => aparelho.celular,
  ehCelular: () => aparelho.celular,
}))

vi.mock('@/services/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/api')>()
  return { ...real, fetchBetaProgram: async () => apiFake.programa ?? real.BETA_PROGRAM_RESERVA }
})

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Baixar />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  aparelho.celular = false
  esquecerBetaProgram()
  __resetLatestReleaseForTests()
  window.sessionStorage.clear()
  apiFake.programa = { ...BETA_PROGRAM_RESERVA, launchAt: '2099-11-10T03:00:00Z' }
  // Sem rede nos testes: o painel fica com os links de reserva.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const nomesDosApps = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('/baixar', () => {
  it('no computador: primeiro o IrisFlow Communicator, depois o Cuidador com o código QR', () => {
    montar()
    const nomes = nomesDosApps()
    expect(nomes.indexOf('IrisFlow Communicator')).toBeLessThan(nomes.indexOf('IrisFlow Cuidador'))
    expect(screen.getByRole('img', { name: /Código QR/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copiar o link' })).not.toBeInTheDocument()
  })

  it('no celular: primeiro o Cuidador, e o Communicator vira um link para o computador', () => {
    aparelho.celular = true
    montar()
    const nomes = nomesDosApps()
    expect(nomes.indexOf('IrisFlow Cuidador')).toBeLessThan(nomes.indexOf('IrisFlow Communicator'))
    expect(screen.getByRole('button', { name: 'Copiar o link' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Código QR/ })).not.toBeInTheDocument()
  })

  it('antes do lançamento, avisa o dia do download', async () => {
    montar()
    expect(await screen.findByText(/Download a partir de 10 de novembro/)).toBeInTheDocument()
  })

  it('os selos das lojas levam ao Google Play e à disponibilidade do iPhone', () => {
    montar()
    expect(screen.getByRole('link', { name: 'Baixar no Google Play, para Android' })).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=br.com.irisflow.cuidador',
    )
    expect(screen.getByRole('link', { name: 'App Store, para iPhone: em breve' })).toHaveAttribute(
      'href',
      '/cuidador#disponibilidade',
    )
  })
})

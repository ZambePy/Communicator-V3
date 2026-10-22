import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { LinkedDevices } from './LinkedDevices'

/* Revisão final (22/10/2026): o painel "Aplicativo e computadores" consulta o banco a cada
   minuto. Três coisas que a revisão achou:
   - uma falha de rede na releitura trocava a lista por "Nenhum computador vinculado ainda",
     o que é falso (o computador continua vinculado, só a internet oscilou);
   - na primeira leitura que falha, o mesmo texto aparecia ao lado do erro;
   - a leitura seguia a cada minuto com a aba escondida. */

const { api } = vi.hoisted(() => ({
  api: { fetchAppLicense: vi.fn(), fetchDevices: vi.fn(), revokeDevice: vi.fn() },
}))
vi.mock('@/services/api', () => api)

const LICENCA = {
  allowed: true,
  reason: 'beta',
  status: 'ativa',
  plan_id: 'beta',
  plan_name: 'Beta',
  access_until: '2027-03-31T23:59:59Z',
  checked_at: '2026-10-22T00:00:00Z',
  beneficiary: null,
  features: { relatorios: true, multiplos_dispositivos: true, assistente: true, voz: true },
}
const NOTEBOOK = {
  id: 'd1',
  name: 'Notebook da Maria',
  os: 'windows',
  appVersion: '1.0.0-beta.12',
  hostname: null,
  pairedAt: '2026-10-02T10:00:00Z',
  lastSeenAt: new Date().toISOString(),
  revokedAt: null,
  online: true,
  cameraOk: true,
  trackerOk: true,
  calibrated: true,
}

function abaEscondida(escondida: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => escondida })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (escondida ? 'hidden' : 'visible') })
}

async function passar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  api.fetchAppLicense.mockReset().mockResolvedValue(LICENCA)
  api.fetchDevices.mockReset().mockResolvedValue([NOTEBOOK])
  abaEscondida(false)
})

afterEach(() => {
  vi.useRealTimers()
  abaEscondida(false)
})

describe('<LinkedDevices />', () => {
  it('uma falha ao reler não troca a lista por "nenhum computador vinculado"', async () => {
    render(<LinkedDevices />)
    await passar(10)
    expect(screen.getByText('Notebook da Maria')).toBeInTheDocument()

    api.fetchDevices.mockRejectedValue(new Error('Sem conexão com o servidor. Confira a internet e tente de novo.'))
    await passar(60_000)

    expect(screen.getByText('Notebook da Maria')).toBeInTheDocument()
    expect(screen.queryByText(/Nenhum computador vinculado/)).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão com o servidor')
  })

  it('o aviso de falha some quando a leitura seguinte dá certo', async () => {
    render(<LinkedDevices />)
    await passar(10)
    api.fetchDevices.mockRejectedValueOnce(new Error('Sem conexão com o servidor.'))
    await passar(60_000)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await passar(60_000)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Notebook da Maria')).toBeInTheDocument()
  })

  it('na primeira leitura que falha, diz o erro e não afirma que não há computador vinculado', async () => {
    api.fetchDevices.mockRejectedValue(new Error('Sem conexão com o servidor.'))
    render(<LinkedDevices />)
    await passar(10)

    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão com o servidor')
    expect(screen.queryByText(/Nenhum computador vinculado/)).not.toBeInTheDocument()
    expect(screen.queryByText('Carregando…')).not.toBeInTheDocument()
  })

  it('com a aba escondida não consulta o banco; ao voltar, relê uma vez', async () => {
    render(<LinkedDevices />)
    await passar(10)
    expect(api.fetchDevices).toHaveBeenCalledTimes(1)

    abaEscondida(true)
    document.dispatchEvent(new Event('visibilitychange'))
    await passar(5 * 60_000)
    expect(api.fetchDevices).toHaveBeenCalledTimes(1)

    abaEscondida(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await passar(10)
    expect(api.fetchDevices).toHaveBeenCalledTimes(2)
  })

  it('voltar à aba logo depois de uma leitura não repete a consulta', async () => {
    render(<LinkedDevices />)
    await passar(10)
    abaEscondida(true)
    document.dispatchEvent(new Event('visibilitychange'))
    abaEscondida(false)
    document.dispatchEvent(new Event('visibilitychange'))
    await passar(10)
    expect(api.fetchDevices).toHaveBeenCalledTimes(1)
  })

  it('ao desmontar, para de consultar', async () => {
    const { unmount } = render(<LinkedDevices />)
    await passar(10)
    unmount()
    await passar(5 * 60_000)
    expect(api.fetchDevices).toHaveBeenCalledTimes(1)
  })
})

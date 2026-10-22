import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sucesso from './Sucesso'
import type { Account } from '@/context/AccountContext'

/* ============================================================
   Verificação de compatibilidade da página /sucesso.

   O ponto sensível é a distinção entre "não deu para verificar a câmera"
   (página aberta por http ou pelo IP da rede local, em que o navegador
   esconde a câmera de todo site) e "este computador não tem câmera". O
   primeiro caso é sobre o endereço, e não pode virar veredito sobre a
   máquina.
   ============================================================ */

/**
 * Finge o navegador. `navigator` e `window.isSecureContext` são
 * somente-leitura no jsdom, então cada campo é redefinido via
 * defineProperty e restaurado no afterEach.
 */
type Ambiente = {
  seguro: boolean
  camera: boolean
  nucleos?: number
  memoria?: number
}

const originais = {
  isSecureContext: Object.getOwnPropertyDescriptor(window, 'isSecureContext'),
  mediaDevices: Object.getOwnPropertyDescriptor(navigator, 'mediaDevices'),
  hardwareConcurrency: Object.getOwnPropertyDescriptor(navigator, 'hardwareConcurrency'),
  deviceMemory: Object.getOwnPropertyDescriptor(navigator, 'deviceMemory'),
}

function fingirNavegador({ seguro, camera, nucleos, memoria }: Ambiente) {
  Object.defineProperty(window, 'isSecureContext', { value: seguro, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', {
    value: camera ? { getUserMedia: () => Promise.resolve() } : undefined,
    configurable: true,
  })
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    value: nucleos,
    configurable: true,
  })
  Object.defineProperty(navigator, 'deviceMemory', { value: memoria, configurable: true })
}

function restaurar(alvo: object, nome: string, descritor?: PropertyDescriptor) {
  if (descritor) Object.defineProperty(alvo, nome, descritor)
  else delete (alvo as Record<string, unknown>)[nome]
}

afterEach(() => {
  restaurar(window, 'isSecureContext', originais.isSecureContext)
  restaurar(navigator, 'mediaDevices', originais.mediaDevices)
  restaurar(navigator, 'hardwareConcurrency', originais.hardwareConcurrency)
  restaurar(navigator, 'deviceMemory', originais.deviceMemory)
})

/* As regras do veredito (o endereço sem https não reprova o computador, a
   memória que o navegador não informa, os mínimos) estão em
   src/utils/compat.test.ts; o bloco na tela, em
   components/sections/CompatCheck.test.tsx. */

/* ---------------- a página inteira ----------------
   Mesmas regras, agora vistas pelo usuário: o veredito e a linha da
   webcam renderizados. A conta e os downloads são mockados porque a
   página só existe para quem acabou de assinar.
   -------------------------------------------------- */

// vi.hoisted: a fábrica do vi.mock abaixo é içada e precisa enxergar `conta`
const conta = vi.hoisted<Account>(() => ({
  id: 'sub-1',
  profile: {
    buyerName: 'Maria Aparecida Souza',
    email: 'maria@exemplo.com.br',
    phone: '',
    document: '',
    userName: 'João',
    relation: 'conjuge',
    condition: 'ela',
    os: 'windows',
    newsletter: true,
  },
  status: 'avaliacao',
  createdAt: '2026-09-01T00:00:00Z',
  trialEndsAt: '2026-09-16T00:00:00Z',
  nextChargeAt: '2026-09-16T00:00:00Z',
  priceBRL: 399,
  planId: 'completo',
}))

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => ({ account: conta, authenticated: true, loading: false }),
}))

vi.mock('@/hooks/useDownloads', async () => {
  const { buildDownloads } = await import('@/lib/releases')
  // nenhum instalador publicado: os três cartões em "Em breve"
  return {
    useDownloads: () => ({
      platforms: buildDownloads('dono/repo', []),
      detected: null,
      releasesPage: 'https://github.com/dono/repo/releases',
      apk: { situacao: 'nao-oferecido' },
    }),
  }
})

describe('<Sucesso />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('não reprova o computador só porque a página está em http', () => {
    fingirNavegador({ seguro: false, camera: false, nucleos: 8, memoria: 8 })
    // Um Windows de verdade (o jsdom se diz Linux, que ainda não tem instalador).
    const uaOriginal = Object.getOwnPropertyDescriptor(navigator, 'userAgent')
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      configurable: true,
    })
    onTestFinished(() => restaurar(navigator, 'userAgent', uaOriginal))

    render(
      // as flags só calam os avisos de migração para o v7
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sucesso />
      </MemoryRouter>,
    )

    // O mesmo teste de /meu-computador, com o título do bloco de sempre.
    expect(screen.getByRole('heading', { name: 'Seu computador é compatível?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Testar a câmera' }))
    expect(screen.getByText('Não deu para testar neste endereço')).toBeInTheDocument()
    // na linha da câmera e em "O que fazer"
    expect(screen.getAllByText(/não diz nada sobre o computador/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Não vai funcionar')).not.toBeInTheDocument()
  })
})

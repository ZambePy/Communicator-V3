import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sucesso from './Sucesso'
import { diagnosticar } from '@/utils/compat'
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

describe('diagnosticar', () => {
  it('em contexto NÃO seguro diz "não verificado", e não "abaixo do mínimo"', () => {
    // http://192.168.0.10:5173 — o navegador nem expõe mediaDevices aqui
    fingirNavegador({ seguro: false, camera: false, nucleos: 8, memoria: 8 })

    const d = diagnosticar()

    expect(d.nivel).not.toBe('abaixo')
    expect(d.titulo).not.toBe('Abaixo do mínimo')
    expect(d.linhas.find((l) => l.rotulo.startsWith('Acesso à webcam'))?.valor).toMatch(
      /não verificado/,
    )
    // a ressalva fala do endereço, não do computador
    expect(d.texto).toMatch(/endereço não seguro/)
    expect(d.texto).not.toMatch(/antigo demais/)
  })

  it('em contexto seguro sem câmera é um veredito sobre a máquina', () => {
    fingirNavegador({ seguro: true, camera: false, nucleos: 8, memoria: 8 })

    const d = diagnosticar()

    expect(d.nivel).toBe('abaixo')
    expect(d.texto).toMatch(/antigo demais/)
  })

  it('16 GB e 8 núcleos: compatível', () => {
    // O Chromium reporta no máximo 8 mesmo com 16 GB instalados; o veredito
    // não pode depender de ver "16" ali.
    fingirNavegador({ seguro: true, camera: true, nucleos: 8, memoria: 8 })

    const d = diagnosticar()

    expect(d.nivel).toBe('recomendado')
    expect(d.titulo).toBe('Compatível')
    expect(d.linhas.find((l) => l.rotulo === 'Memória')?.valor).toMatch(/8 GB ou mais/)
  })

  it('4 núcleos e 8 GB: no mínimo, sem ser reprovado', () => {
    fingirNavegador({ seguro: true, camera: true, nucleos: 4, memoria: 8 })

    const d = diagnosticar()

    expect(d.nivel).toBe('minimo')
  })

  it('2 núcleos: abaixo do mínimo', () => {
    fingirNavegador({ seguro: true, camera: true, nucleos: 2, memoria: 8 })

    expect(diagnosticar().nivel).toBe('abaixo')
  })

  it('4 GB de memória: abaixo do mínimo', () => {
    fingirNavegador({ seguro: true, camera: true, nucleos: 8, memoria: 4 })

    expect(diagnosticar().nivel).toBe('abaixo')
  })

  it('sem deviceMemory (Firefox, Safari) diz que a memória não foi verificada', () => {
    fingirNavegador({ seguro: true, camera: true, nucleos: 8, memoria: undefined })

    const d = diagnosticar()

    expect(d.nivel).toBe('recomendado')
    expect(d.texto).toMatch(/não informa a memória/)
  })
})

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

    render(
      // as flags só calam os avisos de migração para o v7
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Sucesso />
      </MemoryRouter>,
    )

    expect(screen.getByText('Compatível')).toBeInTheDocument()
    expect(screen.queryByText('Abaixo do mínimo')).not.toBeInTheDocument()
    expect(screen.getByText(/não verificado — a página não está num endereço seguro/)).toBeInTheDocument()
  })
})

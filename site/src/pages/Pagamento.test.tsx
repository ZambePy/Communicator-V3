import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import Pagamento from './Pagamento'
import type { Account } from '@/context/AccountContext'

/* ============================================================
   /pagamento — o cartão vira para o verso no código de segurança, e a
   confirmação mostra a camada de status (processando → sucesso) antes de
   seguir para /sucesso. No erro, a camada some e a mensagem fica no
   formulário. Os testes rodam com "reduzir movimento" ligado, que encurta
   as esperas da animação.
   ============================================================ */

const conta: Account = {
  id: 'sub-1',
  profile: {
    buyerName: 'Maria Aparecida Souza',
    email: 'maria@exemplo.com.br',
    phone: '11900000000',
    document: '',
    userName: 'João',
    relation: 'conjuge',
    condition: 'ela',
    os: 'windows',
    newsletter: true,
  },
  status: 'ativa',
  createdAt: '2026-10-01T00:00:00Z',
  trialEndsAt: '2099-10-15T00:00:00Z',
  nextChargeAt: '2099-10-15T00:00:00Z',
  priceBRL: 399,
  planId: 'completo',
}

const { attachPayment } = vi.hoisted(() => ({ attachPayment: vi.fn() }))

vi.mock('@/context/AccountContext', () => ({
  useAccount: () => ({ account: conta, authenticated: true, loading: false, attachPayment }),
}))
vi.mock('@/hooks/usePlans', () => ({
  usePlans: () => ({ getPlan: () => ({ name: 'Completo' }) }),
}))
vi.mock('@/components/effects/Reveal', () => ({
  Reveal: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/components/effects/AmbientBackground', () => ({ AmbientBackground: () => null }))

const matchMediaOriginal = window.matchMedia

beforeEach(() => {
  attachPayment.mockReset()
  window.matchMedia = ((query: string) => ({
    ...matchMediaOriginal(query),
    matches: query.includes('reduce'),
  })) as typeof window.matchMedia
})

afterEach(() => {
  window.matchMedia = matchMediaOriginal
})

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/pagamento']}>
      <Routes>
        <Route path="/pagamento" element={<Pagamento />} />
        <Route path="/sucesso" element={<p>página de sucesso</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function preencher() {
  fireEvent.change(screen.getByLabelText('Número do cartão'), { target: { value: '4111111111111111' } })
  fireEvent.change(screen.getByLabelText('Nome impresso no cartão'), { target: { value: 'Maria Souza' } })
  fireEvent.change(screen.getByLabelText('Validade'), { target: { value: '1230' } })
  fireEvent.change(screen.getByLabelText('Código de segurança'), { target: { value: '123' } })
}

describe('Pagamento', () => {
  it('vira o cartão enquanto o código de segurança está em foco', () => {
    const { container } = abrir()
    const cartao = container.querySelector('.cartao3d') as HTMLElement
    const cvv = screen.getByLabelText('Código de segurança')

    expect(cartao).not.toHaveClass('is-virado')
    fireEvent.focus(cvv)
    expect(cartao).toHaveClass('is-virado')
    fireEvent.blur(cvv)
    expect(cartao).not.toHaveClass('is-virado')
  })

  it('confirma com a camada de status e segue para o sucesso', async () => {
    attachPayment.mockResolvedValue(undefined)
    abrir()
    preencher()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e liberar o download/ }))

    expect(await screen.findByText('Tudo certo!')).toBeInTheDocument()
    expect(await screen.findByText('página de sucesso')).toBeInTheDocument()

    // Só o titular, a bandeira e os quatro últimos dígitos saem da tela.
    expect(attachPayment).toHaveBeenCalledWith({
      method: 'cartao',
      cardLast4: '1111',
      cardBrand: 'Visa',
      holder: 'Maria Souza',
      installments: 1,
    })
  })

  it('com movimento normal, mostra o processando com o cartão brilhando antes do sucesso', async () => {
    window.matchMedia = matchMediaOriginal
    attachPayment.mockResolvedValue(undefined)
    abrir()
    preencher()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e liberar o download/ }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Salvando a forma de pagamento')
    expect(status.querySelector('.cartao3d')).toHaveClass('cartao3d--processando')
    expect(screen.getByLabelText('Código de segurança').closest('form')).toHaveAttribute('inert')

    expect(await screen.findByText('Tudo certo!', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(status.querySelector('.cartao3d')).toHaveClass('cartao3d--sucesso')
    expect(await screen.findByText('página de sucesso', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('no erro, a camada some e a mensagem fica no formulário', async () => {
    attachPayment.mockRejectedValue(new Error('Sem conexão com o servidor.'))
    abrir()
    preencher()
    fireEvent.click(screen.getByRole('button', { name: /Confirmar e liberar o download/ }))

    expect(await screen.findByText('Sem conexão com o servidor.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.getByLabelText('Código de segurança').closest('form')).not.toHaveAttribute('inert')
  })
})

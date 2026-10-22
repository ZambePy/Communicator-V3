import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { LevarAoComputador } from './LevarAoComputador'
import { SITE_URL } from '@/data/content'

/* Copiar o link (rodada 4, 21/10/2026): a confirmação aparece no próprio botão
   e é anunciada; se a área de transferência recusar, a pessoa vê o que fazer
   (antes o erro era engolido e o botão ficava como se nada tivesse acontecido). */

let escrever: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  escrever = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: escrever } })
})
afterEach(() => {
  vi.useRealTimers()
})

async function clicarEmCopiar() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Copiar o link' }))
  })
}

describe('<LevarAoComputador />', () => {
  it('copia o endereço da página e confirma no botão, com a marca de confirmação', async () => {
    render(<LevarAoComputador />)
    await clicarEmCopiar()
    expect(escrever).toHaveBeenCalledWith(`${SITE_URL}/baixar`)
    const botao = screen.getByRole('button', { name: 'Link copiado' })
    expect(botao.querySelector('.levar-ao-computador__ok')).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Link copiado')
  })

  it('a confirmação some depois de um tempo e o botão volta ao que era', async () => {
    render(<LevarAoComputador caminho="/meu-computador" />)
    await clicarEmCopiar()
    expect(escrever).toHaveBeenCalledWith(`${SITE_URL}/meu-computador`)
    act(() => void vi.advanceTimersByTime(2600))
    expect(screen.getByRole('button', { name: 'Copiar o link' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('se a área de transferência recusar, diz o que fazer, em vez de calar', async () => {
    escrever.mockRejectedValueOnce(new Error('negado'))
    render(<LevarAoComputador />)
    await clicarEmCopiar()
    expect(screen.queryByRole('button', { name: 'Link copiado' })).not.toBeInTheDocument()
    const aviso = screen.getByRole('status')
    expect(aviso).toHaveTextContent(/não consegui copiar/i)
    expect(aviso).toHaveTextContent(/selecione o endereço/i)
    // e o aviso também some sozinho
    act(() => void vi.advanceTimersByTime(8000))
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('sem navigator.clipboard (navegador antigo ou página sem https), também avisa', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    render(<LevarAoComputador />)
    await clicarEmCopiar()
    expect(screen.getByRole('status')).toHaveTextContent(/não consegui copiar/i)
  })

  it('o e-mail continua sendo uma saída: o link já traz o endereço', () => {
    render(<LevarAoComputador />)
    const email = screen.getByRole('link', { name: 'Enviar por e-mail' })
    expect(email.getAttribute('href')).toContain(encodeURIComponent(`${SITE_URL}/baixar`))
  })

  it('desmontar com a confirmação na tela não deixa temporizador para trás', async () => {
    const { unmount } = render(<LevarAoComputador />)
    await clicarEmCopiar()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Faq } from './Faq'
import { FAQ } from '@/data/content'

/* As perguntas abrem e fecham com a altura animada: ao abrir, a resposta sai
   do `hidden` e cresce no quadro seguinte; ao fechar, encolhe e só depois volta
   ao `hidden` (fora do foco e do leitor de tela). */

describe('<Faq /> com a altura animada', () => {
  it('abre crescendo e fecha encolhendo, e a resposta fechada fica escondida', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    try {
      render(
        <MemoryRouter>
          <Faq perguntas={[FAQ[0].q, FAQ[1].q]} />
        </MemoryRouter>,
      )
      const [primeira, segunda] = screen.getAllByRole('button')
      const resposta = (b: HTMLElement) => document.getElementById(b.getAttribute('aria-controls')!)!
      // A primeira já vem aberta, sem animar.
      expect(resposta(primeira)).not.toHaveAttribute('hidden')
      expect(resposta(primeira)).toHaveClass('is-aberta')
      expect(resposta(segunda)).toHaveAttribute('hidden')

      fireEvent.click(segunda)
      // Saiu do hidden, mas ainda não cresceu: a transição tem de onde partir.
      expect(resposta(segunda)).not.toHaveAttribute('hidden')
      expect(resposta(segunda)).not.toHaveClass('is-aberta')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(40)
      })
      expect(resposta(segunda)).toHaveClass('is-aberta')
      expect(segunda).toHaveAttribute('aria-expanded', 'true')

      // A primeira fechou: encolhe e, terminada a transição, some.
      expect(resposta(primeira)).not.toHaveClass('is-aberta')
      expect(resposta(primeira)).not.toHaveAttribute('hidden')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      expect(resposta(primeira)).toHaveAttribute('hidden')
      expect(primeira).toHaveAttribute('aria-expanded', 'false')
    } finally {
      vi.useRealTimers()
    }
  })
})

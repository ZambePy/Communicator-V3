import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CookieNotice } from './CookieNotice'
import { CONSENT_KEY } from '@/lib/consent'
import { BEACON_SRC, unloadAnalytics } from '@/lib/analytics'

const beacon = () => document.querySelector(`script[src="${BEACON_SRC}"]`)

function montar() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CookieNotice />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  unloadAnalytics()
  vi.stubEnv('VITE_CF_ANALYTICS_TOKEN', 'tok-teste')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('<CookieNotice />', () => {
  it('aparece na primeira visita, com link para a política', () => {
    montar()
    expect(screen.getByRole('region', { name: /Sem cookies de rastreamento/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Privacidade/ })).toHaveAttribute('href', '/privacidade')
  })

  it('"Recusar estatísticas" some com o aviso e NÃO carrega o beacon', () => {
    montar()
    // antes da escolha, com token, as estatísticas sem cookie rodam
    expect(beacon()).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Recusar estatísticas' }))
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('refused')
    expect(beacon()).toBeNull()
  })

  it('com a recusa guardada, a próxima visita não carrega nada nem mostra o aviso', () => {
    window.localStorage.setItem(CONSENT_KEY, 'refused')
    montar()
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    expect(beacon()).toBeNull()
  })

  it('"Entendi" guarda a escolha e mantém o beacon', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('accepted')
    expect(beacon()).not.toBeNull()
  })

  it('sem token no build, nunca carrega o beacon', () => {
    vi.stubEnv('VITE_CF_ANALYTICS_TOKEN', '')
    montar()
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    expect(beacon()).toBeNull()
  })
})

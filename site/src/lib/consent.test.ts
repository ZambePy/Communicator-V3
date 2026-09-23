import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_KEY, analyticsAllowed, readConsent, resetConsent, saveConsent } from './consent'
import { BEACON_SRC, loadAnalytics, unloadAnalytics } from './analytics'

const beacon = () => document.querySelector<HTMLScriptElement>(`script[src="${BEACON_SRC}"]`)

beforeEach(() => {
  window.localStorage.clear()
  unloadAnalytics()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('escolha sobre estatísticas', () => {
  it('guarda e lê a escolha', () => {
    expect(readConsent()).toBeNull()
    saveConsent('refused')
    expect(readConsent()).toBe('refused')
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('refused')
    resetConsent()
    expect(readConsent()).toBeNull()
  })

  it('não quebra sem localStorage (modo privado)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(readConsent()).toBeNull()
    expect(() => saveConsent('accepted')).not.toThrow()
  })

  it('só a recusa explícita desliga as estatísticas', () => {
    expect(analyticsAllowed(null)).toBe(true)
    expect(analyticsAllowed('accepted')).toBe(true)
    expect(analyticsAllowed('refused')).toBe(false)
  })
})

describe('beacon do Cloudflare Web Analytics', () => {
  it('não carrega sem token', () => {
    expect(loadAnalytics('', 'accepted')).toBe(false)
    expect(beacon()).toBeNull()
  })

  it('não carrega quando a pessoa recusou', () => {
    expect(loadAnalytics('tok123', 'refused')).toBe(false)
    expect(beacon()).toBeNull()
  })

  it('carrega uma vez com token e sem recusa, levando o token', () => {
    expect(loadAnalytics('tok123', null)).toBe(true)
    expect(loadAnalytics('tok123', 'accepted')).toBe(true)
    expect(document.querySelectorAll(`script[src="${BEACON_SRC}"]`)).toHaveLength(1)
    expect(JSON.parse(beacon()!.getAttribute('data-cf-beacon')!)).toMatchObject({ token: 'tok123' })
  })

  it('sai da página ao recusar depois', () => {
    loadAnalytics('tok123', 'accepted')
    unloadAnalytics()
    expect(beacon()).toBeNull()
  })
})

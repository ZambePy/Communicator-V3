import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AbrirApp from './AbrirApp'

/* /app é o endereço do código QR: cada celular vai para a sua loja. */

const { aparelho, lojas } = vi.hoisted(() => ({
  aparelho: { ios: false, android: false },
  lojas: {
    googlePlay: 'https://play.google.com/store/apps/details?id=br.com.irisflow.cuidador',
    appStore: null as string | null,
    apk: null as string | null,
  },
}))

vi.mock('@/lib/aparelho', () => ({
  ehIOS: () => aparelho.ios,
  ehAndroid: () => aparelho.android,
  ehCelular: () => aparelho.ios || aparelho.android,
}))

vi.mock('@/lib/lojas', () => ({ LOJAS: lojas, SELOS_OFICIAIS: false, PACOTE_ANDROID: 'br.com.irisflow.cuidador' }))

const replace = vi.fn()

beforeEach(() => {
  Object.assign(aparelho, { ios: false, android: false })
  lojas.appStore = null
  replace.mockReset()
  Object.defineProperty(window, 'location', { value: { ...window.location, replace }, writable: true })
})

describe('/app', () => {
  it('no Android, vai direto para o Google Play', () => {
    aparelho.android = true
    render(<AbrirApp />)
    expect(replace).toHaveBeenCalledWith(lojas.googlePlay)
  })

  it('no iPhone, sem o app na App Store ainda, vai para a disponibilidade', () => {
    aparelho.ios = true
    render(<AbrirApp />)
    expect(replace).toHaveBeenCalledWith('/cuidador#disponibilidade')
  })

  it('no iPhone, com o endereço da App Store, vai para a loja', () => {
    aparelho.ios = true
    lojas.appStore = 'https://apps.apple.com/br/app/irisflow-cuidador/id000'
    render(<AbrirApp />)
    expect(replace).toHaveBeenCalledWith(lojas.appStore)
  })

  it('no computador, fica e mostra os selos das duas lojas', () => {
    render(<AbrirApp />)
    expect(replace).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Baixar no Google Play, para Android' })).toHaveAttribute('href', lojas.googlePlay)
    expect(screen.getByRole('link', { name: 'App Store, para iPhone: em breve' })).toHaveAttribute('href', '/cuidador#disponibilidade')
  })
})

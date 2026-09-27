import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import { SelosDasLojas } from './SelosDasLojas'

/* Os selos das lojas: as imagens de public/badges quando existem, os botões
   próprios quando não — com os mesmos rótulos para leitor de tela. */

const { modo, lojas } = vi.hoisted(() => ({
  modo: { oficiais: true },
  lojas: {
    googlePlay: 'https://play.google.com/store/apps/details?id=br.com.irisflow.cuidador',
    appStore: null as string | null,
    apk: null as string | null,
  },
}))

vi.mock('@/lib/lojas', () => ({
  LOJAS: lojas,
  get SELOS_OFICIAIS() {
    return modo.oficiais
  },
  PACOTE_ANDROID: 'br.com.irisflow.cuidador',
}))

beforeEach(() => {
  modo.oficiais = true
  lojas.appStore = null
})

describe('SelosDasLojas', () => {
  it('usa as imagens de public/badges, que estão no repositório', () => {
    const publico = path.resolve(__dirname, '../../../public/badges')
    expect(existsSync(path.join(publico, 'app-store.svg'))).toBe(true)
    expect(existsSync(path.join(publico, 'google-play.png'))).toBe(true)
    expect(readFileSync(path.join(publico, 'app-store.svg'), 'utf8')).toMatch(/^<svg [^>]*viewBox=/)

    const { container } = render(<SelosDasLojas />)
    const imagens = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(imagens).toEqual(['/badges/app-store.svg', '/badges/google-play.png'])
  })

  it('sem o app na App Store, o selo da Apple fica "em breve" e leva à disponibilidade', () => {
    render(<SelosDasLojas />)
    const apple = screen.getByRole('link', { name: 'App Store, para iPhone: em breve' })
    expect(apple).toHaveAttribute('href', '/cuidador#disponibilidade')
    expect(apple).not.toHaveAttribute('target')
    expect(screen.getByText('em breve')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Baixar no Google Play, para Android' })).toHaveAttribute(
      'href',
      lojas.googlePlay,
    )
  })

  it('com o endereço da App Store, o selo abre a loja numa aba nova', () => {
    lojas.appStore = 'https://apps.apple.com/br/app/irisflow-cuidador/id0000000000'
    render(<SelosDasLojas />)
    const apple = screen.getByRole('link', { name: 'Baixar na App Store, para iPhone' })
    expect(apple).toHaveAttribute('href', lojas.appStore)
    expect(apple).toHaveAttribute('target', '_blank')
    expect(screen.queryByText('em breve')).not.toBeInTheDocument()
  })

  it('sem as imagens, os botões próprios têm os mesmos rótulos', () => {
    modo.oficiais = false
    const { container } = render(<SelosDasLojas />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByRole('link', { name: 'App Store, para iPhone: em breve' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Baixar no Google Play, para Android' })).toBeInTheDocument()
  })
})

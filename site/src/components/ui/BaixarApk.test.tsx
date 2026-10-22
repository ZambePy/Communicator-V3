import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ApkDoRelease, BaixarApk, emNavegadorEmbutido } from './BaixarApk'
import type { ApkDoCuidador } from '@/hooks/useDownloads'

const { lojas, downloads } = vi.hoisted(() => ({
  lojas: { googlePlay: null as string | null, appStore: null as string | null, apk: 'https://exemplo.invalid/app.apk' as string | null },
  downloads: { apk: { situacao: 'nao-oferecido' } as ApkDoCuidador },
}))
vi.mock('@/lib/lojas', () => ({ LOJAS: lojas, SELOS_OFICIAIS: false, PACOTE_ANDROID: 'br.com.irisflow.cuidador' }))
vi.mock('@/hooks/useDownloads', () => ({ useDownloads: () => ({ apk: downloads.apk }) }))

describe('BaixarApk', () => {
  it('depois do lançamento, é um link de download na mesma aba com o passo a passo', () => {
    render(<BaixarApk lancou liberaEm="2026-09-29T15:00:00Z" />)
    const botao = screen.getByRole('link', { name: /Baixar para Android/ })
    expect(botao).toHaveAttribute('href', lojas.apk)
    expect(botao).not.toHaveAttribute('target')
    expect(screen.getByText(/instalar apps desta fonte/)).toBeInTheDocument()
  })

  it('antes do lançamento, diz o dia em vez de oferecer o arquivo', () => {
    render(<BaixarApk lancou={false} liberaEm="2099-11-10T03:00:00Z" />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/sai no dia do lançamento/)).toBeInTheDocument()
  })

  it('sem APK configurado, não mostra nada', () => {
    lojas.apk = null
    const { container } = render(<BaixarApk lancou liberaEm="2026-09-29T15:00:00Z" />)
    expect(container).toBeEmptyDOMElement()
    lojas.apk = 'https://exemplo.invalid/app.apk'
  })

  it('reconhece os navegadores embutidos que não baixam arquivos', () => {
    expect(emNavegadorEmbutido('Mozilla/5.0 (Linux; Android 14) Instagram 300.0')).toBe(true)
    expect(emNavegadorEmbutido('Mozilla/5.0 (Linux; Android 14; SM-A146B) FBAV/480.0')).toBe(true)
    expect(emNavegadorEmbutido('Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit')).toBe(true)
    expect(emNavegadorEmbutido('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/129 Mobile')).toBe(false)
  })
})

describe('ApkDoRelease — o arquivo do último release (relato de 19/10/2026)', () => {
  const montar = () =>
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ApkDoRelease lancou liberaEm="2026-09-29T15:00:00Z" />
      </MemoryRouter>,
    )

  it('com o .apk no release, o botão aponta para ele, e não para o link fixo', () => {
    downloads.apk = { situacao: 'disponivel', url: 'https://github.com/dono/repo/releases/download/v1/IrisFlow-Cuidador.apk' }
    montar()
    expect(screen.getByRole('link', { name: /Baixar para Android/ })).toHaveAttribute(
      'href',
      'https://github.com/dono/repo/releases/download/v1/IrisFlow-Cuidador.apk',
    )
  })

  it('release sem o .apk: o aviso, sem botão', () => {
    downloads.apk = { situacao: 'fora-do-release' }
    montar()
    expect(screen.queryByRole('link', { name: /Baixar para Android/ })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('O app para Android não está na versão publicada agora')
  })

  it('site sem APK: nada', () => {
    downloads.apk = { situacao: 'nao-oferecido' }
    const { container } = montar()
    expect(container).toBeEmptyDOMElement()
  })
})

describe('BaixarApk com o arquivo dado por quem chama', () => {
  it('a prop url vale mais que o link configurado', () => {
    render(<BaixarApk lancou liberaEm="2026-09-29T15:00:00Z" url="https://exemplo.invalid/do-release.apk" />)
    expect(screen.getByRole('link', { name: /Baixar para Android/ })).toHaveAttribute(
      'href',
      'https://exemplo.invalid/do-release.apk',
    )
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RouteMeta } from './useDocumentMeta'
import { DEFAULT_SITE_URL } from '@/seo/site'
import { metaForPath } from '@/seo/pages'

function montar(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RouteMeta />
    </MemoryRouter>,
  )
}

const meta = (sel: string) => document.head.querySelector<HTMLMetaElement>(sel)?.content

beforeEach(() => {
  document.head.innerHTML = ''
  document.title = ''
})

describe('<RouteMeta />', () => {
  it.each(['/', '/planos', '/beta', '/privacidade', '/termos', '/contato'])(
    'aplica título, descrição, canonical, og e twitter em %s',
    (path) => {
      montar(path)
      const m = metaForPath(path)
      const url = DEFAULT_SITE_URL + path

      expect(document.title).toBe(`${m.title} | IrisFlow`)
      expect(meta('meta[name="description"]')).toBe(m.description)
      expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(url)
      expect(meta('meta[property="og:title"]')).toBe(`${m.title} | IrisFlow`)
      expect(meta('meta[property="og:description"]')).toBe(m.description)
      expect(meta('meta[property="og:url"]')).toBe(url)
      expect(meta('meta[property="og:image"]')).toBe(`${DEFAULT_SITE_URL}/og-image.png`)
      expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image')
      expect(meta('meta[name="robots"]')).toBe('index, follow')
    },
  )

  it('telas de conta ficam fora da busca', () => {
    montar('/conta')
    expect(document.title).toBe('Minha conta | IrisFlow')
    expect(meta('meta[name="robots"]')).toBe('noindex, follow')
  })

  it('endereço inexistente recebe o título da 404 e noindex', () => {
    montar('/nao-existe')
    expect(document.title).toBe('Página não encontrada | IrisFlow')
    expect(meta('meta[name="robots"]')).toBe('noindex, follow')
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      `${DEFAULT_SITE_URL}/nao-existe`,
    )
  })

  it('não duplica as tags ao trocar de rota', () => {
    montar('/planos').unmount()
    montar('/sobre')
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(document.title).toBe(`${metaForPath('/sobre').title} | IrisFlow`)
  })
})

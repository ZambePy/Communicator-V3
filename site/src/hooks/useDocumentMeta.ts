import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { SITE_URL } from '@/data/content'
import { fullTitle, metaForPath, normalizePath, type PageMeta } from '@/seo/pages'
import { absoluteUrl, OG_IMAGE_PATH } from '@/seo/site'

type Applied = {
  title: string
  description: string
  /** Caminho canônico ("/planos"). */
  path: string
  index: boolean
}

function setMeta(attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', value)
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  el.href = href
}

/**
 * Escreve no <head>: title, description, canonical, robots, og:* e
 * twitter:*. Exportada para os testes e para quem precisar aplicar fora
 * do ciclo de rota.
 */
export function applyDocumentMeta({ title, description, path, index }: Applied) {
  const full = fullTitle(title)
  const url = absoluteUrl(SITE_URL, path)
  const image = absoluteUrl(SITE_URL, OG_IMAGE_PATH)

  document.title = full
  setMeta('name', 'description', description)
  setMeta('name', 'robots', index ? 'index, follow' : 'noindex, follow')
  setLink('canonical', url)

  setMeta('property', 'og:type', 'website')
  setMeta('property', 'og:site_name', 'IrisFlow')
  setMeta('property', 'og:locale', 'pt_BR')
  setMeta('property', 'og:title', full)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:url', url)
  setMeta('property', 'og:image', image)
  setMeta('property', 'og:image:width', '1200')
  setMeta('property', 'og:image:height', '630')
  setMeta('property', 'og:image:alt', 'IrisFlow — comunicação pelo olhar com a webcam comum')

  setMeta('name', 'twitter:card', 'summary_large_image')
  setMeta('name', 'twitter:title', full)
  setMeta('name', 'twitter:description', description)
  setMeta('name', 'twitter:image', image)
}

/**
 * Aplica os metadados da rota atual (tabela em src/seo/pages.ts). Fica no
 * Layout, então toda rota — inclusive a 404 — ganha título, descrição e
 * og:* próprios sem que cada página precise lembrar disso. Leitores de tela
 * anunciam o novo título ao trocar de página.
 */
export function RouteMeta() {
  const { pathname } = useLocation()

  useEffect(() => {
    const meta: PageMeta = metaForPath(pathname)
    // Na 404 o canonical aponta para o próprio endereço pedido, com noindex.
    const path = meta.path === '/404' ? normalizePath(pathname) : meta.path
    applyDocumentMeta({ ...meta, path })
  }, [pathname])

  return null
}

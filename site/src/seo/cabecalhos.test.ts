import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* public/_headers (Cloudflare Pages). Relato de 19/10/2026: a política
   bloqueava a câmera em todo o site (camera=()), e o teste "Meu computador
   funciona?" daria sempre "sem permissão" no ar — nos testes e no navegador
   local, sem o cabeçalho, ele funcionava. */

// No Windows o git entrega o arquivo com CRLF: o teste lê as regras linha a linha.
const CABECALHOS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../public/_headers'), 'utf8').replace(/\r\n/g, '\n')

/** As diretivas da Permissions-Policy da regra "/*". */
function politica(): Record<string, string> {
  const linha = CABECALHOS.split('\n').find((l) => /^\s+Permissions-Policy:/.test(l))
  expect(linha, 'a regra /* tem Permissions-Policy').toBeDefined()
  const valor = linha!.replace(/^\s+Permissions-Policy:\s*/, '')
  return Object.fromEntries(valor.split(',').map((d) => d.trim().split('=') as [string, string]))
}

describe('Permissions-Policy do site', () => {
  it('libera a câmera só para o próprio site, em todas as rotas (é uma SPA)', () => {
    expect(politica().camera).toBe('(self)')
    // Uma regra só: a política é a do documento carregado primeiro, então
    // liberar só em /meu-computador não valeria para quem chega pelo menu.
    expect(CABECALHOS.match(/^\s+Permissions-Policy:/gm)).toHaveLength(1)
  })

  it('o microfone e o resto continuam bloqueados', () => {
    const p = politica()
    for (const recurso of ['microphone', 'geolocation', 'payment', 'usb', 'serial']) expect(p[recurso]).toBe('()')
  })
})

/* "Teste com o seu olhar" (21/10/2026): o reconhecimento do rosto é
   WebAssembly, e uma CSP com script-src sem 'wasm-unsafe-eval' bloqueia a
   compilação — o MediaPipe nem cai na hora: o teste de SIMD falha calado,
   ele escolhe o wasm sem SIMD e só então quebra. Nos testes e no `npm run
   dev`, sem o cabeçalho, tudo funcionava. */

/** As diretivas da Content-Security-Policy da regra "/*". */
function csp(): Record<string, string[]> {
  const linha = CABECALHOS.split('\n').find((l) => /^\s+Content-Security-Policy:/.test(l))
  expect(linha, 'a regra /* tem Content-Security-Policy').toBeDefined()
  const valor = linha!.replace(/^\s+Content-Security-Policy:\s*/, '')
  return Object.fromEntries(
    valor
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((partes) => partes[0])
      .map(([nome, ...fontes]) => [nome, fontes]),
  )
}

/** As regras do arquivo: o caminho (com `*`) e os cabeçalhos de cada uma. */
function regras(): { caminho: string; cabecalhos: [string, string][] }[] {
  const lista: { caminho: string; cabecalhos: [string, string][] }[] = []
  for (const linha of CABECALHOS.split('\n')) {
    if (/^\s*(#|$)/.test(linha)) continue
    if (/^\S/.test(linha)) lista.push({ caminho: linha.trim(), cabecalhos: [] })
    else {
      const [, nome, valor] = /^\s+([^:]+):\s*(.*)$/.exec(linha) ?? []
      if (nome && lista.length) lista[lista.length - 1].cabecalhos.push([nome, valor])
    }
  }
  return lista
}

/** Como o Pages casa um caminho com a regra: `*` pega qualquer coisa, barras inclusive. */
function casa(caminho: string, regra: string): boolean {
  const escapar = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${regra.split('*').map(escapar).join('.*')}$`).test(caminho)
}

describe('Content-Security-Policy do site', () => {
  it('deixa compilar WebAssembly (o reconhecimento do rosto do teste ao vivo), sem liberar eval de JavaScript', () => {
    const script = csp()['script-src']
    expect(script).toContain("'wasm-unsafe-eval'")
    expect(script).not.toContain("'unsafe-eval'")
    expect(script).not.toContain("'unsafe-inline'")
  })
})

describe('cache dos arquivos do teste ao vivo', () => {
  it('o wasm e o modelo (uns 15 MB, caminho com a versão) ficam em cache longo, por uma regra só', () => {
    for (const arquivo of [
      '/demo/mediapipe-0.10.35/wasm/vision_wasm_internal.wasm',
      '/demo/mediapipe-0.10.35/face_landmarker.task',
    ]) {
      // Duas regras casando juntas somariam dois Cache-Control contraditórios.
      const caches = regras()
        .filter((r) => casa(arquivo, r.caminho))
        .flatMap((r) => r.cabecalhos.filter(([nome]) => nome === 'Cache-Control'))
      expect(caches, arquivo).toHaveLength(1)
      expect(caches[0][1]).toContain('max-age=31536000')
      expect(caches[0][1]).toContain('immutable')
    }
  })

  it('o LICENSE da pasta do MediaPipe fica em cache longo junto dos outros arquivos dela', () => {
    const caches = regras()
      .filter((r) => casa('/demo/mediapipe-0.10.35/LICENSE', r.caminho))
      .flatMap((r) => r.cabecalhos.filter(([nome]) => nome === 'Cache-Control'))
    expect(caches).toHaveLength(1)
    expect(caches[0][1]).toContain('immutable')
  })

  /* Revisão final de 21/10/2026: a regra era `/demo/*`. O Pages serve o
     index.html (200) para qualquer caminho que não existe, então um
     /demo/qualquer-coisa, ou um arquivo que faltasse num deploy, ficaria como
     HTML em cache imutável de um ano no navegador de quem pediu. */
  it('o cache de um ano vale só para /demo/mediapipe-*; o resto de /demo/ fica sem ele', () => {
    for (const caminho of ['/demo/qualquer-coisa', '/demo/', '/demo/index.html', '/demo/mediapipe/wasm.wasm', '/demo']) {
      const caches = regras()
        .filter((r) => casa(caminho, r.caminho))
        .flatMap((r) => r.cabecalhos.filter(([nome]) => nome === 'Cache-Control'))
      expect(caches, caminho).toEqual([])
    }
    const regraDaPasta = regras().filter((r) => r.cabecalhos.some(([nome, v]) => nome === 'Cache-Control' && v.includes('31536000')))
    expect(regraDaPasta.map((r) => r.caminho)).toEqual(['/assets/*', '/fonts/*', '/demo/mediapipe-*'])
  })
})

/* Auditoria de 21/10/2026 (P3-7): as telas do app e os vídeos (até 1,5 MB) de
   /media e os selos de /badges não tinham regra, e revalidavam a cada visita.
   O nome do arquivo não leva hash, então o cache é de um dia (como /team e
   /brand), com revalidação em segundo plano por mais uma semana, e não o ano
   imutável de /assets. */
describe('cache das imagens e vídeos do produto', () => {
  for (const arquivo of ['/media/telas/teclado.webp', '/media/demo-communicator.webm', '/media/demo-cuidador.mp4', '/badges/app-store.svg']) {
    it(`${arquivo} tem um Cache-Control só, de um dia com revalidação em segundo plano`, () => {
      const caches = regras()
        .filter((r) => casa(arquivo, r.caminho))
        .flatMap((r) => r.cabecalhos.filter(([nome]) => nome === 'Cache-Control'))
      expect(caches).toHaveLength(1)
      expect(caches[0][1]).toContain('max-age=86400')
      expect(caches[0][1]).toContain('stale-while-revalidate')
      expect(caches[0][1]).not.toContain('immutable')
    })
  }
})

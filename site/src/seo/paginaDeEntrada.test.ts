import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/* index.html: o que o navegador lê antes de rodar qualquer JavaScript. */

const HTML = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8')
const TOKENS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/tokens.css'), 'utf8')

describe('index.html', () => {
  /* Auditoria de 21/10/2026 (P3-6): o theme-color era #03060d, do tempo do
     fundo quase preto. No celular, a barra do navegador ficava mais escura do
     que a página. Tem de ser o marinho da marca (--v3-noite-2, o chão da página). */
  it('o theme-color é o marinho da página, não um preto à parte', () => {
    const cor = /<meta name="theme-color" content="(#[0-9a-f]{6})"/i.exec(HTML)?.[1]
    const chao = /--v3-noite-2:\s*(#[0-9a-f]{6})/i.exec(TOKENS)?.[1]
    expect(cor?.toLowerCase()).toBe('#0b1b3a')
    expect(cor?.toLowerCase()).toBe(chao?.toLowerCase())
  })
})
